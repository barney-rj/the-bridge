#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# THE BRIDGE — Onboarding Script
#
# Gets a new user from git clone to running dashboard in under 60 seconds.
#
# Usage:
#   git clone https://github.com/barney-rj/the-bridge.git
#   cd the-bridge
#   bash scripts/onboard.sh
#
# What it does:
#   1. Checks prerequisites (node, npm)
#   2. Installs dev server dependencies
#   3. Copies the current dev-server config as your starting point
#   4. Starts the dev server
# ============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_SERVER="$REPO_ROOT/examples/dev-server"
DEMO_CONFIG="$REPO_ROOT/examples/estate-agent-config.js"
USER_CONFIG="$REPO_ROOT/examples/my-config.js"

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║       THE BRIDGE — Control Room Setup     ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

# --- Prerequisites ---
echo "▸ Checking prerequisites..."

if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ✗ Node.js v18+ required (found v$(node -v))"
  exit 1
fi

echo "  ✓ Node.js $(node -v)"
echo "  ✓ npm $(npm -v)"

# --- Install dependencies ---
echo ""
echo "▸ Installing dev server dependencies..."
cd "$DEV_SERVER"
npm install --silent 2>&1 | tail -1
echo "  ✓ Dependencies installed"

# --- Create user config if not exists ---
if [ ! -f "$USER_CONFIG" ]; then
  echo ""
  echo "▸ Creating your config from dev-server template..."
  cp "$DEMO_CONFIG" "$USER_CONFIG"
  echo "  ✓ Created examples/my-config.js"
  echo "    Edit this file to build your own control room."
else
  echo ""
  echo "  ✓ examples/my-config.js already exists (skipping)"
fi

# --- Start dev server ---
echo ""
echo "▸ Starting dev server..."
echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  The Bridge is running at http://localhost:5173   │"
echo "  │                                                  │"
echo "  │  Next steps:                                     │"
echo "  │  1. Open http://localhost:5173 in your browser   │"
echo "  │  2. Edit examples/my-config.js                   │"
echo "  │  3. The dev server loads that file automatically │"
echo "  │     and the dashboard hot-reloads on save        │"
echo "  │                                                  │"
echo "  │  Want agents? See harness/README.md              │"
echo "  │  → Define agents in harness/agents.yml           │"
echo "  │  → Paste harness/BOOT_PROMPT.md into Claude      │"
echo "  │                                                  │"
echo "  │  Press Ctrl+C to stop                            │"
echo "  └──────────────────────────────────────────────────┘"
echo ""

VITE_BRIDGE_CONFIG="../../my-config.js" npm run dev
