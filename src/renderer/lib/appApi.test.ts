import { describe, expect, it } from 'vitest'
import { hsCodeLookup } from './appApi'

describe('hsCodeLookup', () => {
  it('returns ranked lookup results for partial chapter input', () => {
    const results = hsCodeLookup.searchHSRows('8471')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8471.30')
  })

  it('resolves undotted HS codes to their canonical dotted form', () => {
    const resolved = hsCodeLookup.resolveKnownHSCode('847130')

    expect(resolved?.code).toBe('8471.30')
  })

  it('resolves already dotted HS codes without changing them', () => {
    const resolved = hsCodeLookup.resolveKnownHSCode('8471.30')

    expect(resolved?.code).toBe('8471.30')
  })

  it('supports description-based lookup for suggestion selection', () => {
    const results = hsCodeLookup.searchHSRows('portable data processing')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8471.30')
  })

  it('returns null for unknown typed codes', () => {
    const resolved = hsCodeLookup.resolveKnownHSCode('9999.99')

    expect(resolved).toBeNull()
  })
})