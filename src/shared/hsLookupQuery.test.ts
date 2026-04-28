import { describe, expect, it } from 'vitest'
import {
  FALLBACK_CONFIDENCE_SCORE,
  LOCAL_CATALOG_CONFIDENCE_SCORE,
  getHsCodeMetadata,
  isCodeLikeQuery,
  isValidExactHsCode,
  normalizeExactHsCode,
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

  it('normalizes exact HS code inputs to canonical dotted form', () => {
    expect(normalizeExactHsCode('847130')).toBe('8471.30')
    expect(normalizeExactHsCode('84713090')).toBe('8471.30.90')
    expect(normalizeExactHsCode('8471309000')).toBe('8471.30.90.00')
  })

  it('rejects malformed exact HS code inputs', () => {
    expect(normalizeExactHsCode('abc')).toBeNull()
    expect(normalizeExactHsCode('8471')).toBeNull()
    expect(isValidExactHsCode('8471.3')).toBe(false)
  })

  it('supports strict exact-length validation for milestone enforcement', () => {
    expect(isValidExactHsCode('84713090', { allowedDigitLengths: [8] })).toBe(true)
    expect(isValidExactHsCode('847130', { allowedDigitLengths: [8] })).toBe(false)
  })

  it('derives chapter and section metadata from normalized HS codes', () => {
    expect(getHsCodeMetadata('84713090')).toEqual({
      chapterCode: '84',
      sectionCode: 'XVI',
      sectionName: 'Machinery and Electrical Equipment',
    })

    expect(getHsCodeMetadata('020714')).toEqual({
      chapterCode: '02',
      sectionCode: 'I',
      sectionName: 'Live Animals; Animal Products',
    })
  })
})
