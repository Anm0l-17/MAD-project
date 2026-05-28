#!/bin/bash
# start_tor.sh — CipherNode Onion V3 Hidden Service Launcher
# Usage: ./tor/start_tor.sh
# Requires: tor (brew install tor)

set -e

# ─── Resolve paths ─────────────────────────────────────────────────────
TOR_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ONION_DIR="$TOR_DIR/onion_service"
TORRC="$TOR_DIR/torrc"

echo ""
echo "🧅 ═══════════════════════════════════════════════════════════"
echo "   CipherNode Onion Hidden Service Launcher"
echo "═══════════════════════════════════════════════════════════════"

# ─── Pre-flight checks ────────────────────────────────────────────────
if ! command -v tor &> /dev/null; then
    echo ""
    echo "❌ 'tor' is not installed."
    echo "   Install it with:  brew install tor"
    echo ""
    exit 1
fi

echo ""
echo "[1/4] Creating onion service directory..."
mkdir -p "$ONION_DIR"

echo "[2/4] Setting secure permissions (chmod 700)..."
chmod 700 "$ONION_DIR"

echo "[3/4] Launching Tor daemon with Hidden Service config..."
echo "      Config:  $TORRC"
echo "      Service: $ONION_DIR"
echo ""

# Launch Tor, injecting HiddenServiceDir dynamically to avoid hardcoded paths
tor -f "$TORRC" --HiddenServiceDir "$ONION_DIR" &
TOR_PID=$!

# Clean shutdown on Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down Tor (PID $TOR_PID)..."
    kill $TOR_PID 2>/dev/null
    wait $TOR_PID 2>/dev/null
    echo "   Tor stopped cleanly."
    exit 0
}
trap cleanup INT TERM

echo "[4/4] Waiting for circuit bootstrap and .onion address..."
echo ""

# Poll for the hostname file
ELAPSED=0
while [ ! -f "$ONION_DIR/hostname" ]; do
    sleep 1
    ELAPSED=$((ELAPSED+1))
    if [ $ELAPSED -ge 60 ]; then
        echo "⚠️  Tor has been bootstrapping for over 60 seconds."
        echo "   This may indicate a network or firewall issue."
        ELAPSED=0
    fi
done

# Read the generated .onion address
ONION_ADDRESS=$(cat "$ONION_DIR/hostname")

echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  🟢 SUCCESS — Tor Hidden Service is LIVE"
echo ""
echo "  Your .onion address:"
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  $ONION_ADDRESS"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "  📋 Next Steps:"
echo "     1. Start the relay:  node server.js"
echo "     2. On your phone, go to Settings → Relay Server URL"
echo "     3. Enter:  http://$ONION_ADDRESS"
echo "     4. Ensure Orbot is running on both phones"
echo ""
echo "  ⚠️  Keep this terminal open. Press Ctrl+C to stop."
echo ""
echo "═══════════════════════════════════════════════════════════════"

# Keep running until killed
wait $TOR_PID
