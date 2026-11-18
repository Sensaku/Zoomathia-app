import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../../../api/http'
import { I18nProvider } from '../../../i18n/I18nContext'
import { expectNoAxeViolations } from '../../../test/axe'
import { createTestQueryClient, createWrapper } from '../../../test/queryClient'
import { server } from '../../../test/server'
import { ConceptPicker, type PickedConcept } from './ConceptPicker'

const items = [
  { label: 'Lion', uri: 'http://thezoo/lion', identifier: 'lion' },
  { label: 'Lionne', uri: 'http://thezoo/lionne', identifier: 'lionne' },
]

beforeEach(() => localStorage.setItem('zoomathia_lang', 'en'))

function setup(value: PickedConcept | null = null, allowClear = false) {
  const onChange = vi.fn()
  const Wrapper = createWrapper(createTestQueryClient())
  const view = render(
    <Wrapper>
      <I18nProvider>
        <ConceptPicker label="Concept" value={value} onChange={onChange} allowClear={allowClear} />
      </I18nProvider>
    </Wrapper>,
  )
  return { onChange, ...view }
}

function mockSearch(requests: string[] = []) {
  server.use(
    http.get(`${BASE_URL}/thesaurus/autocomplete`, ({ request }) => {
      requests.push(new URL(request.url).searchParams.get('q') ?? '')
      return HttpResponse.json(items)
    }),
  )
  return requests
}

describe('ConceptPicker', () => {
  it('does not search for one character', async () => {
    const requests = mockSearch()
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('textbox', { name: /search for a concept/i }), 'l')
    await new Promise((r) => setTimeout(r, 450))
    expect(requests).toEqual([])
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('searches once with the typed term, then choosing a result calls onChange and clears the search', async () => {
    const requests = mockSearch()
    const user = userEvent.setup()
    const { onChange } = setup()
    const input = screen.getByRole('textbox', { name: /search for a concept/i })
    await user.type(input, 'lion')
    const choice = await screen.findByRole('button', { name: 'Lionne' })
    expect(requests).toEqual(['lion'])
    expect(screen.getByText('2 concept(s) found')).toBeInTheDocument()
    await user.click(choice)
    expect(onChange).toHaveBeenCalledWith({ uri: 'http://thezoo/lionne', label: 'Lionne' })
    expect(input).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Lionne' })).toBeNull()
  })

  it('shows the empty state', async () => {
    server.use(http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json([])))
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('textbox', { name: /search for a concept/i }), 'zz')
    expect(await screen.findByText('No concept found.')).toBeInTheDocument()
  })

  it('shows the translated message when the API fails', async () => {
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json({ detail: 'down' }, { status: 502 })),
    )
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('textbox', { name: /search for a concept/i }), 'lion')
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('down')
    expect(alert.textContent?.length).toBeGreaterThan(0)
  })

  it('removes the value only when allowClear is set', async () => {
    const user = userEvent.setup()
    const value = { uri: 'http://thezoo/lion', label: 'Lion' }
    const first = setup(value, true)
    expect(screen.getByText('http://thezoo/lion')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove the concept' }))
    expect(first.onChange).toHaveBeenCalledWith(null)
    first.unmount()
    setup(value, false)
    expect(screen.queryByRole('button', { name: 'Remove the concept' })).toBeNull()
  })

  it('has no accessibility violation', async () => {
    mockSearch()
    const user = userEvent.setup()
    const { container } = setup({ uri: 'http://thezoo/lion', label: 'Lion' }, true)
    await user.type(screen.getByRole('textbox', { name: /search for a concept/i }), 'lion')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lionne' })).toBeInTheDocument())
    await expectNoAxeViolations(container)
  })
})
