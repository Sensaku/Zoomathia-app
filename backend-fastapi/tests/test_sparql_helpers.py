"""Unit tests of the SPARQL escaping helpers (AGENTS.md, non-negotiable rule 1).

Each rejected payload is an injection attempt that the old per-route sanitizers
let through or altered silently.
"""

import pytest

from app.shared.sparql import InvalidSparqlValue, sparql_iri, sparql_lang, sparql_literal

ZOO_IRI = "http://ns.inria.fr/zoomathia/zoo#Oeuvre"


class TestSparqlIri:
    @pytest.mark.parametrize(
        "value",
        [
            ZOO_IRI,
            "https://opentheso.huma-num.fr/?idc=1&idt=th310",
            "HTTP://example.org/UPPER",
            "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1",
            "http://example.org/ἆρα-λέων",
            "http://example.org/a%20b",
        ],
    )
    def test_valid_iri_is_wrapped_in_angle_brackets(self, value: str) -> None:
        assert sparql_iri(value) == f"<{value}>"

    @pytest.mark.parametrize(
        "value",
        [
            "http://ex.org/x> ?s ?p ?o } #",
            "http://ex.org/x>",
            "http://ex.org/<x",
            "http://ex.org/a b",
            "http://ex.org/a\tb",
            "http://ex.org/a\nb",
            "http://ex.org/a\x00b",
            "http://ex.org/a\x1fb",
            "http://ex.org/{x}",
            "http://ex.org/}",
            'http://ex.org/"x',
            "http://ex.org/a|b",
            "http://ex.org/a^b",
            "http://ex.org/a`b",
            "http://ex.org/a\\b",
            "http://ex.org/x\\u003E",
            "http://ex.org/x\\U0000003E",
            "http://ex.org/\ud800",
            " http://ex.org/x",
            "http://ex.org/x ",
            "http://ex.org/x\n",
        ],
    )
    def test_iri_with_a_forbidden_character_is_rejected(self, value: str) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_iri(value)

    @pytest.mark.parametrize(
        "value",
        [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "ftp://example.org/x",
            "urn:isbn:0451450523",
            "//example.org/x",
            "/relative/path",
            "example.org/x",
            "http:/example.org",
            "http://",
            "https://",
            "",
        ],
    )
    def test_only_absolute_http_and_https_iris_are_accepted(self, value: str) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_iri(value)

    def test_iri_of_2048_characters_is_accepted_and_longer_is_rejected(self) -> None:
        longest = "http://ex.org/" + "a" * (2048 - len("http://ex.org/"))

        assert sparql_iri(longest) == f"<{longest}>"
        with pytest.raises(InvalidSparqlValue):
            sparql_iri(longest + "a")

    def test_non_text_value_is_rejected(self) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_iri(None)  # type: ignore[arg-type]

    def test_error_message_does_not_echo_the_value(self) -> None:
        with pytest.raises(InvalidSparqlValue) as error:
            sparql_iri("http://ex.org/x> ?s ?p ?o } #")

        assert "?s ?p ?o" not in str(error.value)


class TestSparqlLiteral:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("Aelian", '"Aelian"'),
            ("", '""'),
            ("Claudius Aelianus, dit Élien", '"Claudius Aelianus, dit Élien"'),
            ("ἆρα λέων; ἢ οὔ", '"ἆρα λέων; ἢ οὔ"'),
            ("100% sûr {oui}", '"100% sûr {oui}"'),
            ('say "hi"', '"say \\"hi\\""'),
            ('"', '"\\""'),
            ('a" } UNION { ?s ?p ?o } #', '"a\\" } UNION { ?s ?p ?o } #"'),
        ],
    )
    def test_literal_is_quoted_and_the_double_quote_is_escaped(
        self, value: str, expected: str
    ) -> None:
        assert sparql_literal(value) == expected

    @pytest.mark.parametrize(
        "value",
        [
            "a\\b",
            "\\",
            "\\u0022",
            "\\u0022 } UNION { ?s ?p ?o } #",
            "\\U00000022",
            'a\\"b',
            "a\nb",
            "a\rb",
            "a\tb",
            "a\x00b",
            "a\x1fb",
            "a\x7fb",
            "a\ud800b",
        ],
    )
    def test_backslash_control_and_surrogate_characters_are_rejected(self, value: str) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_literal(value)

    def test_literal_of_1000_characters_is_accepted_and_longer_is_rejected(self) -> None:
        assert sparql_literal("a" * 1000) == '"' + "a" * 1000 + '"'
        with pytest.raises(InvalidSparqlValue):
            sparql_literal("a" * 1001)

    def test_non_text_value_is_rejected(self) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_literal(None)  # type: ignore[arg-type]


class TestSparqlLang:
    @pytest.mark.parametrize(
        "tag", ["en", "fr", "grc", "la", "zh-Hant", "en-US", "de-CH-1996", "A"]
    )
    def test_plain_language_tag_is_returned_unchanged(self, tag: str) -> None:
        assert sparql_lang(tag) == tag

    @pytest.mark.parametrize(
        "tag",
        [
            "",
            "en\n",
            "en US",
            'en"',
            'en") || true || lang(?x) = "',
            "en-",
            "-en",
            "en--US",
            "e1",
            "toolongtag",
            "en-toolongsubtag",
            "en_US",
            "fr\\u0022",
            "é",
        ],
    )
    def test_invalid_language_tag_is_rejected(self, tag: str) -> None:
        with pytest.raises(InvalidSparqlValue):
            sparql_lang(tag)

    def test_tag_of_35_characters_is_accepted_and_of_36_is_rejected(self) -> None:
        def tag_of(length: int) -> str:
            # "en" + three 8-letter subtags + a last subtag that pads to `length`.
            return "en" + "-abcdefgh" * 3 + "-" + "a" * (length - 30)

        assert len(tag_of(35)) == 35
        assert sparql_lang(tag_of(35)) == tag_of(35)
        assert len(tag_of(36)) == 36
        with pytest.raises(InvalidSparqlValue):
            sparql_lang(tag_of(36))
