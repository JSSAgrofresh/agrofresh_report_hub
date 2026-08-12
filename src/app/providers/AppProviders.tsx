import type { ReactNode } from 'react'

/** Single composition point for app-wide context providers as they're introduced. */
export function AppProviders({ children }: { children: ReactNode }) {
  return children
}
