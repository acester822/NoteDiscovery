#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NoteDiscovery – run locally (CachyOS / Arch)
# Activates the venv then launches run.py
# ─────────────────────────────────────────────────────────────
set -e

VENV_DIR=".venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Virtual environment not found. Run ./install-arch.sh first."
    exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
exec python run.py "$@"
