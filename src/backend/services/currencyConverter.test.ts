import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest'
import axios from 'axios'

let CurrencyConverterClass: typeof import('./currencyConverter').CurrencyConverter

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-currency-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()

  const converterModule = await import('./currencyConverter')
  CurrencyConverterClass = converterModule.CurrencyConverter
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CurrencyConverter.getRate', () => {
  it('returns identity rate when converting from and to same currency', async () => {
    const converter = new CurrencyConverterClass()

    const result = await converter.getRate('PHP', 'PHP')

    expect(result.rate).toBe(1)
    expect(result.source).toBe('identity')
  })

  it('falls back to a hardcoded rate when live API is unavailable', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network error'))

    const converter = new CurrencyConverterClass()

    const result = await converter.getRate('USD', 'PHP')

    // Source may be 'fallback' (first run) or 'cache' (subsequent runs with a valid DB entry).
    expect(['fallback', 'cache']).toContain(result.source)
    expect(result.rate).toBeGreaterThan(0)
    expect(result.fromCurrency).toBe('USD')
    expect(result.toCurrency).toBe('PHP')
  })

  it('returns a cached rate on subsequent calls within the TTL window', async () => {
    const converter = new CurrencyConverterClass()

    // First call primes the cache (may hit API or fallback)
    await converter.getRate('USD', 'PHP')

    // Second call should be cache hit
    const axiosSpy = vi.spyOn(axios, 'get')
    const result = await converter.getRate('USD', 'PHP')

    // axios.get should NOT have been called for exchange-rate API
    const apiCalls = axiosSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('exchangerate')
    )
    expect(apiCalls.length).toBe(0)
    expect(result.source).toBe('cache')
  })
})

describe('CurrencyConverter.convert', () => {
  it('converts an amount using the fetched rate', async () => {
    // Use a rarely-cached pair to avoid DB cache interference
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { rates: { KWD: 0.31 } },
      status: 200,
    })

    const converter = new CurrencyConverterClass()

    const result = await converter.convert(100, 'USD', 'KWD')

    expect(result.convertedAmount).toBeCloseTo(100 * 0.31, 1)
    expect(result.originalCurrency).toBe('USD')
    expect(result.targetCurrency).toBe('KWD')
  })

  it('returns the original amount unchanged for same-currency conversions', async () => {
    const converter = new CurrencyConverterClass()

    const result = await converter.convert(500, 'PHP', 'PHP')

    expect(result.convertedAmount).toBe(500)
    expect(result.rate).toBe(1)
  })
})
