# Quickstart

The short version, for when you're setting up before a run. Depth lives in
[PI-RUNBOOK.md](./PI-RUNBOOK.md); this is the checklist.

---

## 1. Get on the Pi

```bash
ssh groupdynamics@raspberrypi.local
```

Password is the one you set at flash time. The Pi needs to be on the shop wifi
and so does your Mac.

**If it hangs or refuses**, it is almost never the Pi. In order of likelihood:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Nothing on the LAN responds, but the internet works | NordVPN is connected and rejecting LAN routes | Disconnect it, or turn on *Invisibility on LAN* |
| Router answers, every device is silent | macOS Local Network permission | System Settings → Privacy & Security → Local Network → enable your terminal |
| Only this one host is unreachable | Pi is off, or on a different network | Check <https://192.168.1.1> → device list |

That device list is the one source of truth here — your Mac's ARP cache holds
entries for ~20 minutes and will happily show a MAC for a Pi that's been off
for ten.

Check the print server is up:

```bash
sudo systemctl status active-cultures-print
```

Not running? `sudo systemctl restart active-cultures-print`. Logs with
`journalctl -u active-cultures-print -f`.

---

## 2. Open the tunnel

The Pi is behind NAT; Vercel is on the internet. The tunnel is how they meet.

### Quick tunnel — no domain, URL changes every restart

```bash
cloudflared tunnel --url http://localhost:8000
```

Leave that terminal open — the tunnel dies when it closes. Copy the
`https://….trycloudflare.com` URL it prints.

### Named tunnel — needs a domain on Cloudflare, URL is permanent

Worth doing before this becomes routine. Setup is in
[PI-RUNBOOK.md](./PI-RUNBOOK.md#cloudflare-tunnel); after that it runs as a
service and you never touch this step again.

### Verify it, from off the LAN

Phone on cellular, or any machine not on the shop wifi:

```bash
curl -H "Authorization: Bearer $PRINT_TOKEN" https://YOUR-TUNNEL-URL/health
```

You want JSON with `"threshold": 190`. A 401 means the token doesn't match
Vercel's `PRINTER_TOKEN`; no response at all means the tunnel isn't up.

---

## 3. Point the site at it

In Vercel → Settings → Environment Variables:

```
PRINTER_URL = https://YOUR-TUNNEL-URL
```

Then **Deployments → ⋯ → Redeploy**. Env changes don't apply to a running
deployment.

With a quick tunnel this is required every time the Pi restarts, which is the
single best argument for setting up a named one.

### The env vars, and which host is which

| Variable | Value | Notes |
| --- | --- | --- |
| `STRAVA_CLIENT_ID` / `_SECRET` | from strava.com/settings/api | |
| `SESSION_SECRET` | `openssl rand -hex 32` | rotating it just signs people out |
| `OPERATOR_PASSCODE` | your choice | gates `/control` |
| `PRINTER_TOKEN` | must equal `PRINT_TOKEN` in the Pi's `.env` | mismatch = 401 on print |
| `PRINTER_URL` | the tunnel URL | |
| `NEXT_PUBLIC_SITE_URL` | **leave unset** | see below |

Leave `NEXT_PUBLIC_SITE_URL` unset on Vercel. It's what builds the OAuth
`redirect_uri`, and unset it falls back to `VERCEL_PROJECT_PRODUCTION_URL` —
always the production host, so preview deploys redirect somewhere Strava
accepts. Set it by hand and it drifts from the domain and every login fails
with `{"field":"redirect_uri","code":"invalid"}`.

Three hostnames, easy to conflate:

- `active-cultures-receipts.vercel.app` — the site. **This is Strava's
  Authorization Callback Domain**, bare host, no scheme.
- `…trycloudflare.com` — the tunnel to the Pi. Only the Vercel server talks to
  it. Strava never sees it.
- `raspberrypi.local` — your LAN only. Local dev.

---

## 4. Deploying changes

Push to `main` and Vercel builds it.

```bash
git push
```

**The Pi does not need updating for receipt changes.** It receives a finished
bitmap and only thresholds, crops and prints — it has no idea what's on the
receipt. Only edits to `pi-server/app.py` call for a `git pull` there.

To change the receipt design, edit `src/lib/receiptConfig.ts`, then preview at
<http://localhost:3000/api/receipt> — that renders the sample run, and it is
byte-identical to what would print.

---

## 5. Before people arrive

```bash
curl -X POST -H "Authorization: Bearer $PRINT_TOKEN" http://localhost:8000/test
```

Prints the calibration strip. Confirms paper, power, USB and the print head in
one go.

Then open `/control` on the site, sign in with `OPERATOR_PASSCODE`, and check
it says **Printer online**. Keep that tab open during the event — it shows the
queue, retries failed jobs, and has a hold switch for changing the paper roll.

Print one real receipt through the whole flow before the first runner does.

---

## Known limits

- **Strava caps connected athletes.** One by default, ten after self-upgrading
  with a paid subscription, more only after app review. Past that, runners get
  `403 Limit of connected athletes exceeded`. The app deauthorises immediately
  after printing to keep the live count near zero — whether that frees a slot
  is undocumented, so test it before relying on it. See the README.
- **Quick tunnel URLs die on restart** and take the print button with them.
- **Photos are capped at three** per receipt, dithered in the browser.
