from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any, Optional
import re
from app.services.sparql_client import sparql_client
from app.services.witness_dedup import dedupe_zoo_witnesses

router = APIRouter(tags=["Works & Authors"])

@router.get("/getAuthors")
async def get_authors() -> List[Dict[str, str]]:
    sparql = """
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?name WHERE {
      ?oeuvre (schema:author|zoo:author) ?name;
        zoo:editor ?editor.
    } ORDER BY ?name
    """
    res = await sparql_client.query(sparql)
    return [{"name": b["name"]["value"]} for b in res.get("results", {}).get("bindings", []) if "name" in b]

@router.get("/getWorks")
async def get_works() -> List[Dict[str, Any]]:
    sparql = """
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT ?oeuvre ?title ?author (SAMPLE(?file) AS ?file) WHERE {
      ?oeuvre (zoo:author|schema:author) ?author;
              (schema:title|zoo:title) ?title.
      OPTIONAL { ?oeuvre zoo:file ?file. }
    } GROUP BY ?oeuvre ?title ?author ORDER BY ?title
    """
    res = await sparql_client.query(sparql)
    rows = []
    for b in res.get("results", {}).get("bindings", []):
        if "oeuvre" in b and "title" in b and "author" in b:
            rows.append({
                "uri": b["oeuvre"]["value"],
                "title": b["title"]["value"],
                "author": b["author"]["value"],
                "file": b.get("file", {}).get("value")
            })
    return dedupe_zoo_witnesses(rows)

@router.get("/getWorksFromAuthors")
async def get_works_from_author(author: str = Query(..., description="Nom de l'auteur")) -> List[Dict[str, Any]]:
    # Échappement des guillemets pour éviter l'injection
    safe_author = author.replace('"', '\\"')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT ?oeuvre ?title (SAMPLE(?file) AS ?file) WHERE {{
      ?oeuvre (zoo:author|schema:author) ?author;
              zoo:editor ?editor;
              (schema:title|zoo:title) ?title.
      OPTIONAL {{ ?oeuvre zoo:file ?file. }}
      FILTER(str(?author) = "{safe_author}")
    }} GROUP BY ?oeuvre ?title ORDER BY ?title
    """
    res = await sparql_client.query(sparql)
    rows = []
    for b in res.get("results", {}).get("bindings", []):
        if "oeuvre" in b and "title" in b:
            rows.append({
                "uri": b["oeuvre"]["value"],
                "title": b["title"]["value"],
                "author": author,
                "file": b.get("file", {}).get("value")
            })
    return dedupe_zoo_witnesses(rows)

@router.get("/getWorkByUri")
async def get_work_by_uri(uri: str = Query(..., description="URI de l'œuvre ou partie")) -> List[Dict[str, str]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix schema: <http://schema.org/>
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?work ?author ?title WHERE {{
      {{
        ?work zoo:hasPart+ <{safe_uri}>;
              zoo:author ?author;
              zoo:editor ?editor;
              zoo:title ?title.
      }} UNION {{
        ?work zoo:author ?author;
              zoo:title ?title;
              zoo:editor ?editor.
        FILTER(?work = <http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium>)
      }}
    }}
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "work" in b and "title" in b and "author" in b:
            response.append({
                "uri": b["work"]["value"],
                "title": b["title"]["value"],
                "author": b["author"]["value"]
            })
    return response

@router.get("/getTranslation")
async def get_translation(uri: str = Query(..., description="URI de l'œuvre")) -> Optional[Dict[str, str]]:
    safe_uri = uri.replace('>', '').replace('<', '')
    file_sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT ?file WHERE {{
      <{safe_uri}> zoo:file ?file.
    }}
    """
    file_res = await sparql_client.query(file_sparql)
    bindings = file_res.get("results", {}).get("bindings", [])
    if not bindings or "file" not in bindings[0]:
        return None

    file_val = bindings[0]["file"]["value"]
    match = re.search(r'^(.*\/)(\d+)([a-z])(?:_(\d+))?\.xml$', file_val)
    if not match or match.group(3) == 'e':
        return None

    dir_part, number, _, suffix = match.groups()
    dir_escaped = dir_part.replace('.', '\\\\.')
    cand_sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
    SELECT ?work ?title ?file WHERE {{
      ?work zoo:file ?file;
            zoo:title ?title.
      FILTER(REGEX(STR(?file), "^{dir_escaped}{number}e(_[0-9]+)?\\\\.xml$"))
    }}
    """
    cand_res = await sparql_client.query(cand_sparql)
    candidates = cand_res.get("results", {}).get("bindings", [])
    if not candidates:
        return None

    def find_by_suffix(s):
        for c in candidates:
            m = re.search(r'_(\d+)\.xml$', c["file"]["value"])
            if s:
                if m and m.group(1) == s:
                    return c
            else:
                if not m:
                    return c
        return None

    chosen = (suffix and find_by_suffix(suffix)) or find_by_suffix(None) or candidates[0]
    return {
        "uri": chosen["work"]["value"],
        "title": chosen["title"]["value"]
    }

@router.get("/getWorkPart")
async def get_work_part(title: str = Query(..., description="URI du livre ou oeuvre")) -> List[Dict[str, Any]]:
    safe_title = title.replace('>', '').replace('<', '')
    sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?part ?type ?id ?title WHERE {{    
      <{safe_title}> zoo:hasPart ?part.
      ?part a ?type;
            zoo:identifier ?id;
            zoo:title ?title.
    }} ORDER BY ?id
    """
    res = await sparql_client.query(sparql)
    response = []
    for b in res.get("results", {}).get("bindings", []):
        if "part" in b:
            response.append({
                "uri": b["part"]["value"],
                "id": b.get("id", {}).get("value"),
                "title": b.get("title", {}).get("value"),
                "type": b.get("type", {}).get("value")
            })
    return response

@router.get("/getMetadata")
async def get_metadata(uri: str = Query(..., description="URI de l'oeuvre")) -> Dict[str, Any]:
    safe_uri = uri.replace('>', '').replace('<', '')
    sparql = f"""
    prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
    SELECT DISTINCT ?author ?editor ?file ?date WHERE {{
      <{safe_uri}> a zoo:Oeuvre;
        zoo:author ?author;
        zoo:date ?date;
        zoo:editor ?editor.
      OPTIONAL {{ <{safe_uri}> zoo:file ?file_t. }}
      BIND(IF(BOUND(?file_t), ?file_t, 'word_files') as ?file)
    }}
    """
    res = await sparql_client.query(sparql)
    bindings = res.get("results", {}).get("bindings", [])
    if not bindings:
        return {}
    elt = bindings[0]
    return {
        "author": elt.get("author", {}).get("value"),
        "editor": elt.get("editor", {}).get("value"),
        "date": elt.get("date", {}).get("value"),
        "file": elt.get("file", {}).get("value")
    }
