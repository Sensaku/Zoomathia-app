let { executeSPARQLRequest } = require('./utils.js')
let express = require('express');
const axios = require('axios');
let router = express.Router();

const endpoint = "http://localhost:8080/sparql"

const query = `prefix schema: <http://schema.org/>
SELECT ?book ?id WHERE {
  ?book a schema:Book;
    schema:identifier ?id.
}`

/* GET home page. */
router.get('/', async (req, res) => {
  res.status(200);
});

router.get('/getBookList', async (req, res) => {
  const result = await executeSPARQLRequest(endpoint, query)
  let response = []

  for (const elt of result["results"]["bindings"]) {
    response.push({
      uri: elt["book"]["value"],
      id: parseInt(elt["id"]["value"])
    })
  }

  response = response.sort((a, b) => {
    if (a.id > b.id) {
      return 1
    }
    if (a.id < b.id) {
      return -1
    }
    return 0
  })

  res.status(200).json(response);
});

const getParagraphQuery = (uri) => {
  return `prefix schema: <http://schema.org/>
  SELECT ?uri ?id ?text WHERE {
    ?uri schema:isPartOf <${uri}>;
      schema:identifier ?id;
      schema:text ?text
}`
}

const getConceptsQuery = (uri) => {
  return `prefix schema: <http://schema.org/>
  prefix oa: <http://www.w3.org/ns/oa#>
  SELECT DISTINCT ?annotation ?concept ?label ?start ?end ?exact WHERE {
    ?annotation oa:hasBody ?concept;
      oa:hasTarget [
        oa:hasSource <${uri}>;
        oa:hasSelector [
          oa:start ?start;
          oa:end ?end;
          oa:exact ?exact
        ]
      ].
    ?concept skos:prefLabel ?label
    FILTER(lang(?label) = "en")
  }`
}

const searchConceptsQuery = (input) => {
  return `prefix schema: <http://schema.org/>
  prefix oa: <http://www.w3.org/ns/oa#>
  SELECT DISTINCT ?concept ?label WHERE {
    ?concept skos:prefLabel ?label
    FILTER(lang(?label) = "en")
    FILTER(contains(str(?label), "${input}"))
  }`
}

const getParagraphWithConcept = (input, uri) => {
  return `prefix schema: <http://schema.org/>
  prefix oa: <http://www.w3.org/ns/oa#>
  SELECT DISTINCT ?paragraph ?title ?id ?text WHERE {
    ?annotation oa:hasBody ?concept;
      oa:hasTarget [
        oa:hasSource ?paragraph
      ].

    ?paragraph schema:text ?text;
      schema:identifier ?id;
      schema:isPartOf <${uri}>.

    <${uri}> schema:title ?title.
    
    ?concept skos:prefLabel ?label

    FILTER(lang(?label) = "en")
    FILTER(str(?label) = "${input}")
  }
  `
}

const getAuthors = () => {
  return `prefix schema: <http://schema.org/>
  SELECT ?name WHERE {
    ?oeuvre schema:author ?name
  }ORDER BY ?name
`
}

const getWorksFromAuthor = (author) => {
  return `prefix schema: <http://schema.org/>
  SELECT ?oeuvre ?title WHERE {
    ?oeuvre schema:author ?author;
      schema:title ?title.
    filter(str(?author) = "${author}")
  }ORDER BY ?title
  `
}

const getParagraphsWithConcept = (input) => {
  return `prefix schema: <http://schema.org/>
  prefix oa: <http://www.w3.org/ns/oa#>
  SELECT DISTINCT ?uri ?author ?title (xsd:integer(?book) as ?bookid) ?paragraph (xsd:integer(?id) as ?nb) ?text WHERE {
    ?annotation oa:hasBody ?concept;
      oa:hasTarget [
        oa:hasSource ?paragraph
      ].

    ?paragraph schema:text ?text;
      schema:identifier ?id;
      schema:isPartOf ?uri.
    
    ?uri schema:identifier ?book;
      schema:title ?title.

    ?oeuvre schema:author ?author;
      schema:hasPart ?uri.
    
    ?concept skos:prefLabel ?label

    FILTER(lang(?label) = "en")
    FILTER(str(?label) = "${input}")
  }ORDER BY ?bookid ?nb
  `
}

router.get('/getAuthors', async (req, res) => {
  console.log("Get author")
  const response = []
  const result = await executeSPARQLRequest(endpoint, getAuthors());
  for (const author of result.results.bindings) {
    response.push({ name: author.name.value })
  }
  res.status(200).json(response)
})

router.get('/getWorks', async (req, res) => {
  console.log("Get works from author")
  const response = []
  const result = await executeSPARQLRequest(endpoint, getWorksFromAuthor(req.query.author))
  for (const elt of result.results.bindings) {
    response.push({
      uri: elt.oeuvre.value,
      title: elt.title.value
    })
  }
  res.status(200).json(response)
})

router.get('/getParagraphs', async (req, res) => {
  console.log(`Get paragraphs for ${req.query.uri}`)
  let response = []
  const result = await executeSPARQLRequest(endpoint, getParagraphQuery(req.query.uri));
  for (const elt of result.results.bindings) {
    response.push({
      uri: elt.uri.value,
      text: elt.text.value,
      id: parseInt(elt.id.value)
    })
  }

  response = response.sort((a, b) => {
    if (a.id > b.id) {
      return 1
    }
    if (a.id < b.id) {
      return -1
    }
    return 0
  })

  res.status(200).json(response)
})

router.get('/getConcepts', async (req, res) => {
  console.log(`Get Concepts for paragraph ${req.query.uri}`)
  const result = await executeSPARQLRequest(endpoint, getConceptsQuery(req.query.uri))
  const response = []
  for (const elt of result.results.bindings) {
    response.push({
      annotation: elt.annotation.value,
      concept: elt.concept.value,
      label: elt.label.value,
      start: parseInt(elt.start.value),
      end: parseInt(elt.end.value),
      exact: elt.exact.value
    })
  }

  res.status(200).json(response)
})

router.get('/getParagraphWithConcept', async (req, res) => {
  const result = await executeSPARQLRequest(endpoint, getParagraphWithConcept(req.query.concept, req.query.uri))
  let response = []
  for (const elt of result.results.bindings) {
    response.push({
      uri: elt.paragraph.value,
      text: elt.text.value,
      title: elt.title.value,
      id: parseInt(elt.id.value)
    })
  }
  response = response.sort((a, b) => {
    if (a.id > b.id) {
      return 1
    }
    if (a.id < b.id) {
      return -1
    }
    return 0
  })
  res.status(200).json(response)
})

router.get('/searchConcepts', async (req, res) => {
  console.log(`Search concept query for input: ${req.query.input}`)
  const result = await executeSPARQLRequest(endpoint, searchConceptsQuery(req.query.input))
  const response = []

  for (const elt of result.results.bindings) {
    response.push({
      uri: elt.concept.value,
      label: elt.label.value
    })
  }

  res.status(200).json(response)
})

router.get('/getParagraphsWithConcept', async (req, res) => {
  const result = await executeSPARQLRequest(endpoint, getParagraphsWithConcept(req.query.concept.replace("%20", ' ')))
  let response = []
  //?uri ?book ?paragraph ?id ?text
  for (const elt of result.results.bindings) {
    response.push({
      author: elt.author.value,
      bookUri: elt.uri.value,
      bookId: parseInt(elt.bookid.value),
      title: elt.title.value,
      uri: elt.paragraph.value,
      text: elt.text.value,
      id: parseInt(elt.nb.value)
    })
  }

  res.status(200).json(response)
})

module.exports = router;
