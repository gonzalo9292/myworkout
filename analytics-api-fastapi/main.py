# main.py
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
from collections import defaultdict
from datetime import date, datetime, timedelta
import os

from reports_router import router as reports_router

# =========================================================
# App
# =========================================================
app = FastAPI(title="MyWorkout Analytics API")

# IMPORTANTE: registra el endpoint POST /analytics/reports
app.include_router(reports_router)

# =========================================================
# CORS (para llamadas desde Angular en http://localhost:4200)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# Config
# =========================================================
CORE_API_BASE = os.getenv("CORE_API_BASE", "http://core-api:3000")

# =========================================================
# Health
# =========================================================
@app.get("/health")
def health():
    return {"status": "ok"}

# =========================================================
# Helpers
# =========================================================
def _validate_iso_date(s: str, field: str) -> str:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except Exception:
        raise HTTPException(
            status_code=400, detail=f"'{field}' debe tener formato YYYY-MM-DD"
        )

def _fetch_rows(from_date: str, to_date: str):
    try:
        resp = requests.get(
            f"{CORE_API_BASE}/analytics/workouts",
            params={"from": from_date, "to": to_date},
            timeout=10,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Core API no accesible: {e}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Error desde Core API: {resp.text}",
        )

    payload = resp.json()
    return payload.get("rows", [])

def _compute_summary(from_date: str, to_date: str, rows: list):
    if not rows:
        return {
            "from": from_date,
            "to": to_date,
            "summary": {
                "workouts": 0,
                "exercises": 0,
                "sets": 0,
                "total_reps": 0,
                "total_volume": 0,
            },
            "by_day": [],
            "by_exercise": [],
        }

    workouts = set()
    exercises = set()

    sets_count = 0
    total_reps = 0
    total_volume = 0.0

    volume_by_day = defaultdict(float)
    volume_by_exercise = defaultdict(float)

    for r in rows:
        workout_id = r.get("workout_id")
        exercise_id = r.get("exercise_id")

        if workout_id is not None:
            workouts.add(workout_id)
        if exercise_id is not None:
            exercises.add(exercise_id)

        if r.get("set_id") is None:
            continue

        reps = r.get("reps") or 0

        try:
            weight = float(r.get("weight_kg") or 0)
        except Exception:
            weight = 0.0

        volume = reps * weight

        sets_count += 1
        total_reps += reps
        total_volume += volume

        day = str(r.get("workout_date", ""))[:10]
        if day:
            volume_by_day[day] += volume

        ex_name = r.get("exercise_name") or (
            f"exercise_{exercise_id}" if exercise_id is not None else "unknown_exercise"
        )
        volume_by_exercise[ex_name] += volume

    return {
        "from": from_date,
        "to": to_date,
        "summary": {
            "workouts": len(workouts),
            "exercises": len(exercises),
            "sets": sets_count,
            "total_reps": total_reps,
            "total_volume": round(total_volume, 2),
        },
        "by_day": [
            {"date": d, "volume": round(v, 2)}
            for d, v in sorted(volume_by_day.items())
        ],
        "by_exercise": [
            {"exercise": e, "volume": round(v, 2)}
            for e, v in sorted(volume_by_exercise.items(), key=lambda x: -x[1])
        ],
    }

# =========================================================
# Endpoints
# =========================================================
@app.get("/analytics/summary")
def analytics_summary(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
):
    from_date = _validate_iso_date(from_date, "from")
    to_date = _validate_iso_date(to_date, "to")

    if from_date > to_date:
        raise HTTPException(
            status_code=400, detail="'from' no puede ser posterior a 'to'"
        )

    rows = _fetch_rows(from_date, to_date)
    return _compute_summary(from_date, to_date, rows)

@app.post("/analytics/rebuild/latest")
def analytics_rebuild_latest(days: int = Query(90, ge=1, le=3650)):
    to_d = date.today()
    from_d = to_d - timedelta(days=days)

    from_date = from_d.strftime("%Y-%m-%d")
    to_date = to_d.strftime("%Y-%m-%d")

    rows = _fetch_rows(from_date, to_date)

    return {
        "range": {"from": from_date, "to": to_date, "days": days},
        "result": _compute_summary(from_date, to_date, rows),
    }
