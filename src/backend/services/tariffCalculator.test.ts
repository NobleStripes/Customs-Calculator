import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

let TariffCalculatorClass: typeof import('./tariffCalculator').TariffCalculator

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()

  const tariffCalculatorModule = await import('./tariffCalculator')
  TariffCalculatorClass = tariffCalculatorModule.TariffCalculator
})

describe('TariffCalculator.searchHSCodes', () => {
  it('returns the canonical dotted code first for exact undotted searches', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    const results = await tariffCalculator.searchHSCodes('847130')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8471.30')
  })

  it('supports multi-term description searches consistently with the local fallback', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    const results = await tariffCalculator.searchHSCodes('oil filter')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8421.23')
  })

  it('returns no results for empty normalized queries', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    const results = await tariffCalculator.searchHSCodes('   ')

    expect(results).toEqual([])
  })
})