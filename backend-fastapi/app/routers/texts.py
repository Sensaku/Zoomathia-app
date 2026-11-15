import logging
import re
from typing import Any

from fastapi import APIRouter, Query

from app.services.sparql_client import sparql_client
from app.services.tree_builder import build_summary_tree
from app.shared.sparql import sparql_iri

logger = logging.getLogger("zoomathia.texts")

router = APIRouter(tags=["Texts & Hierarchy"])


@router.get("/getSummary")
async def get_summary(uri: str = Query(..., description="URI de l'oeuvre")) -> list[dict[str, Any]]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT DISTINCT ?parent ?current ?type (xsd:integer(?id_t) as ?id) ?title ?file WHERE {{
      ?current a ?type;
          zoo:isPartOf+ {node_iri};
          zoo:isPartOf ?parent_t;
          zoo:identifier ?id_t.
      FILTER(?type != zoo:Paragraph)
      BIND(IF(?parent_t = {node_iri}, ?current, ?parent_t) AS ?parent)
      OPTIONAL {{ ?current zoo:title ?title_t. }}
      BIND(IF(BOUND(?author_t), ?author_t, "") AS ?author)
      BIND(IF(BOUND(?title_t), ?title_t, "") AS ?title)
    }} ORDER BY ?id ?parent
    """
    res = await sparql_client.query(sparql)
    bindings = res.get("results", {}).get("bindings", [])
    return build_summary_tree(bindings)


@router.get("/getChildren")
async def get_children(uri: str = Query(..., description="URI du noeud")) -> list[dict[str, Any]]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?child ?identifier ?title ?type WHERE {{
      {node_iri} zoo:hasPart ?child.
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
            response.append(
                {
                    "uri": b["child"]["value"],
                    "title": b.get("title", {}).get("value"),
                    "type": b.get("type", {}).get("value"),
                }
            )
    return response


@router.get("/getChildrenType")
async def get_children_type(uri: str = Query(..., description="URI du noeud")) -> list[str]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?childType WHERE {{
      {node_iri} zoo:hasPart ?child.
      ?child a ?childType.
    }}
    """
    res = await sparql_client.query(sparql)
    return [
        b["childType"]["value"]
        for b in res.get("results", {}).get("bindings", [])
        if "childType" in b
    ]


@router.get("/getCurrentType")
async def get_current_type(
    uri: str = Query(..., description="URI du noeud"),
) -> list[dict[str, str]]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?type WHERE {{
      {node_iri} a ?type .
    }}
    """
    res = await sparql_client.query(sparql)
    return [
        {"type": b["type"]["value"]}
        for b in res.get("results", {}).get("bindings", [])
        if "type" in b
    ]


@router.get("/getParagraphs")
async def get_paragraphs(
    uri: str = Query(..., description="URI du noeud parent"),
) -> list[dict[str, Any]]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT (xsd:integer(?id_p) as ?id) ?title ?uri ?text WHERE {{
      {node_iri} zoo:title ?title.
      ?uri a zoo:Paragraph;
        zoo:isPartOf {node_iri};
        zoo:identifier ?id_p;
        zoo:text ?text.
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "uri" in b:
            response.append(
                {
                    "title": b.get("title", {}).get("value"),
                    "uri": b["uri"]["value"],
                    "text": b.get("text", {}).get("value"),
                    "id": b.get("id", {}).get("value"),
                }
            )
    return response


@router.get("/getParagraphAlone")
async def get_paragraph_alone(
    uri: str = Query(..., description="URI de référence"),
) -> list[dict[str, Any]]:
    node_iri = sparql_iri(uri)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?paragraph (xsd:integer(?id_p) as ?id) ?text WHERE {{
      ?oeuvre zoo:hasPart+ ?parent.
      ?parent zoo:hasPart ?paragraph.
      ?paragraph zoo:text ?text;
                 zoo:identifier ?id_p.
      FILTER EXISTS {{
        ?parent zoo:hasPart {node_iri}
      }}
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append(
                {
                    "uri": b["paragraph"]["value"],
                    "text": b.get("text", {}).get("value"),
                    "id": b.get("id", {}).get("value"),
                }
            )
    return response


@router.get("/resolveUri")
async def resolve_uri(
    uri: str = Query(..., description="URI à résoudre (oeuvre, section ou paragraphe)"),
) -> dict[str, Any]:
    safe_uri = uri.strip()
    # Validated before the `try` below, which would otherwise turn a 400 into an empty answer.
    node_iri = sparql_iri(safe_uri)
    bindings = []

    try:
        sparql = f"""
        prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
        SELECT ?type ?work ?section WHERE {{
          {{
            {node_iri} a zoo:Oeuvre .
            BIND({node_iri} AS ?work)
            BIND("work" AS ?type)
          }} UNION {{
            {node_iri} (^zoo:hasPart|zoo:isPartOf) ?section .
            ?section (^zoo:hasPart*|zoo:isPartOf*) ?work .
            ?work a zoo:Oeuvre .
            FILTER EXISTS {{ {node_iri} zoo:text ?txt }}
            BIND("paragraph" AS ?type)
          }} UNION {{
            {node_iri} a zoo:Paragraph .
            {node_iri} (^zoo:hasPart|zoo:isPartOf) ?section .
            ?section (^zoo:hasPart*|zoo:isPartOf*) ?work .
            ?work a zoo:Oeuvre .
            BIND("paragraph" AS ?type)
          }} UNION {{
            {node_iri} (^zoo:hasPart+|zoo:isPartOf+) ?work .
            ?work a zoo:Oeuvre .
            BIND({node_iri} AS ?section)
            BIND("section" AS ?type)
          }}
        }} LIMIT 1
        """
        res = await sparql_client.query(sparql)
        bindings = res.get("results", {}).get("bindings", [])
    except Exception as e:
        logger.warning(
            f"Impossible d'exécuter la requête SPARQL de résolution pour {safe_uri}: {e}"
        )

    if bindings:
        b = bindings[0]
        uri_type = b.get("type", {}).get("value", "unknown")
        work_uri = b.get("work", {}).get("value")
        section_uri = b.get("section", {}).get("value")
        paragraph_uri = safe_uri if uri_type == "paragraph" else None

        return {
            "type": uri_type,
            "work": work_uri,
            "section": section_uri,
            "paragraph": paragraph_uri,
        }

    # Repli heuristique déterministe basé sur l'anatomie canonique des URIs Zoomathia
    # Ex: http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10/172
    # Ex: http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1
    m = re.match(r"^https?://ns\.inria\.fr/zoomathia/([^/]+)/([^/]+)(?:/(.*))?$", safe_uri)
    if m:
        author = m.group(1)
        work_name = m.group(2)
        work_uri = f"http://ns.inria.fr/zoomathia/{author}/{work_name}"
        sub = m.group(3)

        if not sub:
            return {"type": "work", "work": work_uri, "section": None, "paragraph": None}

        segments = [s for s in sub.split("/") if s]
        if "text" in segments:
            text_idx = segments.index("text")
            sec_parts = segments[:text_idx]
            section_uri = f"{work_uri}/{'/'.join(sec_parts)}" if sec_parts else None
            return {
                "type": "paragraph",
                "work": work_uri,
                "section": section_uri,
                "paragraph": safe_uri,
            }
        elif len(segments) >= 2:
            section_uri = f"{work_uri}/{'/'.join(segments[:-1])}"
            return {
                "type": "paragraph",
                "work": work_uri,
                "section": section_uri,
                "paragraph": safe_uri,
            }
        elif len(segments) == 1:
            return {"type": "section", "work": work_uri, "section": safe_uri, "paragraph": None}

    return {"type": "unknown", "work": None, "section": None, "paragraph": safe_uri}
