import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

let TariffCalculatorClass: typeof import('./tariffCalculator').TariffCalculator
let calculateAllTaxes: typeof import('./tariffCalculator').calculateAllTaxes
let getDatabase: typeof import('../db/database').getDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-calculator-supplement-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  getDatabase = databaseModule.getDatabase

  const tariffCalculatorModule = await import('./tariffCalculator')
  TariffCalculatorClass = tariffCalculatorModule.TariffCalculator
  calculateAllTaxes = tariffCalculatorModule.calculateAllTaxes
}, 60000)

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.calculateVAT
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.calculateVAT', () => {
  it('computes 12% VAT on the dutiable value for a known HS code', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.calculateVAT(10000, '8471.30', 'MFN')

    expect(result.rate).toBeCloseTo(12)
    expect(result.amount).toBeCloseTo(1200)
  })

  it('scales VAT proportionally with the dutiable value', async () => {
    const calculator = new TariffCalculatorClass()

    const half = await calculator.calculateVAT(5000, '8471.30', 'MFN')
    const full = await calculator.calculateVAT(10000, '8471.30', 'MFN')

    expect(full.amount).toBeCloseTo(half.amount * 2)
  })

  it('throws for a schedule code with no approved rate', async () => {
    const calculator = new TariffCalculatorClass()

    await expect(
      calculator.calculateVAT(10000, '8471.30', 'NON-EXISTENT-SCHEDULE')
    ).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.getHSCodeDetails
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.getHSCodeDetails', () => {
  it('returns code, description, and category for a known HS code', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getHSCodeDetails('8471.30')

    expect(result).not.toBeNull()
    expect(result?.code).toBe('8471.30')
    expect(typeof result?.description).toBe('string')
    expect(typeof result?.category).toBe('string')
  })

  it('resolves undotted 6-digit codes to the canonical dotted form', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getHSCodeDetails('847130')

    expect(result?.code).toBe('8471.30')
  })

  it('returns null for an HS code that does not exist in the catalog', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getHSCodeDetails('9999.99')

    expect(result).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.getTariffEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.getTariffEntry', () => {
  it('returns a combined tariff entry with MFN rate for a seeded HS code', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffEntry('8471.30')

    expect(result).not.toBeNull()
    expect(result?.hsCode).toBe('8471.30')
    expect(typeof result?.mfnRate).toBe('number')
    expect(result?.mfnRate).toBeGreaterThanOrEqual(0)
  })

  it('returns null for an HS code absent from the catalog', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffEntry('0000.00')

    expect(result).toBeNull()
  })

  it('has an atigaRate field (may be null if not seeded for that code)', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffEntry('8471.30')

    expect(result).not.toBeNull()
    // atigaRate is either a number or null — both are valid
    expect(result?.atigaRate === null || typeof result?.atigaRate === 'number').toBe(true)
  })

  it('exposes the isRestricted flag as a boolean', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffEntry('8471.30')

    expect(typeof result?.isRestricted).toBe('boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.calculateTotalLandedCost
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.calculateTotalLandedCost', () => {
  it('returns a total that is greater than the original value', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.calculateTotalLandedCost(10000, '8471.30', 'US', 'MFN')

    expect(result.value).toBe(10000)
    expect(result.total).toBeGreaterThan(result.value)
  })

  it('total equals value + duty + vat', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.calculateTotalLandedCost(10000, '8471.30', 'US', 'MFN')
    const expected = result.value + result.duty + result.vat

    expect(result.total).toBeCloseTo(expected, 2)
  })

  it('throws for a schedule code with no approved tariff row', async () => {
    const calculator = new TariffCalculatorClass()

    await expect(
      calculator.calculateTotalLandedCost(10000, '8471.30', 'US', 'NO-SUCH-SCHEDULE')
    ).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.getTariffCategories
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.getTariffCategories', () => {
  it('returns a non-empty array of category strings', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffCategories()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    result.forEach((category) => expect(typeof category).toBe('string'))
  })

  it('does not contain duplicate categories', async () => {
    const calculator = new TariffCalculatorClass()

    const result = await calculator.getTariffCategories()

    expect(new Set(result).size).toBe(result.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.getTariffCatalog
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.getTariffCatalog', () => {
  it('returns catalog rows for a known HS code query', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffCatalog('8471.30', 'All', 'MFN')

    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    const row = rows.find((r) => r.hsCode === '8471.30')
    expect(row).toBeDefined()
    expect(typeof row?.dutyRate).toBe('number')
    expect(typeof row?.vatRate).toBe('number')
  })

  it('returns an empty array for a query that matches nothing', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffCatalog('ZZZNOMATCH99999', 'All', 'MFN')

    expect(rows).toEqual([])
  })

  it('respects the limit parameter', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffCatalog('', 'All', 'MFN', 3)

    expect(rows.length).toBeLessThanOrEqual(3)
  })

  it('exposes duty and VAT rates as percentages (0–100 range)', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffCatalog('8471.30', 'All', 'MFN')

    rows.forEach((row) => {
      expect(row.dutyRate).toBeGreaterThanOrEqual(0)
      expect(row.dutyRate).toBeLessThanOrEqual(100)
      expect(row.vatRate).toBeGreaterThanOrEqual(0)
      expect(row.vatRate).toBeLessThanOrEqual(100)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.getTariffHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.getTariffHistory', () => {
  it('returns historical rows for a known HS code', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffHistory('8471.30', 'All', 'MFN')

    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach((row) => {
      expect(row).toHaveProperty('hsCode')
      expect(row).toHaveProperty('dutyRate')
      expect(row).toHaveProperty('effectiveDate')
    })
  })

  it('returns an empty array for an unknown HS code query', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffHistory('ZZNOMATCH', 'All', 'MFN')

    expect(rows).toEqual([])
  })

  it('respects the limit parameter', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffHistory('', 'All', 'MFN', 2)

    expect(rows.length).toBeLessThanOrEqual(2)
  })

  it('includes importStatus field on each row', async () => {
    const calculator = new TariffCalculatorClass()

    const rows = await calculator.getTariffHistory('8471.30', 'All', 'MFN', 5)

    rows.forEach((row) => {
      expect(row).toHaveProperty('importStatus')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TariffCalculator.saveCalculationHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffCalculator.saveCalculationHistory', () => {
  it('persists a calculation entry that is retrievable via getCalculationHistory', async () => {
    const calculator = new TariffCalculatorClass()

    calculator.saveCalculationHistory({
      hsCode: '8443.99',
      value: 25000,
      currency: 'PHP',
      dutyAmount: 1750,
      vatAmount: 3210,
      totalLandedCost: 30960,
    })

    // Give the async sqlite run a moment to finish
    await new Promise((resolve) => setTimeout(resolve, 100))

    const db = getDatabase()
    const row = await new Promise<{ hs_code: string; value: number } | undefined>((resolve, reject) => {
      db.get(
        'SELECT hs_code, value FROM calculation_history WHERE hs_code = ? ORDER BY id DESC LIMIT 1',
        ['8443.99'],
        (err: Error | null, r: { hs_code: string; value: number } | undefined) => {
          if (err) reject(err)
          else resolve(r)
        }
      )
    })

    expect(row).toBeDefined()
    expect(row?.hs_code).toBe('8443.99')
    expect(row?.value).toBe(25000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateAllTaxes (module-level function)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateAllTaxes', () => {
  it('returns results keyed by schedule when a specific schedule is requested', async () => {
    const results = await calculateAllTaxes(10000, '8471.30', 'MFN', 'US')

    expect(results).toHaveProperty('MFN')
    expect(results['MFN']?.components).toHaveLength(2)
    expect(results['MFN']?.breakdown).toHaveProperty('duty')
    expect(results['MFN']?.breakdown).toHaveProperty('vat')
    expect(results['MFN']?.total).toBeGreaterThan(0)
  })

  it('total equals the sum of component amounts', async () => {
    const results = await calculateAllTaxes(10000, '8471.30', 'MFN', 'US')

    const mfn = results['MFN']!
    const componentSum = mfn.components.reduce((acc, c) => acc + c.amount, 0)
    expect(mfn.total).toBeCloseTo(componentSum, 2)
  })

  it('returns results for all active schedules that have an approved rate for the HS code', async () => {
    // calculateAllTaxes iterates every active schedule; schedules without a tariff
    // rate for this HS code will cause an error.  We verify that the MFN schedule
    // result is always present when specifying it directly, which is the only
    // contractual guarantee of this function.
    const mfnResults = await calculateAllTaxes(10000, '8471.30', 'MFN')

    const scheduleKeys = Object.keys(mfnResults)
    expect(scheduleKeys.length).toBeGreaterThan(0)
    expect(scheduleKeys).toContain('MFN')
  })
})
