import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type sqlite3 from 'sqlite3'

let database: sqlite3.Database
let reseed: typeof import('./database').seedInitialData
let calculator: InstanceType<typeof import('../services/tariffCalculator').TariffCalculator>
let dataDir: string
const originalDataDir = process.env.DATA_DIR

const run = (sql: string, params: Array<string | number> = []) => new Promise<void>((resolve, reject) => {
  database.run(sql, params, (error: Error | null) => error ? reject(error) : resolve())
})
const get = <T>(sql: string, params: Array<string | number> = []) => new Promise<T>((resolve, reject) => {
  database.get(sql, params, (error: Error | null, row: T) => error ? reject(error) : resolve(row))
})

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'customs-hs-catalog-'))
  process.env.DATA_DIR = dataDir
  const module = await import('./database')
  await module.initializeDatabase()
  database = module.getDatabase()
  reseed = module.seedInitialData
  const { TariffCalculator } = await import('../services/tariffCalculator')
  calculator = new TariffCalculator()
}, 60_000)

afterAll(async () => {
  if (database) await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()))
  if (originalDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = originalDataDir
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
})

describe('persisted HS catalog', () => {
  it('seeds specific codes across the catalog and resolves compact input', async () => {
    const counts = await get<{ total: number; chapters: number }>(
      'SELECT COUNT(*) AS total, COUNT(DISTINCT chapter_code) AS chapters FROM hs_codes'
    )
    expect(counts.total).toBeGreaterThan(13_000)
    expect(counts.chapters).toBe(96)
    for (const code of ['0101.21.00', '0904.11.10', '8471.30.20', '8517.13.00', '9706.10.00']) {
      expect((await calculator.getHSCodeDetails(code.replace(/\./g, '')))?.code).toBe(code)
    }
    expect((await calculator.searchHSCodes('smartphone')).some((row) => row.code === '8517.13.00')).toBe(true)
  })

  it('requires a separately approved rate for a newly available code', async () => {
    await expect(calculator.calculateDuty(100_000, '8517.13.00', 'CHN')).rejects.toThrow('No approved tariff rate found')
    expect((await calculator.calculateDuty(100_000, '8471.30', 'CHN')).amount).toBe(5_000)
  })

  it('updates old seed descriptions while preserving imported metadata and rates on reseed', async () => {
    const before = await get<{ count: number }>('SELECT COUNT(*) AS count FROM hs_codes')
    await run("UPDATE hs_codes SET description = 'Old seed description', metadata_source = 'seed' WHERE code = '8517.13.00'")
    await run(`UPDATE hs_codes SET description = 'Reviewed local description', metadata_source = 'manual',
      category = 'Reviewed category', unit = 'pcs', is_restricted = 1 WHERE code = '8471.30.20'`)
    await run(`INSERT INTO tariff_rates
      (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, import_status)
      VALUES ('8471.30.20', 'MFN', 0.017, 0.12, 0, '2020-01-01', 'approved')`)
    await reseed()
    expect(await get('SELECT COUNT(*) AS count FROM hs_codes')).toEqual(before)
    expect(await get('SELECT description, metadata_source FROM hs_codes WHERE code = ?', ['8517.13.00']))
      .toMatchObject({ metadata_source: 'official-snapshot', description: expect.stringContaining('Smartphones') })
    expect(await get('SELECT description, category, unit, is_restricted, metadata_source FROM hs_codes WHERE code = ?', ['8471.30.20']))
      .toEqual({ description: 'Reviewed local description', category: 'Reviewed category', unit: 'pcs', is_restricted: 1, metadata_source: 'manual' })
    expect((await calculator.calculateDuty(100_000, '8471.30.20', 'CHN')).amount).toBeCloseTo(1_700)
  })
})
