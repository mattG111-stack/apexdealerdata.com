#!/usr/bin/env bash
# Start Apex locally: Postgres + FastAPI backend + Next.js frontend.
# Stop everything with ./stop.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="$HOME/Applications/Postgres.app/Contents/Versions/17/bin"
PGDATA="$HOME/pgdata-apex"
NODEBIN="$HOME/.nvm/versions/node/v20.20.2/bin"

# 1. Postgres (port 5433)
if ! "$PGBIN/pg_isready" -p 5433 -q 2>/dev/null; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p 5433" -l "$PGDATA/server.log" start
  until "$PGBIN/pg_isready" -p 5433 -q; do sleep 0.5; done
fi
echo "postgres  ready on :5433"

# 2. Backend
cd "$ROOT/backend"
.venv/bin/uvicorn app.main:app --port 8000 > "$ROOT/api.log" 2>&1 &
until curl -sf http://localhost:8000/health > /dev/null; do sleep 0.5; done
echo "backend   ready on http://localhost:8000  (docs: /docs)"

# 3. Frontend
cd "$ROOT/frontend"
PATH="$NODEBIN:$PATH" npm run dev > "$ROOT/web.log" 2>&1 &
until curl -sf -o /dev/null http://localhost:3000; do sleep 0.5; done
echo "frontend  ready on http://localhost:3000"
