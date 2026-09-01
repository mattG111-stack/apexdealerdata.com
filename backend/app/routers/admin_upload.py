"""Weekly snapshot upload.

A file lands, a job row is created immediately, and the ingest runs in the
background — a 50k-row file takes about nine seconds, which is long enough that
holding the request open would time out behind a proxy.

The ingest is deliberately *not* a publish: the week arrives staged, gets scored
for suspect rows, and only becomes visible to dealers when an admin publishes it
(see app.release).
"""

from __future__ import annotations

import shutil
import tempfile
import traceback
from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import release as release_service
from ..db import SessionLocal, get_db
from ..ingest import ingest_snapshot, parse_week_ending
from ..models import IngestJob, Listing, User, WeeklySnapshot
from ..security import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class JobRow(BaseModel):
    id: int
    filename: str
    week_ending: str | None
    status: str
    progress_pct: int
    stage: str | None
    rows_total: int | None
    rows_inserted: int | None
    rows_rejected: int | None
    sales_derived: int | None
    relists_flagged: int | None
    error_message: str | None
    audit_warnings: str | None
    snapshot_id: int | None
    created_at: str | None
    completed_at: str | None


def _job_row(job: IngestJob) -> JobRow:
    return JobRow(
        id=job.id,
        filename=job.filename,
        week_ending=job.week_ending.isoformat() if job.week_ending else None,
        status=job.status,
        progress_pct=job.progress_pct,
        stage=job.stage,
        rows_total=job.rows_total,
        rows_inserted=job.rows_inserted,
        rows_rejected=job.rows_rejected,
        sales_derived=job.sales_derived,
        relists_flagged=job.relists_flagged,
        error_message=job.error_message,
        audit_warnings=job.audit_warnings,
        snapshot_id=job.snapshot_id,
        created_at=job.created_at.isoformat() if job.created_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


def _update(db: Session, job_id: int, **kwargs) -> None:
    job = db.get(IngestJob, job_id)
    if job is None:
        return
    for key, value in kwargs.items():
        setattr(job, key, value)
    db.commit()


def _run_job(job_id: int) -> None:
    """Background ingest. Owns its own session — the request's is long gone."""
    db = SessionLocal()
    try:
        job = db.get(IngestJob, job_id)
        if job is None or not job.file_path:
            return

        from datetime import datetime, timezone

        _update(db, job_id, status="running", stage="Reading file",
                started_at=datetime.now(timezone.utc), progress_pct=10)

        result = ingest_snapshot(db, job.file_path, job.week_ending, job.uploaded_by_id)

        _update(db, job_id, stage="Scoring rows", progress_pct=70)
        reasons = release_service.hold_flagged_rows(db, result.snapshot_id)

        # Price the week as part of the load. The whole point of the hub is that
        # uploading a file is ALL the admin does — if pricing were a separate
        # script, every hosted deploy would show a yard full of unpriced stock.
        _update(db, job_id, stage="Pricing stock", progress_pct=80)
        from ..pricing.deals import price_week

        priced = price_week(db, result.week_ending, verbose=False)
        warnings_extra = (
            f"priced {priced['priced']:,} cars, {priced['deals']:,} flagged underpriced"
        )

        warnings = list(result.warnings)
        warnings.append(warnings_extra)
        if reasons:
            warnings.append(
                "Held: " + ", ".join(f"{n:,} {r.lower()}" for r, n in reasons.items())
            )

        import json

        _update(
            db, job_id,
            status="completed", stage="Staged for review", progress_pct=100,
            rows_total=result.rows_total, rows_inserted=result.rows_inserted,
            rows_rejected=result.rows_rejected, sales_derived=result.sales_derived,
            relists_flagged=result.relists_flagged, snapshot_id=result.snapshot_id,
            audit_warnings=json.dumps(warnings) if warnings else None,
            completed_at=datetime.now(timezone.utc),
        )
    except Exception as exc:  # noqa: BLE001 — the message goes to the admin UI
        from datetime import datetime, timezone

        _update(
            db, job_id, status="failed", progress_pct=100,
            error_message=f"{type(exc).__name__}: {exc}"[:2000],
            audit_warnings=traceback.format_exc()[-2000:],
            completed_at=datetime.now(timezone.utc),
        )
    finally:
        # The temp file is only needed for the duration of the ingest.
        try:
            job = db.get(IngestJob, job_id)
            if job and job.file_path:
                Path(job.file_path).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001 — cleanup must never mask the result
            pass
        db.close()


def _save_upload(upload: UploadFile) -> tuple[str, int]:
    suffix = Path(upload.filename or "upload.csv").suffix or ".csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(upload.file, tmp)
        return tmp.name, tmp.tell()


@router.post("/upload", response_model=JobRow)
def upload_snapshot(
    background: BackgroundTasks,
    file: UploadFile,
    week_ending: date | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> JobRow:
    """Stage one weekly listings file.

    The week-ending date comes from the filename ('week ending 03-08-26.csv')
    unless given explicitly. Guessing wrong would file the rows under the wrong
    week and corrupt every diff after it, so an unreadable name is an error
    rather than a default to today.
    """
    filename = file.filename or "upload.csv"
    week = week_ending or parse_week_ending(filename)
    if week is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Can't read a week-ending date from '{filename}'. "
            "Rename it like 'week ending 03-08-26.csv' or pass week_ending.",
        )

    existing = db.scalar(select(WeeklySnapshot).where(WeeklySnapshot.week_ending == week))
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Week ending {week} is already loaded (snapshot {existing.id}).",
        )

    path, size = _save_upload(file)
    job = IngestJob(
        filename=filename,
        week_ending=week,
        file_size_bytes=size,
        file_path=path,
        status="pending",
        uploaded_by_id=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background.add_task(_run_job, job.id)
    return _job_row(job)


@router.get("/jobs/{job_id}", response_model=JobRow)
def get_job(
    job_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> JobRow:
    job = db.get(IngestJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such job.")
    return _job_row(job)


@router.get("/jobs", response_model=list[JobRow])
def list_recent_jobs(
    limit: int = 20,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[JobRow]:
    jobs = db.execute(
        select(IngestJob).order_by(IngestJob.id.desc()).limit(min(limit, 100))
    ).scalars()
    return [_job_row(j) for j in jobs]


class SnapshotRow(BaseModel):
    id: int
    week_ending: str
    filename: str
    rows_inserted: int
    rows_rejected: int
    status: str
    sales_confirmed: bool
    published_at: str | None


@router.get("/snapshots", response_model=list[SnapshotRow])
def list_snapshots(
    limit: int = 52,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[SnapshotRow]:
    rows = db.execute(
        select(WeeklySnapshot)
        .order_by(WeeklySnapshot.week_ending.desc())
        .limit(min(limit, 200))
    ).scalars()
    return [
        SnapshotRow(
            id=s.id,
            week_ending=s.week_ending.isoformat(),
            filename=s.filename,
            rows_inserted=s.rows_inserted,
            rows_rejected=s.rows_rejected,
            status=s.status,
            sales_confirmed=s.sales_confirmed_at is not None,
            published_at=s.published_at.isoformat() if s.published_at else None,
        )
        for s in rows
    ]


class DataStatus(BaseModel):
    """What the tool actually has to answer from."""
    for_sale_week: str | None       # the live snapshot every price is compared against
    for_sale_count: int
    sold_weeks_held: int            # how many weeks of sold history are stored
    sold_total: int                 # sales across those weeks, relists excluded
    sold_window: list[dict]         # week-by-week, newest first
    dealers: int
    priced: int                     # live listings with a stored valuation
    oldest_week: str | None
    newest_week: str | None


@router.get("/data-status", response_model=DataStatus)
def data_status(
    weeks: int = 8,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DataStatus:
    """The hub's headline: what's loaded, and what Ollie can therefore answer.

    Sold history is windowed to the last `weeks` (8 by default) because that is
    what the pricing and speed answers draw on. Older weeks stay in the database
    for back-testing, but they are not what the tool reads.
    """
    from sqlalchemy import func as _f

    latest = db.scalar(select(_f.max(Listing.week_ending)))
    for_sale_count = db.scalar(
        select(_f.count(Listing.id)).where(
            Listing.week_ending == latest, Listing.is_held.is_(False)
        )
    ) or 0 if latest else 0

    priced = db.scalar(
        select(_f.count(Listing.id)).where(
            Listing.week_ending == latest, Listing.fair_value.isnot(None)
        )
    ) or 0 if latest else 0

    from ..models import Dealer, Sale

    sold_weeks = [
        r[0] for r in db.execute(
            select(Sale.sold_week).where(Sale.is_relist.is_(False))
            .group_by(Sale.sold_week).order_by(Sale.sold_week.desc()).limit(weeks)
        )
    ]

    window = []
    for wk in sold_weeks:
        n = db.scalar(
            select(_f.count(Sale.id)).where(
                Sale.sold_week == wk, Sale.is_relist.is_(False)
            )
        ) or 0
        provisional = db.scalar(
            select(_f.count(Sale.id)).where(
                Sale.sold_week == wk, Sale.is_provisional.is_(True)
            )
        ) or 0
        window.append({
            "week": wk.isoformat(),
            "sales": n,
            "provisional": provisional > 0,
        })

    bounds = db.execute(
        select(_f.min(WeeklySnapshot.week_ending), _f.max(WeeklySnapshot.week_ending))
    ).one()

    return DataStatus(
        for_sale_week=latest.isoformat() if latest else None,
        for_sale_count=for_sale_count,
        sold_weeks_held=len(sold_weeks),
        sold_total=sum(w["sales"] for w in window),
        sold_window=window,
        dealers=db.scalar(select(_f.count(Dealer.id))) or 0,
        priced=priced,
        oldest_week=bounds[0].isoformat() if bounds[0] else None,
        newest_week=bounds[1].isoformat() if bounds[1] else None,
    )


@router.post("/reprice")
def reprice_latest(
    background: BackgroundTasks,
    _: User = Depends(require_admin),
) -> dict:
    """Price (or re-price) the latest loaded week on demand.

    Exists for recovery: a week loaded under an older build, or a pricing-engine
    update, would otherwise mean re-uploading a file just to get valuations.
    Runs in the background — 50k cars takes a few minutes.
    """
    def _run() -> None:
        db = SessionLocal()
        try:
            from ..pricing.deals import price_week

            price_week(db, verbose=False)
        finally:
            db.close()

    background.add_task(_run)
    return {"started": True, "note": "Pricing the latest week — a few minutes for 50k cars."}


@router.post("/rebuild-sales")
def rebuild_missing_sales(
    background: BackgroundTasks,
    _: User = Depends(require_admin),
) -> dict:
    """Derive sales for any week that's missing them, in date order.

    Exists for backfill: a week uploaded before its predecessor derives zero
    sales (nothing to diff against). Load the history, press this once, and
    every consecutive pair gets its sold list — including relist confirmation
    for the week before each.
    """
    def _run() -> None:
        from sqlalchemy import func as _f

        from ..ingest import (
            IngestResult,
            _confirm_previous_sales,
            _derive_sales,
            _listing_rows,
            _previous_snapshot,
        )
        from ..models import Sale

        db = SessionLocal()
        try:
            snaps = db.execute(
                select(WeeklySnapshot).order_by(WeeklySnapshot.week_ending)
            ).scalars().all()
            for snap in snaps:
                prev = _previous_snapshot(db, snap)
                if prev is None:
                    continue
                existing = db.scalar(
                    select(_f.count(Sale.id)).where(Sale.sold_week == snap.week_ending)
                ) or 0
                if existing:
                    continue
                rows = _listing_rows(db, snap.id)
                result = IngestResult(snapshot_id=snap.id, week_ending=snap.week_ending)
                _derive_sales(db, snap, rows, result)
                _confirm_previous_sales(db, snap, rows, result)
                db.commit()
        finally:
            db.close()

    background.add_task(_run)
    return {"started": True,
            "note": "Deriving sales for any week missing them — a minute or two per week."}
