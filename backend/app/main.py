from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import SessionLocal
from .routers import (
    admin_dealers,
    admin_metrics,
    admin_settings,
    admin_upload,
    assistant,
    auth,
    billing,
    dealer,
    release,
)
from .security import ensure_seed_admin, require_active


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        ensure_seed_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Apex Dealer Data API",
    version="0.1.0",
    description="Backend for the Apex dealer market platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The product data itself is paywalled: no free access. These routers require an
# active subscription (or admin / admin-approved account) — an authenticated but
# not-yet-subscribed user gets 402 and the frontend routes them to onboarding.
PAYWALL = [Depends(require_active)]

app.include_router(auth.router)
app.include_router(auth.admin_router)
app.include_router(assistant.router, dependencies=PAYWALL)
app.include_router(dealer.router, dependencies=PAYWALL)
app.include_router(admin_upload.router)
app.include_router(admin_metrics.router)
app.include_router(admin_settings.router)
app.include_router(admin_dealers.router)
app.include_router(release.router)
app.include_router(billing.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "Apex API", "docs": "/docs"}
