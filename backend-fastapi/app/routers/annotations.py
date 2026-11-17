"""
Reader endpoint that groups the annotations of a section: the reference ones from Corese and
the staged ones from the contributions database (RM-ACC-03).

The contribution routes themselves (create, list, edit, review, delete, export) live in
`app.contributions.router`. This route stays here because it mixes SPARQL and staged data.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.accounts.dependencies import optional_auth
from app.accounts.service import AuthContext
from app.accounts.viewer import viewer_of
from app.contributions.router import get_annotation_service
from app.contributions.schemas import annotation_out
from app.contributions.service import AnnotationService
from app.routers.concepts import classify_concept
from app.services.sparql_client import sparql_client
from app.shared.sparql import sparql_iri, sparql_lang

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("/section")
async def get_section_annotations(
    section_uri: str = Query(..., description="URI de la section / chapitre"),
    lang: str = Query("en", description="Code langue pour les labels"),
    include_pending: bool = Query(
        False, description="Also return the annotations that no peer has reviewed yet"
    ),
    context: AuthContext | None = Depends(optional_auth),
    service: AnnotationService = Depends(get_annotation_service),
) -> dict[str, Any]:
    """
    Récupère en un appel groupé toutes les annotations de référence Corese d'une section
    ainsi que les annotations en staging : les validées, et les en attente si `include_pending`
    (RM-ACC-03). Une annotation rejetée n'apparaît jamais dans le lecteur.
    Élimine la tempête N+1 de requêtes sur le Triplestore.

    Raises:
        Unprocessable: `too_many_results` si la section dépasse 2 000 annotations staging.
    """
    section_iri = sparql_iri(section_uri)
    lang_tag = sparql_lang(lang)

    # 1. Requête SPARQL groupée pour obtenir les annotations Corese de toute la section
    sparql_annots = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix skos: <http://www.w3.org/2004/02/skos/core#> 
    SELECT DISTINCT ?paragraph ?annotation ?annotation_type ?concept ?label ?start ?end ?exact ?coll ?collLabel WHERE {{
      ?paragraph a zoo:Paragraph;
                 zoo:isPartOf {section_iri};
                 zoo:hasAnnotation ?annotation.
      ?annotation a ?annotation_type;
        oa:hasBody ?concept;
        oa:hasTarget [
          oa:hasSource ?paragraph;
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
    }} ORDER BY ?paragraph ?label
    """

    res = await sparql_client.query(sparql_annots)
    bindings = res.get("results", {}).get("bindings", [])

    # Indexation par paragraphe
    reference_annotations: dict[str, dict[str, Any]] = {}
    section_paras_set = set()

    for elt in bindings:
        para_uri = elt.get("paragraph", {}).get("value")
        if not para_uri:
            continue
        section_paras_set.add(para_uri)
        label = elt.get("label", {}).get("value")
        if not label:
            continue

        if para_uri not in reference_annotations:
            reference_annotations[para_uri] = {}

        coll_lbl = elt.get("collLabel", {}).get("value")
        coll_uri = elt.get("coll", {}).get("value")
        concept_val = elt.get("concept", {}).get("value")
        cat = classify_concept(coll_lbl, coll_uri, label, concept_val)

        if label not in reference_annotations[para_uri]:
            reference_annotations[para_uri][label] = {
                "concept": concept_val,
                "label": label,
                "type": elt.get("annotation_type", {}).get("value"),
                "category": cat,
                "collection": coll_lbl,
                "offset": [],
            }
        else:
            if (
                reference_annotations[para_uri][label].get("category") == "general"
                and cat != "general"
            ):
                reference_annotations[para_uri][label]["category"] = cat
                reference_annotations[para_uri][label]["collection"] = coll_lbl

        start = elt.get("start", {}).get("value", 0)
        end = elt.get("end", {}).get("value", 0)
        new_offset = {
            "start": int(start) if str(start).isdigit() else 0,
            "end": int(end) if str(end).isdigit() else 0,
        }
        if new_offset not in reference_annotations[para_uri][label]["offset"]:
            reference_annotations[para_uri][label]["offset"].append(new_offset)

    # 2. Récupération des annotations en staging
    # Si section_paras_set est vide (ex: Corese n'avait aucune annotation), on extrait les paragraphes
    if not section_paras_set:
        sparql_paras = f"""
        prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
        SELECT DISTINCT ?uri WHERE {{
          ?uri a zoo:Paragraph;
               zoo:isPartOf {section_iri}.
        }}
        """
        para_res = await sparql_client.query(sparql_paras)
        for b in para_res.get("results", {}).get("bindings", []):
            p_val = b.get("uri", {}).get("value")
            if p_val:
                section_paras_set.add(p_val)

    staged = await service.section(sorted(section_paras_set), include_pending)
    viewer = viewer_of(context)

    return {
        "section_uri": section_uri,
        "paragraph_count": len(section_paras_set),
        "reference_annotations": reference_annotations,
        "staged_annotations": [annotation_out(s, viewer).model_dump(mode="json") for s in staged],
    }
