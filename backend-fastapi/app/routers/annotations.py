"""
Routeur FastAPI pour les annotations manuelles au standard W3C Web Annotation (oa:).
Permet aux chercheurs d'annoter des passages textuels, de modérer les propositions et d'exporter les triplets RDF.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Response
from app.services.staging_store import staging_store
from app.services.sparql_client import sparql_client
from app.routers.concepts import classify_concept
from app.models.annotation_models import (
    CreateAnnotationRequest,
    AnnotationResponse,
    UpdateAnnotationStatusRequest,
)

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.post("", response_model=AnnotationResponse)
async def create_annotation(annotation: CreateAnnotationRequest):
    """Enregistre une nouvelle annotation sémantique (mot, séquence, phrase, paragraphe ou multi-paragraphes)."""
    # Si intra-paragraphe, l'offset de fin doit être strictement supérieur au début
    if not annotation.end_paragraph_uri or annotation.end_paragraph_uri == annotation.paragraph_uri:
        if annotation.end_offset <= annotation.start_offset:
            raise HTTPException(
                status_code=400,
                detail="L'offset de fin doit être strictement supérieur à l'offset de début."
            )
    return staging_store.add_annotation(annotation)


@router.get("", response_model=List[AnnotationResponse])
async def list_annotations(
    paragraph_uri: Optional[str] = Query(None, description="URI du paragraphe"),
    status: Optional[str] = Query(None, description="Filtrer par statut ('En attente de validation', 'Validé', 'Rejeté')")
):
    """Liste les annotations enregistrées en staging, filtrables par paragraphe et par statut."""
    return staging_store.get_annotations(paragraph_uri=paragraph_uri, status=status)


@router.patch("/{annotation_id}/status", response_model=AnnotationResponse)
async def update_annotation_status(annotation_id: int, req: UpdateAnnotationStatusRequest):
    """Met à jour le statut de validation d'une annotation ('En attente de validation', 'Validé', 'Rejeté')."""
    valid_statuses = {"En attente de validation", "Validé", "Rejeté"}
    if req.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Statut invalide. Valeurs autorisées : {', '.join(valid_statuses)}"
        )
    updated = staging_store.update_annotation_status(annotation_id, req.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Annotation introuvable")
    return updated


@router.get("/section")
async def get_section_annotations(
    section_uri: str = Query(..., description="URI de la section / chapitre"),
    lang: str = Query("en", description="Code langue pour les labels")
) -> Dict[str, Any]:
    """
    Récupère en un appel groupé toutes les annotations de référence Corese d'une section
    ainsi que les annotations en staging (propositions en cours).
    Élimine la tempête N+1 de requêtes sur le Triplestore.
    """
    safe_section = section_uri.replace('>', '').replace('<', '')
    safe_lang = lang.replace('"', '')

    # 1. Requête SPARQL groupée pour obtenir les annotations Corese de toute la section
    sparql_annots = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    prefix oa: <http://www.w3.org/ns/oa#>
    prefix skos: <http://www.w3.org/2004/02/skos/core#> 
    SELECT DISTINCT ?paragraph ?annotation ?annotation_type ?concept ?label ?start ?end ?exact ?coll ?collLabel WHERE {{
      ?paragraph a zoo:Paragraph;
                 zoo:isPartOf <{safe_section}>;
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
    }} ORDER BY ?paragraph ?label
    """

    res = await sparql_client.query(sparql_annots)
    bindings = res.get("results", {}).get("bindings", [])

    # Indexation par paragraphe
    reference_annotations: Dict[str, Dict[str, Any]] = {}
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
                "offset": []
            }
        else:
            if reference_annotations[para_uri][label].get("category") == "general" and cat != "general":
                reference_annotations[para_uri][label]["category"] = cat
                reference_annotations[para_uri][label]["collection"] = coll_lbl

        start = elt.get("start", {}).get("value", 0)
        end = elt.get("end", {}).get("value", 0)
        new_offset = {
            "start": int(start) if str(start).isdigit() else 0,
            "end": int(end) if str(end).isdigit() else 0
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
               zoo:isPartOf <{safe_section}>.
        }}
        """
        para_res = await sparql_client.query(sparql_paras)
        for b in para_res.get("results", {}).get("bindings", []):
            p_val = b.get("uri", {}).get("value")
            if p_val:
                section_paras_set.add(p_val)

    staged = staging_store.get_annotations(section_paragraphs=list(section_paras_set))

    return {
        "section_uri": section_uri,
        "paragraph_count": len(section_paras_set),
        "reference_annotations": reference_annotations,
        "staged_annotations": [s.model_dump() for s in staged]
    }


@router.delete("/{annotation_id}")
async def delete_annotation(annotation_id: int):
    """Supprime une annotation du staging."""
    success = staging_store.delete_annotation(annotation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Annotation introuvable")
    return {"message": "Annotation supprimée avec succès", "id": annotation_id}


@router.get("/export-ttl")
async def export_annotations_turtle():
    """Télécharge l'ensemble des annotations de staging au format RDF Turtle W3C."""
    ttl_content = staging_store.export_annotations_to_turtle()
    return Response(
        content=ttl_content,
        media_type="text/turtle",
        headers={"Content-Disposition": "attachment; filename=zoomathia_staging_annotations.ttl"}
    )
