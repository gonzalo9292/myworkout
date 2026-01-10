from pydantic import BaseModel, Field
from typing import List, Optional


class AnalyticsByDay(BaseModel):
    date: str
    volume: float


class AnalyticsByExercise(BaseModel):
    exercise: str
    volume: float


class AnalyticsSummary(BaseModel):
    workouts: int
    exercises: int
    sets: int
    total_reps: int
    total_volume: float


class AnalyticsResult(BaseModel):
    from_: str = Field(alias="from")
    to: str
    summary: AnalyticsSummary
    by_day: List[AnalyticsByDay]
    by_exercise: List[AnalyticsByExercise]


class ReportCreateRequest(BaseModel):
    from_: str = Field(alias="from")
    to: str
    filename: str
    result: AnalyticsResult
    source: Optional[str] = "frontend-angular"
    trigger: Optional[str] = "user_click"


class ReportCreateResponse(BaseModel):
    ok: bool
    id: str
