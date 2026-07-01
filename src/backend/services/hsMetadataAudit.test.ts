import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { auditHsMetadata } from './hsMetadataAudit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let databaseModule: Record<string, any>

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-audit-vitest')

  databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()
})

describe('hsMetadataAudit', () => {
  it('returns audit result with no discrepancies for seeded catalog', async () => {
    const result = await auditHsMetadata()

    expect(result.totalCodes).toBeGreaterThan(400)
    expect(result.codesWithMissingChapter).toBe(0)
    expect(result.codesWithMissingSection).toBe(0)
    expect(result.codesWithMissingSectionName).toBe(0)
  })

  it('detects matching chapter derivation from normalized codes', async () => {
    const result = await auditHsMetadata()

    // Should not have chapter mismatches for valid 6-digit codes
    const chapterMismatches = result.discrepanciesFound.filter((d) =>
      d.description.includes('Chapter code mismatch')
    )
    expect(chapterMismatches).toHaveLength(0)
  })

  it('includes summary statistics in audit result', async () => {
    const result = await auditHsMetadata()

    expect(result).toHaveProperty('totalCodes')
    expect(result).toHaveProperty('codesWithMissingChapter')
    expect(result).toHaveProperty('codesWithMissingSection')
    expect(result).toHaveProperty('codesWithMissingSectionName')
    expect(result).toHaveProperty('discrepanciesFound')
    expect(Array.isArray(result.discrepanciesFound)).toBe(true)
  })

  it('verifies all 8-digit codes have metadata after expansion', async () => {
    const result = await auditHsMetadata()

    // Should have no metadata gaps for all codes including 8-digit variants
    expect(result.codesWithMissingChapter).toBe(0)
    expect(result.codesWithMissingSection).toBe(0)
    expect(result.codesWithMissingSectionName).toBe(0)
  })
})
