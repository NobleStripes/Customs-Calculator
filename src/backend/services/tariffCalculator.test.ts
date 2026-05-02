import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { HSCodeLookupRow } from './tariffCalculator'

let TariffCalculatorClass: typeof import('./tariffCalculator').TariffCalculator
let hasChapter99Intent: typeof import('./tariffCalculator').hasChapter99Intent
let getSynonymProfile: typeof import('./tariffCalculator').getSynonymProfile
let scoreHsSearchResult: typeof import('./tariffCalculator').scoreHsSearchResult
let getDatabase: typeof import('../db/database').getDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  getDatabase = databaseModule.getDatabase

  const tariffCalculatorModule = await import('./tariffCalculator')
  TariffCalculatorClass = tariffCalculatorModule.TariffCalculator
  hasChapter99Intent = tariffCalculatorModule.hasChapter99Intent
  getSynonymProfile = tariffCalculatorModule.getSynonymProfile
  scoreHsSearchResult = tariffCalculatorModule.scoreHsSearchResult
}, 60000)

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

  it('respects configurable HS search limits', async () => {
    const tariffCalculator = new TariffCalculatorClass()

    const results = await tariffCalculator.searchHSCodes('8', { limit: 5 })

    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('boosts synonym-driven results for discovery terms like drone', async () => {
    const database = getDatabase()
    const tariffCalculator = new TariffCalculatorClass()

    await new Promise<void>((resolve, reject) => {
      database.run(
        `
          INSERT INTO hs_codes (code, description, category, catalog_version, metadata_source)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET
            description = excluded.description,
            category = excluded.category,
            catalog_version = excluded.catalog_version,
            metadata_source = excluded.metadata_source
        `,
        ['8806.21', 'Unmanned aircraft (drones), remotely piloted', 'Aircraft', 'AHTN-2022', 'test'],
        (error: Error | null) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        }
      )
    })

    const results = await tariffCalculator.searchHSCodes('drone', { limit: 10 })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.code).toBe('8806.21')
  })

  it('de-boosts chapter 99 noise unless the query explicitly targets chapter 99', async () => {
    const database = getDatabase()
    const tariffCalculator = new TariffCalculatorClass()

    await new Promise<void>((resolve, reject) => {
      database.serialize(() => {
        database.run(
          `
            INSERT INTO hs_codes (code, description, category, catalog_version, metadata_source)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
              description = excluded.description,
              category = excluded.category,
              catalog_version = excluded.catalog_version,
              metadata_source = excluded.metadata_source
          `,
          ['9910.00', 'Chapter 99 special temporary classification for routers', 'Special', 'AHTN-2022', 'test']
        )
        database.run(
          `
            INSERT INTO hs_codes (code, description, category, catalog_version, metadata_source)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
              description = excluded.description,
              category = excluded.category,
              catalog_version = excluded.catalog_version,
              metadata_source = excluded.metadata_source
          `,
          ['8517.62', 'Wireless routers and network transmission apparatus', 'Electronics', 'AHTN-2022', 'test'],
          (error: Error | null) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          }
        )
      })
    })

    const genericResults = await tariffCalculator.searchHSCodes('wireless router', { limit: 10 })
    const chapter99Results = await tariffCalculator.searchHSCodes('chapter 99 wireless router', { limit: 10 })

    expect(genericResults.length).toBeGreaterThan(0)
    expect(genericResults[0]?.code).toBe('8517.62')
    expect(chapter99Results.some((row) => row.code.startsWith('99'))).toBe(true)
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

describe('scoreHsSearchResult / live-search merged-result re-ranking', () => {
  // Simulates the re-scoring pass applied to merged official + local results in
  // /api/hs-codes/live-search, which uses the same exported utilities.

  const authorityBonus = (rank: number): number => (rank === 1 ? 20 : rank === 2 ? 10 : 0)

  const score = (row: HSCodeLookupRow, query: string, authorityRank = 3): number => {
    const q = query.toUpperCase()
    const compact = q.replace(/[^0-9A-Z]/g, '')
    const { expandedTerms, preferredPrefixes } = getSynonymProfile(query)
    const chapter99Intent = hasChapter99Intent(query)
    return scoreHsSearchResult(row, q, compact, expandedTerms, preferredPrefixes, chapter99Intent) + authorityBonus(authorityRank)
  }

  it('de-boosts chapter 99 entries below relevant results in merged live-search output', () => {
    const chapter99Entry: HSCodeLookupRow = { code: '9910.00', description: 'Special temporary classification for smartphones', category: 'Special' }
    const normalEntry: HSCodeLookupRow = { code: '8517.12', description: 'Telephones for cellular networks, smartphones', category: 'Electronics' }

    const chapter99Score = score(chapter99Entry, 'smartphone')
    const normalScore = score(normalEntry, 'smartphone')

    expect(normalScore).toBeGreaterThan(chapter99Score)
  })

  it('retains chapter 99 ordering when the query explicitly requests chapter 99', () => {
    const chapter99Entry: HSCodeLookupRow = { code: '9910.00', description: 'Special temporary classification for smartphones', category: 'Special' }
    const normalEntry: HSCodeLookupRow = { code: '8517.12', description: 'Telephones for cellular networks, smartphones', category: 'Electronics' }

    const chapter99Score = score(chapter99Entry, 'chapter 99 smartphone')
    const normalScore = score(normalEntry, 'chapter 99 smartphone')

    // With chapter 99 intent, the de-boost does not apply; 9910 now matches "99" code prefix pattern
    expect(chapter99Score).toBeGreaterThan(normalScore - 200) // no catastrophic suppression
  })

  it('applies authority bonus so official-site results rank above local-catalog when scores are close', () => {
    const row: HSCodeLookupRow = { code: '8471.30', description: 'Portable automatic data processing machines', category: 'Electronics' }

    const officialScore = score(row, 'laptop', 1) // official-site, rank=1
    const localScore = score(row, 'laptop', 3)    // local-catalog, rank=3

    expect(officialScore).toBeGreaterThan(localScore)
  })

  it('synonym boosts still overcome authority penalty for highly relevant local results', () => {
    const droneEntry: HSCodeLookupRow = { code: '8806.21', description: 'Unmanned aircraft, remotely piloted', category: 'Aircraft' }
    const irrelevantOfficialEntry: HSCodeLookupRow = { code: '9999.00', description: 'Miscellaneous goods not elsewhere classified', category: 'Other' }

    const droneLocal = score(droneEntry, 'drone', 3)           // local-catalog
    const irrelevantOfficial = score(irrelevantOfficialEntry, 'drone', 1) // official-site

    // The drone entry has a synonym prefix match (+25) and description match (+12*2);
    // the irrelevant entry should not overcome that even with the authority bonus.
    expect(droneLocal).toBeGreaterThan(irrelevantOfficial)
  })
})
