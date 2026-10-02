import express from 'express'
import http, { type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../backend/services/autoFetcher', () => ({ startAutoFetching: vi.fn() }))

type CalculationRow = {
  deMinimisExempt: boolean
  entryType: string
  insuranceBenchmarkApplied: boolean
  duty: { amount: number; surcharge: number; rate: number }
  exciseTax: { amount: number }
  vat: { amount: number; rate: number }
  costBase: { taxableValue: number; brokerageFee: number; vatBase: number }
  breakdown: {
    globalFees: { ipc: number; transitCharge: number; totalGlobalTax: number }
    totalTaxAndFees: number
  }
  tradeRemedies: { total: number }
  penalties: { totalPenalties: number }
  section800Exemption: { eligible: boolean; exemptAmountPhp: number }
  landedCostSubtotal: number
  totalLandedCost: number
  totalPayable: number
  fx: { rateToPhp: number; source: string }
}

const baseShipment = {
  hsCode: '8471.30.10',
  scheduleCode: 'MFN',
  value: 100_000,
  freight: 5_000,
  insurance: 1_000,
  originCountry: 'JPN',
  destinationPort: 'MNL',
  currency: 'PHP',
  declarationType: 'consumption',
  containerSize: 'none',
  arrivalDate: '2026-04-20',
  arrastreWharfage: 1_000,
  doxStampOthers: 0,
}

let server: Server
let baseUrl: string
let dataDir: string
let originalDataDir: string | undefined

const postBatch = async (shipments: unknown[]) => {
  const response = await fetch(`${baseUrl}/api/calculate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments }),
  })
  const body = await response.json() as { success: boolean; data?: CalculationRow[]; error?: string }
  return { status: response.status, body }
}

beforeAll(async () => {
  originalDataDir = process.env.DATA_DIR
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'customs-calculation-contract-'))
  process.env.DATA_DIR = dataDir

  let resolveListening: () => void = () => undefined
  const listening = new Promise<void>((resolve) => { resolveListening = resolve })
  vi.spyOn(express.application, 'listen').mockImplementation(function (this: express.Application) {
    server = http.createServer(this)
    server.listen(0, '127.0.0.1', resolveListening)
    return server
  })

  await import('./index')
  await listening
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const { getDatabase } = await import('../backend/db/database')
  const db = getDatabase()
  const run = (sql: string, params: Array<string | number> = []) => new Promise<void>((resolve, reject) => {
    db.run(sql, params, (error: Error | null) => error ? reject(error) : resolve())
  })

  for (const [code, description] of [
    ['8471.30.10', 'Portable computer'],
    ['2203.00.00', 'Beer'],
    ['2801.10.00', 'Dangerous chemical'],
  ]) {
    await run('INSERT OR IGNORE INTO hs_codes (code, description, category) VALUES (?, ?, ?)', [code, description, 'Test'])
  }
  for (const [code, schedule, duty, surcharge] of [
    ['8471.30.10', 'MFN', 0.05, 0.01],
    ['8471.30.10', 'ATIGA', 0.01, 0],
    ['2203.00.00', 'MFN', 0.05, 0],
    ['2801.10.00', 'MFN', 0.05, 0],
  ] as const) {
    await run(
      `INSERT INTO tariff_rates
       (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, import_status)
       VALUES (?, ?, ?, 0.12, ?, '2020-01-01', 'approved')`,
      [code, schedule, duty, surcharge]
    )
  }
  await run(
    `INSERT INTO tariff_rates
     (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, import_status)
     VALUES ('8471.30.10', 'ATIGA', 0.99, 0.12, 0, '2030-01-01', 'approved')`
  )
  await run(
    `INSERT INTO tariff_rates
     (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, import_status)
     VALUES ('8471.30.10', 'MFN', 0.99, 0.12, 0, '2025-01-01', 'pending_review')`
  )
  await run(
    'INSERT INTO exchange_rates (currency_pair, rate, last_updated) VALUES (?, ?, ?)',
    ['BSP_USD_PHP', 56, new Date().toISOString()]
  )
}, 60_000)

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  const { getDatabase } = await import('../backend/db/database')
  await new Promise<void>((resolve) => getDatabase().close(() => resolve()))
  vi.restoreAllMocks()
  if (originalDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = originalDataDir
  if (dataDir && path.resolve(dataDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

describe('POST /api/calculate/batch calculation contract', () => {
  it('combines dutiable value, duty, surcharge, fees, VAT, and final totals for an ordinary PHP shipment', async () => {
    const { status, body } = await postBatch([baseShipment])
    const row = body.data?.[0]

    expect(status).toBe(200)
    expect(row?.costBase.taxableValue).toBe(106_000)
    expect(row?.duty).toMatchObject({ amount: 5_300, surcharge: 1_060, rate: 5 })
    expect(row?.costBase.brokerageFee).toBe(2_500)
    expect(row?.breakdown.globalFees.totalGlobalTax).toBe(890)
    expect(row?.landedCostSubtotal).toBe(116_750)
    expect(row?.vat).toMatchObject({ amount: 14_010, rate: 12 })
    expect(row?.totalLandedCost).toBe(130_760)
    expect(row?.totalPayable).toBe(130_760)
    expect(row?.fx).toMatchObject({ rateToPhp: 1, source: 'identity' })
  })

  it('converts FOB, freight, and insurance to PHP before assessing duty and VAT', async () => {
    const { body } = await postBatch([{
      ...baseShipment, currency: 'USD', value: 1_000, freight: 100, insurance: 10,
    }])
    const row = body.data?.[0]
    expect(row?.fx).toMatchObject({ rateToPhp: 56, source: 'bsp' })
    expect(row?.costBase.taxableValue).toBe(62_160)
    expect(row?.duty).toMatchObject({ amount: 3_108, surcharge: 621.6 })
    expect(row?.vat.amount).toBeCloseTo((row?.costBase.vatBase ?? 0) * 0.12)
  })

  it.each([0, 10_000])('exempts FOB %s at or below the de minimis threshold', async (value) => {
    const { body } = await postBatch([{ ...baseShipment, value, freight: 0, insurance: 0 }])
    const row = body.data?.[0]
    expect(row?.deMinimisExempt).toBe(true)
    expect(row?.duty.amount).toBe(0)
    expect(row?.vat.amount).toBe(0)
    expect(row?.totalLandedCost).toBe(value + 1_000)
  })

  it('taxes the first value above the de minimis threshold and benchmarks zero insurance', async () => {
    const { body } = await postBatch([{ ...baseShipment, value: 10_000.01, freight: 0, insurance: 0 }])
    const row = body.data?.[0]
    expect(row?.deMinimisExempt).toBe(false)
    expect(row?.insuranceBenchmarkApplied).toBe(true)
    expect(row?.costBase.taxableValue).toBeCloseTo(10_200.0102, 4)
  })

  it('uses the dangerous-goods insurance benchmark and the formal-entry boundary', async () => {
    const { body } = await postBatch([
      { ...baseShipment, hsCode: '2801.10.00', value: 50_000, freight: 0, insurance: 0 },
      { ...baseShipment, value: 50_000, freight: 0, insurance: 0 },
    ])
    expect(body.data?.[0]?.costBase.taxableValue).toBe(52_000)
    expect(body.data?.[0]?.entryType).toBe('formal')
    expect(body.data?.[1]?.costBase.taxableValue).toBe(51_000)
  })

  it('classifies exactly 50,000 PHP as informal and the next cent as formal', async () => {
    const { body } = await postBatch([
      { ...baseShipment, value: 49_000, freight: 0, insurance: 1_000 },
      { ...baseShipment, value: 49_000.01, freight: 0, insurance: 1_000 },
    ])
    expect(body.data?.[0]?.costBase.taxableValue).toBe(50_000)
    expect(body.data?.[0]?.entryType).toBe('informal')
    expect(body.data?.[1]?.entryType).toBe('formal')
  })

  it('selects an approved schedule rate and falls back to MFN for a missing schedule', async () => {
    const { body } = await postBatch([
      { ...baseShipment, scheduleCode: 'ATIGA' },
      { ...baseShipment, scheduleCode: 'NO-SUCH-SCHEDULE' },
    ])
    expect(body.data?.[0]?.duty).toMatchObject({ rate: 1, amount: 1_060, surcharge: 0 })
    expect(body.data?.[1]?.duty).toMatchObject({ rate: 5, amount: 5_300, surcharge: 1_060 })
  })

  it('applies the Section 800 balikbayan ceiling before the de minimis check', async () => {
    const { body } = await postBatch([
      { ...baseShipment, value: 150_000, freight: 0, insurance: 0, importerStatus: 'balikbayan', balikbayanBoxesThisYear: 3 },
      { ...baseShipment, value: 150_001, freight: 0, insurance: 0, importerStatus: 'balikbayan', balikbayanBoxesThisYear: 3 },
    ])
    expect(body.data?.[0]?.section800Exemption).toMatchObject({ eligible: true, exemptAmountPhp: 150_000 })
    expect(body.data?.[0]?.deMinimisExempt).toBe(true)
    expect(body.data?.[1]?.section800Exemption).toMatchObject({ eligible: false, exemptAmountPhp: 0 })
    expect(body.data?.[1]?.deMinimisExempt).toBe(false)
  })

  it('does not exempt low-value alcohol and includes excise in the VAT base', async () => {
    const { body } = await postBatch([{
      ...baseShipment, hsCode: '2203.00.00', value: 9_000, freight: 0, insurance: 0,
      exciseQuantity: 2, exciseUnit: 'liter',
    }])
    const row = body.data?.[0]
    expect(row?.deMinimisExempt).toBe(false)
    expect(row?.exciseTax.amount).toBe(70)
    expect(row?.costBase.vatBase).toBe(row?.landedCostSubtotal)
    expect(row?.vat.amount).toBeCloseTo((row?.landedCostSubtotal ?? 0) * 0.12)
  })

  it('adds trade remedies and penalties after computing landed cost', async () => {
    const { body } = await postBatch([{
      ...baseShipment, antiDumpingDutyRate: 0.02, assessedCustomsValue: 120_000,
      misclassificationDetected: true, latePaymentDays: 30,
    }])
    const row = body.data?.[0]
    expect(row?.tradeRemedies.total).toBe(2_120)
    expect(row?.penalties.totalPenalties).toBeGreaterThan(0)
    expect(row?.totalPayable).toBeCloseTo((row?.totalLandedCost ?? 0) + (row?.penalties.totalPenalties ?? 0))
  })

  it.each([
    { name: 'non-numeric FOB', shipment: { ...baseShipment, value: 'invalid' } },
    { name: 'non-numeric freight', shipment: { ...baseShipment, freight: 'invalid' } },
    { name: 'six-digit calculation code', shipment: { ...baseShipment, hsCode: '8471.30' } },
    { name: 'unknown eight-digit code', shipment: { ...baseShipment, hsCode: '9999.99.99' } },
  ])('rejects $name', async ({ shipment }) => {
    const { status, body } = await postBatch([shipment])
    expect(status).toBe(502)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it('rejects malformed batch envelopes and batches over 100 shipments', async () => {
    const missing = await fetch(`${baseUrl}/api/calculate/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    expect(missing.status).toBe(400)
    const oversized = await postBatch(Array.from({ length: 101 }, () => baseShipment))
    expect(oversized.status).toBe(400)
  })
})
