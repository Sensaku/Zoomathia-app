/**
 * Global Vitest setup: jest-dom matchers, Testing Library cleanup and the MSW server.
 * No test reaches the network: with `onUnhandledFrame: 'error'` MSW rejects an unhandled
 * request with an error and logs it.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vite-plus/test'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
