/**
 * Shared MSW server for the unit and component tests. Handlers live in each test
 * (`server.use(...)`); `setup.ts` resets them after every test.
 */
import { setupServer } from 'msw/node'

export const server = setupServer()
