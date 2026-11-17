"""Plant rows directly in the contributions and saved queries tables, as rows stored earlier exist.

The rows bypass the API and the validation, so a test can check what the server does with a
value that the input rules would refuse today (an unsafe IRI), or with a historical author
(RM-CTB-06). They are written with plain `sqlite3`, on the database of the test.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.contributions.models import label_key
from app.core.config import settings

PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1"
CONCEPT = "https://opentheso.huma-num.fr/?idc=107399&idt=th310"
CREATED = "2026-11-16 10:00:00.000000"


def insert(table: str, row: dict[str, Any]) -> int:
    """Insert `row` in `table` of the test database and return its id."""
    columns = ", ".join(row)
    placeholders = ", ".join("?" for _ in row)
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        cursor = connection.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",  # noqa: S608
            tuple(row.values()),
        )
        return int(cursor.lastrowid or 0)


def plant_annotation(**overrides: Any) -> int:
    """A pending historical annotation by "Chercheuse"; `overrides` replace any column."""
    row: dict[str, Any] = {
        "paragraph_uri": PARAGRAPH,
        "target_text": "canis",
        "start_offset": 0,
        "end_offset": 5,
        "concept_uri": CONCEPT,
        "concept_label": "canis",
        "concept_type": "http://www.w3.org/2004/02/skos/core#Concept",
        "justification": None,
        "scope_type": "word",
        "end_paragraph_uri": None,
        "target_paragraphs": json.dumps([PARAGRAPH]),
        "author_id": None,
        "author_label": "Chercheuse",
        "status": "pending",
        "created_at": CREATED,
    }
    row.update(overrides)
    return insert("staged_annotations", row)


def plant_proposal(**overrides: Any) -> int:
    """A pending historical proposal by "Chercheuse"; its anti-duplicate key follows its label."""
    row: dict[str, Any] = {
        "pref_label": "cerf",
        "language": "fr",
        "alt_labels": json.dumps(["biche"]),
        "broader_concept_uri": CONCEPT,
        "broader_concept_label": "cervidé",
        "definition": "Grand mammifère",
        "author_id": None,
        "author_label": "Chercheuse",
        "status": "pending",
        "created_at": CREATED,
    }
    row.update(overrides)
    row.setdefault("pref_label_key", label_key(row["pref_label"]))
    return insert("thesaurus_proposals", row)


def plant_query(**overrides: Any) -> int:
    """A personal query saved before accounts existed, by "Chercheuse"; `overrides` replace any column."""
    row: dict[str, Any] = {
        "title": "Historical query",
        "description": None,
        "query_text": "SELECT ?s WHERE { ?s ?p ?o } LIMIT 5",
        "query_spo_text": None,
        "category": "Recherche personnalisée",
        "author_id": None,
        "author_label": "Chercheuse",
        "is_builtin": 0,
        "created_at": CREATED,
        "updated_at": CREATED,
    }
    row.update(overrides)
    return insert("saved_queries", row)
