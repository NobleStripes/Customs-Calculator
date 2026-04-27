import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

let TariffCalculatorClass: typeof import('./tariffCalculator').TariffCalculator
let getDatabase: typeof import('../db/database').getDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  getDatabase = databaseModule.getDatabase

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

  it('selects schedule-specific tariff rates when a non-default schedule is requested', async () => {
    const database = getDatabase()
    const tariffCalculator = new TariffCalculatorClass()

    await new Promise<void>((resolve, reject) => {
      database.run(
        'DELETE FROM tariff_rates WHERE hs_code = ? AND COALESCE(schedule_code, ?) = ?',
        ['8471.30', 'MFN', 'AHTN'],
        (deleteError: Error | null) => {
          if (deleteError) {
            reject(deleteError)
            return
          }

          database.run(
            `
              INSERT INTO tariff_rates (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, import_status)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            ['8471.30', 'AHTN', 0.01, 0.12, 0, '2026-01-01', 'approved'],
            (insertError: Error | null) => {
              if (insertError) {
                reject(insertError)
                return
              }

              resolve()
            }
          )
        }
      )
    })

    const mfnDuty = await tariffCalculator.calculateDuty(1000, '8471.30', 'US', 'MFN')
    const ahtnDuty = await tariffCalculator.calculateDuty(1000, '8471.30', 'US', 'AHTN')

    expect(mfnDuty.rate).toBe(5)
    expect(ahtnDuty.rate).toBe(1)
    expect(ahtnDuty.amount).toBe(10)
  })

  it('returns seeded tariff schedule metadata for agreement selectors', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    const schedules = await tariffCalculator.getTariffSchedules()

    expect(schedules.some((schedule) => schedule.code === 'MFN' && schedule.displayName === 'Most-Favored-Nation')).toBe(true)
    expect(
      schedules.some(
        (schedule) =>
          schedule.code === 'AANZFTA' &&
          schedule.displayName === 'ASEAN-Australia-New Zealand Free Trade Agreement'
      )
    ).toBe(true)
    expect(
      schedules.some(
        (schedule) =>
          schedule.code === 'PH-EFTA FTA (CHE/LIE)' &&
          schedule.displayName === 'Philippines-European Free Trade Association Free Trade Agreement (Switzerland/Liechtenstein)'
      )
    ).toBe(true)
  })

  it('throws a handled error when a selected tariff schedule has no approved row', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    await expect(
      tariffCalculator.calculateDuty(1000, '8471.30', 'US', 'NON-EXISTENT')
    ).rejects.toThrow('No approved tariff rate found')
  })
})
