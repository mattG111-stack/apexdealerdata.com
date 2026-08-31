"""The question box.

One endpoint. The dealer asks; the assistant answers using tools bound to their
dealership. There is no key management here — Apex runs on one platform Claude
key set by an admin (see routers.admin_settings), because a dealer principal has
no reason to own one.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..assistant.agent import AssistantUnavailable, Turn, ask
from ..db import get_db
from ..models import User
from ..security import current_user

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

# Per-user monthly cap. The platform pays for every question, so one account
# can't be allowed to run up an unbounded bill.
MONTHLY_QUESTION_LIMIT = 500


class TurnIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[TurnIn] = Field(default_factory=list, max_length=20)


class ToolCallOut(BaseModel):
    name: str
    arguments: dict | None = None


class AskOut(BaseModel):
    answer: str
    tool_calls: list[ToolCallOut] = Field(default_factory=list)
    questions_used: int
    questions_limit: int


def _roll_period(user: User, db: Session) -> None:
    """Reset the counter when the calendar month turns over."""
    today = date.today()
    start = today.replace(day=1)
    if user.assistant_period_start != start:
        user.assistant_period_start = start
        user.assistant_questions_used = 0
        db.commit()


@router.post("/ask", response_model=AskOut)
def ask_question(
    body: AskIn,
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AskOut:
    if me.dealer_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Pick your dealership first — everything is scoped to it.",
        )

    _roll_period(me, db)
    if me.assistant_questions_used >= MONTHLY_QUESTION_LIMIT:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've used all {MONTHLY_QUESTION_LIMIT} questions this month.",
        )

    try:
        result = ask(
            db,
            me,
            body.question,
            [Turn(role=t.role, content=t.content) for t in body.history],
        )
    except AssistantUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    me.assistant_questions_used += 1
    db.commit()

    return AskOut(
        answer=result.text,
        tool_calls=[
            ToolCallOut(name=c.name, arguments=getattr(c, "arguments", None))
            for c in getattr(result, "tool_calls", [])
        ],
        questions_used=me.assistant_questions_used,
        questions_limit=MONTHLY_QUESTION_LIMIT,
    )
