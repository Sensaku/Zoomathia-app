import { render, screen } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { I18nProvider } from '../i18n'
import { expectNoAxeViolations } from '../test/axe'
import type { ConceptCategory, ConceptCollection } from '../types'
import { categoryStyle, collectionLabel, ConceptCategoryBadge } from './ConceptCategoryBadge'

const ZOONYM: ConceptCollection = {
  iri: 'https://opentheso.huma-num.fr/?idg=MT_7&idt=th310',
  labels: { fr: 'Zoonyme', en: 'Zoonyms' },
}
const SUBJECT: ConceptCollection = {
  iri: 'https://opentheso.huma-num.fr/?idg=MT_6&idt=th310',
  labels: { fr: 'Sujet', en: 'Subject' },
}

function renderIn(language: 'fr' | 'en', ui: ReactNode) {
  localStorage.setItem('zoomathia_lang', language)
  return render(<I18nProvider>{ui}</I18nProvider>)
}

beforeEach(() => localStorage.clear())

describe('collectionLabel', () => {
  it('gives the label in the interface language', () => {
    expect(collectionLabel(ZOONYM, 'fr')).toBe('Zoonyme')
    expect(collectionLabel(ZOONYM, 'en')).toBe('Zoonyms')
  })

  it('falls back to the other language, then to the IRI', () => {
    const frOnly: ConceptCollection = { iri: 'urn:c', labels: { fr: 'Lieu' } }
    const enOnly: ConceptCollection = { iri: 'urn:c', labels: { en: 'Place' } }
    const none: ConceptCollection = { iri: 'urn:c', labels: {} }
    expect(collectionLabel(frOnly, 'en')).toBe('Lieu')
    expect(collectionLabel(enOnly, 'fr')).toBe('Place')
    expect(collectionLabel(none, 'fr')).toBe('urn:c')
  })

  it('treats an empty label as missing', () => {
    expect(collectionLabel({ iri: 'urn:c', labels: { fr: '', en: 'Place' } }, 'fr')).toBe('Place')
  })
})

describe('categoryStyle', () => {
  it('RM-CON-02: takes the category as given and guesses nothing from anywhere else', () => {
    const categories: ConceptCategory[] = ['animal', 'behavior', 'anatomy', 'place', 'person', 'general']
    expect(categories.map((c) => categoryStyle(c).category)).toEqual(categories)
  })

  it('reads a missing category as general, with the general icon', () => {
    expect(categoryStyle(undefined).category).toBe('general')
    expect(categoryStyle(undefined).icon).toBe(Sparkles)
    expect(categoryStyle('general').icon).toBe(Sparkles)
  })
})

describe('ConceptCategoryBadge', () => {
  it('RM-CON-02: the label is translated by the app, in French and in English', () => {
    const { unmount } = renderIn('fr', <ConceptCategoryBadge category="behavior" />)
    expect(screen.getByText('Comportement')).toBeInTheDocument()
    unmount()
    renderIn('en', <ConceptCategoryBadge category="behavior" />)
    expect(screen.getByText('Behaviour')).toBeInTheDocument()
  })

  it('RM-CON-02: the title lists the collections in the interface language', () => {
    const { unmount } = renderIn('fr', <ConceptCategoryBadge category="animal" collections={[ZOONYM, SUBJECT]} />)
    expect(screen.getByText('Animal').closest('span[title]')).toHaveAttribute(
      'title',
      'Collections TheZoo : Zoonyme, Sujet',
    )
    unmount()
    renderIn('en', <ConceptCategoryBadge category="animal" collections={[ZOONYM, SUBJECT]} />)
    expect(screen.getByText('Animal').closest('span[title]')).toHaveAttribute(
      'title',
      'TheZoo collections: Zoonyms, Subject',
    )
  })

  it('a general concept still names its collection', () => {
    renderIn('fr', <ConceptCategoryBadge category="general" collections={[SUBJECT]} />)
    expect(screen.getByText('Général').closest('span[title]')).toHaveAttribute('title', 'Collections TheZoo : Sujet')
  })

  it('names the IRI of a collection that has no label at all', () => {
    renderIn('en', <ConceptCategoryBadge category="place" collections={[{ iri: 'urn:mt4', labels: {} }]} />)
    expect(screen.getByText('Place').closest('span[title]')).toHaveAttribute('title', 'TheZoo collections: urn:mt4')
  })

  it('without a collection the title is the category label', () => {
    renderIn('fr', <ConceptCategoryBadge category="person" collections={[]} />)
    expect(screen.getByText('Personne').closest('span[title]')).toHaveAttribute('title', 'Personne')
  })

  it('inserts a label as it is: "$&" in a collection name is not a replacement pattern', () => {
    const odd: ConceptCollection = { iri: 'urn:odd', labels: { fr: 'A$&B' } }
    renderIn('fr', <ConceptCategoryBadge category="general" collections={[odd]} />)
    expect(screen.getByText('Général').closest('span[title]')).toHaveAttribute('title', 'Collections TheZoo : A$&B')
  })

  it('RM-CON-02: a screen reader gets the collection names as text, not only in the title', () => {
    const { container, unmount } = renderIn(
      'fr',
      <ConceptCategoryBadge category="animal" collections={[ZOONYM, SUBJECT]} />,
    )
    expect(container.querySelector('.sr-only')).toHaveTextContent('Collections TheZoo : Zoonyme, Sujet')
    unmount()
    const english = renderIn('en', <ConceptCategoryBadge category="animal" collections={[ZOONYM, SUBJECT]} />)
    expect(english.container.querySelector('.sr-only')).toHaveTextContent('TheZoo collections: Zoonyms, Subject')
  })

  it('without a collection there is no hidden text', () => {
    const { container } = renderIn('fr', <ConceptCategoryBadge category="person" collections={[]} />)
    expect(container.querySelector('.sr-only')).toBeNull()
  })

  it('has no accessibility violation', async () => {
    const { container } = renderIn('fr', <ConceptCategoryBadge category="anatomy" collections={[ZOONYM]} />)
    await expectNoAxeViolations(container)
  })
})
