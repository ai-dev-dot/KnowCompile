/**
 * Renderer test setup.
 *
 * Import from this file in renderer test files instead of @testing-library/react.
 * It stubs window.electronAPI so components that call useIPC() don't crash.
 *
 * Each test file must also start with: // @vitest-environment jsdom
 */
import React from 'react'
import { render, renderHook, cleanup } from '@testing-library/react'
import { beforeAll, afterEach, vi } from 'vitest'

// Stub window.electronAPI before any component tries to read it
beforeAll(() => {
  if (typeof window !== 'undefined') {
    ;(window as any).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
      getFilePath: vi.fn().mockImplementation((f: File) => (f as any).path || ''),
    }
  }
})

// Ensure DOM cleanup between tests (belt and suspenders with auto-cleanup)
afterEach(() => {
  cleanup()
})

export { render, renderHook, vi }
export { screen, fireEvent, waitFor, act } from '@testing-library/react'
