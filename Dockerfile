# Explicit build for Railway.
#
# Without this, Railway guesses. On an earlier deploy it found a lone HTML file
# at the repo root, decided this was a static site, and served that file from a
# busybox container — so the API never ran at all. A Dockerfile removes the
# guess.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Dependencies first so a code change doesn't reinstall them.
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ ./

EXPOSE 8000

# Migrations run on every boot; alembic upgrade is idempotent. $PORT is injected
# by Railway, with a default so the image runs locally too.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
