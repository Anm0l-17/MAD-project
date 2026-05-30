# CipherNode: Production Tor Deployment Guide

This guide covers deploying CipherNode with a **native Tor Onion Hidden Service** — no third-party tunnels (Pinggy, Ngrok) required. The relay server becomes completely anonymous with a cryptographic `.onion` address.

---

## Prerequisites

| Component | Install Command | Purpose |
|---|---|---|
| **Node.js** | `brew install node` | Runs the relay server |
| **Tor** | `brew install tor` | Creates the Onion Hidden Service |
| **Expo CLI** | `npm install -g expo-cli` | Builds & serves the mobile app (dev only) |
| **Orbot** (phones) | App Store / Play Store | Optional for Expo dev (APK release embeds Tor) |
| **Expo Go** (phones) | App Store / Play Store | Runs the React Native app (dev only) |

---

## Phase 1: Start the Tor Hidden Service

This creates a permanent `.onion` address for your relay server. The server is **never** exposed on the public internet.

```bash
cd CipherNode

# Launch the Tor Hidden Service
./tor/start_tor.sh
```

Wait for the output:

```
🟢 SUCCESS — Tor Hidden Service is LIVE

Your .onion address:
┌─────────────────────────────────────────────────────────┐
│  abc123xyz456...onion
└─────────────────────────────────────────────────────────┘
```

**Copy the `.onion` address.** Keep this terminal open.

> **Note:** Your `.onion` address is persistent. The cryptographic keys are stored in `tor/onion_service/`. As long as this directory exists, your address stays the same across restarts.

---

## Phase 2: Start the Relay Server

Open a **second terminal**:

```bash
cd CipherNode

# Production mode (localhost-only, requires Tor)
node server.js

# Development mode (exposes on LAN — NOT for production)
BIND_HOST=0.0.0.0 node server.js
```

You should see:
```
🧅 CipherNode Relay running on 127.0.0.1:3001
   🔒 Bound to localhost only (Tor Hidden Service mode)
   → Start Tor with: ./tor/start_tor.sh
   → Clients connect via your .onion address
```

The relay is now accessible **only** through your `.onion` address via the Tor network. It cannot be reached from the public internet or your local network.

---

## Phase 3A: Start the Expo App (Development Only)

Open a **third terminal**:

```bash
cd CipherNode
npx expo start --tunnel
```

A QR code will appear. Both phones scan this to load the app.

---

## Phase 3B: Build the APK (Production / Embedded Tor)

The release APK ships with an **embedded Tor runtime** (no Orbot/VPN required).

```bash
cd CipherNode

# Generate native Android project (one-time)
npx expo prebuild --platform android

# Build release APK
cd android
./gradlew assembleRelease
```

Install the APK from `android/app/build/outputs/apk/release/` on each phone.

---

## Phase 4: Configure Phones

### On Both Phones (APK Release):

1. Install the APK on both devices.
2. Open the app and wait for **“Tor Circuit Active”** in the header.
3. Go to **Settings → Relay Server URL** and enter your `.onion` address.
4. Tap **Save & Reconnect**.

### On Both Phones (Expo Dev):

1. **Install Orbot** and **Expo Go** from the app store.

2. **Configure Orbot**:
   - Open Orbot → Enable **VPN Mode**
   - Tap the gear icon → Select **Expo Go** from the app list
   - Tap **Start** → Wait for "Bootstrapped 100%"

3. **Load the App**:
   - Open Camera → Scan the Expo QR code from your terminal
   - The app will load inside Expo Go

4. **Set the Relay URL**:
   - Go to **Settings** tab in the app
   - In **Relay Server URL**, enter: `http://YOUR_ONION_ADDRESS.onion`
   - Tap **Save & Reconnect**
   - The status should show: `🧅 Tor Circuit Active`

---

## Phase 5: Secure P2P Chat

1. **Phone 1**: Go to **Connect** → Stay on **📱 My QR** tab
2. **Phone 2**: Go to **Connect** → Switch to **📷 Scan Peer** tab
3. Phone 2 scans Phone 1's QR code
4. Both phones enter a secure, encrypted chat room

### Traffic Flow (Full Anonymity)
```
Phone 1 → Embedded Tor → [Guard] → [Middle] → [Exit] → .onion → Relay Server
                                                                    ↓
Phone 2 ← Embedded Tor ← [Guard] ← [Middle] ← [Exit] ← .onion ← Relay Server
```

**Zero parties** (including the relay server operator) can read message content. The relay only sees encrypted ciphertext and anonymous Tor circuit IDs.

---

## Security Architecture Summary

| Layer | Protection |
|---|---|
| **Transport** | All traffic routed through Tor (3-hop onion circuits) |
| **Server Identity** | Hidden behind `.onion` address (no public IP exposure) |
| **Server Binding** | Bound to `127.0.0.1` only (inaccessible from LAN/WAN) |
| **Encryption** | AES-256 + HMAC-SHA256 (Encrypt-then-MAC) |
| **Key Exchange** | Ephemeral 256-bit keys exchanged physically via QR code |
| **Local Storage** | Encrypted with device-derived keys |
| **Burn-on-Read** | Messages permanently shredded from disk after timer expires |
| **Fail-Closed** | App refuses to connect if Tor proxy is not detected |
| **Anti-Spoofing** | Server validates socket-to-identity binding on every event |
| **Input Sanitization** | All server inputs stripped of control/ANSI characters |

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `tor: command not found` | Run `brew install tor` |
| Hostname not generating | Check firewall settings; Tor needs outbound access |
| App shows "Tor Disconnected" | For APK: keep the Tor notification running and wait for bootstrap; for Expo: ensure Orbot VPN is active for Expo Go |
| Can't reach .onion from phone | For APK: wait for embedded Tor bootstrap; for Expo: verify Orbot shows "Bootstrapped 100%" |
| `BIND_HOST` confusion | Default is `127.0.0.1` (production). Use `0.0.0.0` only for local dev/testing |

---

## Release Validation Checklist

- [ ] Tor foreground service starts and stays active after app background/foreground.
- [ ] Header shows **“Tor Circuit Active”** within 60 seconds.
- [ ] Relay URL is a `.onion` address (non-onion URLs are rejected in release).
- [ ] No direct IP traffic visible during connection attempts.
- [ ] Reconnect works after toggling airplane mode or switching networks.
