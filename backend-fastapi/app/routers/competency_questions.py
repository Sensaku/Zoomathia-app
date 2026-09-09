import os

from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any
from app.services.sparql_client import sparql_client
from app.core.qcs_data import QCS_DATA
from app.core.config import settings

router = APIRouter(tags=["Competency Questions"])

QUERIES_DIR = settings.QUERIES_DIR

def get_qc_metadata(qc_id: int) -> Dict[str, Any]:
    for qc in QCS_DATA:
        if qc["id"] == qc_id:
            return qc
    raise HTTPException(status_code=404, detail=f"Question de compétence introuvable: {qc_id}")

@router.get("/qcList")
async def get_qc_list() -> List[Dict[str, Any]]:
    return QCS_DATA

@router.get("/getQCspo")
async def get_qc_spo(id: int = Query(..., description="ID de la question de compétence")) -> Dict[str, Any]:
    get_qc_metadata(id)
    file_path = os.path.join(QUERIES_DIR, f"qc{id}_spo.rq")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Fichier de requête SPO introuvable: qc{id}_spo.rq")

    with open(file_path, "r", encoding="utf-8") as f:
        sparql_query = f.read()

    return await sparql_client.query(sparql_query)

@router.get("/getQC")
async def get_qc(id: int = Query(..., description="ID de la question de compétence")) -> Dict[str, Any]:
    qc = get_qc_metadata(id)
    file_path = os.path.join(QUERIES_DIR, f"qc{id}.rq")
    spo_path = os.path.join(QUERIES_DIR, f"qc{id}_spo.rq")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Fichier de requête introuvable: qc{id}.rq")

    with open(file_path, "r", encoding="utf-8") as f:
        sparql_query = f.read()

    spo_content = ""
    if os.path.exists(spo_path):
        with open(spo_path, "r", encoding="utf-8") as f:
            spo_content = f.read()

    result = await sparql_client.query(sparql_query)
    vars_list = result.get("head", {}).get("vars", [])
    bindings = result.get("results", {}).get("bindings", [])

    data = []
    for row in bindings:
        temp_row = []
        for var in vars_list:
            temp_row.append(row.get(var, {}).get("value", ""))
        data.append(temp_row)

    return {
        "query": sparql_query,
        "results": result,
        "titleVizu": qc.get("vizuTitle", ""),
        "spo": spo_content,
        "table": {
            "columns": vars_list,
            "data": data
        }
    }
