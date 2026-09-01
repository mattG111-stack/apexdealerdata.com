# Apex Backend (FastAPI)

Weekly NZ car-market snapshots in, derived sales and pricing out.

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8000
```

Load data: `.venv/bin/python scripts/load_history.py`, or upload a week at
`/admin/upload`.

Score the pricing engine: `.venv/bin/python scripts/backtest_pricing.py`.
