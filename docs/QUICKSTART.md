# Quickstart

The short version, for when you're setting up before a run. Depth lives in
[PI-RUNBOOK.md](./PI-RUNBOOK.md); this is the checklist.

The Pi is set-and-forget: plug it in and within a minute it's on wifi, the
print server is up, and the site can reach it at the same permanent URL as
last time. Most runs need only steps 1 and 4.

---

## 1. Plug in and check it's up

Power the printer (it has its own supply) and the Pi. Give it a minute, then
open `/control` on the site and sign in with `OPERATOR_PASSCODE`. It should
say **Printer online**.

That's the whole check. If it says offline, get on the Pi (step 2).

---

## 2. Get on the Pi

From anywhere, with Tailscale running on your Mac:

```bash
ssh groupdynamics@raspberrypi
```

Or on the same wifi as the Pi, without Tailscale:

```bash
ssh groupdynamics@raspberrypi.local
```

Your Mac's SSH key is installed, so neither asks for a password.

**If it hangs**, it is almost never the Pi. In order of likelihood:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Hangs with no output at all | Hostname typo — a misspelled `.local` name waits forever rather than erroring | It's **rasp**berrypi. Or use the IP from the router's device list |
| Nothing on the LAN responds, but the internet works | NordVPN is connected and rejecting LAN routes | Disconnect it, or turn on *Invisibility on LAN* |
| Router answers, every device is silent | macOS Local Network permission | System Settings → Privacy & Security → Local Network → enable your terminal |
| Only this one host is unreachable | Pi is off, or never joined this wifi | See [new location](#new-location) below |

Then check the two services:

```bash
sudo systemctl status active-cultures-print   # the print server
tailscale funnel status                        # the public URL
```

Print server down? `sudo systemctl restart active-cultures-print`. Logs with
`journalctl -u active-cultures-print -f`.

---

## 3. How the site reaches the Pi

The Pi is behind the wifi's NAT; Vercel is on the internet. Tailscale Funnel
bridges them, and the address is permanent:

```
https://raspberrypi.tail9cd54b.ts.net
```

It's tied to the Pi's name in the Tailscale account, not to the network, so it
survives reboots and moves between locations. `PRINTER_URL` in Vercel is set to
it once and never changes. There is no tunnel to open and nothing to redeploy.

Verify it from off the LAN — phone on cellular, or any machine not on the
Pi's wifi:

```bash
curl -H "Authorization: Bearer $PRINT_TOKEN" https://raspberrypi.tail9cd54b.ts.net/health
```

You want JSON with `"threshold": 190`. A 401 means the token doesn't match
Vercel's `PRINTER_TOKEN`; no response at all means the Pi is offline or Funnel
is off.

### The env vars, and which host is which

| Variable | Value | Notes |
| --- | --- | --- |
| `STRAVA_CLIENT_ID` / `_SECRET` | from strava.com/settings/api | |
| `SESSION_SECRET` | `openssl rand -hex 32` | rotating it just signs people out |
| `OPERATOR_PASSCODE` | your choice | gates `/control` |
| `PRINTER_TOKEN` | must equal `PRINT_TOKEN` in the Pi's `.env` | mismatch = 401 on print |
| `PRINTER_URL` | `https://raspberrypi.tail9cd54b.ts.net` | permanent |
| `NEXT_PUBLIC_SITE_URL` | **leave unset** | see below |

Env changes don't apply to a running deployment — after editing one, go to
**Deployments → ⋯ → Redeploy**.

Leave `NEXT_PUBLIC_SITE_URL` unset on Vercel. It's what builds the OAuth
`redirect_uri`, and unset it falls back to `VERCEL_PROJECT_PRODUCTION_URL` —
always the production host, so preview deploys redirect somewhere Strava
accepts. Set it by hand and it drifts from the domain and every login fails
with `{"field":"redirect_uri","code":"invalid"}`.

Four hostnames, easy to conflate:

- `active-cultures-receipts.vercel.app` — the site. **This is Strava's
  Authorization Callback Domain**, bare host, no scheme.
- `raspberrypi.tail9cd54b.ts.net` — the public URL of the Pi. Only the Vercel
  server talks to it. Strava never sees it.
- `raspberrypi` — the Pi on your Tailscale network. SSH from anywhere.
- `raspberrypi.local` — the Pi on the local wifi only. Local dev.

---

## 4. Before people arrive

From `/control`, hit **Test print**. It prints the calibration strip, which
confirms paper, power, USB and the print head in one go.

Keep that tab open during the event — it shows the queue, retries failed jobs,
and has a hold switch for changing the paper roll.

Print one real receipt through the whole flow before the first runner does.

---

## New location

The Pi only joins wifi it already knows, and with no screen you can't tell it
about a new one on the spot. **Save the network before you go**, while the Pi
is still reachable:

```bash
sudo nmcli connection add type wifi ifname wlan0 con-name "NAME" ssid "NAME" \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "PASSWORD"
```

It connects by itself once it's in range. `nmcli connection show` lists what's
saved. Your phone's hotspot is worth adding as a fallback, and an ethernet
cable into the router always works.

Avoid wifi with a sign-in page (hotels, cafés). The Pi can't click "accept".

---

## Deploying changes

Push to `main` and Vercel builds it.

```bash
git push
```

**The Pi does not need updating for receipt changes.** It receives a finished
bitmap and only thresholds, crops and prints — it has no idea what's on the
receipt. Only edits to `pi-server/app.py` call for an update there:

```bash
cd ~/active-cultures-receipts && git pull
sudo systemctl restart active-cultures-print
```

To change the receipt design, edit `src/lib/receiptConfig.ts`, then preview at
<http://localhost:3000/api/receipt> — that renders the sample run, and it is
byte-identical to what would print.

---

## Known limits

- **Strava caps connected athletes.** One by default, ten after self-upgrading
  with a paid subscription, more only after app review. Past that, runners get
  `403 Limit of connected athletes exceeded`. The app deauthorises immediately
  after printing to keep the live count near zero — whether that frees a slot
  is undocumented, so test it before relying on it. See the README.
- **The Pi needs internet.** No wifi it knows, or a sign-in-page network, and
  the print button reports the printer offline.
- **Photos are capped at three** per receipt, dithered in the browser.
