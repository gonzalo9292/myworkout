# schemas_reports.py
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
    # OJO: en JSON es "from", pero en Python no puedes usar from como nombre
    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None

    summary: Optional[AnalyticsSummary] = None
    by_day: List[AnalyticsByDay] = []
    by_exercise: List[AnalyticsByExercise] = []


class ReportRange(BaseModel):
    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None


class ReportPdf(BaseModel):
    filename: Optional[str] = None
    generated: bool = True


class ReportMeta(BaseModel):
    generated_at: Optional[str] = None
    source: Optional[str] = "frontend-angular"
    trigger: Optional[str] = "user_click"


class ReportCreateRequest(BaseModel):
    range: Optional[ReportRange] = None
    result: Optional[AnalyticsResult] = None
    pdf: Optional[ReportPdf] = None
    meta: Optional[ReportMeta] = None


class ReportResponse(BaseModel):
    id: str
    generated_at: str
    range: ReportRange
    pdf: ReportPdf
    result: AnalyticsResult


class ReportCreateResponse(BaseModel):
    ok: bool
    id: str


class ReportListResponse(BaseModel):
    items: List[ReportResponse]
    limit: int
    skip: int


class DeleteResponse(BaseModel):
    ok: bool
    deleted: bool
    id: str
