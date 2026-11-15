"""Table of contents built from SPARQL bindings."""

from app.services.tree_builder import build_summary_tree


def binding(**values: str) -> dict[str, dict[str, str]]:
    return {name: {"type": "literal", "value": value} for name, value in values.items()}


def test_children_are_nested_under_their_parent() -> None:
    bindings = [
        binding(current="w/1", parent="w/1", id="1", title="Book 1", type="Book"),
        binding(current="w/1/1", parent="w/1", id="1", title="Chapter 1", type="Chapter"),
    ]

    tree = build_summary_tree(bindings)

    assert [node["uri"] for node in tree] == ["w/1"]
    assert [child["uri"] for child in tree[0]["children"]] == ["w/1/1"]


def test_a_node_returned_twice_appears_once() -> None:
    row = binding(current="w/1", parent="w/1", id="1", title="Book 1", type="Book")

    assert len(build_summary_tree([row, row])) == 1
