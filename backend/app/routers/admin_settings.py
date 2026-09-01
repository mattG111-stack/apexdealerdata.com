"""Admin-only platform settings: the Claude and CarJam API keys.

Setting a key is write-only by design. A caller can learn that a key is set and
its last four characters so an admin recognises which one is saved; there is no
endpoint that returns the value. That holds even for admins — a stolen admin
session should not hand over the platform's credentials.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import secrets_store
from ..db import get_db
from ..models import User
from ..security import require_admin

router = APIRouter(prefix="/admin/settings", tags=["admin"])


class SecretOut(BaseModel):
    name: str
    label: str
    help_text: str
    is_set: bool
    last_four: str | None
    updated_at: str | None
    unreadable: bool


class SecretIn(BaseModel):
    value: str = Field(min_length=1)


@router.get("", response_model=list[SecretOut])
def list_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[SecretOut]:
    return [
        SecretOut(
            name=s.name,
            label=s.label,
            help_text=s.help_text,
            is_set=s.is_set,
            last_four=s.last_four,
            updated_at=s.updated_at.isoformat() if s.updated_at else None,
            unreadable=s.unreadable,
        )
        for s in secrets_store.status(db)
    ]


@router.put("/{name}", response_model=SecretOut)
def set_setting(
    name: str,
    body: SecretIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SecretOut:
    if name not in secrets_store.SPECS:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, f"Unknown setting '{name}'.")

    error = secrets_store.validate(name, body.value)
    if error:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, error)

    secrets_store.set_value(db, name, body.value, user_id=admin.id)
    return _one(db, name)


@router.delete("/{name}", response_model=SecretOut)
def clear_setting(
    name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> SecretOut:
    if name not in secrets_store.SPECS:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, f"Unknown setting '{name}'.")
    secrets_store.clear(db, name)
    return _one(db, name)


class TestResult(BaseModel):
    ok: bool
    detail: str


@router.post("/{name}/test", response_model=TestResult)
def test_setting(
    name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> TestResult:
    """Prove the saved key actually works, rather than only that it looks right.

    A format check can't tell a revoked key from a live one, and the failure would
    otherwise surface to a dealer mid-question.
    """
    key = secrets_store.get(db, name)
    if not key:
        return TestResult(ok=False, detail="No key saved.")

    if name == secrets_store.ANTHROPIC_API_KEY:
        return _test_anthropic(key)
    if name == secrets_store.CARJAM_API_KEY:
        return _test_carjam(db)
    return TestResult(ok=False, detail=f"No test defined for '{name}'.")


def _test_carjam(db: Session) -> TestResult:
    """A real lookup against a real plate, because a format check can't tell a
    revoked key from a live one."""
    from ..carjam import CarJamUnavailable, lookup

    try:
        v = lookup(db, "ABC123")
        return TestResult(ok=True, detail=f"Key works — ABC123 is a {v.get('year')} {v.get('make')} {v.get('model')}.")
    except CarJamUnavailable as exc:
        return TestResult(ok=False, detail=str(exc)[:200])


def _test_anthropic(key: str) -> TestResult:
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        client.messages.create(
            model="claude-opus-4-8",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return TestResult(ok=True, detail="Key works.")
    except Exception as exc:  # noqa: BLE001 — the message is the useful part
        return TestResult(ok=False, detail=f"{type(exc).__name__}: {str(exc)[:200]}")


def _one(db: Session, name: str) -> SecretOut:
    for s in secrets_store.status(db):
        if s.name == name:
            return SecretOut(
                name=s.name,
                label=s.label,
                help_text=s.help_text,
                is_set=s.is_set,
                last_four=s.last_four,
                updated_at=s.updated_at.isoformat() if s.updated_at else None,
                unreadable=s.unreadable,
            )
    raise HTTPException(http_status.HTTP_404_NOT_FOUND, f"Unknown setting '{name}'.")
