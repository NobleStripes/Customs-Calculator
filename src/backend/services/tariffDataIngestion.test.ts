import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

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
})