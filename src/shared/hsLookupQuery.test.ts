import { describe, expect, it } from 'vitest'
import {
  FALLBACK_CONFIDENCE_SCORE,
  LOCAL_CATALOG_CONFIDENCE_SCORE,
  isCodeLikeQuery,
} from './hsLookupQuery'

describe('hsLookupQuery', () => {
  it('exposes stable confidence scores for local and fallback matches', () => {
    expect(LOCAL_CATALOG_CONFIDENCE_SCORE).toBeGreaterThan(FALLBACK_CONFIDENCE_SCORE)
    expect(LOCAL_CATALOG_CONFIDENCE_SCORE).toBe(82)
    expect(FALLBACK_CONFIDENCE_SCORE).toBe(78)
  })

  it('detects code-like queries with digits and optional dots', () => {
    expect(isCodeLikeQuery('8471.30')).toBe(true)
    expect(isCodeLikeQuery(' 847130 ')).toBe(true)
    expect(isCodeLikeQuery('.8471')).toBe(true)
  })

  it('rejects empty, punctuation-only, and descriptive search text', () => {
    expect(isCodeLikeQuery('')).toBe(false)
    expect(isCodeLikeQuery('...')).toBe(false)
    expect(isCodeLikeQuery('portable computers')).toBe(false)
    expect(isCodeLikeQuery('8471 laptops')).toBe(false)
  })
})
