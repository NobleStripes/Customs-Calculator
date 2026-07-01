import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createHsCodeMapping,
  getHsCodeMappings,
  migrateHsCodesForward,
  validateTargetCodes,
} from './hsVersionMigration'

let databaseModule: any

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-migration-vitest')

  databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
})

describe('hsVersionMigration', () => {
  it('creates an HS code mapping between two versions', async () => {
    const success = await createHsCodeMapping('AHTN-2022', 'AHTN-2025', '8471.30', '8471.30.10', 'upgrade')

    expect(success).toBe(true)
  })

  it('retrieves all mappings for a version transition', async () => {
    // Create a few mappings
    await createHsCodeMapping('AHTN-2022', 'AHTN-2025', '0101.21', '0101.21.10', 'unchanged')
    await createHsCodeMapping('AHTN-2022', 'AHTN-2025', '0102.29', '0102.29.20', 'unchanged')

    const mappings = await getHsCodeMappings('AHTN-2022', 'AHTN-2025')

    expect(mappings.length).toBeGreaterThanOrEqual(3) // At least the 3 we created
    expect(mappings[0]).toHaveProperty('from_code')
    expect(mappings[0]).toHaveProperty('to_code')
    expect(mappings[0]).toHaveProperty('from_version')
    expect(mappings[0]).toHaveProperty('to_version')
  })

  it('validates target codes exist in hs_codes table', async () => {
    // Codes from the seeded catalog should exist
    const result = await validateTargetCodes(['8471.30', '8703.21', '9999.99'])

    expect(result.valid).toContain('8471.30')
    expect(result.valid).toContain('8703.21')
    expect(result.missing).toContain('9999.99') // This code should not exist
  })

  it('handles empty code list for validation', async () => {
    const result = await validateTargetCodes([])

    expect(result.valid).toHaveLength(0)
    expect(result.missing).toHaveLength(0)
  })

  it('performs version migration with valid mappings', async () => {
    // Create test mappings (using existing 6-digit codes)
    const mappings = new Map<string, string>([
      ['0101.21', '0101.21'], // Same code in new version (no change)
      ['0102.29', '0102.29'], // Same code in new version (no change)
    ])

    const result = await migrateHsCodesForward('AHTN-2022', 'AHTN-2025', mappings)

    expect(result.from_version).toBe('AHTN-2022')
    expect(result.to_version).toBe('AHTN-2025')
    expect(result.total_mappings_created).toBeGreaterThanOrEqual(2)
    expect(result.total_codes_migrated).toBeGreaterThanOrEqual(0)
  })

  it('records missing target codes as failures in migration', async () => {
    const mappings = new Map<string, string>([
      ['8471.30', '9999.99'], // Target code doesn't exist
    ])

    const result = await migrateHsCodesForward('AHTN-2022', 'AHTN-2025-TEST', mappings)

    // Should have recorded the failure
    const missingCodeFailure = result.failed.some((f) => f.error.includes('does not exist'))
    expect(missingCodeFailure).toBe(true)
  })

  it('retrieves no mappings for non-existent version transition', async () => {
    const mappings = await getHsCodeMappings('AHTN-1990', 'AHTN-1991')

    expect(mappings).toHaveLength(0)
  })
})
