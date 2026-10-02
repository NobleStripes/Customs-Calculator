import { describe, expect, it } from 'vitest'
import { parseOfficialCatalog } from './officialCatalogParser'

describe('official catalog parser', () => {
  it('keeps leading zeros, decodes descriptions, and includes parent descriptions for specific codes', () => {
    const rows = parseOfficialCatalog([
      { code: '0101', desc: '<p>Live horses &amp; asses.</p>' },
      { code: '0101.21.00', desc: '- - Pure-bred breeding animals', status: 'active' },
      { code: '8471', desc: 'Automatic data processing machines' },
      { code: '8471.30', desc: '- Portable computers :' },
      { code: '8471.30.20', desc: '<p>- - Laptops&nbsp;including notebooks</p>' },
    ])
    expect(rows).toEqual([
      ['0101.21.00', 'Live horses & asses. — Pure-bred breeding animals'],
      ['8471.30', 'Automatic data processing machines — Portable computers'],
      ['8471.30.20', 'Automatic data processing machines — Portable computers — Laptops including notebooks'],
    ])
  })

  it('excludes inactive, invalid and FTA-specific rows and deduplicates canonical codes', () => {
    const rows = parseOfficialCatalog([
      { code: '8517.13.00', desc: 'Smartphones' },
      { code: '85171300', desc: 'Duplicate smartphone row' },
      { code: 'ex 8517.13.00', desc: 'Special concession' },
      { code: '8517.13.00.10', desc: 'FTA-only concession', agreement_id: 13 },
      { code: '8517.13.00.20', desc: 'FTA-only concession', fta: 'RCEP' },
      { code: '8517.14.00', desc: 'Inactive row', status: 'inactive' },
      { code: '123', desc: 'Invalid code' },
      { code: '9999.99', desc: 'Outside the AHTN catalog' },
      { code: '8517.14.00', desc: '' },
    ])
    expect(rows).toEqual([['8517.13.00', 'Smartphones']])
  })
})
