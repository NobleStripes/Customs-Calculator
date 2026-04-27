import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'

let ComplianceCheckerClass: typeof import('./complianceChecker').ComplianceChecker
let initializeDatabase: typeof import('../db/database').initializeDatabase

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-compliance-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
  initializeDatabase = databaseModule.initializeDatabase

  const complianceModule = await import('./complianceChecker')
  ComplianceCheckerClass = complianceModule.ComplianceChecker
})

describe('ComplianceChecker.getRequirements', () => {
  it('always includes Commercial Invoice and Bill of Lading in required documents', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.getRequirements('8471.30', 500, 'MNL')

    expect(result.requiredDocuments).toContain('Commercial Invoice')
    expect(result.requiredDocuments).toContain('Bill of Lading/Airway Bill')
  })

  it('adds Packing List and high-value warning for shipments over 10000', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.getRequirements('8471.30', 15000, 'MNL')

    expect(result.requiredDocuments).toContain('Packing List')
    expect(result.warnings.some((w) => w.toLowerCase().includes('high value'))).toBe(true)
  })

  it('does not trigger a high-value warning for shipments at or below 10000', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.getRequirements('8471.30', 10000, 'MNL')

    expect(result.warnings.some((w) => w.toLowerCase().includes('high value'))).toBe(false)
  })

  it('recognises all expanded Philippine port codes without warning', async () => {
    const checker = new ComplianceCheckerClass()

    const portCodes = ['MNL', 'CEB', 'DVO', 'ILO', 'CGY', 'ZAM', 'GEN', 'BAT', 'SFS', 'SUB',
      'CLA', 'LEG', 'SAN', 'BAC', 'TAC', 'OZM', 'DUM', 'RXS', 'BXU', 'SUG', 'PPS']

    for (const port of portCodes) {
      const result = await checker.getRequirements('8471.30', 100, port)
      const hasPortWarning = result.warnings.some(
        (w) => w.toLowerCase().includes('calibrated for philippine') || w.toLowerCase().includes('verify requirements')
      )
      expect(hasPortWarning, `Port ${port} should not trigger a port-code warning`).toBe(false)
    }
  })

  it('warns for unrecognised port codes', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.getRequirements('8471.30', 100, 'XYZ')

    expect(result.warnings.some((w) => w.toLowerCase().includes('verify requirements'))).toBe(true)
  })

  it('does not duplicate required documents in results', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.getRequirements('8471.30', 100, 'MNL')

    const unique = new Set(result.requiredDocuments)
    expect(unique.size).toBe(result.requiredDocuments.length)
  })
})

describe('ComplianceChecker.validateShipment', () => {
  it('returns isCompliant true for a valid shipment with acceptable port', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.validateShipment({
      hsCode: '8471.30',
      value: 1000,
      origin: 'CHN',
      destination: 'MNL',
    })

    expect(result.isCompliant).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns an issue for zero value', async () => {
    const checker = new ComplianceCheckerClass()

    const result = await checker.validateShipment({
      hsCode: '8471.30',
      value: 0,
      origin: 'CHN',
      destination: 'MNL',
    })

    expect(result.isCompliant).toBe(false)
    expect(result.issues.some((i) => i.toLowerCase().includes('value must be greater'))).toBe(true)
  })
})
