/**
 * The fictional work of `e2e/fixtures/corese.json`, declared once here for the journeys.
 * Keep it in step with that file.
 */
const base = 'http://ns.inria.fr/zoomathia/Fictus/de_animalibus'

export const corpus = {
  author: 'Fictus',
  workTitle: 'De animalibus',
  workIri: base,
  bookTitle: 'Liber primus',
  bookIri: `${base}/1`,
  chapterTitle: 'De bestiis silvarum',
  chapterIri: `${base}/1/1`,
  /** The three paragraphs of the chapter: IRI and text. The first has the reference annotation. */
  paragraphs: [
    { iri: `${base}/1/1/text/1`, text: 'In silva magna leo habitat et ceteras bestias vincit.' },
    { iri: `${base}/1/1/text/2`, text: 'Lupus noctu errat et ovium greges observat.' },
    { iri: `${base}/1/1/text/3`, text: 'Aquila alte volat atque oculis acutissimis praedam cernit.' },
  ],
  /** The reference annotation from Corese, on the word "leo" of the first paragraph. */
  referenceAnnotation: { word: 'leo', label: 'lion', start: 15, end: 18 },
} as const

/** Reader URL of the fixture chapter. */
export const readerUrl = `/explore-work?uri=${encodeURIComponent(corpus.chapterIri)}`

/** Reader URL that opens the chapter of `iri` with that paragraph active (`corpus.paragraphs[n].iri`). */
export const readerParagraphUrl = (iri: string): string => `/explore-work?uri=${encodeURIComponent(iri)}`

/** Annotation studio URL of the fixture work (the chapter is picked in its table of contents). */
export const studioUrl = `/annotate?uri=${encodeURIComponent(corpus.workIri)}`
