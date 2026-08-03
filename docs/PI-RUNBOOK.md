# Pi runbook

Operational notes for the actual hardware, with the actual values. The README
covers how the system is designed; this covers how to run *this* Pi.

## This machine

| | |
| --- | --- |
| Host | `raspberrypi.local` — `192.168.1.164` on the shop LAN |
| User | `groupdynamics` |
| OS | Debian 13 (trixie), Python 3.13 |
| Code | `/home/groupdynamics/active-cultures-receipts/pi-server` |
| Service | `active-cultures-print.service` |
| Printer | BisOffice / `TECH CLA58`, USB `6868:0200`, 58mm |

The printer's USB ids match the defaults in `.env.example`, so
`PRINTER_VID`/`PRINTER_PID` need no changes.

**Calibration result:** both edge markers print, so the usable head width is the
full **384 dots** — `PRINTER_HEAD_DOTS=384` on the Pi and `HEAD_DOTS = 384` in
`src/lib/receiptConfig.ts` are correct. Rules at 2px and above print solid; 1px
prints noticeably light, which is why `ROUTE.stroke` is 2.

## Everyday commands

```bash
sudo systemctl status active-cultures-print     # is it up?
sudo systemctl restart active-cultures-print    # after a git pull
journalctl -u active-cultures-print -f          # live logs
```

Update the code:

```bash
cd ~/active-cultures-receipts && git pull
sudo systemctl restart active-cultures-print
```

Calibration print (no web app, no Strava, no tunnel):

```bash
curl -X POST -H "Authorization: Bearer $PRINT_TOKEN" http://localhost:8000/test
```

## First-time setup

```bash
sudo apt update && sudo apt install -y libusb-1.0-0 git
cd ~ && git clone https://github.com/Popopshuv/active-cultures-receipts.git
cd active-cultures-receipts/pi-server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

cp .env.example .env
openssl rand -hex 32        # PRINT_TOKEN — the same value goes in Vercel as PRINTER_TOKEN
nano .env
```

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

## Where the tokens live

One secret, three places, all the same value:

| Where | Name |
| --- | --- |
| `pi-server/.env` on the Pi | `PRINT_TOKEN` |
| Vercel env vars | `PRINTER_TOKEN` |
| Local `.env.local` for dev | `PRINTER_TOKEN` |

If prints 401, these have drifted apart.

## Troubleshooting

### "Failed to connect to raspberrypi.local port 8000"

The service isn't running. If you started it by hand with `&`, it died when
you closed SSH — backgrounding doesn't detach a process from the terminal.
That's what systemd is for. `sudo systemctl status active-cultures-print`.

### Can't reach the Pi from your Mac at all — ping, SSH, everything

Two separate causes, both on the Mac, both encountered during setup:

1. **NordVPN blocks LAN traffic.** With it connected, the default route goes to
   the VPN gateway and local addresses are rejected. The tell: your router
   still answers (it has its own host route) but no other device does.
   Disconnect, or enable *Invisibility on LAN* in the NordVPN settings.

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
and opens the same USB device, and only one process can hold the printer.

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
the name. If it's genuinely absent, check its own power supply; USB bus power
alone often isn't enough for it to enumerate.

## Cloudflare Tunnel

The Pi is behind NAT and the web app is on Vercel, so the tunnel is how they
meet. Outbound only — no port forwarding, no exposed home IP.

```bash
curl -L https://pkg.cloudflare.com/install.sh | sudo bash
sudo apt install -y cloudflared
cloudflared tunnel login
cloudflared tunnel create active-cultures
cloudflared tunnel route dns active-cultures printer.yourdomain.com

sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml >/dev/null <<'EOF'
tunnel: active-cultures
credentials-file: /home/groupdynamics/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: printer.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
EOF

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Verify from off the LAN — phone on cellular:

```bash
curl -H "Authorization: Bearer $PRINT_TOKEN" https://printer.yourdomain.com/health
```

Then set `PRINTER_URL` in Vercel to that hostname.

**Note:** the photobooth used a `trycloudflare.com` quick tunnel, whose URL is
ephemeral and is already dead. Use a *named* tunnel as above so the hostname
survives reboots — otherwise `PRINTER_URL` in Vercel goes stale every restart.

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
