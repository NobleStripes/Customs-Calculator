import { describe, expect, it } from 'vitest'
import { getCoreCatalogWithMetadata } from './hsCatalogSeed'

describe('HS catalog seed', () => {
  it('includes the bundled official catalog and retains legacy calculation codes', () => {
    const rows = getCoreCatalogWithMetadata()
    expect(rows.length).toBeGreaterThan(13_000)
    expect(rows.find((row) => row.code === '8517.13.00')).toMatchObject({
      chapterCode: '85', metadataSource: 'official-snapshot',
    })
    expect(rows.find((row) => row.code === '8471.30')).toMatchObject({ category: 'Computers' })
    expect(rows.find((row) => row.code === '8471.30.10')).toBeDefined()
    expect(rows.find((row) => row.code === '9302.00')?.isRestricted).toBe(true)
    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length)
  })
})
