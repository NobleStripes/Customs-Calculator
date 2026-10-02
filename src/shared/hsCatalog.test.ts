import { describe, expect, it } from 'vitest'
import { HS_CATALOG_SOURCE, OFFICIAL_HS_CATALOG } from './hsCatalog'
import { normalizeExactHsCode } from './hsLookupQuery'

describe('bundled official HS catalog', () => {
  it('covers every AHTN chapter except reserved chapter 77 with unique canonical codes', () => {
    expect(OFFICIAL_HS_CATALOG.length).toBe(HS_CATALOG_SOURCE.codeCount)
    expect(OFFICIAL_HS_CATALOG.length).toBeGreaterThan(10_000)
    expect(new Set(OFFICIAL_HS_CATALOG.map((row) => row.code)).size).toBe(OFFICIAL_HS_CATALOG.length)
    expect(new Set(OFFICIAL_HS_CATALOG.map((row) => row.chapterCode))).toEqual(
      new Set(Array.from({ length: 97 }, (_, i) => String(i + 1).padStart(2, '0')).filter((code) => code !== '77'))
    )
    for (const row of OFFICIAL_HS_CATALOG) {
      expect(normalizeExactHsCode(row.code)).toBe(row.code)
      expect(row.description).not.toMatch(/<[^>]+>/)
      expect(row.sectionCode).toBeTruthy()
    }
  })

  it('includes specific codes that were absent from the browser fallback without inventing rates', () => {
    for (const code of ['0101.21.00', '0904.11.10', '8471.30.20', '8517.13.00', '9706.10.00']) {
      const row = OFFICIAL_HS_CATALOG.find((item) => item.code === code)
      expect(row).toBeDefined()
      expect(row).not.toHaveProperty('dutyRate')
    }
    expect(OFFICIAL_HS_CATALOG.find((row) => row.code === '8471.30.20')?.description).toContain('Laptops')
  })
})
