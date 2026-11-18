import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vite-plus/test'
import { renderWithProviders } from '../components/renderWithProviders'
import { usePendingFilter } from './usePendingFilter'
import { useSavedNotice } from './useSavedNotice'

function Page() {
  const [section, setSection] = useState('s1')
  const { includePending, setIncludePending } = usePendingFilter()
  const notice = useSavedNotice(section)
  return (
    <>
      <p>{notice.visible ? 'notice shown' : 'notice hidden'}</p>
      <button onClick={notice.show}>save</button>
      <button onClick={notice.dismiss}>dismiss</button>
      <button onClick={() => setIncludePending(!includePending)}>toggle</button>
      <button onClick={() => setSection('s2')}>change section</button>
      <button onClick={() => setSection('s1')}>back to first section</button>
    </>
  )
}

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))

describe('useSavedNotice (RM-ACC-03)', () => {
  it('shows after a save, and hides when dismissed', async () => {
    renderWithProviders(<Page />)
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
    await click('save')
    expect(screen.getByText('notice shown')).toBeInTheDocument()
    await click('dismiss')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
  })

  it('does not come back after the filter was turned on and off again', async () => {
    renderWithProviders(<Page />)
    await click('save')
    await click('toggle')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
    await click('toggle')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
  })

  it('does not come back after a change of section', async () => {
    renderWithProviders(<Page />)
    await click('save')
    await click('change section')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
    // Back on the section of the save, with no filter change in between: the notice was reset
    // when the section changed, so it must not come back.
    await click('back to first section')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
  })

  it('stays hidden when saved while the filter is already on', async () => {
    renderWithProviders(<Page />, { route: '/?pending=1' })
    await click('save')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
    await click('toggle')
    expect(screen.getByText('notice hidden')).toBeInTheDocument()
  })
})
