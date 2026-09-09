/**
 * Utilitaires pour le formatage et la décomposition d'URIs Zoomathia en citations lisibles.
 */

export interface FormattedCitation {
  author: string;
  work: string;
  book: string;
  section: string;
  displayLabel: string;
  shortLabel: string;
  isZoomathiaUri: boolean;
}

const AUTHOR_MAP: Record<string, string> = {
  Pliny: "Pline l'Ancien",
  Aristotle: 'Aristote',
  Aelian: 'Élien',
  Oppian: "Oppien d'Apamée",
  Thomas_Cantimpratensis: 'Thomas de Cantimpré',
  Albertus_Magnus: 'Albert le Grand',
  Vincent_Bellovacensis: 'Vincent de Beauvais',
  Isidore: 'Isidore de Séville',
  Solinus: 'Solin',
  Philes: 'Manuel Philès',
}

const WORK_MAP: Record<string, string> = {
  historia_naturalis: 'Histoire Naturelle',
  historia_animalium: 'Histoire des Animaux',
  de_natura_animalium: 'La Personnalité des Animaux',
  liber_de_natura_rerum: 'Liber de natura rerum',
  de_animalibus: 'De animalibus',
  speculum_doctrinale: 'Speculum Doctrinale',
  speculum_naturale: 'Speculum Naturale',
  etymologiae: 'Étymologies',
  cynegetica: 'Cynégétique',
  halieutica: 'Halieutique',
}

export function parseCitation(uri: string): FormattedCitation {
  if (!uri) {
    return { author: '', work: '', book: '', section: '', displayLabel: '', shortLabel: '', isZoomathiaUri: false }
  }

  const clean = uri
    .replace(/^https?:\/\/ns\.inria\.fr\/zoomathia\//, '')
    .replace(/^https?:\/\/www\.zoomathia\.com\//, '')
    .replace(/^https?:\/\/zoomathia\.i3s\.unice\.fr\/ExploreAWork\?uri=/, '')
    .replace(/^https?:\/\/zoomathia\.i3s\.unice\.fr\//, '')

  const parts = clean.split('/').filter(Boolean)

  if (parts.length >= 4) {
    const rawAuthor = parts[0]
    const rawWork = parts[1]
    const rawBook = parts[2]
    const rawSection = parts[3]

    const author = AUTHOR_MAP[rawAuthor] || rawAuthor.replace(/_/g, ' ')
    const work = WORK_MAP[rawWork.toLowerCase()] || rawWork.replace(/_/g, ' ')
    const book = `Livre ${rawBook}`
    const section = `§${rawSection}`

    return {
      author,
      work,
      book,
      section,
      displayLabel: `${author} — ${work} (${book}, ${section})`,
      shortLabel: `${author}, ${book}, ${section}`,
      isZoomathiaUri: true,
    }
  }

  const lastPart = parts[parts.length - 1] || uri
  return {
    author: '',
    work: '',
    book: '',
    section: '',
    displayLabel: lastPart,
    shortLabel: lastPart,
    isZoomathiaUri: false,
  }
}
