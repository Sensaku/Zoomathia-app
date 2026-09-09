"""
Service de persistance locale (SQLite) pour les annotations et propositions d'enrichissement.
Permet d'isoler les données en cours de rédaction (staging) avant leur injection officielle
dans le triplestore Corese ou l'OpenTheso d'Huma-Num.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

from app.models.annotation_models import (
    CreateAnnotationRequest,
    AnnotationResponse,
    ThesaurusProposalRequest,
    ThesaurusProposalResponse,
    CreateSavedQueryRequest,
    UpdateSavedQueryRequest,
    SavedQueryResponse,
)
from app.core.qcs_data import QCS_DATA
from app.core.config import settings

# Emplacement configurable de la base SQLite de staging
DB_PATH = Path(settings.STAGING_DB_PATH)


class StagingStore:
    """Gestionnaire de persistance SQLite pour les données de recherche en cours d'évaluation."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialise le schéma relationnel SQLite si la base n'existe pas encore."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Table des annotations manuelles W3C
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS staged_annotations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    paragraph_uri TEXT NOT NULL,
                    target_text TEXT NOT NULL,
                    start_offset INTEGER NOT NULL,
                    end_offset INTEGER NOT NULL,
                    concept_uri TEXT NOT NULL,
                    concept_label TEXT NOT NULL,
                    concept_type TEXT NOT NULL,
                    annotator_name TEXT NOT NULL,
                    justification TEXT,
                    scope_type TEXT NOT NULL DEFAULT 'word_sequence',
                    end_paragraph_uri TEXT,
                    target_paragraphs TEXT,
                    status TEXT NOT NULL DEFAULT 'En attente de validation',
                    created_at TEXT NOT NULL
                )
            """)

            # Migrations pour colonnes additionnelles sur staged_annotations existantes
            for col, col_def in [
                ("justification", "TEXT"),
                ("scope_type", "TEXT NOT NULL DEFAULT 'word_sequence'"),
                ("end_paragraph_uri", "TEXT"),
                ("target_paragraphs", "TEXT"),
                ("status", "TEXT NOT NULL DEFAULT 'En attente de validation'"),
            ]:
                try:
                    cursor.execute(f"ALTER TABLE staged_annotations ADD COLUMN {col} {col_def}")
                except sqlite3.OperationalError:
                    pass

            # Table des propositions d'enrichissement du thésaurus TheZoo
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS thesaurus_proposals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pref_label TEXT NOT NULL,
                    language TEXT NOT NULL,
                    alt_labels TEXT NOT NULL,
                    broader_concept_uri TEXT,
                    broader_concept_label TEXT,
                    definition TEXT,
                    contributor_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            try:
                cursor.execute("ALTER TABLE thesaurus_proposals ADD COLUMN broader_concept_label TEXT")
            except sqlite3.OperationalError:
                pass

            # Table unifiée des requêtes SPARQL sauvegardées et questions de recherche
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS saved_queries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    query_text TEXT NOT NULL,
                    query_spo_text TEXT,
                    category TEXT NOT NULL,
                    author_name TEXT NOT NULL,
                    is_builtin INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            self._seed_builtin_queries(cursor)
            conn.commit()

    def _seed_builtin_queries(self, cursor: sqlite3.Cursor):
        """Peuple les questions de compétence historiques si elles ne sont pas encore présentes."""
        queries_dir = Path(settings.QUERIES_DIR)
        now = datetime.now(timezone.utc).isoformat()

        for qc in QCS_DATA:
            qc_id = qc["id"]
            cursor.execute("SELECT COUNT(*) FROM saved_queries WHERE id = ? AND is_builtin = 1", (qc_id,))
            if cursor.fetchone()[0] > 0:
                continue

            rq_path = queries_dir / f"qc{qc_id}.rq"
            spo_path = queries_dir / f"qc{qc_id}_spo.rq"

            query_text = ""
            if rq_path.exists():
                try:
                    with open(rq_path, "r", encoding="utf-8") as f:
                        query_text = f.read()
                except Exception:
                    pass

            query_spo_text = None
            if spo_path.exists():
                try:
                    with open(spo_path, "r", encoding="utf-8") as f:
                        query_spo_text = f.read()
                except Exception:
                    pass

            if query_text:
                cursor.execute(
                    """
                    INSERT INTO saved_queries (
                        id, title, description, query_text, query_spo_text,
                        category, author_name, is_builtin, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        qc_id,
                        qc.get("title", f"Question de recherche {qc_id}"),
                        qc.get("goal") or qc.get("vizuTitle") or "",
                        query_text,
                        query_spo_text,
                        "Question de compétence",
                        "Équipe scientifique Zoomathia",
                        1,
                        now,
                        now
                    ),
                )

    # --- Gestion des Annotations ---

    def add_annotation(self, req: CreateAnnotationRequest) -> AnnotationResponse:
        """Enregistre une nouvelle annotation de texte (mot, séquence, phrase, paragraphe, multi-paragraphes)."""
        created_at = datetime.now(timezone.utc).isoformat()
        target_paras = req.target_paragraphs or [req.paragraph_uri]
        if req.end_paragraph_uri and req.end_paragraph_uri not in target_paras:
            target_paras.append(req.end_paragraph_uri)
        target_paras_json = json.dumps(target_paras, ensure_ascii=False)
        status = req.status or "En attente de validation"
        scope_type = req.scope_type or "word_sequence"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO staged_annotations (
                    paragraph_uri, target_text, start_offset, end_offset,
                    concept_uri, concept_label, concept_type, annotator_name,
                    justification, scope_type, end_paragraph_uri, target_paragraphs,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    req.paragraph_uri,
                    req.target_text,
                    req.start_offset,
                    req.end_offset,
                    req.concept_uri,
                    req.concept_label,
                    req.concept_type or "http://www.w3.org/2004/02/skos/core#Concept",
                    req.annotator_name or "Chercheur anonyme",
                    req.justification,
                    scope_type,
                    req.end_paragraph_uri,
                    target_paras_json,
                    status,
                    created_at,
                ),
            )
            annot_id = cursor.lastrowid
            conn.commit()

        return AnnotationResponse(
            id=annot_id,
            paragraph_uri=req.paragraph_uri,
            target_text=req.target_text,
            start_offset=req.start_offset,
            end_offset=req.end_offset,
            concept_uri=req.concept_uri,
            concept_label=req.concept_label,
            concept_type=req.concept_type or "http://www.w3.org/2004/02/skos/core#Concept",
            annotator_name=req.annotator_name or "Chercheur anonyme",
            justification=req.justification,
            scope_type=scope_type,
            end_paragraph_uri=req.end_paragraph_uri,
            target_paragraphs=target_paras,
            status=status,
            created_at=created_at,
        )

    def get_annotations(
        self,
        paragraph_uri: Optional[str] = None,
        status: Optional[str] = None,
        section_paragraphs: Optional[List[str]] = None
    ) -> List[AnnotationResponse]:
        """Retourne la liste des annotations en staging, filtrable par paragraphe, statut, ou ensemble de paragraphes."""
        query = "SELECT * FROM staged_annotations WHERE 1=1"
        params: List[Any] = []

        if paragraph_uri:
            query += " AND (paragraph_uri = ? OR target_paragraphs LIKE ?)"
            params.extend([paragraph_uri, f"%{paragraph_uri}%"])

        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY id DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                keys = row.keys()
                target_paras_val = row["target_paragraphs"] if "target_paragraphs" in keys and row["target_paragraphs"] else None
                try:
                    paras_list = json.loads(target_paras_val) if target_paras_val else [row["paragraph_uri"]]
                except Exception:
                    paras_list = [row["paragraph_uri"]]

                # Si un filtre section_paragraphs est fourni, vérifier si au moins un paragraphe correspond
                if section_paragraphs:
                    if not any(p in section_paragraphs for p in paras_list):
                        continue

                results.append(
                    AnnotationResponse(
                        id=row["id"],
                        paragraph_uri=row["paragraph_uri"],
                        target_text=row["target_text"],
                        start_offset=row["start_offset"],
                        end_offset=row["end_offset"],
                        concept_uri=row["concept_uri"],
                        concept_label=row["concept_label"],
                        concept_type=row["concept_type"],
                        annotator_name=row["annotator_name"],
                        justification=row["justification"] if "justification" in keys else None,
                        scope_type=row["scope_type"] if "scope_type" in keys and row["scope_type"] else "word_sequence",
                        end_paragraph_uri=row["end_paragraph_uri"] if "end_paragraph_uri" in keys else None,
                        target_paragraphs=paras_list,
                        status=row["status"] if "status" in keys and row["status"] else "En attente de validation",
                        created_at=row["created_at"],
                    )
                )
            return results

    def update_annotation_status(self, annotation_id: int, status: str) -> Optional[AnnotationResponse]:
        """Met à jour le statut d'arbitrage d'une annotation (Validé, Rejeté, En attente de validation)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE staged_annotations SET status = ? WHERE id = ?",
                (status, annotation_id)
            )
            conn.commit()
            cursor.execute("SELECT * FROM staged_annotations WHERE id = ?", (annotation_id,))
            row = cursor.fetchone()
            if not row:
                return None
            keys = row.keys()
            target_paras_val = row["target_paragraphs"] if "target_paragraphs" in keys and row["target_paragraphs"] else None
            try:
                paras_list = json.loads(target_paras_val) if target_paras_val else [row["paragraph_uri"]]
            except Exception:
                paras_list = [row["paragraph_uri"]]

            return AnnotationResponse(
                id=row["id"],
                paragraph_uri=row["paragraph_uri"],
                target_text=row["target_text"],
                start_offset=row["start_offset"],
                end_offset=row["end_offset"],
                concept_uri=row["concept_uri"],
                concept_label=row["concept_label"],
                concept_type=row["concept_type"],
                annotator_name=row["annotator_name"],
                justification=row["justification"] if "justification" in keys else None,
                scope_type=row["scope_type"] if "scope_type" in keys and row["scope_type"] else "word_sequence",
                end_paragraph_uri=row["end_paragraph_uri"] if "end_paragraph_uri" in keys else None,
                target_paragraphs=paras_list,
                status=row["status"] if "status" in keys and row["status"] else "En attente de validation",
                created_at=row["created_at"],
            )

    def delete_annotation(self, annotation_id: int) -> bool:
        """Supprime une annotation du staging."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM staged_annotations WHERE id = ?", (annotation_id,))
            conn.commit()
            return cursor.rowcount > 0

    # --- Gestion des Propositions de Thésaurus ---

    def add_proposal(self, req: ThesaurusProposalRequest) -> ThesaurusProposalResponse:
        """Enregistre une nouvelle proposition de concept dans TheZoo avec contrôle de doublon."""
        clean_pref = req.pref_label.strip()
        clean_lang = req.language.strip().lower()
        created_at = datetime.now(timezone.utc).isoformat()
        alt_json = json.dumps(req.alt_labels or [], ensure_ascii=False)

        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Vérification anti-doublon : empêcher la soumission multiple du même terme en attente
            cursor.execute(
                "SELECT id FROM thesaurus_proposals WHERE LOWER(pref_label) = ? AND LOWER(language) = ? AND status = 'En attente de révision'",
                (clean_pref.lower(), clean_lang),
            )
            existing = cursor.fetchone()
            if existing:
                raise ValueError(
                    f"Une proposition identique pour '{clean_pref}' ({clean_lang}) est déjà en attente d'arbitrage (ID #{existing['id']})."
                )

            cursor.execute(
                """
                INSERT INTO thesaurus_proposals (
                    pref_label, language, alt_labels, broader_concept_uri, broader_concept_label,
                    definition, contributor_name, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_pref,
                    clean_lang,
                    alt_json,
                    req.broader_concept_uri,
                    req.broader_concept_label,
                    req.definition,
                    req.contributor_name or "Chercheur anonyme",
                    "En attente de révision",
                    created_at,
                ),
            )
            prop_id = cursor.lastrowid
            conn.commit()

        return ThesaurusProposalResponse(
            id=prop_id,
            pref_label=clean_pref,
            language=clean_lang,
            alt_labels=req.alt_labels or [],
            broader_concept_uri=req.broader_concept_uri,
            broader_concept_label=req.broader_concept_label,
            definition=req.definition,
            contributor_name=req.contributor_name or "Chercheur anonyme",
            status="En attente de révision",
            created_at=created_at,
        )

    def get_proposals(
        self,
        status: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[ThesaurusProposalResponse]:
        """Retourne la liste des propositions de concepts enregistrées avec filtres optionnels."""
        query = "SELECT * FROM thesaurus_proposals WHERE 1=1"
        params: List[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status)

        if search:
            search_like = f"%{search.strip().lower()}%"
            query += " AND (LOWER(pref_label) LIKE ? OR LOWER(alt_labels) LIKE ? OR LOWER(contributor_name) LIKE ? OR LOWER(definition) LIKE ? OR LOWER(COALESCE(broader_concept_label, '')) LIKE ?)"
            params.extend([search_like, search_like, search_like, search_like, search_like])

        query += " ORDER BY id DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [
                ThesaurusProposalResponse(
                    id=row["id"],
                    pref_label=row["pref_label"],
                    language=row["language"],
                    alt_labels=json.loads(row["alt_labels"]),
                    broader_concept_uri=row["broader_concept_uri"],
                    broader_concept_label=row["broader_concept_label"] if "broader_concept_label" in row.keys() else None,
                    definition=row["definition"],
                    contributor_name=row["contributor_name"],
                    status=row["status"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]

    def delete_proposal(self, proposal_id: int) -> bool:
        """Supprime une proposition de thésaurus du registre."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM thesaurus_proposals WHERE id = ?", (proposal_id,))
            conn.commit()
            return cursor.rowcount > 0

    def update_proposal_status(self, proposal_id: int, status: str) -> Optional[ThesaurusProposalResponse]:
        """Met à jour le statut d'arbitrage d'une proposition (Validé, Rejeté, En attente de révision)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE thesaurus_proposals SET status = ? WHERE id = ?",
                (status, proposal_id)
            )
            conn.commit()
            cursor.execute("SELECT * FROM thesaurus_proposals WHERE id = ?", (proposal_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return ThesaurusProposalResponse(
                id=row["id"],
                pref_label=row["pref_label"],
                language=row["language"],
                alt_labels=json.loads(row["alt_labels"]),
                broader_concept_uri=row["broader_concept_uri"],
                broader_concept_label=row["broader_concept_label"] if "broader_concept_label" in row.keys() else None,
                definition=row["definition"],
                contributor_name=row["contributor_name"],
                status=row["status"],
                created_at=row["created_at"],
            )

    # --- Sérialiseurs RDF Turtle (Standards W3C Web Annotation & SKOS) ---

    def export_annotations_to_turtle(self) -> str:
        """
        Sérialise toutes les annotations de staging en RDF Turtle au standard W3C Web Annotation.
        Compatible avec l'ontologie Open Annotation (oa:).
        """
        annotations = self.get_annotations()
        lines = [
            "@prefix oa: <http://www.w3.org/ns/oa#> .",
            "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
            "@prefix dcterms: <http://purl.org/dc/terms/> .",
            "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
            "@prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> .",
            "",
            f"# Export de {len(annotations)} annotation(s) W3C en staging - Zoomathia",
            f"# Date de génération : {datetime.now(timezone.utc).isoformat()}Z",
            "",
        ]

        for a in annotations:
            annot_uri = f"<http://zoomathia.i3s.unice.fr/annotation/staging/{a.id}>"
            target_blank = f"_:target_{a.id}"
            selector_blank = f"_:selector_{a.id}"
            escaped_text = a.target_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')

            lines.append(f"{annot_uri} a oa:Annotation ;")
            lines.append(f"    oa:hasBody <{a.concept_uri}> ;")
            lines.append(f"    oa:hasTarget {target_blank} ;")
            lines.append(f"    dcterms:creator \"{a.annotator_name}\" ;")
            lines.append(f"    zoo:proposalStatus \"{a.status}\" ;")
            lines.append(f"    zoo:scopeType \"{a.scope_type}\" ;")
            if a.justification:
                escaped_just = a.justification.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')
                lines.append(f"    dcterms:description \"{escaped_just}\" ;")
            lines.append(f"    dcterms:created \"{a.created_at}\"^^xsd:dateTime .")
            lines.append("")
            lines.append(f"{target_blank} a oa:SpecificResource ;")
            lines.append(f"    oa:hasSource <{a.paragraph_uri}> ;")
            if a.end_paragraph_uri and a.end_paragraph_uri != a.paragraph_uri:
                lines.append(f"    zoo:endSource <{a.end_paragraph_uri}> ;")
            lines.append(f"    oa:hasSelector {selector_blank} .")
            lines.append("")
            lines.append(f"{selector_blank} a oa:TextPositionSelector ;")
            lines.append(f"    oa:exact \"{escaped_text}\" ;")
            lines.append(f"    oa:start {a.start_offset} ;")
            lines.append(f"    oa:end {a.end_offset} .")
            lines.append("")

        return "\n".join(lines)

    def export_proposals_to_turtle(self) -> str:
        """
        Sérialise les propositions de concepts du thésaurus au format SKOS Turtle.
        """
        proposals = self.get_proposals()
        lines = [
            "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
            "@prefix dcterms: <http://purl.org/dc/terms/> .",
            "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
            "",
            f"# Export de {len(proposals)} proposition(s) SKOS - TheZoo",
            f"# Date de génération : {datetime.now(timezone.utc).isoformat()}Z",
            "",
        ]

        for p in proposals:
            concept_uri = f"<http://zoomathia.i3s.unice.fr/concept/proposal/{p.id}>"
            escaped_pref = p.pref_label.replace('"', '\\"')
            lines.append(f"{concept_uri} a skos:Concept ;")
            lines.append(f"    skos:prefLabel \"{escaped_pref}\"@{p.language} ;")
            for alt in p.alt_labels:
                escaped_alt = alt.replace('"', '\\"')
                lines.append(f"    skos:altLabel \"{escaped_alt}\"@{p.language} ;")
            if p.broader_concept_uri:
                lines.append(f"    skos:broader <{p.broader_concept_uri}> ;")
            if p.definition:
                escaped_def = p.definition.replace('\\', '\\\\').replace('"', '\\"')
                lines.append(f"    skos:definition \"{escaped_def}\"@{p.language} ;")
            lines.append(f"    dcterms:creator \"{p.contributor_name}\" ;")
            lines.append(f"    dcterms:created \"{p.created_at}\"^^xsd:dateTime .")
            lines.append("")

        return "\n".join(lines)

    # --- Gestion des Requêtes SPARQL Sauvegardées ---

    def add_saved_query(self, req: CreateSavedQueryRequest) -> SavedQueryResponse:
        """Enregistre une nouvelle requête SPARQL personnalisée."""
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO saved_queries (
                    title, description, query_text, query_spo_text,
                    category, author_name, is_builtin, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    req.title.strip(),
                    req.description.strip() if req.description else None,
                    req.query_text.strip(),
                    req.query_spo_text.strip() if req.query_spo_text else None,
                    req.category.strip() if req.category else "Recherche personnalisée",
                    req.author_name.strip() if req.author_name else "Chercheur Zoomathia",
                    0,
                    now,
                    now,
                ),
            )
            query_id = cursor.lastrowid
            conn.commit()

        return self.get_saved_query_by_id(query_id)  # type: ignore

    def get_saved_queries(
        self, category: Optional[str] = None, search: Optional[str] = None
    ) -> List[SavedQueryResponse]:
        """Retourne les requêtes sauvegardées avec filtrage optionnel."""
        query_sql = "SELECT * FROM saved_queries WHERE 1=1"
        params: List[Any] = []

        if category:
            query_sql += " AND category = ?"
            params.append(category)

        if search:
            query_sql += " AND (title LIKE ? OR description LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])

        query_sql += " ORDER BY is_builtin DESC, id ASC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query_sql, params)
            rows = cursor.fetchall()
            return [
                SavedQueryResponse(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"],
                    query_text=row["query_text"],
                    query_spo_text=row["query_spo_text"],
                    category=row["category"],
                    author_name=row["author_name"],
                    is_builtin=bool(row["is_builtin"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    def get_saved_query_by_id(self, query_id: int) -> Optional[SavedQueryResponse]:
        """Récupère une requête par son identifiant unique."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM saved_queries WHERE id = ?", (query_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return SavedQueryResponse(
                id=row["id"],
                title=row["title"],
                description=row["description"],
                query_text=row["query_text"],
                query_spo_text=row["query_spo_text"],
                category=row["category"],
                author_name=row["author_name"],
                is_builtin=bool(row["is_builtin"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def update_saved_query(
        self, query_id: int, req: UpdateSavedQueryRequest
    ) -> Optional[SavedQueryResponse]:
        """Met à jour une requête existante."""
        existing = self.get_saved_query_by_id(query_id)
        if not existing:
            return None

        now = datetime.now(timezone.utc).isoformat()
        new_title = req.title.strip() if req.title is not None else existing.title
        new_desc = req.description.strip() if req.description is not None else existing.description
        new_query = req.query_text.strip() if req.query_text is not None else existing.query_text
        new_spo = req.query_spo_text.strip() if req.query_spo_text is not None else existing.query_spo_text
        new_cat = req.category.strip() if req.category is not None else existing.category
        new_author = req.author_name.strip() if req.author_name is not None else existing.author_name

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE saved_queries
                SET title = ?, description = ?, query_text = ?, query_spo_text = ?,
                    category = ?, author_name = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_title, new_desc, new_query, new_spo, new_cat, new_author, now, query_id),
            )
            conn.commit()

        return self.get_saved_query_by_id(query_id)

    def delete_saved_query(self, query_id: int) -> bool:
        """Supprime une requête personnalisée. Bloque la suppression des requêtes natives."""
        existing = self.get_saved_query_by_id(query_id)
        if not existing:
            return False
        if existing.is_builtin:
            raise ValueError("Impossible de supprimer une question de compétence native du système.")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM saved_queries WHERE id = ?", (query_id,))
            conn.commit()
            return cursor.rowcount > 0


# Instance singleton réutilisable
staging_store = StagingStore()
