"""Thin bridge so the assistant tool returns plain dicts."""

from ..pricing.opportunities import compute


def compute_as_dicts(db, limit: int = 10) -> list[dict]:
    return [o.__dict__ for o in compute(db, limit=limit)]
