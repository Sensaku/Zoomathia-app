from fastapi import APIRouter, Body, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.services.sparql_client import sparql_client
from app.services.tree_builder import build_custom_search_tree

router = APIRouter(tags=["Search"])

class ConceptCriterion(BaseModel):
    uri: str
    label: Optional[str] = None
    type: Optional[str] = None
    include_subconcepts: bool = False  # skos:broader+ (taxonomie / sous-concepts)
    polarity: str = "include"          # "include" | "exclude"

class CollectionCriterion(BaseModel):
    uri: str
    label: Optional[str] = None
    polarity: str = "include"          # "include" | "exclude"

class ConceptFilter(BaseModel):
    uri: str
    type: Optional[str] = None

class CustomSearchPayload(BaseModel):
    author: List[str] = []
    work: List[str] = []
    concepts: List[Any] = []
    checked: bool = False
    collectionMembers: bool = False
    subConcepts: bool = False
    
    # Nouveaux champs pour le constructeur de corpus avancé
    excluded_works: List[str] = []
    concept_criteria: Optional[List[ConceptCriterion]] = None
    collection_criteria: Optional[List[CollectionCriterion]] = None
    match_mode: Optional[str] = None  # "AND" | "OR"

def clean_uri(uri: str) -> str:
    return uri.replace('>', '').replace('<', '').strip()

def escape_uri(uri: str) -> str:
    return f"<{clean_uri(uri)}>"

def escape_literal(val: str) -> str:
    clean = val.replace('"', '\\"').strip()
    return f'"{clean}"'

@router.post("/customSearch")
async def custom_search(payload: CustomSearchPayload) -> Dict[str, Any]:
    authors = payload.author
    works = payload.work
    excluded_works = payload.excluded_works
    
    # 1. Normalisation des critères de concepts
    concept_criteria: List[ConceptCriterion] = []
    collection_criteria: List[CollectionCriterion] = []

    if payload.concept_criteria is not None:
        concept_criteria = payload.concept_criteria
    elif payload.concepts:
        for c in payload.concepts:
            if isinstance(c, dict):
                uri = c.get("uri") or c.get("value", "")
                c_type = c.get("type")
                label = c.get("label")
            elif hasattr(c, "uri"):
                uri = getattr(c, "uri")
                c_type = getattr(c, "type", None)
                label = getattr(c, "label", None)
            else:
                uri = str(c)
                c_type = None
                label = None
            
            if not uri:
                continue
                
            if payload.collectionMembers and c_type and "Collection" in str(c_type):
                collection_criteria.append(CollectionCriterion(
                    uri=uri,
                    label=label,
                    polarity="include"
                ))
            else:
                concept_criteria.append(ConceptCriterion(
                    uri=uri,
                    label=label,
                    type=c_type,
                    include_subconcepts=payload.subConcepts,
                    polarity="include"
                ))

    if payload.collection_criteria is not None:
        collection_criteria = payload.collection_criteria

    # Séparation inclusions / exclusions
    included_concepts = [c for c in concept_criteria if c.polarity == "include"]
    excluded_concepts = [c for c in concept_criteria if c.polarity == "exclude"]
    included_collections = [c for c in collection_criteria if c.polarity == "include"]
    excluded_collections = [c for c in collection_criteria if c.polarity == "exclude"]

    # Règle de sécurité Corese : interdire une recherche purement négative
    has_positive = bool(authors or works or included_concepts or included_collections)
    has_exclusions = bool(excluded_works or excluded_concepts or excluded_collections)
    if not has_positive and has_exclusions:
        raise HTTPException(
            status_code=400,
            detail="Une recherche ne peut pas être uniquement composée d'exclusions sans périmètre positif (auteur, œuvre ou concept inclus)."
        )

    # Détermination de la logique d'inclusion (AND vs OR)
    is_and_mode = (payload.match_mode == "AND") if payload.match_mode else payload.checked

    # 2. Construction des filtres textuels (Auteurs / Œuvres)
    text_filters = []
    if authors and works:
        auth_in = ", ".join([escape_literal(a) for a in authors])
        work_in = ", ".join([escape_uri(w) for w in works])
        text_filters.append(f"FILTER(?author IN ({auth_in}) || ?work IN ({work_in}))")
    elif authors:
        auth_in = ", ".join([escape_literal(a) for a in authors])
        text_filters.append(f"FILTER(?author IN ({auth_in}))")
    elif works:
        work_in = ", ".join([escape_uri(w) for w in works])
        text_filters.append(f"FILTER(?work IN ({work_in}))")

    if excluded_works:
        ex_work_in = ", ".join([escape_uri(w) for w in excluded_works])
        text_filters.append(f"FILTER(?work NOT IN ({ex_work_in}))")

    text_filter_block = "\n      ".join(text_filters)

    # 3. Construction des filtres d'annotations positives
    positive_clauses = []
    if included_concepts or included_collections:
        if is_and_mode:
            # Mode ET : chaque critère positif doit être présent sur le paragraphe
            for i, c in enumerate(included_concepts):
                c_uri = escape_uri(c.uri)
                if c.include_subconcepts:
                    positive_clauses.append(f"""
                    ?ann_c_{i} oa:hasTarget [ oa:hasSource ?paragraph ];
                               oa:hasBody ?c_body_{i}.
                    {{ ?c_body_{i} = {c_uri} }} UNION {{ ?c_body_{i} skos:broader+ {c_uri} }}
                    """)
                else:
                    positive_clauses.append(f"""
                    ?ann_c_{i} oa:hasTarget [ oa:hasSource ?paragraph ];
                               oa:hasBody {c_uri}.
                    """)
            
            for j, col in enumerate(included_collections):
                col_uri = escape_uri(col.uri)
                positive_clauses.append(f"""
                ?ann_col_{j} oa:hasTarget [ oa:hasSource ?paragraph ];
                             oa:hasBody ?col_body_{j}.
                {col_uri} skos:member ?col_body_{j}.
                """)
        else:
            # Mode OU : un des critères positifs doit correspondre
            or_branches = []
            exact_uris = [escape_uri(c.uri) for c in included_concepts if not c.include_subconcepts]
            taxo_uris = [escape_uri(c.uri) for c in included_concepts if c.include_subconcepts]
            coll_uris = [escape_uri(col.uri) for col in included_collections]

            all_direct_uris = exact_uris + taxo_uris
            if all_direct_uris:
                or_branches.append(f"""{{
                  ?ann_pos oa:hasTarget [ oa:hasSource ?paragraph ];
                           oa:hasBody ?body_concept.
                  FILTER(?body_concept IN ({", ".join(all_direct_uris)}))
                }}""")
            
            if taxo_uris:
                or_branches.append(f"""{{
                  ?ann_pos oa:hasTarget [ oa:hasSource ?paragraph ];
                           oa:hasBody ?body_concept.
                  ?body_concept skos:broader+ ?super_c.
                  FILTER(?super_c IN ({", ".join(taxo_uris)}))
                }}""")

            if coll_uris:
                or_branches.append(f"""{{
                  ?ann_pos oa:hasTarget [ oa:hasSource ?paragraph ];
                           oa:hasBody ?body_concept.
                  ?coll_owner skos:member ?body_concept.
                  FILTER(?coll_owner IN ({", ".join(coll_uris)}))
                }}""")

            if or_branches:
                positive_clauses.append(" UNION ".join(or_branches))

    positive_block = "\n      ".join(positive_clauses)

    # 4. Construction des filtres d'exclusion (FILTER NOT EXISTS)
    negative_clauses = []
    for k, exc in enumerate(excluded_concepts):
        exc_uri = escape_uri(exc.uri)
        if exc.include_subconcepts:
            negative_clauses.append(f"""
            FILTER NOT EXISTS {{
              ?ann_ex_{k} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody ?ex_body_{k}.
              {{ ?ex_body_{k} = {exc_uri} }} UNION {{ ?ex_body_{k} skos:broader+ {exc_uri} }}
            }}
            """)
        else:
            negative_clauses.append(f"""
            FILTER NOT EXISTS {{
              ?ann_ex_{k} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody {exc_uri}.
            }}
            """)

    for m, ex_col in enumerate(excluded_collections):
        ex_col_uri = escape_uri(ex_col.uri)
        negative_clauses.append(f"""
        FILTER NOT EXISTS {{
          ?ann_ex_col_{m} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody ?ex_col_body_{m}.
          {ex_col_uri} skos:member ?ex_col_body_{m}.
        }}
        """)

    negative_block = "\n      ".join(negative_clauses)

    # 5. Assemblage de la requête finale ordonnée pour l'optimiseur Corese
    build_request = f"""PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX oa: <http://www.w3.org/ns/oa#>
PREFIX zoo: <http://ns.inria.fr/zoomathia/zoo#> 

SELECT DISTINCT ?work ?type ?author ?title ?parent ?current ?current_type ?current_id ?current_title ?paragraph_direct_parent ?paragraph ?id ?text WHERE {{
  ?work a zoo:Oeuvre; a ?type;
        zoo:title ?title;
        zoo:author ?author;
        zoo:hasPart+ ?paragraph.

  {text_filter_block}
  {positive_block}
  {negative_block}

  ?paragraph zoo:text ?text;
             zoo:identifier ?id;
             zoo:isPartOf+ ?current;
             zoo:isPartOf ?paragraph_direct_parent.

  ?current a ?current_type;
           zoo:identifier ?current_id;
           zoo:isPartOf ?parent.
  OPTIONAL {{ ?current zoo:title ?current_title. }}
}} ORDER BY ?work ?current_id ?id"""

    res = await sparql_client.query(build_request)
    bindings = res.get("results", {}).get("bindings", [])
    tree = build_custom_search_tree(bindings)

    return {
        "sparql": build_request,
        "tree": tree
    }
