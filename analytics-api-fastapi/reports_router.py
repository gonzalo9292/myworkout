# reports_router.py
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from datetime import datetime, timezone

from db_mongo import get_db
from schemas_reports import (
    ReportCreateRequest,
    ReportCreateResponse,
    ReportListResponse,
    ReportResponse,
    DeleteResponse,
)

router = APIRouter(prefix="/analytics", tags=["reports"])
COLLECTION = "report_generations"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _oid_time_iso(oid: ObjectId) -> str:
    return oid.generation_time.replace(tzinfo=timezone.utc).isoformat()


def _ymd_to_dmy_filename(from_ymd: str, to_ymd: str) -> str:
    def conv(s: str) -> str:
        if isinstance(s, str) and len(s) >= 10 and s[4] == "-" and s[7] == "-":
            y, m, d = s[0:4], s[5:7], s[8:10]
            return f"{d}-{m}-{y}"
        return s or "—"
    return f"Progreso_del_{conv(from_ymd)}_al_{conv(to_ymd)}.pdf"


def _normalize_doc(doc: dict) -> dict:
    """
    Normaliza un documento Mongo para frontend y para el response_model:
    - id: string
    - generated_at: SIEMPRE
    - range: {from,to} si se puede
    - pdf: filename calculado si falta y hay rango
    - result: summary/by_day/by_exercise
    """
    oid = doc.get("_id")
    if not isinstance(oid, ObjectId):
        raise HTTPException(status_code=500, detail="Documento Mongo sin _id válido")

    rng = doc.get("range") or {}
    res = doc.get("result") or {}
    meta = doc.get("meta") or {}
    pdf = doc.get("pdf") or {}

    from_ = rng.get("from") or res.get("from")
    to_ = rng.get("to") or res.get("to")

    generated_at = meta.get("generated_at") or _oid_time_iso(oid)

    filename = pdf.get("filename")
    if (not filename) and from_ and to_:
        filename = _ymd_to_dmy_filename(from_, to_)

    by_day = res.get("by_day") or []
    by_exercise = res.get("by_exercise") or []
    if not isinstance(by_day, list):
        by_day = []
    if not isinstance(by_exercise, list):
        by_exercise = []

    return {
        "id": str(oid),
        "generated_at": generated_at,
        "range": {"from": from_, "to": to_},
        "pdf": {"filename": filename, "generated": bool(pdf.get("generated", True))},
        "result": {
            "from": res.get("from"),
            "to": res.get("to"),
            "summary": res.get("summary"),
            "by_day": by_day,
            "by_exercise": by_exercise,
        },
    }


@router.post(
    "/reports",
    response_model=ReportCreateResponse,
    summary="Crear informe en historial",
    description="Inserta un registro de generación de informe en MongoDB para mantener el historial.",
)
async def create_report(payload: ReportCreateRequest) -> ReportCreateResponse:
    db = get_db()

    data = payload.model_dump(by_alias=True, exclude_none=True)

    # Garantías mínimas
    data.setdefault("meta", {})
    data["meta"].setdefault("generated_at", _iso_now())

    # Completa range si no viene, usando result.from/to
    data.setdefault("range", {})
    res = data.get("result") or {}
    data["range"].setdefault("from", res.get("from"))
    data["range"].setdefault("to", res.get("to"))

    # Completa pdf.filename si no viene y hay rango
    data.setdefault("pdf", {})
    data["pdf"].setdefault("generated", True)
    rng = data.get("range") or {}
    if not data["pdf"].get("filename") and rng.get("from") and rng.get("to"):
        data["pdf"]["filename"] = _ymd_to_dmy_filename(rng["from"], rng["to"])

    ins = await db[COLLECTION].insert_one(data)
    return ReportCreateResponse(ok=True, id=str(ins.inserted_id))


@router.get(
    "/reports",
    response_model=ReportListResponse,
    summary="Listar informes del historial",
    description="Devuelve informes ordenados por meta.generated_at desc (si falta, se infiere por ObjectId).",
)
async def list_reports(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
) -> ReportListResponse:
    db = get_db()

    cursor = (
        db[COLLECTION]
        .find({})
        .sort("meta.generated_at", -1)
        .skip(skip)
        .limit(limit)
    )

    items = []
    async for doc in cursor:
        items.append(_normalize_doc(doc))

    return ReportListResponse(items=items, limit=limit, skip=skip)


@router.get(
    "/reports/{report_id}",
    response_model=ReportResponse,
    summary="Obtener detalle de un informe",
)
async def get_report(report_id: str) -> ReportResponse:
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="ID inválido")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(report_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Informe no encontrado")

    # Validación final contra response_model
    return ReportResponse.model_validate(_normalize_doc(doc))


@router.delete(
    "/reports/{report_id}",
    response_model=DeleteResponse,
    summary="Eliminar un informe del historial",
)
async def delete_report(report_id: str) -> DeleteResponse:
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="ID inválido")

    db = get_db()
    res = await db[COLLECTION].delete_one({"_id": ObjectId(report_id)})

    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Informe no encontrado")

    return DeleteResponse(ok=True, deleted=True, id=report_id)
