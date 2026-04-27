import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

const xlsxFixtureBase64 = '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'

let TariffDataIngestionServiceClass: typeof import('./tariffDataIngestion').TariffDataIngestionService
let getDatabase: typeof import('../db/database').getDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-ingestion-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  getDatabase = databaseModule.getDatabase

  const ingestionModule = await import('./tariffDataIngestion')
  TariffDataIngestionServiceClass = ingestionModule.TariffDataIngestionService
})

describe('TariffDataIngestionService', () => {
  it('normalizes schedule codes in tariff import previews', () => {
    const service = new TariffDataIngestionServiceClass()

    const preview = service.previewRows([
      {
        hsCode: '847130',
        scheduleCode: ' ahtn ',
        dutyRate: '1%',
      },
    ])

    expect(preview.validRows).toBe(1)
    expect(preview.rows[0]?.normalized?.hsCode).toBe('8471.30')
    expect(preview.rows[0]?.normalized?.scheduleCode).toBe('AHTN')
    expect(preview.rows[0]?.normalized?.dutyRate).toBeCloseTo(0.01)
  })

  it('imports non-MFN tariff schedules without overwriting MFN rows', async () => {
    const service = new TariffDataIngestionServiceClass()
    const database = getDatabase()

    await service.importRows({
      sourceName: 'AHTN Test Import',
      rows: [
        {
          hsCode: '8471.30',
          scheduleCode: 'AHTN',
          description: 'Portable ADP machines',
          category: 'Electronics',
          dutyRate: '1%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
        },
      ],
      forceApprove: true,
    })

    const rows = await new Promise<Array<{ schedule_code: string; duty_rate: number }>>((resolve, reject) => {
      database.all(
        `
          SELECT schedule_code, duty_rate
          FROM tariff_rates
          WHERE hs_code = ? AND COALESCE(schedule_code, 'MFN') IN (?, ?)
          ORDER BY schedule_code
        `,
        ['8471.30', 'AHTN', 'MFN'],
        (error: Error | null, queryRows: Array<{ schedule_code: string; duty_rate: number }>) => {
          if (error) {
            reject(error)
            return
          }

          resolve(queryRows)
        }
      )
    })

    expect(rows.some((row) => row.schedule_code === 'MFN' && Math.abs(row.duty_rate - 0.05) < 0.000001)).toBe(true)
    expect(rows.some((row) => row.schedule_code === 'AHTN' && Math.abs(row.duty_rate - 0.01) < 0.000001)).toBe(true)
  })

  it('parses HS catalog rows from xlsx base64 uploads', async () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = await service.parseHSCatalogRows({
      fileName: 'catalog.xlsx',
      contentBase64: xlsxFixtureBase64,
    })

    expect(rows).toEqual([
      {
        hsCode: '8471.30',
        description: 'Portable data processing machines',
        category: 'Electronics',
      },
    ])
  })

  it('parses tariff rows from workbook uploads and detects duplicate source references', async () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = await service.parseTariffRows({
      rows: [
        {
          hs_code: '8471.30',
          duty_rate: '5%',
          vat_rate: '12%',
          schedule_code: 'MFN',
        },
      ],
    })

    expect(rows[0]).toMatchObject({
      hsCode: '8471.30',
      dutyRate: '5%',
      vatRate: '12%',
      scheduleCode: 'MFN',
    })

    await service.importRows({
      sourceName: 'Duplicate Reference Test',
      sourceType: 'auto-fetch-tariff-rates-boc-tabular',
      sourceReference: 'https://example.gov.ph/file.csv',
      rows,
      forceApprove: true,
    })

    await expect(
      service.hasSourceReference('auto-fetch-tariff-rates-boc-tabular', 'https://example.gov.ph/file.csv')
    ).resolves.toBe(true)
  })
})
