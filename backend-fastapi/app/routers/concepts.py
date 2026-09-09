from fastapi import APIRouter, Query, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.services.sparql_client import sparql_client

router = APIRouter(tags=["Concepts & Thesaurus"])

class ConceptInput(BaseModel):
    value: str
    type: Optional[str] = None

class ParagraphWithConceptRequest(BaseModel):
    uri: str
    concepts: List[ConceptInput]

ROOT_ANIMAL_IDS = {
    '4988', '106004', '107676', '105539', '105555', '105540', '105541',
    '107008', '106789', '107912', '105781', '105782', '106935', '106749',
    '106753', '108745', '106933', '107467', '107292', '107286', '108048',
    '108187', '108313', '108179', '108175', '108177', '107264', '107948',
    '107515', '107743', '107284', '108169', '108303', '108221', '108223',
    '107473', '5037', '105780', '4996', '15094',
    # Descendants directs de DOMESTIQUE et SAUVAGE
    'pcrt3jcrAaRENB', 'pcrt4v7jKE3TVw', 'pcrt0wSiSXpLTf', 'pcrth4ik1YqDS1',
    '106951', '105804', '106949', '106492', '106516', '106512', '5071',
    '105993', '105994', '105996', 'pcrtDtJwUVaZ0I', 'pcrtLywf8Y5k0n',
    '106552', '106554', 'pcrtamWjqMqPWT', 'pcrtOl4a3UUtiu', 'pcrtDoQWOTMlW7',
    'pcrt6i8AcPBoY2', '106482', '106484', 'pcrtnpPag9iONJ', '107580',
    '107578', '107582', '107914', 'pcrtEOlJwpiHmn', 'pcrt1eSDN7pc4r',
    'pcrtoWmR7YcVct', '105904', 'pcrtRpEmyMyoAU', '106536', 'pcrtVibtZJlA99',
    '105918', '106647', 'pcrtva7NUywIgB', '105879', 'pcrt8q2AHnsLUr',
    'pcrt5TAeZsO7W4', '106524', 'pcrtlYnu8y5j62', '106620', 'pcrtRmvjGjzyOO',
    '106269', '105880', '106622', '106626', '105898', 'pcrtZtKktLIqkU',
    '107709', '105867', '105882', '106624'
}

def classify_concept(
    coll_label: Optional[str] = None,
    coll_uri: Optional[str] = None,
    concept_label: Optional[str] = None,
    concept_uri: Optional[str] = None
) -> str:
    """Détermine la catégorie taxonomique/thématique principale d'un concept TheZoo."""
    lbl = (concept_label or "").strip().lower()
    c_uri = (concept_uri or "").lower()
    coll_str = f"{coll_label or ''} {coll_uri or ''}".lower()

    # 1. Vérification par identifiant URI de racine animale ou taxon TheZoo (Domestique, Sauvage, etc.)
    if concept_uri and any(f"idc={rid}" in c_uri for rid in ROOT_ANIMAL_IDS):
        return "animal"

    # 2. Vérification par libellé pour les concepts racines et dérivés animaux (Domestique, Sauvage, Animal, etc.)
    exact_root_animals = {
        "domestique", "domestic", "domesticus", "domestico",
        "sauvage", "wild", "ferus", "salvaje", "selvatico",
        "ni domestique ni sauvage",
        "animal domestique", "animal sauvage",
        "animal", "animaux", "faune", "bête", "bestiole", "fauve",
        "eumetazoa", "parazoa"
    }
    if lbl in exact_root_animals:
        return "animal"

    if any(lbl.startswith(prefix) for prefix in [
        "animal ", "animaux ", "faune ", "bête ", "bestiole ",
        "oiseau ", "poisson ", "reptile ", "insecte ", "squale "
    ]):
        return "animal"

    # Animaux qualifiés de sauvage ou domestique (ex: "cheval sauvage", "âne sauvage", "taureau sauvage", "abeille sauvage")
    if (lbl.endswith(" sauvage") or lbl.endswith(" domestique")) and not any(plant in lbl for plant in ["rosier", "figuier", "olivier", "laitue", "vigne", "pommier", "poirier"]):
        return "animal"

    # 3. Vérification par Collection TheZoo : MT_7 (Zoonyme), MT_10 (Archéotaxon)
    if any(k in coll_str for k in ["zoonym", "archéotaxon", "archeotaxon", "ancient class", "idg=mt_7", "idg=mt_10"]):
        return "animal"
    
    # 4. Comportements : Éthologie (MT_13) ou libellés éthologiques
    if any(k in coll_str for k in ["éthologie", "ethologie", "ethology", "comportement", "behavior", "idg=mt_13"]):
        return "behavior"
    if lbl in {"éthologie", "ethology", "comportement", "prédation", "intelligence", "parasitisme", "monogamie", "accouplement", "hygiène", "courage", "sagesse"}:
        return "behavior"
        
    # 5. Anatomie / Physiologie : MT_8, MT_11
    if any(k in coll_str for k in ["anatomie", "anatomy", "physiologie", "physiology", "idg=mt_8", "idg=mt_11"]):
        return "anatomy"
    if any(lbl.startswith(p) for p in ["organe", "nageoire", "aile", "patte", "queue", "museau", "crâne"]):
        return "anatomy"
        
    # 6. Lieux / Géographie : MT_4
    if any(k in coll_str for k in ["lieu", "place", "géographie", "geography", "idg=mt_4"]):
        return "place"
        
    # 7. Personnes / Peuples : MT_1, MT_5
    if any(k in coll_str for k in ["anthroponyme", "anthroponym", "peuple", "people", "idg=mt_1", "idg=mt_5"]):
        return "person"
        
    return "general"

@router.get("/getConcepts")
async def get_concepts(
    uri: str = Query(..., description="URI du paragraphe"),
    lang: str = Query("en", description="Code langue (ex: en, fr, lat)")
) -> Dict[str, Any]:
    safe_uri = uri.replace('>', '').replace('<', '')
    safe_lang = lang.replace('"', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix skos: <http://www.w3.org/2004/02/skos/core#> 
    SELECT DISTINCT ?annotation ?annotation_type ?concept ?label ?start ?end ?exact ?coll ?collLabel WHERE {{
      <{safe_uri}> zoo:hasAnnotation ?annotation.
      ?annotation a ?annotation_type;
        oa:hasBody ?concept;
        oa:hasTarget [
          oa:hasSource <{safe_uri}>;
          oa:hasSelector ?selector
        ].
      ?selector oa:exact ?exact.
      ?concept skos:prefLabel ?labelen.
      FILTER(lang(?labelen) = "en")
      OPTIONAL {{
        ?concept skos:prefLabel ?labellang.
        FILTER(lang(?labellang) = "{safe_lang}")
      }}
      OPTIONAL {{
        ?coll skos:member ?concept;
              skos:prefLabel ?collLabel.
        FILTER(lang(?collLabel) = "fr" || lang(?collLabel) = "en")
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
    annotations: Dict[str, Any] = {}
    
    bindings = res.get("results", {}).get("bindings", [])
    for elt in bindings:
        label = elt.get("label", {}).get("value")
        if not label:
            continue
        coll_lbl = elt.get("collLabel", {}).get("value")
        coll_uri = elt.get("coll", {}).get("value")
        concept_val = elt.get("concept", {}).get("value")
        cat = classify_concept(coll_lbl, coll_uri, label, concept_val)
        
        if label not in annotations:
            annotations[label] = {
                "concept": concept_val,
                "label": label,
                "type": elt.get("annotation_type", {}).get("value"),
                "category": cat,
                "collection": coll_lbl,
                "offset": []
            }
        else:
            if annotations[label].get("category") == "general" and cat != "general":
                annotations[label]["category"] = cat
                annotations[label]["collection"] = coll_lbl

        start = elt.get("start", {}).get("value", 0)
        end = elt.get("end", {}).get("value", 0)
        new_offset = {
            "start": int(start) if str(start).isdigit() else 0,
            "end": int(end) if str(end).isdigit() else 0
        }
        if new_offset not in annotations[label]["offset"]:
            annotations[label]["offset"].append(new_offset)

    return annotations

@router.get("/searchConcepts")
async def search_concepts(
    input: str = Query(..., min_length=1, description="Terme recherché"),
    lang: str = Query("en", description="Langue"),
    limit: int = Query(60, ge=1, le=300, description="Nombre max de résultats")
) -> List[Dict[str, Any]]:
    safe_input = input.replace('"', '\\"')
    safe_lang = lang.replace('"', '')
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?concept ?label ?type ?coll ?collLabel WHERE {{
      ?concept a ?type;
               skos:prefLabel ?label.
      FILTER(lang(?label) = "{safe_lang}")
      FILTER(regex(str(?label), "{safe_input}", "i"))
      OPTIONAL {{
        ?coll skos:member ?concept;
              skos:prefLabel ?collLabel.
        FILTER(lang(?collLabel) = "fr" || lang(?collLabel) = "en")
      }}
    }} ORDER BY ?label LIMIT {limit}
    """
    res = await sparql_client.query(sparql)
    response = []
    seen: Dict[str, Dict[str, Any]] = {}
    for b in res.get("results", {}).get("bindings", []):
        if "concept" in b and "label" in b:
            uri = b["concept"]["value"]
            lbl = b["label"]["value"]
            c_type = b.get("type", {}).get("value", "")
            coll_lbl = b.get("collLabel", {}).get("value")
            coll_uri = b.get("coll", {}).get("value")
            cat = classify_concept(coll_lbl, coll_uri, lbl, uri)
            
            if uri not in seen:
                item = {
                    "uri": uri,
                    "label": lbl,
                    "type": c_type.split('#')[-1] if '#' in c_type else c_type,
                    "category": cat,
                    "collection": coll_lbl
                }
                seen[uri] = item
                response.append(item)
            else:
                if seen[uri].get("category") == "general" and cat != "general":
                    seen[uri]["category"] = cat
                    seen[uri]["collection"] = coll_lbl
    return response

@router.get("/getCollections")
async def get_collections(
    lang: str = Query("fr", description="Langue des libellés (ex: fr, en)")
) -> List[Dict[str, Any]]:
    """Récupère les 14 collections thématiques SKOS de TheZoo avec décompte des membres."""
    safe_lang = lang.replace('"', '')
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?coll ?label (count(?m) as ?members) WHERE {{
      ?coll a skos:Collection;
            skos:prefLabel ?label;
            skos:member ?m.
      FILTER(lang(?label) = "{safe_lang}")
    }} GROUP BY ?coll ?label ORDER BY desc(?members)
    """
    res = await sparql_client.query(sparql)
    collections = []
    for b in res.get("results", {}).get("bindings", []):
        if "coll" in b and "label" in b:
            collections.append({
                "uri": b["coll"]["value"],
                "label": b["label"]["value"],
                "memberCount": int(b.get("members", {}).get("value", 0))
            })
    return collections

@router.get("/getLanguageConcept")
async def get_language_concept() -> List[Dict[str, str]]:
    sparql = """
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    prefix schema: <http://schema.org/>
    prefix oa: <http://www.w3.org/ns/oa#>
    SELECT DISTINCT (lang(?label) as ?lang) WHERE {
      ?concept skos:prefLabel ?label.
    }
    """
    res = await sparql_client.query(sparql)
    return [{"value": b["lang"]["value"]} for b in res.get("results", {}).get("bindings", []) if "lang" in b and b["lang"]["value"]]

@router.get("/getTheso")
async def get_theso(lang: str = Query("en", description="Langue")) -> List[Dict[str, str]]:
    safe_lang = lang.replace('"', '')
    sparql = f"""
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?concept ?label ?type WHERE {{
      ?concept a ?type;
               skos:prefLabel ?label.
      FILTER(lang(?label) = "{safe_lang}")
    }} ORDER BY ?label
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "concept" in b and "label" in b:
            concept_type = b.get("type", {}).get("value", "")
            raw_label = b["label"]["value"]
            label = raw_label + " (Collection)" if "Collection" in concept_type else raw_label
            response.append({
                "label": label,
                "value": b["concept"]["value"],
                "type": concept_type
            })
    return response

@router.get("/getTopConcepts")
async def get_top_concepts(lang: str = Query("en")) -> List[Any]:
    return []

@router.post("/getParagraphWithConcept")
async def get_paragraph_with_concept(payload: ParagraphWithConceptRequest) -> List[Dict[str, Any]]:
    subpart_clauses = []
    for i, c in enumerate(payload.concepts):
        safe_c = c.value.replace('>', '').replace('<', '')
        subpart_clauses.append(f"""
        ?annotation{i} oa:hasBody <{safe_c}>;
                       oa:hasTarget [ oa:hasSource ?paragraph ].
        """)
    subpart = "\n".join(subpart_clauses)
    safe_uri = payload.uri.replace('>', '').replace('<', '')

    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?paragraph ?title ?id ?text WHERE {{
      <{safe_uri}> schema:title ?title.
      ?paragraph zoo:text ?text;
                 zoo:identifier ?id;
                 zoo:isPartOf <{safe_uri}>.
      {subpart}
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append({
                "uri": b["paragraph"]["value"],
                "text": b.get("text", {}).get("value"),
                "title": b.get("title", {}).get("value"),
                "id": b.get("id", {}).get("value")
            })
    return response

@router.post("/getParagraphsWithConcepts")
async def get_paragraphs_with_concepts(payload: Dict[str, Any] = Body(...)) -> List[Dict[str, Any]]:
    concepts_raw = payload.get("concepts", [])
    subpart_clauses = []
    for i, c in enumerate(concepts_raw):
        c_val = c.get("value", "") if isinstance(c, dict) else str(c)
        safe_c = c_val.replace('>', '').replace('<', '')
        subpart_clauses.append(f"""
        ?annotation{i} oa:hasBody <{safe_c}>;
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
      ?concept skos:prefLabel ?label.
      FILTER(lang(?label) = "en")
    }} ORDER BY ?book ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "paragraph" in b:
            response.append({
                "author": b.get("author", {}).get("value"),
                "bookUri": b.get("uri", {}).get("value"),
                "bookId": b.get("book", {}).get("value"),
                "title": b.get("title", {}).get("value"),
                "uri": b["paragraph"]["value"],
                "text": b.get("text", {}).get("value"),
                "id": b.get("id", {}).get("value")
            })
    return response
