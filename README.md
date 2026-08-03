# Active Cultures — run receipts

A runner scans a QR code at the shop, connects Strava, picks the run they just
finished, adds up to three photos, and a receipt prints on the thermal printer.

Two apps:

```
                   OAuth + pick a run              PNG over bearer-token POST
  runner's phone ───────────────────────►  web    ──────────────────────────►  pi-server/
   (QR at shop)                          (Vercel)   https://printer.yourdomain    (Pi at the shop)
                                                       via cloudflared
```

- **Web app** — this repo's root. Next.js 16 on Vercel. Runs the OAuth flow,
  renders the receipt, forwards it to the Pi.
- **`pi-server/`** — Flask. Owns the printer and a durable print queue.

Built on the Group Dynamics starter — design rules in
[CLAUDE.md](./CLAUDE.md) and [GROUP-D-SYSTEM.md](./GROUP-D-SYSTEM.md).

**Running the actual Pi?** See [docs/PI-RUNBOOK.md](./docs/PI-RUNBOOK.md) — real
hostnames, real USB ids, calibration results, and the failure modes we've
already hit.

---

## The idea worth knowing

**The receipt is rendered exactly once.**

`src/components/receipt/ReceiptDoc.tsx` lays it out as flexbox JSX, `next/og`
rasterises it to a 384px-wide PNG, and that one PNG is *both* what the runner
previews on their phone and what the Pi burns onto paper.

This is the fix for what made the photobooth receipts so painful. That build
drew the receipt twice — once on a canvas in the browser, once with Pillow on
the Pi — so two layout engines had to be kept in sync by hand and nothing could
be trusted to fit. Here there is no second layout pass, so there is nothing to
drift.

Practical consequences:

- To restyle the receipt, edit `src/lib/receiptConfig.ts`. Every measurement
  lives there, in print pixels.
- To see the change, open <http://localhost:3000/api/receipt> — it renders the
  fixture from `src/lib/fixtures/sampleRun.ts`. Refresh and you are looking at
  the exact bitmap that would print.
- The Pi never lays anything out. It thresholds, crops, and prints.

### Two things that will bite you

**Satori does not flatten React fragments.** It lays `<>…</>` out as its own box
in the default `row` direction, so `<><Rule/><div/></>` puts the content
*beside* the rule, off the 384px canvas, where it prints as blank space. Use the
`<Block>` element in `ReceiptDoc` instead.

**Photos are dithered in the browser, not on the Pi.** A thermal head is 1-bit,
so something must decide per pixel. Doing it on the Pi would error-diffuse
across the whole composite — including the anti-aliased edge of every glyph —
and fur up the text. So `src/lib/thermal.ts` reduces photos to pure black and
white at exactly print size, and the Pi only thresholds. The corollary:
**never resample a dithered photo.** `ReceiptDoc` places them at native size for
this reason.

---

## Strava: read this before promising anyone a receipt

Strava changed its developer terms on 1 June 2026, and the limits decide whether
this works at an event.

- A new API app can access **one athlete** — you.
- Self-upgrading in the API dashboard raises that to **ten athletes** and
  requires a **paid Strava subscription** on the owning account.
- Past ten, you submit the app for review. Strava says increased access "is not
  a guarantee."
- Access tokens last six hours, and every refresh rotates the refresh token.

### The deauthorize trick

This app needs an athlete's data for about thirty seconds — read one activity,
render a bitmap, queue it — and never again. So `/api/print` calls
`POST /oauth/deauthorize` as soon as the job is safely queued.

If Strava's counter tracks *live* connections rather than lifetime
authorisations, that holds the app at one or two connections no matter how many
runners come through, and the ten-athlete cap never bites.

**Strava does not document which it is.** Developers ask in the community hub
and get no staff answer. Settle it yourself in five minutes, on the free
one-athlete tier, before the first event:

1. Connect with your own account. Confirm a receipt prints.
2. `curl -X POST https://www.strava.com/oauth/deauthorize -H "Authorization: Bearer <token>"`
3. Try connecting with a second account.

Step 3 succeeding means the counter is on active connections and you are fine.
`403 Limit of connected athletes exceeded` means it is cumulative and you need
review.

Either way, run the parallel track: email `developers@strava.com` with your
client id to request a limit increase. Reported turnaround is days to a couple
of months. Review wants to see a working app, so build first and submit after.

### Attribution

The API agreement requires attributing Strava, and attributing **Garmin** when
the displayed data came off a Garmin device. Both are handled — see
`garminAttribution` in `src/lib/receiptConfig.ts`, which keys off the activity's
`device_name`. Don't remove those footer lines.

---

## Web app setup

```bash
npm install
cp .env.example .env.local   # fill it in
npm run dev
```

Nothing in `.env.local` is `NEXT_PUBLIC_`, deliberately. The Strava client
secret and the printer token stay server-side: the runner's phone talks to us,
and we talk to the Pi. (The photobooth shipped its printer token to the browser,
which meant anyone who loaded the page could drive the printer directly.)

On the Strava app at `strava.com/settings/api`, set **Authorization Callback
Domain** to your bare production host — no scheme, no path. `localhost` is
whitelisted separately, so development needs no extra setup.

### Routes

| Route | What it is |
| --- | --- |
| `/` | QR landing. Connect Strava. |
| `/runs` | Recent runs, with route thumbnails. |
| `/runs/[id]` | Photo picker, live preview, print. |
| `/control` | Operator page. Passcode-gated. |
| `/api/receipt` | `GET` renders the fixture; `POST` renders a payload. |

---

## Pi server setup

```bash
sudo apt update
sudo apt install -y libusb-1.0-0

cd pi-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env    # PRINT_TOKEN must match the web app's PRINTER_TOKEN
```

Run it:

```bash
set -a; source .env; set +a
python3 app.py
curl -H "Authorization: Bearer $PRINT_TOKEN" http://localhost:8000/health
```

### Developing without hardware

`PRINTER_DRY_RUN=1` writes each prepared bitmap into `PRINT_QUEUE_DIR` instead
of sending it to USB. The whole server — queue, worker, retries, hold — is
developable on a laptop with no printer attached.

```bash
PRINT_TOKEN=devtoken PRINTER_DRY_RUN=1 python3 app.py
```

### systemd

`/etc/systemd/system/active-cultures-print.service`:

```ini
[Unit]
Description=Active Cultures print server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=groupdynamics
WorkingDirectory=/home/groupdynamics/active-cultures-receipts/pi-server
EnvironmentFile=/home/groupdynamics/active-cultures-receipts/pi-server/.env
ExecStart=/home/groupdynamics/active-cultures-receipts/pi-server/.venv/bin/python3 app.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now active-cultures-print
journalctl -u active-cultures-print -f
```

### Cloudflare Tunnel

The Pi sits behind residential NAT; the web app is on the public internet. A
tunnel bridges them with no port forwarding and no exposed home IP.

```bash
curl -L https://pkg.cloudflare.com/install.sh | sudo bash
sudo apt install -y cloudflared
cloudflared tunnel login
cloudflared tunnel create active-cultures
cloudflared tunnel route dns active-cultures printer.yourdomain.com

sudo tee /etc/cloudflared/config.yml >/dev/null <<'EOF'
tunnel: active-cultures
credentials-file: /home/pi/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: printer.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
EOF

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Then set `PRINTER_URL=https://printer.yourdomain.com` in the web app.

### The queue

sqlite plus PNGs on disk, both stdlib. Jobs survive a power cut mid-event.

A job left mid-print by a crash is marked `failed`, not requeued — the paper may
be half-printed, and silently reprinting hands someone a duplicate. The operator
decides from `/control`.

`hold` also persists across restarts: someone who paused the printer before a
reboot does not expect a stack of receipts on the way back up.

---

## Calibrating the print

Print the test strip from `/control` → **Test print**. It gives you a dot ruler,
horizontal and vertical rules at 1–4px, and edge markers.

- **Edge markers missing?** The printable width is narrower than
  `PRINTER_HEAD_DOTS`. Reduce it, and match `HEAD_DOTS` in
  `src/lib/receiptConfig.ts`.
- **Thin rules broken or grey?** Raise `ROUTE.stroke` in `receiptConfig.ts`.
  1px strokes do not survive thresholding.
- **Small text furry or blobby?** Adjust `PRINT_THRESHOLD`.

`PRINT_THRESHOLD` defaults to **190**, not the intuitive 128. The wordmark is
ABC Monument Grotesk *Light*, and at the 10–11px sizes the eyebrow and
attribution lines use, its stems are thinner than one dot — anti-aliasing puts
them around 60% grey, so a 128 threshold discards them and the small type prints
as broken fragments. Measured against the real font: 128 loses most stems, 170
is legible, 190 is clean, 210 starts blobbing shut.

Raising it is free for photos, which arrive already dithered to pure black and
white and are byte-identical at any threshold from 1 to 254.

---

## Still to do

- **Verify the photo pipeline on a real phone.** `src/lib/thermal.ts` is
  canvas-based and has only been exercised through the type checker. It needs
  one real photo through a real browser before an event.
- **QR code on the receipt** ("view on Strava", as in the reference design).
  Needs a QR encoder, which means a new dependency — not added without sign-off.
- **House photos.** `HOUSE_PHOTOS` in `receiptConfig.ts` is empty. Drop images
  into `public/receipt/` and list them there to print the front door on every
  receipt.
