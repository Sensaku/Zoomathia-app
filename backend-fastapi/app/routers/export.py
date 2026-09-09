import os
import io
import re
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response, FileResponse, StreamingResponse
from typing import Dict, Any
from app.services.sparql_client import sparql_client
from app.core.config import settings

router = APIRouter(tags=["Export & Downloads"])

QUERIES_DIR = settings.QUERIES_DIR
XML_BASE_DIR = settings.XML_DATA_DIR

def json_to_csv(sparql_json: Dict[str, Any]) -> str:
    headers = sparql_json.get("head", {}).get("vars", [])
    bindings = sparql_json.get("results", {}).get("bindings", [])
    
    lines = [";".join(headers)]
    for row in bindings:
        temp = []
        for h in headers:
            temp.append(row.get(h, {}).get("value", ""))
        lines.append(";".join(temp))
        
    return "\n".join(lines)

def validate_readonly_sparql(query: str):
    """Bloque toute tentative d'injection SPARQL Update destructive."""
    forbidden = ["DELETE", "DROP", "INSERT", "CLEAR", "LOAD", "CREATE", "COPY", "MOVE", "ADD"]
    upper = query.upper()
    for word in forbidden:
        if re.search(rf"\b{word}\b", upper):
            raise HTTPException(status_code=400, detail=f"Opération SPARQL interdite: {word}")

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
        target_path,
        media_type="application/xml",
        filename=os.path.basename(target_path)
    )

@router.get("/download-qc-json")
async def download_qc_json(id: int = Query(..., description="ID QC")):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, "r", encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(query)
    import json
    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.json"'}
    )

@router.get("/download-qc-csv")
async def download_qc_csv(id: int = Query(..., description="ID QC")):
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requête QC introuvable")

    with open(file_path, "r", encoding="utf-8") as f:
        query = f.read()

    result = await sparql_client.query(query)
    csv_text = json_to_csv(result)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="export_qc{id}.csv"'}
    )

@router.get("/download-custom-search-json")
async def download_custom_search_json(sparql: str = Query(..., description="Requête SPARQL")):
    validate_readonly_sparql(sparql)
    result = await sparql_client.query(sparql)
    import json
    content = json.dumps(result, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="export_custom_search.json"'}
    )

@router.get("/download-custom-search-csv")
async def download_custom_search_csv(sparql: str = Query(..., description="Requête SPARQL")):
    validate_readonly_sparql(sparql)
    result = await sparql_client.query(sparql)
    csv_text = json_to_csv(result)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_custom_search.csv"'}
    )

@router.get("/download-turtle")
async def download_turtle(uri: str = Query(..., description="URI de l'oeuvre")):
    safe_uri = uri.replace('>', '').replace('<', '')
    # Requête CONSTRUCT bornée pour ne pas faire crasher Corese comme le faisait DESCRIBE
    sparql = f"""
    PREFIX zoo: <http://ns.inria.fr/zoomathia/zoo#>
    CONSTRUCT {{
      <{safe_uri}> ?p ?o .
    }} WHERE {{
      <{safe_uri}> ?p ?o .
    }}
    """
    ttl = await sparql_client.construct(sparql)
    return Response(
        content=ttl,
        media_type="text/turtle; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_turtle.ttl"'}
    )
