// Extend vitest's expect with DOM matchers (toBeInTheDocument, etc.)
// This runs in vitest's context before any test files.
import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
