from typing import List, Dict, Any, Set

def build_summary_tree(bindings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tree: List[Dict[str, Any]] = []
    nodes: Dict[str, Dict[str, Any]] = {}
    id_in_set: Set[str] = set()

    for elt in bindings:
        current_uri = elt.get("current", {}).get("value")
        if not current_uri:
            continue
        nodes[current_uri] = {
            "uri": current_uri,
            "id": elt.get("id", {}).get("value"),
            "title": elt.get("title", {}).get("value"),
            "type": elt.get("type", {}).get("value"),
            "children": []
        }

    for elt in bindings:
        current_uri = elt.get("current", {}).get("value")
        parent_uri = elt.get("parent", {}).get("value")
        if not current_uri or current_uri in id_in_set:
            continue

        if current_uri == parent_uri:
            if current_uri in nodes:
                tree.append(nodes[current_uri])
                id_in_set.add(current_uri)
        else:
            if parent_uri in nodes and current_uri in nodes:
                nodes[parent_uri]["children"].append(nodes[current_uri])
                id_in_set.add(current_uri)

    return tree

def check_paragraph(parent_node: Dict[str, Any], paragraph_id: str) -> bool:
    for child in parent_node.get("children", []):
        if child.get("id") == paragraph_id:
            return True
    return False

def build_custom_search_tree(bindings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tree: List[Dict[str, Any]] = []
    nodes: Dict[str, Dict[str, Any]] = {}
    id_in_set: Set[str] = set()
    placed_in_set: Set[str] = set()

    for elt in bindings:
        work_uri = elt.get("work", {}).get("value")
        current_uri = elt.get("current", {}).get("value")
        author = elt.get("author", {}).get("value")

        if work_uri and work_uri not in nodes:
            nodes[work_uri] = {
                "uri": work_uri,
                "id": work_uri,
                "author": author,
                "title": elt.get("title", {}).get("value"),
                "type": elt.get("type", {}).get("value"),
                "children": []
            }

        if current_uri and current_uri not in nodes:
            nodes[current_uri] = {
                "uri": current_uri,
                "id": elt.get("current_id", {}).get("value"),
                "author": author,
                "title": elt.get("current_title", {}).get("value"),
                "type": elt.get("current_type", {}).get("value"),
                "children": []
            }

    for elt in bindings:
        work_uri = elt.get("work", {}).get("value")
        current_uri = elt.get("current", {}).get("value")
        parent_uri = elt.get("parent", {}).get("value")

        if work_uri and work_uri not in id_in_set:
            if work_uri in nodes:
                tree.append(nodes[work_uri])
                id_in_set.add(work_uri)

        if current_uri and current_uri not in placed_in_set:
            if parent_uri in nodes and current_uri in nodes:
                nodes[parent_uri]["children"].append(nodes[current_uri])
                placed_in_set.add(current_uri)

    for elt in bindings:
        parent_uri = elt.get("paragraph_direct_parent", {}).get("value")
        para_id = elt.get("id", {}).get("value")
        if not parent_uri or parent_uri not in nodes:
            continue

        paragraph = {
            "uri": elt.get("paragraph", {}).get("value"),
            "id": para_id,
            "author": elt.get("author", {}).get("value"),
            "text": elt.get("text", {}).get("value"),
            "children": []
        }

        if not check_paragraph(nodes[parent_uri], para_id):
            nodes[parent_uri]["children"].append(paragraph)

    return tree
