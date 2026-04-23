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

  it('finds common vehicle parts such as oil filters by description', () => {
    const results = hsCodeLookup.searchHSRows('oil filter')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8421.23')
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

describe('appApi backend-first calculation', () => {
  it('uses the server duty calculation endpoint when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          rate: 7,
          amount: 70,
          surcharge: 0,
          notes: 'server result',
        },
      }),
    } as Response)

    const result = await appApi.calculateDuty({
      value: 1000,
      hsCode: '8421.23',
      originCountry: 'JPN',
    })

    expect(result.success).toBe(true)
    expect(result.data?.amount).toBe(70)
    expect(result.data?.rate).toBe(7)
  })
})

describe('appApi.batchCalculate', () => {
  it('applies transit-specific global fees in the local fallback path', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.batchCalculate([
      {
        hsCode: '8421.23',
        value: 30000,
        freight: 0,
        insurance: 0,
        originCountry: 'JPN',
        currency: 'PHP',
        declarationType: 'transit',
        containerSize: 'none',
        arrastreWharfage: 0,
        doxStampOthers: 0,
      },
    ])

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]?.breakdown?.globalFees?.transitCharge).toBeCloseTo(1000)
    expect(result.data?.[0]?.breakdown?.globalFees?.ipc).toBeCloseTo(250)
    expect(result.data?.[0]?.breakdown?.globalFees?.totalGlobalTax).toBeCloseTo(1380)
    expect(result.data?.[0]?.costBase?.vatBase).toBeCloseTo(38567.5)
    expect(result.data?.[0]?.vat?.amount).toBeCloseTo(4628.1)
  })

  it('keeps transit totals distinct from consumption totals for the same shipment', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.batchCalculate([
      {
        hsCode: '8421.23',
        value: 30000,
        freight: 0,
        insurance: 0,
        originCountry: 'JPN',
        currency: 'PHP',
        declarationType: 'consumption',
        containerSize: 'none',
        arrastreWharfage: 0,
        doxStampOthers: 0,
      },
      {
        hsCode: '8421.23',
        value: 30000,
        freight: 0,
        insurance: 0,
        originCountry: 'JPN',
        currency: 'PHP',
        declarationType: 'transit',
        containerSize: 'none',
        arrastreWharfage: 0,
        doxStampOthers: 0,
      },
    ])

    const consumptionRow = result.data?.[0]
    const transitRow = result.data?.[1]

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(consumptionRow?.breakdown?.globalFees?.transitCharge).toBeCloseTo(0)
    expect(consumptionRow?.breakdown?.globalFees?.ipc).toBeCloseTo(500)
    expect(consumptionRow?.totalLandedCost).toBeCloseTo(42355.6)
    expect(transitRow?.totalLandedCost).toBeCloseTo(43195.6)
    expect((transitRow?.totalLandedCost || 0) - (consumptionRow?.totalLandedCost || 0)).toBeCloseTo(840)
  })

  it('returns computed batch amounts in PHP even when the input currency is not PHP', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.batchCalculate([
      {
        hsCode: '8421.23',
        value: 100,
        freight: 0,
        insurance: 0,
        originCountry: 'JPN',
        currency: 'USD',
        declarationType: 'consumption',
        containerSize: 'none',
        arrastreWharfage: 0,
        doxStampOthers: 0,
      },
    ])

    const row = result.data?.[0]

    expect(result.success).toBe(true)
    expect(row?.calculationCurrency).toBe('PHP')
    expect(row?.fx?.baseCurrency).toBe('PHP')
    expect(row?.costBase?.taxableValue).toBeCloseTo(5600)
    expect(row?.duty?.amount).toBeCloseTo(392)
    expect(row?.vat?.amount).toBeCloseTo(1371.48)
    expect(row?.totalLandedCost).toBeCloseTo(12800.48)
  })
})

describe('appApi HS lookup', () => {
  it('trims HS search queries before calling the server endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [],
      }),
    } as Response)

    await appApi.searchHSCodes(' 8471  ')

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/hs-codes/search?query=8471'),
      expect.anything()
    )
  })

  it('uses the server HS search endpoint when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            code: '9999.10',
            description: 'Server-provided catalog row',
            category: 'Test',
          },
        ],
      }),
    } as Response)

    const result = await appApi.searchHSCodes('server row')

    expect(result.success).toBe(true)
    expect(result.data?.[0]?.code).toBe('9999.10')
  })

  it('falls back to the local HS lookup when server search is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.searchHSCodes('oil filter')

    expect(result.success).toBe(true)
    expect(result.data?.[0]?.code).toBe('8421.23')
  })

  it('returns no fallback matches for whitespace-only HS search queries', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.searchHSCodes('   ')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('prefers exact undotted code matches in the local fallback path', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await appApi.searchHSCodes('847130')

    expect(result.success).toBe(true)
    expect(result.data?.[0]?.code).toBe('8471.30')
  })

  it('resolves typed HS codes through the server when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          code: '8471.30',
          description: 'Automatic data processing machines, portable',
          category: 'Electronics',
        },
      }),
    } as Response)

    const result = await appApi.resolveHSCode('847130')

    expect(result.success).toBe(true)
    expect(result.data?.code).toBe('8471.30')
  })

  it('uses the server HS import preview endpoint when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          rows: [
            {
              rowNumber: 1,
              raw: {
                hsCode: '8421.23',
                description: 'Oil filter',
                category: 'Vehicles',
              },
              normalized: {
                hsCode: '8421.23',
                description: 'Oil filter',
                category: 'Vehicles',
              },
              errors: [],
            },
          ],
        },
      }),
    } as Response)

    const result = await appApi.previewTariffImport({
      rows: [
        {
          hsCode: '8421.23',
          description: 'Oil filter',
          category: 'Vehicles',
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.totalRows).toBe(1)
    expect(result.data?.validRows).toBe(1)
  })
})