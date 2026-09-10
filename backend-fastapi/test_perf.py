import httpx
import os
import time

client = httpx.Client(timeout=45)
sparql_endpoint = os.getenv("SPARQL_ENDPOINT", "http://zoomathia.i3s.unice.fr/sparql")

print("Testing Corese SPARQL performance...")

# 1. Summary query
t0 = time.time()
q_sum = """
prefix zoo: <http://ns.inria.fr/zoomathia/zoo#>
SELECT DISTINCT ?parent ?current ?type (xsd:integer(?id_t) as ?id) ?title ?file WHERE {
  ?current a ?type;
      zoo:isPartOf+ <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis>;
      zoo:isPartOf ?parent_t;
      zoo:identifier ?id_t.
  FILTER(?type != zoo:Paragraph)
  BIND(IF(?parent_t = <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis>, ?current, ?parent_t) AS ?parent)
  OPTIONAL { ?current zoo:title ?title_t. }
  BIND(IF(BOUND(?title_t), ?title_t, "") AS ?title)
} ORDER BY ?id ?parent
"""
r_sum = client.get(sparql_endpoint, params={"query": q_sum, "format": "json"}, headers={"Accept": "application/sparql-results+json"})
print(f"Summary query: {round(time.time() - t0, 2)}s, count: {len(r_sum.json().get('results', {}).get('bindings', []))}")

# 2. Paragraphs query
t0 = time.time()
q_para = """
prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
SELECT DISTINCT (xsd:integer(?id_p) as ?id) ?title ?uri ?text WHERE {
  <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10> zoo:title ?title.
  ?uri a zoo:Paragraph;
    zoo:isPartOf <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10>;
    zoo:identifier ?id_p;
    zoo:text ?text.
} ORDER BY ?id
"""
r_para = client.get(sparql_endpoint, params={"query": q_para, "format": "json"}, headers={"Accept": "application/sparql-results+json"})
print(f"Paragraphs query: {round(time.time() - t0, 2)}s, count: {len(r_para.json().get('results', {}).get('bindings', []))}")

# 3. Section annotations query
t0 = time.time()
q_section_annots = """
prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
prefix oa: <http://www.w3.org/ns/oa#>
prefix skos: <http://www.w3.org/2004/02/skos/core#> 
SELECT DISTINCT ?paragraph ?annotation ?annotation_type ?concept ?label ?start ?end ?exact ?coll ?collLabel WHERE {
  ?paragraph a zoo:Paragraph;
             zoo:isPartOf <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10>;
             zoo:hasAnnotation ?annotation.
  ?annotation a ?annotation_type;
    oa:hasBody ?concept;
    oa:hasTarget [
      oa:hasSource ?paragraph;
      oa:hasSelector ?selector
    ].
  ?selector oa:exact ?exact.
  ?concept skos:prefLabel ?labelen.
  FILTER(lang(?labelen) = "en")
  OPTIONAL {
    ?concept skos:prefLabel ?labellang.
    FILTER(lang(?labellang) = "en")
  }
  OPTIONAL {
    ?coll skos:member ?concept;
          skos:prefLabel ?collLabel.
    FILTER(lang(?collLabel) = "fr" || lang(?collLabel) = "en")
  }
  OPTIONAL {
    ?selector oa:start ?start_t;
      oa:end ?end_t.
  }
  BIND(IF(BOUND(?start_t), ?start_t, 0) as ?start)
  BIND(IF(BOUND(?end_t), ?end_t, 0) as ?end)
  BIND(IF(BOUND(?labellang), ?labellang, ?labelen) AS ?label)
} ORDER BY ?paragraph ?label
"""
r_annots = client.get(sparql_endpoint, params={"query": q_section_annots, "format": "json"}, headers={"Accept": "application/sparql-results+json"})
print(f"Section annots query: {round(time.time() - t0, 2)}s, status: {r_annots.status_code}, count: {len(r_annots.json().get('results', {}).get('bindings', []))}")

# 4. Single paragraph query
t0 = time.time()
q_single = """
prefix zoo: <http://ns.inria.fr/zoomathia/zoo#> 
prefix oa: <http://www.w3.org/ns/oa#>
prefix skos: <http://www.w3.org/2004/02/skos/core#> 
SELECT DISTINCT ?annotation ?annotation_type ?concept ?label ?start ?end ?exact ?coll ?collLabel WHERE {
  <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10/211> zoo:hasAnnotation ?annotation.
  ?annotation a ?annotation_type;
    oa:hasBody ?concept;
    oa:hasTarget [
      oa:hasSource <http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10/211>;
      oa:hasSelector ?selector
    ].
  ?selector oa:exact ?exact.
  ?concept skos:prefLabel ?labelen.
  FILTER(lang(?labelen) = "en")
  OPTIONAL {
    ?concept skos:prefLabel ?labellang.
    FILTER(lang(?labellang) = "en")
  }
  OPTIONAL {
    ?coll skos:member ?concept;
          skos:prefLabel ?collLabel.
    FILTER(lang(?collLabel) = "fr" || lang(?collLabel) = "en")
  }
  OPTIONAL {
    ?selector oa:start ?start_t;
      oa:end ?end_t.
  }
  BIND(IF(BOUND(?start_t), ?start_t, 0) as ?start)
  BIND(IF(BOUND(?end_t), ?end_t, 0) as ?end)
  BIND(IF(BOUND(?labellang), ?labellang, ?labelen) AS ?label)
} ORDER BY ?label
"""
r_single = client.get(sparql_endpoint, params={"query": q_single, "format": "json"}, headers={"Accept": "application/sparql-results+json"})
print(f"Single para query: {round(time.time() - t0, 2)}s, status: {r_single.status_code}, count: {len(r_single.json().get('results', {}).get('bindings', []))}")
