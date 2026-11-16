"""
Service de persistance locale (SQLite) pour les annotations et propositions d'enrichissement.
Permet d'isoler les données en cours de rédaction (staging) avant leur injection officielle
dans le triplestore Corese ou l'OpenTheso d'Huma-Num.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.qcs_data import QCS_DATA
from app.models.annotation_models import (
    INITIAL_ANNOTATION_STATUS,
    AnnotationResponse,
    CreateAnnotationRequest,
    CreateSavedQueryRequest,
    SavedQueryResponse,
    ThesaurusProposalRequest,
    ThesaurusProposalResponse,
    UpdateSavedQueryRequest,
)
from app.services.rdf_export import RdfExport, annotations_to_turtle, proposals_to_turtle

# Configurable location of the staging SQLite database
DB_PATH = Path(settings.STAGING_DB_PATH)

# Escape character of the `LIKE` patterns built from user text (a backslash).
LIKE_ESCAPE = chr(92)
LIKE_ESCAPE_CLAUSE = f" ESCAPE '{LIKE_ESCAPE}'"


def escape_like(text: str) -> str:
    """Escape `%`, `_` and the escape character, so that `text` is matched literally by `LIKE`.

    The pattern must be used with `LIKE_ESCAPE_CLAUSE`. Without it, a search for `50%` or
    `a_b` would match anything (RM-ACC-02: a user value never changes the shape of a query).
    """
    return (
        text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


class StagingStore:
    """Gestionnaire de persistance SQLite pour les données de recherche en cours d'évaluation."""

    def __init__(self, db_path: Path = DB_PATH):
        # No database access here: the schema belongs to Alembic (migrations/) and the native
        # questions are seeded at startup, after the migration check (`seed_builtin_queries`).
        self.db_path = db_path

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def seed_builtin_queries(self) -> None:
        """Insert the native competency questions that the database does not hold yet.

        Idempotent. The tables must exist: run `alembic upgrade head` first.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            self._seed_builtin_queries(cursor)
            conn.commit()

    def _seed_builtin_queries(self, cursor: sqlite3.Cursor):
        """Peuple les questions de compétence historiques si elles ne sont pas encore présentes."""
        queries_dir = Path(settings.QUERIES_DIR)
        now = datetime.now(timezone.utc).isoformat()

        for qc in QCS_DATA:
            qc_id = qc["id"]
            cursor.execute(
                "SELECT COUNT(*) FROM saved_queries WHERE id = ? AND is_builtin = 1", (qc_id,)
            )
            if cursor.fetchone()[0] > 0:
                continue

            rq_path = queries_dir / f"qc{qc_id}.rq"
            spo_path = queries_dir / f"qc{qc_id}_spo.rq"

            query_text = ""
            if rq_path.exists():
                try:
                    with open(rq_path, encoding="utf-8") as f:
                        query_text = f.read()
                except Exception:
                    pass

            query_spo_text = None
            if spo_path.exists():
                try:
                    with open(spo_path, encoding="utf-8") as f:
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
                        now,
                    ),
                )

    # --- Gestion des Annotations ---

    def add_annotation(self, req: CreateAnnotationRequest) -> AnnotationResponse:
        """Store a new text annotation (word, sequence, sentence, paragraph, several paragraphs).

        RM-CTB-04: the status is always `INITIAL_ANNOTATION_STATUS`, whatever the client sent.
        """
        created_at = datetime.now(timezone.utc).isoformat()
        target_paras = req.target_paragraphs or [req.paragraph_uri]
        if req.end_paragraph_uri and req.end_paragraph_uri not in target_paras:
            target_paras.append(req.end_paragraph_uri)
        target_paras_json = json.dumps(target_paras, ensure_ascii=False)
        status = INITIAL_ANNOTATION_STATUS
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
        paragraph_uri: str | None = None,
        status: str | None = None,
        section_paragraphs: list[str] | None = None,
    ) -> list[AnnotationResponse]:
        """List the staged annotations, filtered by paragraph, status or set of paragraphs.

        `paragraph_uri` matches an annotation whose first paragraph, or one of whose covered
        paragraphs, is exactly this IRI (never a longer IRI that merely contains it).
        `section_paragraphs` keeps the annotations that cover at least one of these
        paragraphs; an empty collection therefore matches nothing, while `None` does not
        filter.
        """
        query = "SELECT * FROM staged_annotations WHERE 1=1"
        params: list[Any] = []

        if paragraph_uri:
            # `target_paragraphs` is a JSON array: exact membership through `json_each`. The
            # CASE keeps `json_each` from running on a legacy row that is not valid JSON.
            query += (
                " AND (paragraph_uri = ? OR CASE WHEN json_valid(target_paragraphs)"
                " THEN EXISTS (SELECT 1 FROM json_each(target_paragraphs) WHERE value = ?)"
                " ELSE 0 END)"
            )
            params.extend([paragraph_uri, paragraph_uri])

        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY id DESC"
        section_set = set(section_paragraphs) if section_paragraphs is not None else None

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()

            results = []
            for row in rows:
                keys = row.keys()
                target_paras_val = (
                    row["target_paragraphs"]
                    if "target_paragraphs" in keys and row["target_paragraphs"]
                    else None
                )
                try:
                    paras_list = (
                        json.loads(target_paras_val) if target_paras_val else [row["paragraph_uri"]]
                    )
                except Exception:
                    paras_list = [row["paragraph_uri"]]

                # With a section filter, at least one covered paragraph must belong to it.
                if section_set is not None and not any(p in section_set for p in paras_list):
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
                        scope_type=row["scope_type"]
                        if "scope_type" in keys and row["scope_type"]
                        else "word_sequence",
                        end_paragraph_uri=row["end_paragraph_uri"]
                        if "end_paragraph_uri" in keys
                        else None,
                        target_paragraphs=paras_list,
                        status=row["status"]
                        if "status" in keys and row["status"]
                        else "En attente de validation",
                        created_at=row["created_at"],
                    )
                )
            return results

    def update_annotation_status(
        self, annotation_id: int, status: str
    ) -> AnnotationResponse | None:
        """Met à jour le statut d'arbitrage d'une annotation (Validé, Rejeté, En attente de validation)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE staged_annotations SET status = ? WHERE id = ?", (status, annotation_id)
            )
            conn.commit()
            cursor.execute("SELECT * FROM staged_annotations WHERE id = ?", (annotation_id,))
            row = cursor.fetchone()
            if not row:
                return None
            keys = row.keys()
            target_paras_val = (
                row["target_paragraphs"]
                if "target_paragraphs" in keys and row["target_paragraphs"]
                else None
            )
            try:
                paras_list = (
                    json.loads(target_paras_val) if target_paras_val else [row["paragraph_uri"]]
                )
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
                scope_type=row["scope_type"]
                if "scope_type" in keys and row["scope_type"]
                else "word_sequence",
                end_paragraph_uri=row["end_paragraph_uri"] if "end_paragraph_uri" in keys else None,
                target_paragraphs=paras_list,
                status=row["status"]
                if "status" in keys and row["status"]
                else "En attente de validation",
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
        self, status: str | None = None, search: str | None = None
    ) -> list[ThesaurusProposalResponse]:
        """List the stored concept proposals, with optional status and text filters.

        The text is matched literally: `%` and `_` have no special meaning in it.
        """
        query = "SELECT * FROM thesaurus_proposals WHERE 1=1"
        params: list[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status)

        if search:
            search_like = f"%{escape_like(search.strip().lower())}%"
            like = "LIKE ?" + LIKE_ESCAPE_CLAUSE
            query += (
                f" AND (LOWER(pref_label) {like} OR LOWER(alt_labels) {like}"
                f" OR LOWER(contributor_name) {like} OR LOWER(definition) {like}"
                f" OR LOWER(COALESCE(broader_concept_label, '')) {like})"
            )
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
                    broader_concept_label=row["broader_concept_label"]
                    if "broader_concept_label" in row.keys()
                    else None,
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

    def update_proposal_status(
        self, proposal_id: int, status: str
    ) -> ThesaurusProposalResponse | None:
        """Met à jour le statut d'arbitrage d'une proposition (Validé, Rejeté, En attente de révision)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE thesaurus_proposals SET status = ? WHERE id = ?", (status, proposal_id)
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
                broader_concept_label=row["broader_concept_label"]
                if "broader_concept_label" in row.keys()
                else None,
                definition=row["definition"],
                contributor_name=row["contributor_name"],
                status=row["status"],
                created_at=row["created_at"],
            )

    # --- RDF Turtle serializers (W3C Web Annotation and SKOS), see `app.services.rdf_export` ---

    def export_annotations_to_turtle(self) -> RdfExport:
        """Serialize every staged annotation as W3C Web Annotation Turtle (RM-PUB-01).

        Returns:
            The Turtle document and the number of rows left out because they hold an unsafe
            value (see `app.services.rdf_export`).
        """
        return annotations_to_turtle(self.get_annotations())

    def export_proposals_to_turtle(self) -> RdfExport:
        """Serialize every thesaurus proposal as SKOS Turtle (RM-PUB-01).

        Returns:
            The Turtle document and the number of rows left out because they hold an unsafe
            value (see `app.services.rdf_export`).
        """
        return proposals_to_turtle(self.get_proposals())

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
        self, category: str | None = None, search: str | None = None
    ) -> list[SavedQueryResponse]:
        """List the saved queries, with optional category and text filters.

        The text is matched literally in the title and the description.
        """
        query_sql = "SELECT * FROM saved_queries WHERE 1=1"
        params: list[Any] = []

        if category:
            query_sql += " AND category = ?"
            params.append(category)

        if search:
            like = "LIKE ?" + LIKE_ESCAPE_CLAUSE
            query_sql += f" AND (title {like} OR description {like})"
            pattern = f"%{escape_like(search)}%"
            params.extend([pattern, pattern])

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

    def get_saved_query_by_id(self, query_id: int) -> SavedQueryResponse | None:
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
    ) -> SavedQueryResponse | None:
        """Update a saved query.

        Raises:
            ValueError: If the query is a native competency question (RM-QC-02): only an
                administrator may edit it, and accounts do not exist yet.
        """
        existing = self.get_saved_query_by_id(query_id)
        if not existing:
            return None
        if existing.is_builtin:
            raise ValueError("A native competency question cannot be modified.")

        now = datetime.now(timezone.utc).isoformat()
        new_title = req.title.strip() if req.title is not None else existing.title
        new_desc = req.description.strip() if req.description is not None else existing.description
        new_query = req.query_text.strip() if req.query_text is not None else existing.query_text
        new_spo = (
            req.query_spo_text.strip()
            if req.query_spo_text is not None
            else existing.query_spo_text
        )
        new_cat = req.category.strip() if req.category is not None else existing.category
        new_author = (
            req.author_name.strip() if req.author_name is not None else existing.author_name
        )

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
            raise ValueError(
                "Impossible de supprimer une question de compétence native du système."
            )

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM saved_queries WHERE id = ?", (query_id,))
            conn.commit()
            return cursor.rowcount > 0


# Instance singleton réutilisable
staging_store = StagingStore()
