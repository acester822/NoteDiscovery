#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NoteDiscovery – local install for CachyOS / Arch Linux
# ─────────────────────────────────────────────────────────────
set -e

VENV_DIR=".venv"

echo "==> Checking system dependencies..."

# python-pip is needed to bootstrap the venv
PACMAN_DEPS=(python python-pip)
MISSING=()
for pkg in "${PACMAN_DEPS[@]}"; do
    if ! pacman -Q "$pkg" &>/dev/null; then
        MISSING+=("$pkg")
    fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
    echo "==> Installing missing system packages via pacman: ${MISSING[*]}"
    sudo pacman -S --needed --noconfirm "${MISSING[@]}"
fi

# ── Virtual environment ───────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    echo "==> Creating virtual environment in $VENV_DIR ..."
    python -m venv "$VENV_DIR"
else
    echo "==> Virtual environment already exists, skipping creation."
fi

echo "==> Activating venv and installing Python dependencies..."
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

echo ""
echo "✅ Done! To start NoteDiscovery:"
echo ""
echo "   source $VENV_DIR/bin/activate"
echo "   python run.py"
echo ""
echo "   (or just run: ./run-local.sh)"
