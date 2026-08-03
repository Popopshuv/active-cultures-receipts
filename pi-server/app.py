"""Active Cultures print server — runs on the Raspberry Pi.

The Pi does exactly one thing that only the Pi can do: put ink on paper. It
does not lay anything out. A receipt arrives as a finished PNG, already
composed and already dithered by the web app, and the only decisions left here
are "where does the white space end" and "which dots burn".

That is a deliberate departure from the photobooth server this is descended
from. That one re-rendered the receipt from text fields using Pillow, which
meant the browser preview and the printed output were two separate layout
passes that had to be kept in sync by hand. They drifted constantly. Here the
bitmap the runner approved on their phone is the bitmap that prints, byte for
byte.

Endpoints:
    GET  /health              -> liveness, printer config, queue depth
    POST /jobs                -> multipart PNG + meta, enqueue, 202
    GET  /jobs                -> queue listing for the operator page
    POST /jobs/<id>/retry     -> requeue a failed job
    POST /jobs/<id>/cancel    -> drop a job that hasn't printed
    POST /hold                -> pause/resume the worker
    POST /test                -> calibration print, needs no web app

Every endpoint requires the shared bearer token. Nothing browser-side talks to
this server directly — the Next.js app proxies on the operator's behalf — so
there is no CORS handling and the token never reaches a client bundle.

Run:
    python3 app.py            # binds 0.0.0.0:8000

Env:
    PRINT_TOKEN               REQUIRED. shared secret with the web app
    PRINT_PORT                default 8000
    PRINT_QUEUE_DIR           where job PNGs and the sqlite db live. default ./queue
    PRINT_RATE_PER_MIN        soft per-IP cap on /jobs. default 30
    PRINTER_VID               USB vendor id (hex). default 0x6868
    PRINTER_PID               USB product id (hex). default 0x0200
    PRINTER_HEAD_DOTS         print-head width. default 384
    PRINTER_FEED              trailing blank lines. default 6
    PRINTER_CUT               1 to send a cut command after each receipt. default 0
    PRINT_THRESHOLD           grey level that becomes black, 0-255. default 128
    PRINT_BOTTOM_MARGIN       dot rows of white kept below the receipt. default 8
    PRINTER_DRY_RUN           1 to write bitmaps to disk instead of the printer
"""

from __future__ import annotations

import hmac
import io
import json
import os
import sqlite3
import threading
import time
from collections import defaultdict, deque
from typing import Optional

from flask import Flask, jsonify, request
from PIL import Image, ImageChops, ImageDraw, ImageFont


# ---------- config ------------------------------------------------------------

PRINT_TOKEN = os.environ.get("PRINT_TOKEN", "").strip()
if not PRINT_TOKEN:
    raise SystemExit(
        "PRINT_TOKEN is required. Generate one with `openssl rand -hex 32` "
        "and set it in the systemd unit (and in the web app's env as "
        "PRINTER_TOKEN)."
    )

QUEUE_DIR = os.path.abspath(os.environ.get("PRINT_QUEUE_DIR", "queue"))
DB_PATH = os.path.join(QUEUE_DIR, "jobs.db")
RATE_PER_MIN = int(os.environ.get("PRINT_RATE_PER_MIN", "30"))

PRINTER_VID = int(os.environ.get("PRINTER_VID", "0x6868"), 16)
PRINTER_PID = int(os.environ.get("PRINTER_PID", "0x0200"), 16)
HEAD_DOTS = int(os.environ.get("PRINTER_HEAD_DOTS", "384"))
FEED_LINES = int(os.environ.get("PRINTER_FEED", "6"))
CUT_AFTER = os.environ.get("PRINTER_CUT", "0").strip() not in ("0", "false", "False", "")

# Photos arrive already dithered and text arrives anti-aliased, so this is a
# plain threshold rather than another dither pass. Re-dithering here would
# error-diffuse across glyph edges and fur up the type — the whole reason the
# dithering happens in the browser instead.
#
# 190, not the intuitive midpoint of 128. The wordmark font is Light (300), and
# at the 10-11px sizes the eyebrow and attribution lines use, its stems are
# thinner than one dot. Anti-aliasing renders them around 60% grey, so a 128
# threshold discards them and the small type prints as broken fragments — this
# is measurable: at 128 "POWERED BY STRAVA" loses most of its stems, at 170 it
# is legible, at 190 it is clean, and by 210 the type starts blobbing shut.
#
# Raising this costs nothing on photos: they arrive already dithered to pure
# black and white, so every threshold in 1..254 leaves them byte-identical.
# It only affects anti-aliased edges — which is to say, text and thin strokes.
THRESHOLD = max(1, min(254, int(os.environ.get("PRINT_THRESHOLD", "190"))))
BOTTOM_MARGIN = int(os.environ.get("PRINT_BOTTOM_MARGIN", "8"))

DRY_RUN = os.environ.get("PRINTER_DRY_RUN", "0").strip() not in (
    "0",
    "false",
    "False",
    "",
)

os.makedirs(QUEUE_DIR, exist_ok=True)


# ---------- flask app ---------------------------------------------------------

app = Flask(__name__)

_rate_bucket: dict[str, deque] = defaultdict(deque)
_rate_lock = threading.Lock()

# Set whenever a job is enqueued so the worker can sleep instead of polling.
_wake = threading.Event()


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.time()
    cutoff = now - 60.0
    with _rate_lock:
        bucket = _rate_bucket[ip]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= RATE_PER_MIN:
            return True
        bucket.append(now)
    return False


def _check_auth() -> Optional[tuple]:
    header = request.headers.get("Authorization", "")
    expected = f"Bearer {PRINT_TOKEN}"
    # compare_digest so a wrong token can't be recovered by timing the reply.
    if not hmac.compare_digest(header, expected):
        return jsonify(ok=False, error="unauthorized"), 401
    return None


# ---------- queue -------------------------------------------------------------

# sqlite3 and the filesystem, both stdlib. The queue has to survive a Pi that
# gets power-cycled halfway through an event, which rules out keeping jobs in
# memory, and a run club does not need a message broker.

_db_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    # WAL keeps the worker's writes from blocking the operator's reads.
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db() -> None:
    with _db_lock, _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket      TEXT,
                label       TEXT,
                status      TEXT NOT NULL,
                path        TEXT NOT NULL,
                error       TEXT,
                attempts    INTEGER NOT NULL DEFAULT 0,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status)")

        # Anything still marked 'printing' means the process died mid-job. Fail
        # it rather than requeueing: the paper may be half-printed, and silently
        # reprinting hands someone a duplicate receipt. Let the operator decide.
        conn.execute(
            "UPDATE jobs SET status='failed', error='interrupted by restart', "
            "updated_at=? WHERE status='printing'",
            (time.time(),),
        )


def _get_setting(key: str, default: str) -> str:
    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def _set_setting(key: str, value: str) -> None:
    with _db_lock, _connect() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def is_held() -> bool:
    """Hold survives a restart on purpose — an operator who paused the printer
    before a reboot does not expect a stack of receipts on the way back up."""
    return _get_setting("hold", "0") == "1"


def enqueue(png_bytes: bytes, ticket: str, label: str) -> int:
    now = time.time()
    with _db_lock, _connect() as conn:
        cursor = conn.execute(
            "INSERT INTO jobs(ticket, label, status, path, created_at, updated_at) "
            "VALUES(?, ?, 'queued', '', ?, ?)",
            (ticket, label, now, now),
        )
        job_id = int(cursor.lastrowid)
        path = os.path.join(QUEUE_DIR, f"job-{job_id:06d}.png")
        conn.execute("UPDATE jobs SET path=? WHERE id=?", (path, job_id))

    with open(path, "wb") as handle:
        handle.write(png_bytes)

    _wake.set()
    return job_id


def _set_status(job_id: int, status: str, error: Optional[str] = None) -> None:
    with _db_lock, _connect() as conn:
        conn.execute(
            "UPDATE jobs SET status=?, error=?, updated_at=? WHERE id=?",
            (status, error, time.time(), job_id),
        )


def _claim_next() -> Optional[sqlite3.Row]:
    """Atomically take the oldest queued job. The UPDATE ... WHERE status still
    equals 'queued' is what makes this safe if a second worker ever exists."""
    with _db_lock, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM jobs WHERE status='queued' ORDER BY id LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        updated = conn.execute(
            "UPDATE jobs SET status='printing', attempts=attempts+1, updated_at=? "
            "WHERE id=? AND status='queued'",
            (time.time(), row["id"]),
        )
        if updated.rowcount == 0:
            return None
    return row


def queue_depth() -> int:
    with _db_lock, _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','printing')"
        ).fetchone()
    return int(row["n"])


# ---------- bitmap prep -------------------------------------------------------


def _autocrop_bottom(img: Image.Image) -> Image.Image:
    """Trim the trailing white the renderer leaves below the receipt.

    The web app can't know a receipt's exact height before laying it out, so it
    deliberately over-estimates the canvas — too tall wastes nothing, too short
    clips the bottom off. This is where the slack gets removed.

    Only the bottom is cropped. Trimming left or right would change the width
    and throw off every horizontal alignment; trimming the top would eat the
    masthead's intentional padding.
    """
    inverted = ImageChops.invert(img.convert("L"))
    bbox = inverted.getbbox()
    if bbox is None:
        # Nothing but white. Don't hand the printer a blank metre of paper.
        return img.crop((0, 0, img.width, 1))

    bottom = min(img.height, bbox[3] + BOTTOM_MARGIN)
    return img.crop((0, 0, img.width, bottom))


def prepare_bitmap(png_bytes: bytes) -> Image.Image:
    """PNG → 1-bit image at head width, ready for ESC/POS."""
    img = Image.open(io.BytesIO(png_bytes))

    if img.mode in ("RGBA", "LA", "P"):
        # Flatten onto white. An alpha channel left alone reads as black and
        # prints as a solid slab.
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[-1])
        img = flat

    img = img.convert("L")
    img = _autocrop_bottom(img)

    if img.width != HEAD_DOTS:
        # Shouldn't happen — the renderer targets HEAD_DOTS exactly — but a
        # mismatched width would print as garbage, so rescue it loudly.
        print(
            f"[print] WARNING: bitmap is {img.width}px, expected {HEAD_DOTS}px; resizing",
            flush=True,
        )
        ratio = HEAD_DOTS / img.width
        img = img.resize(
            (HEAD_DOTS, max(1, round(img.height * ratio))), Image.LANCZOS
        )

    # Threshold, not dither. See the note on THRESHOLD.
    return img.point(lambda v: 0 if v < THRESHOLD else 255, mode="L").convert("1")


def _print_bitmap(img: Image.Image, job_id: int) -> str:
    """Send a prepared bitmap to the printer. Returns the method used."""
    if DRY_RUN:
        out = os.path.join(QUEUE_DIR, f"dryrun-{job_id:06d}.png")
        img.save(out)
        print(f"[print] dry run -> {out} ({img.width}x{img.height})", flush=True)
        return "dry-run"

    from escpos.printer import Usb

    printer = Usb(PRINTER_VID, PRINTER_PID, profile="default")
    try:
        printer.image(img, impl="bitImageRaster")
        for _ in range(FEED_LINES):
            printer._raw(b"\n")
        if CUT_AFTER:
            printer.cut()
        return "escpos-native"
    finally:
        try:
            printer.close()
        except Exception:
            pass


# ---------- worker ------------------------------------------------------------


def _worker_loop() -> None:
    print(
        f"[worker] up. dry_run={DRY_RUN} head={HEAD_DOTS} threshold={THRESHOLD}",
        flush=True,
    )
    while True:
        # Woken by enqueue(); the timeout is a backstop so a released hold or a
        # missed signal can't wedge the queue.
        _wake.wait(timeout=5.0)
        _wake.clear()

        if is_held():
            continue

        while not is_held():
            job = _claim_next()
            if job is None:
                break

            job_id = int(job["id"])
            try:
                with open(job["path"], "rb") as handle:
                    png_bytes = handle.read()
                bitmap = prepare_bitmap(png_bytes)
                method = _print_bitmap(bitmap, job_id)
                _set_status(job_id, "printed")
                print(
                    f"[worker] job {job_id} printed via {method} "
                    f"({bitmap.width}x{bitmap.height})",
                    flush=True,
                )
            except Exception as exc:
                _set_status(job_id, "failed", str(exc))
                print(f"[worker] job {job_id} FAILED: {exc}", flush=True)
                # Back off before the next job. A failure is usually the
                # printer being unplugged or out of paper, and hammering it
                # just fills the queue with failures.
                time.sleep(2.0)


# ---------- calibration -------------------------------------------------------


def _calibration_bitmap() -> Image.Image:
    """A ruler and a set of stroke weights.

    Printed once when setting up, to confirm the head really is HEAD_DOTS wide
    and to pick a stroke weight that survives thresholding — which is exactly
    the decision behind `ROUTE.stroke` in the web app.
    """
    height = 220
    img = Image.new("L", (HEAD_DOTS, height), 255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    draw.text((0, 0), f"CALIBRATION {HEAD_DOTS} DOTS", fill=0, font=font)

    # Ruler: a tick every 32 dots, taller every 64, labelled.
    ruler_y = 20
    for x in range(0, HEAD_DOTS + 1, 32):
        tick = 10 if x % 64 == 0 else 5
        draw.line([(min(x, HEAD_DOTS - 1), ruler_y),
                   (min(x, HEAD_DOTS - 1), ruler_y + tick)], fill=0)
        if x % 64 == 0 and x < HEAD_DOTS:
            draw.text((x + 2, ruler_y + 12), str(x), fill=0, font=font)

    # Horizontal rules at increasing weights.
    y = ruler_y + 32
    for weight in (1, 2, 3, 4):
        draw.rectangle([(0, y), (HEAD_DOTS - 1, y + weight - 1)], fill=0)
        draw.text((4, y + weight + 2), f"{weight}px rule", fill=0, font=font)
        y += weight + 16

    # Vertical strokes at the same weights — these are what a route signature
    # is made of, and they thin out differently to horizontals on some heads.
    y += 4
    x = 4
    for weight in (1, 2, 3, 4):
        draw.rectangle([(x, y), (x + weight - 1, y + 40)], fill=0)
        x += weight + 24
    draw.text((x + 8, y + 16), "1/2/3/4px", fill=0, font=font)

    # Edge markers — if either is missing, the printable width is narrower
    # than HEAD_DOTS and everything needs to shift inward.
    draw.rectangle([(0, height - 12), (7, height - 5)], fill=0)
    draw.rectangle([(HEAD_DOTS - 8, height - 12), (HEAD_DOTS - 1, height - 5)], fill=0)

    return img.convert("1")


# ---------- routes ------------------------------------------------------------


@app.route("/health")
def health():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error
    return jsonify(
        ok=True,
        printer_vid=hex(PRINTER_VID),
        printer_pid=hex(PRINTER_PID),
        head_dots=HEAD_DOTS,
        threshold=THRESHOLD,
        dry_run=DRY_RUN,
        held=is_held(),
        queue_depth=queue_depth(),
    )


@app.route("/jobs", methods=["POST"])
def create_job():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    ip = _client_ip()
    if _rate_limited(ip):
        return jsonify(ok=False, error="rate limited"), 429

    upload = request.files.get("receipt")
    if upload is None:
        return jsonify(ok=False, error="no receipt in request"), 400

    png_bytes = upload.read()
    if not png_bytes:
        return jsonify(ok=False, error="empty receipt"), 400

    try:
        meta = json.loads(request.form.get("meta", "{}"))
    except Exception:
        meta = {}

    ticket = str(meta.get("ticket", ""))[:24]
    label = str(meta.get("label", ""))[:120]

    # Decode before accepting, so a corrupt upload fails at the door with a 400
    # rather than sitting in the queue and failing at the printer.
    try:
        prepare_bitmap(png_bytes)
    except Exception as exc:
        return jsonify(ok=False, error=f"undecodable png: {exc}"), 400

    job_id = enqueue(png_bytes, ticket, label)
    print(f"[jobs] queued {job_id} ticket={ticket!r} from {ip}", flush=True)
    return jsonify(ok=True, id=job_id, held=is_held()), 202


@app.route("/jobs")
def list_jobs():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    limit = min(200, max(1, int(request.args.get("limit", "50"))))
    with _db_lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, ticket, label, status, error, attempts, created_at, "
            "updated_at FROM jobs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()

    return jsonify(
        ok=True,
        held=is_held(),
        queue_depth=queue_depth(),
        jobs=[dict(row) for row in rows],
    )


@app.route("/jobs/<int:job_id>/retry", methods=["POST"])
def retry_job(job_id: int):
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None:
            return jsonify(ok=False, error="no such job"), 404
        if not os.path.exists(row["path"]):
            return jsonify(ok=False, error="bitmap missing"), 410
        conn.execute(
            "UPDATE jobs SET status='queued', error=NULL, updated_at=? WHERE id=?",
            (time.time(), job_id),
        )

    _wake.set()
    return jsonify(ok=True, id=job_id)


@app.route("/jobs/<int:job_id>/cancel", methods=["POST"])
def cancel_job(job_id: int):
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    with _db_lock, _connect() as conn:
        updated = conn.execute(
            "UPDATE jobs SET status='cancelled', updated_at=? "
            "WHERE id=? AND status IN ('queued','failed')",
            (time.time(), job_id),
        )
    if updated.rowcount == 0:
        # Already printing or printed — cancelling would be a lie.
        return jsonify(ok=False, error="job is not cancellable"), 409
    return jsonify(ok=True, id=job_id)


@app.route("/hold", methods=["POST"])
def set_hold():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    body = request.get_json(silent=True) or {}
    held = bool(body.get("held", not is_held()))
    _set_setting("hold", "1" if held else "0")
    if not held:
        _wake.set()
    print(f"[hold] {'held' if held else 'released'}", flush=True)
    return jsonify(ok=True, held=held)


@app.route("/test", methods=["POST"])
def test_print():
    auth_error = _check_auth()
    if auth_error is not None:
        return auth_error

    buffer = io.BytesIO()
    _calibration_bitmap().save(buffer, format="PNG")
    job_id = enqueue(buffer.getvalue(), "#test", "calibration")
    return jsonify(ok=True, id=job_id), 202


# ---------- entrypoint --------------------------------------------------------

_init_db()
threading.Thread(target=_worker_loop, daemon=True).start()

if __name__ == "__main__":
    port = int(os.environ.get("PRINT_PORT", "8000"))
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False)
