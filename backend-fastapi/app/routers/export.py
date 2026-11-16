import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response

from app.core.config import settings
from app.services.sparql_client import sparql_client
from app.shared.limits import limit_heavy_queries
from app.shared.sparql import sparql_iri
from app.shared.sparql_guard import prepare_query_async

router = APIRouter(tags=["Export & Downloads"])

QUERIES_DIR = settings.QUERIES_DIR
XML_BASE_DIR = settings.XML_DATA_DIR


def json_to_csv(sparql_json: dict[str, Any]) -> str:
    headers = sparql_json.get("head", {}).get("vars", [])
    bindings = sparql_json.get("results", {}).get("bindings", [])

    lines = [";".join(headers)]
    for row in bindings:
        temp = []
        for h in headers:
            temp.append(row.get(h, {}).get("value", ""))
        lines.append(";".join(temp))

    return "\n".join(lines)


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


@router.get("/download-qc-json", dependencies=[Depends(limit_heavy_queries)])
async def download_qc_json(id: int = Query(..., description="ID QC")):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(await prepare_query_async(query))
    import json

    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.json"'},
    )


@router.get("/download-qc-csv", dependencies=[Depends(limit_heavy_queries)])
async def download_qc_csv(id: int = Query(..., description="ID QC")):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(await prepare_query_async(query))
    csv_text = json_to_csv(result)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.csv"'},
    )


@router.get("/download-custom-search-json", dependencies=[Depends(limit_heavy_queries)])
async def download_custom_search_json(sparql: str = Query(..., description="Requête SPARQL")):
    result = await sparql_client.query(await prepare_query_async(sparql))
    import json

    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="export_custom_search.json"'},
    )


@router.get("/download-custom-search-csv", dependencies=[Depends(limit_heavy_queries)])
async def download_custom_search_csv(sparql: str = Query(..., description="Requête SPARQL")):
    result = await sparql_client.query(await prepare_query_async(sparql))
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
