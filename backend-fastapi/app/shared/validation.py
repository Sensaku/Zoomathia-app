"""Validators and annotated types shared by the request models.

The rules for the values a client sends and the server later writes into an RDF export
(IRIs, language codes, free text) live here once; the Pydantic models and the RDF
serializers both use them (RM-ANN-04, RM-THE-05, RM-ACC-02, RM-PUB-01).

The IRI check reuses the SPARQL escaping helper (`app.shared.sparql.sparql_iri`), so the
characters an IRI may contain are defined in one place only.

Example:
    >>> validate_corpus_paragraph_iri("http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24")
    'http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24'
"""

import re
import unicodedata
from typing import Annotated, Literal

from pydantic import AfterValidator, StringConstraints

from app.shared.sparql import InvalidSparqlValue, sparql_iri, sparql_lang

# RM-ANN-04 (decided 2026-11-16): paragraphs belong to the corpus namespace.
CORPUS_NAMESPACE = "http://ns.inria.fr/zoomathia/"

# IRI minted by the server for a concept proposed on the fly (RM-THE-01): it is the only
# concept that can be annotated without being in TheZoo yet.
PROPOSAL_CONCEPT_BASE = "http://zoomathia.i3s.unice.fr/concept/proposal/"

# RM-ANN-04: a TheZoo concept, as OpenTheso's autocomplete and Corese write it.
_THEZOO_CONCEPT_IRI = re.compile(
    r"https://opentheso\.huma-num\.fr/\?idc=[A-Za-z0-9]{1,64}&idt=th310"
)
_PROPOSAL_CONCEPT_IRI = re.compile(re.escape(PROPOSAL_CONCEPT_BASE) + r"[0-9]{1,18}")

# Control characters of the C0 block that a text may not contain (tab, line feed and
# carriage return are legitimate in a justification or in a selected passage).
_ALLOWED_CONTROL_CHARACTERS = frozenset("\t\n\r")

SKOS_CONCEPT = "http://www.w3.org/2004/02/skos/core#Concept"
SKOS_COLLECTION = "http://www.w3.org/2004/02/skos/core#Collection"

# Enumerations (RM-THE-05 for the languages).
LanguageCode = Literal["fr", "en", "la", "grc"]
ScopeType = Literal["word", "word_sequence", "sentence", "paragraph", "multi_paragraph"]
ConceptType = Literal[
    "http://www.w3.org/2004/02/skos/core#Concept",
    "http://www.w3.org/2004/02/skos/core#Collection",
]
AnnotationStatus = Literal["En attente de validation", "Validé", "Rejeté"]
ProposalStatus = Literal["En attente de révision", "Validé", "Rejeté"]


def validate_iri(value: str) -> str:
    """Return `value` if it is a safe absolute `http` or `https` IRI, else raise `ValueError`.

    At most 2,048 characters, and no whitespace, control character or character of
    `<>"{}|\\^` and the backtick: an IRI that passes can sit between angle brackets in
    Turtle or SPARQL without closing them.

    Args:
        value: The IRI sent by the client, or read from the store.

    Returns:
        The same IRI.

    Raises:
        ValueError: If the IRI is not safe. The message never echoes the value.
    """
    try:
        sparql_iri(value)
    except InvalidSparqlValue as error:
        raise ValueError(str(error)) from error
    for character in value:
        if character.isspace() or unicodedata.category(character) in {"Cc", "Zl", "Zp"}:
            raise ValueError("Invalid IRI: it contains a forbidden character.")
    return value


def validate_thezoo_concept_iri(value: str) -> str:
    """Return `value` if it is a TheZoo concept IRI (RM-ANN-04), else raise `ValueError`.

    The form is `https://opentheso.huma-num.fr/?idc=<id>&idt=th310`, with an alphanumeric
    `<id>` of at most 64 characters. Whether the concept exists is not checked.

    Raises:
        ValueError: If the IRI is not safe or not of this form.
    """
    validate_iri(value)
    if _THEZOO_CONCEPT_IRI.fullmatch(value) is None:
        raise ValueError(
            "Invalid concept IRI: a TheZoo concept is expected "
            "(https://opentheso.huma-num.fr/?idc=<id>&idt=th310)."
        )
    return value


def validate_annotation_concept_iri(value: str) -> str:
    """Return `value` if it can be the body of an annotation (RM-ANN-04), else raise `ValueError`.

    A TheZoo concept IRI, or the IRI that the server minted for a concept proposed on the
    fly (`PROPOSAL_CONCEPT_BASE` followed by the proposal number): the annotation modal
    selects the new concept right after proposing it.

    Raises:
        ValueError: If the IRI is neither of these.
    """
    validate_iri(value)
    if (
        _THEZOO_CONCEPT_IRI.fullmatch(value) is None
        and _PROPOSAL_CONCEPT_IRI.fullmatch(value) is None
    ):
        raise ValueError("Invalid concept IRI: a TheZoo concept or a concept proposal is expected.")
    return value


def validate_corpus_paragraph_iri(value: str) -> str:
    """Return `value` if it is an IRI of the corpus namespace (RM-ANN-04), else raise `ValueError`.

    The namespace is `http://ns.inria.fr/zoomathia/`. Whether the paragraph exists is not
    checked.

    Raises:
        ValueError: If the IRI is not safe or outside the corpus namespace.
    """
    validate_iri(value)
    if not value.startswith(CORPUS_NAMESPACE) or len(value) == len(CORPUS_NAMESPACE):
        raise ValueError(f"Invalid paragraph IRI: it must start with {CORPUS_NAMESPACE}")
    return value


def validate_language_tag(value: str) -> str:
    """Return `value` if it is a plain language tag (`fr`, `grc`, `zh-Hant`), else raise `ValueError`.

    This is the tag syntax an RDF export can carry. The languages that a client may send
    are the narrower `LanguageCode` list (RM-THE-05).

    Raises:
        ValueError: If the tag is not a plain language tag.
    """
    try:
        return sparql_lang(value)
    except InvalidSparqlValue as error:
        raise ValueError(str(error)) from error


def validate_text(value: str) -> str:
    """Return `value` if it is text that a serializer can carry as is, else raise `ValueError`.

    Refused: lone surrogates (they cannot be encoded to UTF-8), the C0 control characters
    other than tab, line feed and carriage return, and the delete character.

    Raises:
        ValueError: If the text contains one of these characters.
    """
    for character in value:
        if "\ud800" <= character <= "\udfff" or (
            (character < " " or character == "\x7f")
            and character not in _ALLOWED_CONTROL_CHARACTERS
        ):
            raise ValueError("Invalid text: it contains a forbidden character.")
    return value


# Annotated types of the request models: the limit and the rule are stated once, here.
TheZooConceptIri = Annotated[str, AfterValidator(validate_thezoo_concept_iri)]
AnnotationConceptIri = Annotated[str, AfterValidator(validate_annotation_concept_iri)]
CorpusParagraphIri = Annotated[str, AfterValidator(validate_corpus_paragraph_iri)]

Text100 = Annotated[str, StringConstraints(max_length=100), AfterValidator(validate_text)]
Text200 = Annotated[str, StringConstraints(max_length=200), AfterValidator(validate_text)]
Text2000 = Annotated[str, StringConstraints(max_length=2000), AfterValidator(validate_text)]
Text5000 = Annotated[str, StringConstraints(max_length=5000), AfterValidator(validate_text)]
Text50000 = Annotated[str, StringConstraints(max_length=50_000), AfterValidator(validate_text)]

# Limits that apply to fields declared with `Field(...)` or `Query(...)`.
MAX_OFFSET = 50_000
MAX_TARGET_PARAGRAPHS = 50
MAX_ALT_LABELS = 20
MAX_LABEL_LENGTH = 200
