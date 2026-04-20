import { afterEach, describe, expect, it, vi } from 'vitest'
import { appApi, hsCodeLookup } from './appApi'

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('appApi.convertCurrency', () => {
  it('uses the server currency endpoint when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          originalAmount: 1,
          originalCurrency: 'USD',
          convertedAmount: 56.2,
          targetCurrency: 'PHP',
          rate: 56.2,
          source: 'live',
          timestamp: '2026-04-20T00:00:00.000Z',
        },
      }),
    } as Response)

    const result = await appApi.convertCurrency({
      amount: 1,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
    })

    expect(result.success).toBe(true)
    expect(result.data?.source).toBe('live')
    expect(result.data?.rate).toBe(56.2)
  })

  it('falls back locally when the server currency endpoint is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.convertCurrency({
      amount: 1,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
    })

    expect(result.success).toBe(true)
    expect(result.data?.source).toBe('fallback')
    expect(result.data?.rate).toBe(56)
  })
})