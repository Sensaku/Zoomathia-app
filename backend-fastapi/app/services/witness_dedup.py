import re
from typing import List, Dict, Any, Optional

ZOO_LANG_LABELS = {
    'e': 'EN',
    'g': 'GR',
    'l': 'LA',
    'f': 'FR'
}

ZOO_FILE_PATTERN = re.compile(r'^(.*\/zoo\/zoo\d+\/)(\d+)([a-z])(?:_\d+)?\.xml$')
PERSEUS_PATTERN = re.compile(r'perseus-([a-z]+)\d*\.xml$', re.IGNORECASE)
ZOO_MATCH_PATTERN = re.compile(r'^\d+([a-z])(?:_\d+)?\.xml$')

def derive_language_label(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None
    basename = file_path.replace("\\", "/").split('/')[-1]

    perseus_match = PERSEUS_PATTERN.search(basename)
    if perseus_match:
        code = perseus_match.group(1).lower()
        if code.startswith('eng'):
            return 'EN'
        if code.startswith('grc'):
            return 'GR'
        if code.startswith('lat'):
            return 'LA'

    if 'data_translated' in file_path:
        return 'EN'

    zoo_match = ZOO_MATCH_PATTERN.match(basename)
    if zoo_match:
        lang_char = zoo_match.group(1)
        if lang_char in ZOO_LANG_LABELS:
            return ZOO_LANG_LABELS[lang_char]

    return None

def zoo_witness_match(file_path: Optional[str]):
    if not file_path:
        return None
    return ZOO_FILE_PATTERN.match(file_path.replace("\\", "/"))

def zoo_witness_group_key(file_path: Optional[str]) -> Optional[str]:
    match = zoo_witness_match(file_path)
    if not match:
        return None
    dir_part, number, _ = match.groups()
    return f"{dir_part}{number}"

def dedupe_zoo_witnesses(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        key = zoo_witness_group_key(row.get("file"))
        if not key:
            continue
        groups.setdefault(key, []).append(row)

    chosen_uris = set()
    ambiguous_keys = set()
    for key, group in groups.items():
        non_english = [
            r for r in group 
            if (m := zoo_witness_match(r.get("file"))) and m.group(3) != 'e'
        ]
        if len(non_english) == 1:
            chosen_uris.add(non_english[0]["uri"])
        elif len(non_english) != 1 and len(group) > 1:
            ambiguous_keys.add(key)

    result = []
    for row in rows:
        key = zoo_witness_group_key(row.get("file"))
        if key in ambiguous_keys:
            result.append({
                "uri": row["uri"],
                "title": row["title"],
                "author": row.get("author"),
                "language": None
            })
            continue

        if not key:
            result.append({
                "uri": row["uri"],
                "title": row["title"],
                "author": row.get("author"),
                "language": derive_language_label(row.get("file"))
            })
            continue

        group = groups.get(key, [])
        if len(group) > 1 and row["uri"] not in chosen_uris:
            continue

        result.append({
            "uri": row["uri"],
            "title": row["title"],
            "author": row.get("author"),
            "language": None
        })

    return result
