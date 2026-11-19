from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from app.services.sparql_client import sparql_client
from app.shared.limits import HeavySlot, check_criteria_count, limit_heavy_queries
from app.shared.sparql import sparql_iri, sparql_lang, sparql_literal
from app.thesaurus.collections import CollectionIndex, get_thesaurus_collections

router = APIRouter(tags=["Concepts & Thesaurus"])


def valid_paragraph_uri(
    uri: str = Query(..., description="URI du paragraphe"),
    lang: str = Query("en", description="Code langue (ex: en, fr, lat)"),
) -> str:
    """The paragraph IRI and the language, checked (400) before the index dependency (Corese)."""
    sparql_iri(uri)
    sparql_lang(lang)
    return uri


class ConceptInput(BaseModel):
    value: str
    type: str | None = None


class ParagraphWithConceptRequest(BaseModel):
    uri: str
    concepts: list[ConceptInput]


@router.get("/getConcepts")
async def get_concepts(
    uri: str = Depends(valid_paragraph_uri),
    lang: str = Query("en", description="Code langue (ex: en, fr, lat)"),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> dict[str, Any]:
    """Concepts annotated in a paragraph, with their category and collections (RM-CON-02)."""
    paragraph_iri = sparql_iri(uri)
    lang_tag = sparql_lang(lang)
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix skos: <http://www.w3.org/2004/02/skos/core#> 
    SELECT DISTINCT ?annotation ?annotation_type ?concept ?label ?start ?end ?exact WHERE {{
      {paragraph_iri} zoo:hasAnnotation ?annotation.
      ?annotation a ?annotation_type;
        oa:hasBody ?concept;
        oa:hasTarget [
          oa:hasSource {paragraph_iri};
          oa:hasSelector ?selector
        ].
      ?selector oa:exact ?exact.
      ?concept skos:prefLabel ?labelen.
      FILTER(lang(?labelen) = "en")
      OPTIONAL {{
        ?concept skos:prefLabel ?labellang.
        FILTER(lang(?labellang) = "{lang_tag}")
      }}
      OPTIONAL {{
        ?selector oa:start ?start_t;
          oa:end ?end_t.
      }}
      BIND(IF(BOUND(?start_t), ?start_t, 0) as ?start)
      BIND(IF(BOUND(?end_t), ?end_t, 0) as ?end)
      BIND(IF(BOUND(?labellang), ?labellang, ?labelen) AS ?label)
    }} ORDER BY ?label
    """
    res = await sparql_client.query(sparql)
    annotations: dict[str, Any] = {}

    bindings = res.get("results", {}).get("bindings", [])
    for elt in bindings:
        label = elt.get("label", {}).get("value")
        if not label:
            continue
        concept_val = elt.get("concept", {}).get("value")

        if label not in annotations:
            category, collections = thesaurus.classify(concept_val or "")
            annotations[label] = {
                "concept": concept_val,
                "label": label,
                "type": elt.get("annotation_type", {}).get("value"),
                "category": category,
                "collections": [collection.model_dump() for collection in collections],
                "offset": [],
            }

        start = elt.get("start", {}).get("value", 0)
        end = elt.get("end", {}).get("value", 0)
        new_offset = {
            "start": int(start) if str(start).isdigit() else 0,
            "end": int(end) if str(end).isdigit() else 0,
        }
        if new_offset not in annotations[label]["offset"]:
            annotations[label]["offset"].append(new_offset)

    return annotations


@router.get("/searchConcepts")
async def search_concepts(
    input: str = Query(..., min_length=1, description="Terme recherché"),
    lang: str = Query("en", description="Langue"),
    limit: int = Query(60, ge=1, le=300, description="Nombre max de résultats"),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> list[dict[str, Any]]:
    """Concepts whose label contains the input, with their category and collections."""
    input_literal = sparql_literal(input)
    lang_tag = sparql_lang(lang)
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?concept ?label ?type WHERE {{
      ?concept a ?type;
               skos:prefLabel ?label.
      FILTER(lang(?label) = "{lang_tag}")
      FILTER(CONTAINS(LCASE(STR(?label)), LCASE({input_literal})))
    }} ORDER BY ?label LIMIT {limit}
    """
    res = await sparql_client.query(sparql)
    response = []
    seen: dict[str, dict[str, Any]] = {}
    for b in res.get("results", {}).get("bindings", []):
        if "concept" in b and "label" in b:
            uri = b["concept"]["value"]
            lbl = b["label"]["value"]
            c_type = b.get("type", {}).get("value", "")

            if uri not in seen:
                category, collections = thesaurus.classify(uri)
                item = {
                    "uri": uri,
                    "label": lbl,
                    "type": c_type.split("#")[-1] if "#" in c_type else c_type,
                    "category": category,
                    "collections": [collection.model_dump() for collection in collections],
                }
                seen[uri] = item
                response.append(item)
    return response


@router.get("/getCollections")
async def get_collections(
    lang: str = Query("fr", description="Langue des libellés (ex: fr, en)"),
) -> list[dict[str, Any]]:
    """Récupère les 14 collections thématiques SKOS de TheZoo avec décompte des membres."""
    lang_tag = sparql_lang(lang)
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?coll ?label (count(?m) as ?members) WHERE {{
      ?coll a skos:Collection;
            skos:prefLabel ?label;
            skos:member ?m.
      FILTER(lang(?label) = "{lang_tag}")
    }} GROUP BY ?coll ?label ORDER BY desc(?members)
    """
    res = await sparql_client.query(sparql)
    collections = []
    for b in res.get("results", {}).get("bindings", []):
        if "coll" in b and "label" in b:
            collections.append(
                {
                    "uri": b["coll"]["value"],
                    "label": b["label"]["value"],
                    "memberCount": int(b.get("members", {}).get("value", 0)),
                }
            )
    return collections


@router.get("/getLanguageConcept")
async def get_language_concept() -> list[dict[str, str]]:
    sparql = """
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    prefix schema: <http://schema.org/>
    prefix oa: <http://www.w3.org/ns/oa#>
    SELECT DISTINCT (lang(?label) as ?lang) WHERE {
      ?concept skos:prefLabel ?label.
    }
    """
    res = await sparql_client.query(sparql)
    return [
        {"value": b["lang"]["value"]}
        for b in res.get("results", {}).get("bindings", [])
        if "lang" in b and b["lang"]["value"]
    ]


@router.get("/getTheso")
async def get_theso(lang: str = Query("en", description="Langue")) -> list[dict[str, str]]:
    lang_tag = sparql_lang(lang)
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?concept ?label ?type WHERE {{
      ?concept a ?type;
               skos:prefLabel ?label.
      FILTER(lang(?label) = "{lang_tag}")
    }} ORDER BY ?label
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "concept" in b and "label" in b:
            concept_type = b.get("type", {}).get("value", "")
            raw_label = b["label"]["value"]
            label = raw_label + " (Collection)" if "Collection" in concept_type else raw_label
            response.append({"label": label, "value": b["concept"]["value"], "type": concept_type})
    return response


@router.get("/getTopConcepts")
async def get_top_concepts(lang: str = Query("en")) -> list[Any]:
    return []


def _check_concept_count(count: int) -> None:
    """Refuse an empty concept list (no annotation constraint) or one above the cap (400)."""
    if count == 0:
        raise HTTPException(status_code=400, detail="At least one concept is required.")
    check_criteria_count(count)


@router.post("/getParagraphWithConcept")
async def get_paragraph_with_concept(
    payload: ParagraphWithConceptRequest,
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
) -> list[dict[str, Any]]:
    _check_concept_count(len(payload.concepts))
    subpart_clauses = []
    for i, c in enumerate(payload.concepts):
        concept_iri = sparql_iri(c.value)
        subpart_clauses.append(f"""
        ?annotation{i} oa:hasBody {concept_iri};
                       oa:hasTarget [ oa:hasSource ?paragraph ].
        """)
    subpart = "\n".join(subpart_clauses)
    section_iri = sparql_iri(payload.uri)

    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?paragraph ?title ?id ?text WHERE {{
      {section_iri} schema:title ?title.
      ?paragraph zoo:text ?text;
                 zoo:identifier ?id;
                 zoo:isPartOf {section_iri}.
      {subpart}
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql, slot=slot)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append(
                {
                    "uri": b["paragraph"]["value"],
                    "text": b.get("text", {}).get("value"),
                    "title": b.get("title", {}).get("value"),
                    "id": b.get("id", {}).get("value"),
                }
            )
    return response


@router.post("/getParagraphsWithConcepts")
async def get_paragraphs_with_concepts(
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
    payload: dict[str, Any] = Body(...),
) -> list[dict[str, Any]]:
    concepts_raw = payload.get("concepts", [])
    if not isinstance(concepts_raw, list):
        raise HTTPException(status_code=400, detail="The concepts must be a list.")
    _check_concept_count(len(concepts_raw))
    subpart_clauses = []
    for i, c in enumerate(concepts_raw):
        c_val = c.get("value", "") if isinstance(c, dict) else str(c)
        concept_iri = sparql_iri(c_val)
        subpart_clauses.append(f"""
        ?annotation{i} oa:hasBody {concept_iri};
                       oa:hasTarget [ oa:hasSource ?paragraph ].
        """)
    subpart = "\n".join(subpart_clauses)

    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    prefix skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?uri ?author ?title ?book ?paragraph (xsd:integer(?id_p) as ?id) ?text WHERE {{
      {subpart}
      ?paragraph zoo:text ?text;
                 zoo:identifier ?id_p;
                 zoo:isPartOf ?uri.
      ?uri zoo:identifier ?book;
           zoo:title ?title.
      ?oeuvre zoo:author ?author;
              zoo:hasPart+ ?uri.
    }} ORDER BY ?book ?id
    """
    res = await sparql_client.query(sparql, slot=slot)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append(
                {
                    "author": b.get("author", {}).get("value"),
                    "bookUri": b.get("uri", {}).get("value"),
                    "bookId": b.get("book", {}).get("value"),
                    "title": b.get("title", {}).get("value"),
                    "uri": b["paragraph"]["value"],
                    "text": b.get("text", {}).get("value"),
                    "id": b.get("id", {}).get("value"),
                }
            )
    return response
