import csv
import io
import json
import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response

from app.core.config import settings
from app.corpus.custom_search import build_custom_search_query, criteria_count
from app.corpus.schemas import CustomSearchPayload
from app.services.sparql_client import MAX_SEARCH_RESPONSE_BYTES, sparql_client
from app.shared.limits import HeavySlot, check_criteria_count, limit_heavy_queries
from app.shared.sparql import sparql_iri
from app.shared.sparql_guard import prepare_query_async

router = APIRouter(tags=["Export & Downloads"])

QUERIES_DIR = settings.QUERIES_DIR
XML_BASE_DIR = settings.XML_DATA_DIR

# A spreadsheet reads a cell starting with one of these as a formula (CSV injection).
_FORMULA_PREFIXES = ("=", "+", "-", "@")


def _csv_cell(value: str) -> str:
    """Neutralize a cell that a spreadsheet would execute as a formula (docs/security.md)."""
    return "'" + value if value.startswith(_FORMULA_PREFIXES) else value


def json_to_csv(sparql_json: dict[str, Any]) -> str:
    """Convert SPARQL JSON results to CSV: `head.vars` as columns, one row per binding.

    The `csv` module quotes the values that contain the `;` delimiter, quotes or line
    breaks (Greek text has `;` as its question mark). Cells starting with `=`, `+`, `-`
    or `@` get a leading `'`, so that a spreadsheet does not run them as formulas.
    """
    headers = sparql_json.get("head", {}).get("vars", [])
    bindings = sparql_json.get("results", {}).get("bindings", [])

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow([_csv_cell(h) for h in headers])
    for row in bindings:
        writer.writerow([_csv_cell(row.get(h, {}).get("value", "")) for h in headers])
    return buffer.getvalue()


@router.get("/download-xml")
async def download_xml(file: str = Query(..., description="Chemin ou nom du fichier XML")):
    # Sécurisation stricte contre le Path Traversal
    clean_file = file.replace("\\", "/").lstrip("/")
    if ".." in clean_file:
        raise HTTPException(status_code=400, detail="Chemin invalide (séquence .. interdite)")

    target_path = os.path.abspath(os.path.join(XML_BASE_DIR, clean_file))
    base_abs = os.path.abspath(XML_BASE_DIR)

    if not target_path.startswith(base_abs):
        raise HTTPException(status_code=403, detail="Accès refusé hors du répertoire autorisé")

    if not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="Fichier XML introuvable")

    return FileResponse(
        target_path, media_type="application/xml", filename=os.path.basename(target_path)
    )


@router.get("/download-qc-json")
async def download_qc_json(
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
    id: int = Query(..., description="ID QC"),
):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(await prepare_query_async(query), slot=slot)

    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.json"'},
    )


@router.get("/download-qc-csv")
async def download_qc_csv(
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
    id: int = Query(..., description="ID QC"),
):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(await prepare_query_async(query), slot=slot)
    csv_text = json_to_csv(result)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.csv"'},
    )


async def _run_custom_search(payload: CustomSearchPayload, slot: HeavySlot) -> dict[str, Any]:
    """Run the query of a custom search, built on the server from its criteria.

    RM-EXP-01: the export holds the raw rows of the search query, the same query as
    `/customSearch`, with no limit of its own and no `LIMIT` added. RM-ACC-02: it stops at
    the guardrails of the search (criteria count, heavy-query slot, 64 MB cap).
    """
    check_criteria_count(criteria_count(payload))
    query = build_custom_search_query(payload)
    return await sparql_client.query(query, max_bytes=MAX_SEARCH_RESPONSE_BYTES, slot=slot)


@router.post("/download-custom-search-json")
async def download_custom_search_json(
    payload: CustomSearchPayload,
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
):
    result = await _run_custom_search(payload, slot)
    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="export_custom_search.json"'},
    )


@router.post("/download-custom-search-csv")
async def download_custom_search_csv(
    payload: CustomSearchPayload,
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
):
    result = await _run_custom_search(payload, slot)
    csv_text = json_to_csv(result)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_custom_search.csv"'},
    )


@router.get("/download-turtle")
async def download_turtle(uri: str = Query(..., description="URI de l'oeuvre")):
    work_iri = sparql_iri(uri)
    # Requête CONSTRUCT bornée pour ne pas faire crasher Corese comme le faisait DESCRIBE
    sparql = f"""
    PREFIX zoo: <http://ns.inria.fr/zoomathia/zoo#>
    CONSTRUCT {{
      {work_iri} ?p ?o .
    }} WHERE {{
      {work_iri} ?p ?o .
    }}
    """
    ttl = await sparql_client.construct(sparql)
    return Response(
        content=ttl,
        media_type="text/turtle; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_turtle.ttl"'},
    )
