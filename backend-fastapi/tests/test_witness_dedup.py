"""Witness grouping and language detection, derived from corpus file names."""

from typing import Any

import pytest

from app.services.witness_dedup import dedupe_zoo_witnesses, derive_language_label


def work(uri: str, file: str) -> dict[str, Any]:
    return {"uri": uri, "title": f"Title {uri}", "author": "Aelian", "file": file}


@pytest.mark.parametrize(
    ("file", "language"),
    [
        ("data/tlg0545.tlg001.perseus-grc1.xml", "GR"),
        ("data/phi0845.phi002.perseus-lat2.xml", "LA"),
        ("data/phi0975.phi001.perseus-eng1.xml", "EN"),
    ],
)
def test_language_comes_from_perseus_file_names(file: str, language: str) -> None:
    assert derive_language_label(file) == language


@pytest.mark.xfail(strict=True, reason="Bug: the TEI P5 suffix ('-p5') hides the language code")
def test_language_survives_the_tei_p5_suffix() -> None:
    assert derive_language_label("data/phi0975.phi001.perseus-lat1-p5.xml") == "LA"


def test_a_zoo_group_keeps_its_single_non_english_witness() -> None:
    rows = [work("w:12g", "/data/zoo/zoo1/12g.xml"), work("w:12e", "/data/zoo/zoo1/12e.xml")]

    assert [row["uri"] for row in dedupe_zoo_witnesses(rows)] == ["w:12g"]


def test_an_ambiguous_zoo_group_keeps_every_witness() -> None:
    rows = [work("w:3g", "/data/zoo/zoo2/3g.xml"), work("w:3l", "/data/zoo/zoo2/3l.xml")]

    assert {row["uri"] for row in dedupe_zoo_witnesses(rows)} == {"w:3g", "w:3l"}


def test_works_outside_the_zoo_layout_keep_their_language() -> None:
    rows = [work("w:p", "data/tlg0545.tlg001.perseus-grc1.xml")]

    assert dedupe_zoo_witnesses(rows)[0]["language"] == "GR"
