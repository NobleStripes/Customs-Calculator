import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

let TariffDataIngestionServiceClass: typeof import('./tariffDataIngestion').TariffDataIngestionService
let getDatabase: typeof import('../db/database').getDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-review-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  getDatabase = databaseModule.getDatabase

  const ingestionModule = await import('./tariffDataIngestion')
  TariffDataIngestionServiceClass = ingestionModule.TariffDataIngestionService
})

describe('TariffDataIngestionService — review workflow', () => {
  it('approves a review row and promotes it to tariff_rates with an audit entry', async () => {
    const service = new TariffDataIngestionServiceClass()
    const db = getDatabase()

    const summary = await service.importRows({
      sourceName: 'Review Workflow Test',
      rows: [
        {
          hsCode: '3926.90',
          scheduleCode: 'MFN',
          description: 'Other articles of plastics',
          category: 'Plastics',
          dutyRate: '10%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
          confidenceScore: 50,
        },
      ],
      autoApproveThreshold: 85,
    })

    expect(summary.pendingReviewRows).toBe(1)

    const pendingRows = await service.getPendingReviewRows(summary.importJobId)
    expect(pendingRows.length).toBe(1)

    const rowId = pendingRows[0].id
    await service.approveReviewRow(summary.importJobId, rowId, 'Verified manually')

    // Row should be gone from pending
    const afterPending = await service.getPendingReviewRows(summary.importJobId)
    expect(afterPending.length).toBe(0)

    // tariff_rates should contain the promoted row
    const tariffRow = await new Promise<{ duty_rate: number } | undefined>((resolve, reject) => {
      db.get(
        `SELECT duty_rate FROM tariff_rates WHERE hs_code = ? AND COALESCE(schedule_code, 'MFN') = 'MFN' AND import_status = 'approved' ORDER BY id DESC LIMIT 1`,
        ['3926.90'],
        (err: Error | null, row: { duty_rate: number } | undefined) => {
          if (err) reject(err)
          else resolve(row)
        }
      )
    })

    expect(tariffRow).toBeDefined()
    expect(tariffRow?.duty_rate).toBeCloseTo(0.1)

    // rate_change_audit should have an entry
    const auditEntries = await service.getRateChangeAudit('3926.90', 1, 0)
    expect(auditEntries.length).toBeGreaterThan(0)
    expect(auditEntries[0].new_duty_rate).toBeCloseTo(0.1)
  })

  it('rejects a review row and removes it from the pending queue', async () => {
    const service = new TariffDataIngestionServiceClass()

    const summary = await service.importRows({
      sourceName: 'Review Reject Test',
      rows: [
        {
          hsCode: '9503.00',
          scheduleCode: 'MFN',
          description: 'Toys',
          category: 'Toys',
          dutyRate: '7%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
          confidenceScore: 40,
        },
      ],
      autoApproveThreshold: 85,
    })

    const pendingRows = await service.getPendingReviewRows(summary.importJobId)
    expect(pendingRows.length).toBe(1)

    await service.rejectReviewRow(summary.importJobId, pendingRows[0].id, 'Incorrect source')

    const afterReject = await service.getPendingReviewRows(summary.importJobId)
    expect(afterReject.length).toBe(0)
  })

  it('throws when approving a row from a different job', async () => {
    const service = new TariffDataIngestionServiceClass()

    await expect(service.approveReviewRow(99999, 99999)).rejects.toThrow()
  })

  it('getTariffSources returns records inserted during import', async () => {
    const service = new TariffDataIngestionServiceClass()

    await service.importRows({
      sourceName: 'Tariff Source Listing Test',
      rows: [
        {
          hsCode: '8414.51',
          scheduleCode: 'MFN',
          description: 'Table fans',
          category: 'Electronics',
          dutyRate: '15%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
        },
      ],
      forceApprove: true,
    })

    const sources = await service.getTariffSources(10)
    const found = sources.find((s) => s.source_name === 'Tariff Source Listing Test')
    expect(found).toBeDefined()
  })

  it('getCalculationHistory returns rows from calculation_history table', async () => {
    const service = new TariffDataIngestionServiceClass()
    const db = getDatabase()

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO calculation_history (hs_code, value, currency, duty_amount, vat_amount, total_landed_cost) VALUES (?, ?, ?, ?, ?, ?)`,
        ['8471.30', 1000, 'USD', 50, 132, 2000],
        (err: Error | null) => { if (err) reject(err); else resolve() }
      )
    })

    const history = await service.getCalculationHistory(5)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]).toHaveProperty('hs_code')
    expect(history[0]).toHaveProperty('total_landed_cost')
  })
})

describe('TariffDataIngestionService — HTML table extraction', () => {
  it('extracts HS-code and rate rows from a simple HTML table', async () => {
    const service = new TariffDataIngestionServiceClass()

    const html = `
      <html><body>
      <table>
        <thead><tr><th>HS Code</th><th>Description</th><th>Duty Rate</th></tr></thead>
        <tbody>
          <tr><td>8471.30</td><td>Laptops</td><td>5%</td></tr>
          <tr><td>8517.62</td><td>Smartphones</td><td>3%</td></tr>
        </tbody>
      </table>
      </body></html>
    `

    const { rows, confidence } = await service.parseHtmlTables(html, 'https://example.gov.ph/tariffs')

    expect(rows.length).toBe(2)
    expect(rows[0].hsCode).toBe('8471.30')
    expect(rows[0].dutyRate).toBe('5%')
    expect(confidence).toBe(60)
  })

  it('returns empty rows for HTML with no recognizable HS-code table', async () => {
    const service = new TariffDataIngestionServiceClass()

    const html = '<html><body><p>No table here</p></body></html>'
    const { rows } = await service.parseHtmlTables(html, 'https://example.gov.ph')

    expect(rows).toHaveLength(0)
  })
})
