from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from datetime import datetime, timezone

from db_mongo import get_db

router = APIRouter(prefix="/analytics", tags=["reports"])
COLLECTION = "report_generations"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _oid_time_iso(oid: ObjectId) -> str:
    # ObjectId lleva timestamp interno
    return oid.generation_time.replace(tzinfo=timezone.utc).isoformat()


def _ymd_to_dmy_filename(from_ymd: str, to_ymd: str) -> str:
    def conv(s: str) -> str:
        if isinstance(s, str) and len(s) >= 10 and s[4] == "-" and s[7] == "-":
            y, m, d = s[0:4], s[5:7], s[8:10]
            return f"{d}-{m}-{y}"
        return s or "—"

    return f"Progreso_del_{conv(from_ymd)}_al_{conv(to_ymd)}.pdf"


def _pick_range(doc: dict) -> dict:
    """
    Devuelve {from, to} intentando sacar el rango del documento aunque falten campos.
    Prioridad:
    1) doc.range.from/to
    2) doc.result.from/to
    3) None
    """
    rng = doc.get("range") or {}
    res = doc.get("result") or {}

    from_ = rng.get("from") or res.get("from")
    to_ = rng.get("to") or res.get("to")

    out = {}
    if from_:
        out["from"] = from_
    if to_:
        out["to"] = to_
    return out


def _pick_generated_at(doc: dict, oid: ObjectId) -> str:
    meta = doc.get("meta") or {}
    ga = meta.get("generated_at")
    if ga:
        return ga
    return _oid_time_iso(oid)


def _pick_pdf(doc: dict, rng: dict) -> dict:
    """
    Devuelve pdf {filename, generated}.
    Si falta filename pero tenemos rango, lo calculamos.
    """
    pdf = doc.get("pdf") or {}
    filename = pdf.get("filename")

    from_ = rng.get("from")
    to_ = rng.get("to")

    if (not filename) and from_ and to_:
        filename = _ymd_to_dmy_filename(from_, to_)

    return {
        "filename": filename,
        "generated": bool(pdf.get("generated", True)),
    }


def _pick_result(doc: dict) -> dict:
    """
    Devuelve result normalizado aunque falten piezas.
    """
    res = doc.get("result") or {}
    summary = res.get("summary") or None
    by_day = res.get("by_day") or []
    by_exercise = res.get("by_exercise") or []

    # Normaliza tipos “por si acaso”
    if not isinstance(by_day, list):
        by_day = []
    if not isinstance(by_exercise, list):
        by_exercise = []

    return {
        "summary": summary,
        "by_day": by_day,
        "by_exercise": by_exercise,
        # opcional: mantengo from/to si venían
        "from": res.get("from"),
        "to": res.get("to"),
    }


def _normalize_doc(doc: dict) -> dict:
    """
    Normaliza un documento Mongo para frontend:
    - id: string
    - generated_at: SIEMPRE
    - range: lo que se pueda
    - pdf: filename calculado si falta y hay rango
    - result: summary/by_day/by_exercise
    """
    oid = doc.get("_id")
    if not isinstance(oid, ObjectId):
        raise HTTPException(status_code=500, detail="Documento Mongo sin _id válido")

    rng = _pick_range(doc)
    generated_at = _pick_generated_at(doc, oid)
    pdf = _pick_pdf(doc, rng)
    result = _pick_result(doc)

    # Para evitar que el frontend muestre "—" en rango, intentamos completar
    # con result.from/to si existen
    if "from" not in rng and result.get("from"):
        rng["from"] = result["from"]
    if "to" not in rng and result.get("to"):
        rng["to"] = result["to"]

    return {
        "id": str(oid),
        "generated_at": generated_at,
        "range": rng,
        "pdf": pdf,
        "result": {
            "summary": result.get("summary"),
            "by_day": result.get("by_day", []),
            "by_exercise": result.get("by_exercise", []),
        },
    }


@router.post("/reports")
async def create_report(payload: dict):
    """
    Inserta un informe en Mongo.
    Recomendado (desde frontend):
    {
      "range": {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},
      "result": { "summary":..., "by_day":..., "by_exercise":..., "from":"...", "to":"..." },
      "pdf": {"filename":"...", "generated": true},
      "meta": {"generated_at":"...", "source":"frontend-angular", "trigger":"user_click"}
    }
    """
    db = get_db()
    payload = dict(payload or {})

    # Garantías mínimas
    payload.setdefault("meta", {})
    if isinstance(payload["meta"], dict):
        payload["meta"].setdefault("generated_at", _iso_now())

    # Completa range si no viene, usando result.from/to
    payload.setdefault("range", {})
    if isinstance(payload["range"], dict):
        res = payload.get("result") or {}
        payload["range"].setdefault(
            "from", (res.get("from") if isinstance(res, dict) else None)
        )
        payload["range"].setdefault(
            "to", (res.get("to") if isinstance(res, dict) else None)
        )

    # Completa pdf.filename si no viene y hay rango
    payload.setdefault("pdf", {})
    if isinstance(payload["pdf"], dict):
        payload["pdf"].setdefault("generated", True)
        rng = payload.get("range") or {}
        if not payload["pdf"].get("filename") and rng.get("from") and rng.get("to"):
            payload["pdf"]["filename"] = _ymd_to_dmy_filename(rng["from"], rng["to"])

    res = await db[COLLECTION].insert_one(payload)
    return {"ok": True, "id": str(res.inserted_id)}


@router.get("/reports")
async def list_reports(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """
    Listado para historial.
    Ordena por meta.generated_at desc (si falta, Mongo lo dejará “más abajo”),
    pero igualmente normalizamos.
    """
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

    return {"items": items, "limit": limit, "skip": skip}


@router.get("/reports/{report_id}")
async def get_report(report_id: str):
    """
    Detalle de un informe.
    """
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="ID inválido")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(report_id)})

    if not doc:
        raise HTTPException(status_code=404, detail="Informe no encontrado")

    return _normalize_doc(doc)


# =========================================================
# NUEVO: DELETE /analytics/reports/{id}
# =========================================================
@router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    """
    Elimina un informe del historial (MongoDB).
    """
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="ID inválido")

    db = get_db()
    res = await db[COLLECTION].delete_one({"_id": ObjectId(report_id)})

    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Informe no encontrado")

    return {"ok": True, "deleted": True, "id": report_id}
