#!/usr/bin/env bash
set -euo pipefail
WSGI_PATH="backend.mcp_server:app"
PORT_TO_USE="${PORT:-8000}"
echo "[start] Python: $(python --version 2>&1)"
if command -v gunicorn >/dev/null 2>&1; then
  echo "[start] gunicorn: $(gunicorn --version 2>&1)"
else
  echo "[start] ERROR: gunicorn not found in PATH"
  echo "[start] pip show gunicorn:" || true
  pip show gunicorn || true
  exit 127
fi
exec gunicorn "$WSGI_PATH" --bind 0.0.0.0:"$PORT_TO_USE" --workers 2 --threads 8 --timeout 120