"""Builder of the custom-search SPARQL query (RM-ACC-02, RM-EXP-01).

FastAPI-free: it turns the criteria of a `CustomSearchPayload` into one SELECT query and
raises domain errors, which `app.shared.errors` maps to HTTP statuses. The query is built
only from the payload, with the escaping helpers of `app.shared.sparql`: the custom search
and its CSV and JSON exports send exactly the same query to Corese.
"""

from typing import Any

from app.corpus.schemas import CollectionCriterion, ConceptCriterion, CustomSearchPayload
from app.shared.sparql import sparql_iri, sparql_literal

_PREFIXES = (
    "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n"
    "PREFIX oa: <http://www.w3.org/ns/oa#>\n"
    # The trailing space is part of the query as it has always been sent.
    "PREFIX zoo: <http://ns.inria.fr/zoomathia/zoo#> \n"
)


class PurelyNegativeSearchError(ValueError):
    """The search only excludes things: Corese must not evaluate a query with no positive scope."""


def criteria_count(payload: CustomSearchPayload) -> int:
    """Number of criteria of a payload, as counted by the `MAX_CRITERIA` guardrail (RM-ACC-02)."""
    concepts = (
        len(payload.concept_criteria)
        if payload.concept_criteria is not None
        else len(payload.concepts)
    )
    return (
        len(payload.author)
        + len(payload.work)
        + len(payload.excluded_works)
        + concepts
        + len(payload.collection_criteria or [])
    )


def _legacy_concept(
    item: Any, payload: CustomSearchPayload
) -> ConceptCriterion | CollectionCriterion | None:
    """Turn one entry of the legacy `concepts` list into a criterion (None to skip it)."""
    if isinstance(item, dict):
        uri = item.get("uri") or item.get("value", "")
        c_type = item.get("type")
        label = item.get("label")
    elif hasattr(item, "uri"):
        uri = item.uri
        c_type = getattr(item, "type", None)
        label = getattr(item, "label", None)
    else:
        uri = str(item)
        c_type = None
        label = None

    if not uri:
        return None
    if payload.collectionMembers and c_type and "Collection" in str(c_type):
        return CollectionCriterion(uri=uri, label=label, polarity="include")
    return ConceptCriterion(
        uri=uri,
        label=label,
        type=c_type,
        include_subconcepts=payload.subConcepts,
        polarity="include",
    )


def _normalize_criteria(
    payload: CustomSearchPayload,
) -> tuple[list[ConceptCriterion], list[CollectionCriterion]]:
    """Concept and collection criteria, from the new fields or from the legacy `concepts`."""
    concept_criteria: list[ConceptCriterion] = []
    collection_criteria: list[CollectionCriterion] = []

    if payload.concept_criteria is not None:
        concept_criteria = payload.concept_criteria
    elif payload.concepts:
        for item in payload.concepts:
            criterion = _legacy_concept(item, payload)
            if isinstance(criterion, CollectionCriterion):
                collection_criteria.append(criterion)
            elif criterion is not None:
                concept_criteria.append(criterion)

    if payload.collection_criteria is not None:
        collection_criteria = payload.collection_criteria
    return concept_criteria, collection_criteria


def _text_filter_block(authors: list[str], works: list[str], excluded_works: list[str]) -> str:
    """FILTERs on authors and works (included and excluded)."""
    text_filters = []
    if authors and works:
        auth_in = ", ".join([sparql_literal(a.strip()) for a in authors])
        work_in = ", ".join([sparql_iri(w.strip()) for w in works])
        text_filters.append(f"FILTER(?author IN ({auth_in}) || ?work IN ({work_in}))")
    elif authors:
        auth_in = ", ".join([sparql_literal(a.strip()) for a in authors])
        text_filters.append(f"FILTER(?author IN ({auth_in}))")
    elif works:
        work_in = ", ".join([sparql_iri(w.strip()) for w in works])
        text_filters.append(f"FILTER(?work IN ({work_in}))")

    if excluded_works:
        ex_work_in = ", ".join([sparql_iri(w.strip()) for w in excluded_works])
        text_filters.append(f"FILTER(?work NOT IN ({ex_work_in}))")

    return "\n      ".join(text_filters)


def _and_clauses(
    included_concepts: list[ConceptCriterion], included_collections: list[CollectionCriterion]
) -> list[str]:
    """AND mode: every positive criterion must be present on the paragraph."""
    clauses = []
    for i, c in enumerate(included_concepts):
        c_uri = sparql_iri(c.uri.strip())
        if c.include_subconcepts:
            clauses.append(f"""
                    ?ann_c_{i} oa:hasTarget [ oa:hasSource ?paragraph ];
                               oa:hasBody ?c_body_{i}.
                    ?c_body_{i} skos:broader* {c_uri}.
                    """)
        else:
            clauses.append(f"""
                    ?ann_c_{i} oa:hasTarget [ oa:hasSource ?paragraph ];
                               oa:hasBody {c_uri}.
                    """)

    for j, col in enumerate(included_collections):
        col_uri = sparql_iri(col.uri.strip())
        clauses.append(f"""
                ?ann_col_{j} oa:hasTarget [ oa:hasSource ?paragraph ];
                             oa:hasBody ?col_body_{j}.
                {col_uri} skos:member ?col_body_{j}.
                """)
    return clauses


def _or_clauses(
    included_concepts: list[ConceptCriterion], included_collections: list[CollectionCriterion]
) -> list[str]:
    """OR mode: one of the positive criteria must match."""
    or_branches = []
    exact_uris = [sparql_iri(c.uri.strip()) for c in included_concepts if not c.include_subconcepts]
    taxo_uris = [sparql_iri(c.uri.strip()) for c in included_concepts if c.include_subconcepts]
    coll_uris = [sparql_iri(col.uri.strip()) for col in included_collections]

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

    return [" UNION ".join(or_branches)] if or_branches else []


def _negative_clauses(
    excluded_concepts: list[ConceptCriterion], excluded_collections: list[CollectionCriterion]
) -> list[str]:
    """Exclusions, as FILTER NOT EXISTS blocks."""
    clauses = []
    for k, exc in enumerate(excluded_concepts):
        exc_uri = sparql_iri(exc.uri.strip())
        if exc.include_subconcepts:
            clauses.append(f"""
            FILTER NOT EXISTS {{
              ?ann_ex_{k} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody ?ex_body_{k}.
              ?ex_body_{k} skos:broader* {exc_uri}.
            }}
            """)
        else:
            clauses.append(f"""
            FILTER NOT EXISTS {{
              ?ann_ex_{k} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody {exc_uri}.
            }}
            """)

    for m, ex_col in enumerate(excluded_collections):
        ex_col_uri = sparql_iri(ex_col.uri.strip())
        clauses.append(f"""
        FILTER NOT EXISTS {{
          ?ann_ex_col_{m} oa:hasTarget [ oa:hasSource ?paragraph ];
                          oa:hasBody ?ex_col_body_{m}.
          {ex_col_uri} skos:member ?ex_col_body_{m}.
        }}
        """)
    return clauses


def build_custom_search_query(payload: CustomSearchPayload) -> str:
    """Build the SPARQL SELECT query of a custom search.

    Raises:
        PurelyNegativeSearchError: the criteria only exclude things.
        InvalidSparqlValue: a URI or a literal of the payload cannot be escaped safely.
    """
    authors = payload.author
    works = payload.work
    excluded_works = payload.excluded_works

    concept_criteria, collection_criteria = _normalize_criteria(payload)
    included_concepts = [c for c in concept_criteria if c.polarity == "include"]
    excluded_concepts = [c for c in concept_criteria if c.polarity == "exclude"]
    included_collections = [c for c in collection_criteria if c.polarity == "include"]
    excluded_collections = [c for c in collection_criteria if c.polarity == "exclude"]

    # Corese safety rule: refuse a search that only excludes things
    has_positive = bool(authors or works or included_concepts or included_collections)
    has_exclusions = bool(excluded_works or excluded_concepts or excluded_collections)
    if not has_positive and has_exclusions:
        raise PurelyNegativeSearchError(
            "Une recherche ne peut pas être uniquement composée d'exclusions sans périmètre positif (auteur, œuvre ou concept inclus)."
        )

    # Inclusion logic: AND or OR
    is_and_mode = (payload.match_mode == "AND") if payload.match_mode else payload.checked

    text_filter_block = _text_filter_block(authors, works, excluded_works)

    positive_clauses: list[str] = []
    if included_concepts or included_collections:
        build_positive = _and_clauses if is_and_mode else _or_clauses
        positive_clauses = build_positive(included_concepts, included_collections)
    positive_block = "\n      ".join(positive_clauses)

    negative_block = "\n      ".join(_negative_clauses(excluded_concepts, excluded_collections))

    # Final query, its parts ordered for the Corese optimizer
    return f"""{_PREFIXES}
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
