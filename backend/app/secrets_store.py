"""Platform secrets — set once by an admin, used by the whole app.

Ollie asked every user for their own LLM key. That fits a tool for investors who
already hold one; it does not fit a dealer principal, who has no reason to own a
Claude key and would treat being asked for one as a reason not to sign up. So
Apex keeps one platform key per service, set in the admin dashboard.

Encryption is Fernet with a key derived from the app's JWT secret, so there is no
second secret to provision. Rotating `jwt_secret` therefore makes stored keys
unreadable — decryption fails closed and an admin is asked to re-enter, which is
the right failure mode for a credential.

The plaintext is only ever held in memory for one request. The API can report
that a key is set and its last four characters; the value itself has no read path.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from .config import settings
from .models import AppSetting

ANTHROPIC_API_KEY = "anthropic_api_key"
CARJAM_API_KEY = "carjam_api_key"


@dataclass(frozen=True)
class SecretSpec:
    name: str
    label: str
    help_text: str
    # Cheap shape check so an obvious paste error is caught before a 401. Format
    # only — whether the key works is proven by the test call, not by this.
    prefix: str | None = None
    min_length: int = 16


SPECS: dict[str, SecretSpec] = {
    ANTHROPIC_API_KEY: SecretSpec(
        name=ANTHROPIC_API_KEY,
        label="Claude API key",
        help_text="Powers the assistant. Every dealer question runs on this key.",
        prefix="sk-ant-",
        min_length=20,
    ),
    CARJAM_API_KEY: SecretSpec(
        name=CARJAM_API_KEY,
        label="CarJam API key",
        help_text=(
            "Plate lookup. A dealer types a plate and the make, model, spec and "
            "engine size are filled in, so there is no guessing which variant."
        ),
        # CarJam's key format isn't documented here, so only length is checked —
        # inventing a prefix rule would reject valid keys.
        prefix=None,
        min_length=8,
    ),
}


def _fernet() -> Fernet:
    # Fernet needs a 32-byte urlsafe-base64 key; the JWT secret is an arbitrary
    # string, so hash it to the right shape.
    digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(stored: str | None) -> str | None:
    """Plaintext, or None if it can't be read.

    Fails closed: a rotated jwt_secret or a corrupted value yields None rather
    than raising, so the caller says "re-enter the key" instead of returning 500.
    """
    if not stored:
        return None
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def validate(name: str, value: str) -> str | None:
    """An error message, or None when the value looks plausible."""
    spec = SPECS.get(name)
    if spec is None:
        return f"Unknown setting '{name}'."
    key = value.strip()
    if len(key) < spec.min_length:
        return "That key looks too short."
    if spec.prefix and not key.startswith(spec.prefix):
        return f"{spec.label}s start with '{spec.prefix}'."
    return None


def get(session: Session, name: str) -> str | None:
    """The plaintext value, or None if unset or unreadable."""
    row = session.query(AppSetting).filter(AppSetting.name == name).one_or_none()
    return decrypt(row.value_encrypted) if row else None


def set_value(session: Session, name: str, value: str, user_id: int | None = None) -> None:
    row = session.query(AppSetting).filter(AppSetting.name == name).one_or_none()
    if row is None:
        row = AppSetting(name=name)
        session.add(row)
    row.value_encrypted = encrypt(value.strip())
    row.updated_by_id = user_id
    session.commit()


def clear(session: Session, name: str) -> None:
    row = session.query(AppSetting).filter(AppSetting.name == name).one_or_none()
    if row is not None:
        row.value_encrypted = None
        session.commit()


@dataclass
class SecretStatus:
    name: str
    label: str
    help_text: str
    is_set: bool
    last_four: str | None
    updated_at: datetime | None
    # True when a value is stored but can't be decrypted — almost always a
    # rotated jwt_secret. Surfaced so the admin is told to re-enter rather than
    # left wondering why the assistant stopped working.
    unreadable: bool


def status(session: Session) -> list[SecretStatus]:
    rows = {r.name: r for r in session.query(AppSetting).all()}
    out: list[SecretStatus] = []
    for spec in SPECS.values():
        row = rows.get(spec.name)
        stored = row.value_encrypted if row else None
        plain = decrypt(stored)
        out.append(
            SecretStatus(
                name=spec.name,
                label=spec.label,
                help_text=spec.help_text,
                is_set=bool(plain),
                last_four=plain[-4:] if plain and len(plain) >= 4 else None,
                updated_at=row.updated_at if row else None,
                unreadable=bool(stored) and plain is None,
            )
        )
    return out
