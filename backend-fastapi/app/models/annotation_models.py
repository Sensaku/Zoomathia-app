"""
Modèles Pydantic pour les annotations sémantiques W3C, les propositions du thésaurus TheZoo,
et le requêteur SPARQL interactif.
"""

from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime


class CreateAnnotationRequest(BaseModel):
    """Requête de création d'une annotation manuelle sur un passage de texte ancien."""
    paragraph_uri: str = Field(..., description="URI du paragraphe annoté (ex: Corese URI)")
    target_text: str = Field(..., description="Texte exact sélectionné dans le manuscrit/témoin")
    start_offset: int = Field(..., ge=0, description="Indice caractère de début dans le texte du paragraphe")
    end_offset: int = Field(..., ge=0, description="Indice caractère de fin (non inclus)")
    concept_uri: str = Field(..., description="URI du concept TheZoo associé (ex: https://opentheso.huma-num.fr/?idc=...)")
    concept_label: str = Field(..., description="Libellé du concept (ex: canis, aigle, etc.)")
    concept_type: Optional[str] = Field(default="http://www.w3.org/2004/02/skos/core#Concept", description="Type rdf/skos")
    annotator_name: Optional[str] = Field(default="Chercheur anonyme", description="Nom ou identifiant du contributeur")
    justification: Optional[str] = Field(default=None, description="Justification scientifique ou philologique de l'annotateur")
    scope_type: Optional[str] = Field(default="word_sequence", description="Granularité : word, word_sequence, sentence, paragraph, multi_paragraph")
    end_paragraph_uri: Optional[str] = Field(default=None, description="URI du paragraphe de fin si annotation multi-paragraphes")
    target_paragraphs: Optional[List[str]] = Field(default=None, description="Liste des URIs de paragraphes couverts")
    status: Optional[str] = Field(default="En attente de validation", description="Statut : 'En attente de validation', 'Validé', 'Rejeté'")


class AnnotationResponse(BaseModel):
    """Modèle de restitution d'une annotation enregistrée en base de staging."""
    id: int
    paragraph_uri: str
    target_text: str
    start_offset: int
    end_offset: int
    concept_uri: str
    concept_label: str
    concept_type: str
    annotator_name: str
    justification: Optional[str] = None
    scope_type: str = "word_sequence"
    end_paragraph_uri: Optional[str] = None
    target_paragraphs: List[str] = []
    status: str = "En attente de validation"
    created_at: str


class UpdateAnnotationStatusRequest(BaseModel):
    """Mise à jour du statut éditorial d'une annotation."""
    status: str = Field(..., description="Nouveau statut : 'En attente de validation', 'Validé', 'Rejeté'")


class ThesaurusProposalRequest(BaseModel):
    """Requête de proposition d'enrichissement pour le thésaurus TheZoo (th310)."""
    pref_label: str = Field(..., min_length=2, description="Terme préférentiel proposé")
    language: str = Field(default="fr", description="Code langue ISO (fr, en, grc, la)")
    alt_labels: Optional[List[str]] = Field(default_factory=list, description="Synonymes ou variantes graphiques")
    broader_concept_uri: Optional[str] = Field(None, description="URI du concept parent générique")
    broader_concept_label: Optional[str] = Field(None, description="Libellé préférentiel (prefLabel) du concept parent générique")
    definition: Optional[str] = Field(None, description="Définition scientifique ou justification contextuelle")
    contributor_name: Optional[str] = Field(default="Chercheur anonyme", description="Nom du contributeur")


class ThesaurusProposalResponse(BaseModel):
    """Modèle de restitution d'une proposition de concept du thésaurus."""
    id: int
    pref_label: str
    language: str
    alt_labels: List[str]
    broader_concept_uri: Optional[str]
    broader_concept_label: Optional[str] = None
    definition: Optional[str]
    contributor_name: str
    status: str = Field(default="En attente de révision", description="Statut éditorial")
    created_at: str


class UpdateProposalStatusRequest(BaseModel):
    """Mise à jour du statut de révision d'une proposition SKOS."""
    status: str = Field(..., description="Nouveau statut : 'En attente de révision', 'Validé', 'Rejeté'")


class SparqlQueryRequest(BaseModel):
    """Payload de soumission pour le SPARQL Playground."""
    query: str = Field(..., min_length=10, description="Requête SPARQL SELECT ou CONSTRUCT")


class CreateSavedQueryRequest(BaseModel):
    """Requête de création d'une requête SPARQL persistée."""
    title: str = Field(..., min_length=3, description="Titre explicite de la requête")
    description: Optional[str] = Field(None, description="Intention ou objectif scientifique de recherche")
    query_text: str = Field(..., min_length=10, description="Code SPARQL (SELECT ou CONSTRUCT)")
    query_spo_text: Optional[str] = Field(None, description="Variante SPO pour visualisation de graphe VENUS")
    category: Optional[str] = Field(default="Recherche personnalisée", description="Catégorie thématique")
    author_name: Optional[str] = Field(default="Chercheur Zoomathia", description="Nom de l'auteur de la requête")


class UpdateSavedQueryRequest(BaseModel):
    """Requête de mise à jour d'une requête SPARQL existante."""
    title: Optional[str] = Field(None, min_length=3)
    description: Optional[str] = None
    query_text: Optional[str] = Field(None, min_length=10)
    query_spo_text: Optional[str] = None
    category: Optional[str] = None
    author_name: Optional[str] = None


class SavedQueryResponse(BaseModel):
    """Modèle de restitution d'une requête SPARQL persistée."""
    id: int
    title: str
    description: Optional[str]
    query_text: str
    query_spo_text: Optional[str]
    category: str
    author_name: str
    is_builtin: bool
    created_at: str
    updated_at: str

