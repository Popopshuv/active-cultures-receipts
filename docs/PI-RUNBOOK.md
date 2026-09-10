# Pi runbook

Operational notes for the actual hardware, with the actual values. The README
covers how the system is designed; this covers how to run *this* Pi.

## This machine

| | |
| --- | --- |
| Host | `raspberrypi.local` on the local wifi — `192.168.1.164` at Ski Inn/Ski Out |
| Tailscale | `raspberrypi` — SSH from anywhere on the tailnet |
| Public URL | `https://raspberrypi.tail9cd54b.ts.net` (Tailscale Funnel → `localhost:8000`) |
| User | `groupdynamics` — SSH key auth, passwordless `sudo` |
| OS | Debian 13 (trixie), Python 3.13 |
| Code | `/home/groupdynamics/active-cultures-receipts/pi-server` |
| Queue | `/home/groupdynamics/active-cultures-receipts/queue` |
| Services | `active-cultures-print.service`, `tailscaled.service` — both start on boot |
| Saved wifi | `Ski Inn/Ski Out`, `925officespace` |
| Printer | BisOffice / `TECH CLA58`, USB `6868:0200`, 58mm |

The printer's USB ids match the defaults in `.env.example`, so
`PRINTER_VID`/`PRINTER_PID` need no changes.

**Calibration result:** both edge markers print, so the usable head width is the
full **384 dots** — `PRINTER_HEAD_DOTS=384` on the Pi and `HEAD_DOTS = 384` in
`src/lib/receiptConfig.ts` are correct. Rules at 2px and above print solid; 1px
prints noticeably light, which is why `ROUTE.stroke` is 2.

## Everyday commands

```bash
ssh groupdynamics@raspberrypi                   # from anywhere, via Tailscale
ssh groupdynamics@raspberrypi.local             # same wifi only

sudo systemctl status active-cultures-print     # is it up?
sudo systemctl restart active-cultures-print    # after a git pull
journalctl -u active-cultures-print -f          # live logs — every request shows here
tailscale funnel status                         # is the public URL on?
nmcli connection show                           # which wifi networks are saved
```

Update the code:

```bash
cd ~/active-cultures-receipts && git pull
sudo systemctl restart active-cultures-print
```

Calibration print (no web app, no Strava, no internet):

```bash
curl -X POST -H "Authorization: Bearer $PRINT_TOKEN" http://localhost:8000/test
```

## First-time setup

Only needed on a fresh card. This Pi is already done.

```bash
sudo apt update && sudo apt install -y libusb-1.0-0 git
cd ~ && git clone https://github.com/Popopshuv/active-cultures-receipts.git
cd active-cultures-receipts/pi-server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

cp .env.example .env
openssl rand -hex 32        # PRINT_TOKEN — the same value goes in Vercel as PRINTER_TOKEN
nano .env
```

In `.env`, point `PRINT_QUEUE_DIR` somewhere the `groupdynamics` user owns —
`/home/groupdynamics/active-cultures-receipts/queue`. A path it can't create
crashes the server at startup and systemd restarts it in a loop.

Then the service:

```bash
sudo tee /etc/systemd/system/active-cultures-print.service >/dev/null <<'EOF'
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
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now active-cultures-print
```

Then [Tailscale](#tailscale-funnel), then from your Mac, so SSH stops asking
for a password:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub groupdynamics@raspberrypi.local
```

## Tailscale Funnel

The Pi is behind the wifi's NAT and the web app is on Vercel. Funnel gives the
Pi a public HTTPS address that Vercel can reach. Outbound only — no port
forwarding, no router access, no domain to buy.

The address is tied to the Pi's name in the Tailscale account, not to the
network, so it is the same on any wifi and survives reboots. `PRINTER_URL` in
Vercel is set once.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh          # prints a login link — open it on your Mac
sudo tailscale funnel --bg 8000  # first run may link you to enable Funnel; approve, rerun
tailscale funnel status          # prints the public URL
```

`--bg` persists the Funnel config, and `tailscaled` is enabled on install, so
both come back on boot without anything else.

**Disable key expiry.** Tailscale logs devices out every 180 days by default,
which silently takes the public URL down with it. In the admin console →
Machines → `raspberrypi` → ⋯ → *Disable key expiry*. Done for this Pi.

Verify from off the LAN — phone on cellular:

```bash
curl -H "Authorization: Bearer $PRINT_TOKEN" https://raspberrypi.tail9cd54b.ts.net/health
```

**A new Funnel URL can take a while to resolve everywhere.** The public DNS
record appears a few minutes after Funnel is first turned on, and any resolver
that looked the name up *before* then caches the miss — Cloudflare's `1.1.1.1`
was still returning the IPv6 address but no IPv4 half an hour later.
Don't look the URL up until `tailscale funnel status` shows it, and to check
what's actually published, ask the authoritative server rather than your own:

```bash
dig +short A raspberrypi.tail9cd54b.ts.net @ns1.dnsimple.com
```

## Wifi

The Pi only joins networks it already knows, and it has no screen to be told
about a new one on the spot. Save a network before taking the Pi there:

```bash
sudo nmcli connection add type wifi ifname wlan0 con-name "NAME" ssid "NAME" \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "PASSWORD"
```

It connects by itself whenever that network is in range. Passwords stay on the
Pi (`/etc/NetworkManager/system-connections/`), not in this repo — it's public.

Networks with a sign-in page (hotels, cafés) won't work: the Pi can't click
"accept". A phone hotspot or an ethernet cable into the router always does.

## Where the tokens live

One secret, three places, all the same value:

| Where | Name |
| --- | --- |
| `pi-server/.env` on the Pi | `PRINT_TOKEN` |
| Vercel env vars | `PRINTER_TOKEN` |
| Local `.env.local` for dev | `PRINTER_TOKEN` |

If prints 401, these have drifted apart.

## Troubleshooting

### `/control` says offline

Start with the Pi's log — `journalctl -u active-cultures-print -f` — and
reload `/control`. It polls `/jobs?limit=50` every four seconds.

- **Requests arriving with 401** — the token in Vercel doesn't match the Pi's.
- **No requests arriving at all** — Vercel can't reach the Pi. The queue API
  (`/api/control/queue`) returns a `reason` naming the host it tried and the
  network error: `ENOTFOUND` is DNS or a typo in `PRINTER_URL`; a wrong host
  means `PRINTER_URL` wasn't updated, or Vercel wasn't redeployed after it was.
  That last one is the usual culprit — a redeploy started before the new value
  was saved runs with the old one, even though the settings page looks right.
- **Nothing in the log and the service is down** — see the next entry.

### "Unit active-cultures-print.service could not be found"

The service was never installed — the server was only ever started by hand.
Run the service block from [first-time setup](#first-time-setup).

### "Failed to connect to raspberrypi.local port 8000"

The service isn't running. If you started it by hand with `&`, it died when
you closed SSH — backgrounding doesn't detach a process from the terminal.
That's what systemd is for. `sudo systemctl status active-cultures-print`.

### SSH hangs with no output

Check the spelling first: a misspelled `.local` hostname doesn't error, it
just waits. It's `raspberrypi` — **rasp**berry.

### Can't reach the Pi from your Mac at all — ping, SSH, everything

Try `ssh groupdynamics@raspberrypi` over Tailscale first; it doesn't care which
network either machine is on. If you're on the LAN without it, there are two
separate causes, both on the Mac, both encountered during setup:

1. **NordVPN blocks LAN traffic.** With it connected, the default route goes to
   the VPN gateway and local addresses are rejected. The tell: your router
   still answers (it has its own host route) but no other device does.
   Disconnect, or enable *Invisibility on LAN* in the NordVPN settings. It
   also fights Tailscale — run one at a time.

2. **macOS Local Network permission.** On macOS 15+ each app needs explicit
   permission to talk to LAN devices. Denied, it looks exactly like a network
   fault: the router answers, every peer is silent, ARP and mDNS still resolve
   because they're handled by system services that are exempt. Check
   *System Settings → Privacy & Security → Local Network* and confirm your
   terminal is enabled. The permission is known to get stuck after a VPN
   client has been installed — toggle it off and on.

Quick way to tell these apart from a genuinely dead Pi: look at the router's
device list at <https://192.168.1.1>. It shows currently-connected DHCP clients
and can't be stale, unlike your Mac's ARP cache — which holds entries for about
20 minutes and will happily show a MAC address for a Pi that's been off for ten.

### Nothing prints, no error

The photobooth server may still be running. It listens on the same port 8000
and opens the same USB device, and only one process can hold the printer. It's
disabled on this Pi; if it ever comes back:

```bash
sudo systemctl stop photobooth-print
sudo systemctl disable photobooth-print
```

### USB permission errors from python-escpos

The photobooth already runs as `groupdynamics` and prints fine, so the udev
rule is in place. If it ever breaks:

```bash
sudo tee /etc/udev/rules.d/99-thermal-printer.rules >/dev/null <<'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="6868", ATTRS{idProduct}=="0200", MODE="0666", GROUP="plugdev"
EOF
sudo usermod -aG plugdev groupdynamics
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Then unplug and replug the printer.

### The printer doesn't appear in `lsusb`

It shows up as `ID 6868:0200 TECH CLA58` — not as anything with "printer" in
the name. If it's genuinely absent, check it's switched on and on its own power
supply; USB bus power alone often isn't enough for it to enumerate.

## Testing without Strava

The full pipeline minus OAuth. From your Mac, with `npm run dev` running:

```bash
curl -s http://localhost:3000/api/receipt -o /tmp/receipt.png
curl -X POST -H "Authorization: Bearer <PRINT_TOKEN>" \
  -F "receipt=@/tmp/receipt.png" \
  -F 'meta={"ticket":"#0001","label":"fixture"}' \
  http://raspberrypi.local:8000/jobs
```

This renders the sample run on the Mac and prints it on the Pi, exercising the
real font and the route signature. Useful whenever the receipt design changes,
and the only way to check the layout while the Strava athlete cap is in force.
