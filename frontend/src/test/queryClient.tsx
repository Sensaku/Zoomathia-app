/**
 * Helpers to test hooks that use React Query: a client without retries (a failing request
 * must show at once) and a wrapper that provides it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/** A query client for tests: no retry. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** A `wrapper` for `renderHook` that provides `client`. */
export function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
