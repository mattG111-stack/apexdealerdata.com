#!/usr/bin/env bash
# Stop everything started by ./start.sh
PGBIN="$HOME/Applications/Postgres.app/Contents/Versions/17/bin"

pkill -f "uvicorn app.main:app" 2>/dev/null && echo "backend   stopped" || echo "backend   not running"
pkill -f "next dev"            2>/dev/null && echo "frontend  stopped" || echo "frontend  not running"
"$PGBIN/pg_ctl" -D "$HOME/pgdata-ollie" stop 2>/dev/null && echo "postgres  stopped" || echo "postgres  not running"
