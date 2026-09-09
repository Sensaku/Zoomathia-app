from fastapi import APIRouter, Query
from typing import List, Dict, Any
from app.services.sparql_client import sparql_client
from app.services.tree_builder import build_summary_tree

router = APIRouter(tags=["Texts & Hierarchy"])

@router.get("/getSummary")
async def get_summary(uri: str = Query(..., description="URI de l'oeuvre")) -> List[Dict[str, Any]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT DISTINCT ?parent ?current ?type (xsd:integer(?id_t) as ?id) ?title ?file WHERE {{
      ?current a ?type;
          zoo:isPartOf+ <{safe_uri}>;
          zoo:isPartOf ?parent_t;
          zoo:identifier ?id_t.
      FILTER(?type != zoo:Paragraph)
      BIND(IF(?parent_t = <{safe_uri}>, ?current, ?parent_t) AS ?parent)
      OPTIONAL {{ ?current zoo:title ?title_t. }}
      BIND(IF(BOUND(?author_t), ?author_t, "") AS ?author)
      BIND(IF(BOUND(?title_t), ?title_t, "") AS ?title)
    }} ORDER BY ?id ?parent
    """
    res = await sparql_client.query(sparql)
    bindings = res.get("results", {}).get("bindings", [])
    return build_summary_tree(bindings)

@router.get("/getChildren")
async def get_children(uri: str = Query(..., description="URI du noeud")) -> List[Dict[str, Any]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?child ?identifier ?title ?type WHERE {{
      <{safe_uri}> zoo:hasPart ?child.
      ?child a ?type;
            zoo:identifier ?identifier.
      OPTIONAL {{ ?child zoo:title ?titleprov. }}
      BIND(IF(BOUND(?titleprov), ?titleprov, ?identifier) AS ?title)
    }} ORDER BY ?identifier
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "child" in b:
            response.append({
                "uri": b["child"]["value"],
                "title": b.get("title", {}).get("value"),
                "type": b.get("type", {}).get("value")
            })
    return response

@router.get("/getChildrenType")
async def get_children_type(uri: str = Query(..., description="URI du noeud")) -> List[str]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?childType WHERE {{
      <{safe_uri}> zoo:hasPart ?child.
      ?child a ?childType.
    }}
    """
    res = await sparql_client.query(sparql)
    return [b["childType"]["value"] for b in res.get("results", {}).get("bindings", []) if "childType" in b]

@router.get("/getCurrentType")
async def get_current_type(uri: str = Query(..., description="URI du noeud")) -> List[Dict[str, str]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?type WHERE {{
      <{safe_uri}> a ?type .
    }}
    """
    res = await sparql_client.query(sparql)
    return [{"type": b["type"]["value"]} for b in res.get("results", {}).get("bindings", []) if "type" in b]

@router.get("/getParagraphs")
async def get_paragraphs(uri: str = Query(..., description="URI du noeud parent")) -> List[Dict[str, Any]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT (xsd:integer(?id_p) as ?id) ?title ?uri ?text WHERE {{
      <{safe_uri}> zoo:title ?title.
      ?uri a zoo:Paragraph;
        zoo:isPartOf <{safe_uri}>;
        zoo:identifier ?id_p;
        zoo:text ?text.
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "uri" in b:
            response.append({
                "title": b.get("title", {}).get("value"),
                "uri": b["uri"]["value"],
                "text": b.get("text", {}).get("value"),
                "id": b.get("id", {}).get("value")
            })
    return response

@router.get("/getParagraphAlone")
async def get_paragraph_alone(uri: str = Query(..., description="URI de référence")) -> List[Dict[str, Any]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?paragraph (xsd:integer(?id_p) as ?id) ?text WHERE {{
      ?oeuvre zoo:hasPart+ ?parent.
      ?parent zoo:hasPart ?paragraph.
      ?paragraph zoo:text ?text;
                 zoo:identifier ?id_p.
      FILTER EXISTS {{
        ?parent zoo:hasPart <{safe_uri}>
      }}
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append({
                "uri": b["paragraph"]["value"],
                "text": b.get("text", {}).get("value"),
                "id": b.get("id", {}).get("value")
            })
    return response

@router.get("/resolveUri")
async def resolve_uri(uri: str = Query(..., description="URI à résoudre (oeuvre, section ou paragraphe)")) -> Dict[str, Any]:
    safe_uri = uri.replace('>', '').replace('<', '').strip()
    sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT ?type ?work ?section WHERE {{
      {{
        <{safe_uri}> a zoo:Oeuvre .
        BIND(<{safe_uri}> AS ?work)
        BIND("work" AS ?type)
      }} UNION {{
        <{safe_uri}> zoo:isPartOf ?section .
        ?section zoo:isPartOf* ?work .
        ?work a zoo:Oeuvre .
        FILTER EXISTS {{ <{safe_uri}> zoo:text ?txt }}
        BIND("paragraph" AS ?type)
      }} UNION {{
        <{safe_uri}> a zoo:Paragraph .
        <{safe_uri}> zoo:isPartOf ?section .
        ?section zoo:isPartOf* ?work .
        ?work a zoo:Oeuvre .
        BIND("paragraph" AS ?type)
      }} UNION {{
        <{safe_uri}> zoo:isPartOf+ ?work .
        ?work a zoo:Oeuvre .
        BIND(<{safe_uri}> AS ?section)
        BIND("section" AS ?type)
      }}
    }} LIMIT 1
    """
    res = await sparql_client.query(sparql)
    bindings = res.get("results", {}).get("bindings", [])
    if not bindings:
        return {
            "type": "unknown",
            "work": None,
            "section": None,
            "paragraph": safe_uri
        }

    b = bindings[0]
    uri_type = b.get("type", {}).get("value", "unknown")
    work_uri = b.get("work", {}).get("value")
    section_uri = b.get("section", {}).get("value")
    paragraph_uri = safe_uri if uri_type == "paragraph" else None

    return {
        "type": uri_type,
        "work": work_uri,
        "section": section_uri,
        "paragraph": paragraph_uri
    }
