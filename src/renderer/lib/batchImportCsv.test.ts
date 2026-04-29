import { describe, expect, it } from 'vitest'
import { getColumnAliasHelp, parseBatchImportCsv } from './batchImportCsv'

describe('parseBatchImportCsv', () => {
  it('parses reordered header-based CSV rows using supported aliases', () => {
    const csv = [
      'origin_country,fob,hs_code,currency,port,container,dox_stamp,arrastre,freight,insurance,schedule,declaration_type',
      'jpn,1000,8421.23,usd,ceb,40ft,300,4500,100,25,mfn,transit',
    ].join('\n')

    const result = parseBatchImportCsv(csv)

    expect(result.columnWarnings).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      hsCode: '8421.23',
      value: 1000,
      originCountry: 'JPN',
      currency: 'USD',
      destinationPort: 'CEB',
      containerSize: '40ft',
      declarationType: 'transit',
      scheduleCode: 'MFN',
      arrastreWharfage: 4500,
      doxStampOthers: 300,
    })
  })

  it('keeps positional parsing working when no header row is present', () => {
    const csv = '8471.30,1000,100,25,MFN,CHN,MNL,USD,consumption,20ft,4500,265'

    const result = parseBatchImportCsv(csv)

    expect(result.columnWarnings).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      hsCode: '8471.30',
      value: 1000,
      originCountry: 'CHN',
      scheduleCode: 'MFN',
    })
  })

  it('reports missing required header mappings', () => {
    const csv = [
      'hs_code,freight,insurance',
      '8471.30,100,25',
    ].join('\n')

    const result = parseBatchImportCsv(csv)

    expect(result.rows).toEqual([])
    expect(result.columnWarnings).toEqual([
      'Column "value" not found — expected one of: value, fobvalue, fob',
      'Column "originCountry" not found — expected one of: origincountry, origin_country, origin, country',
    ])
  })
})

describe('getColumnAliasHelp', () => {
  it('exposes alias metadata for UI guidance', () => {
    const aliasHelp = getColumnAliasHelp()

    expect(aliasHelp.some((entry) => entry.column === 'hsCode' && entry.aliases.includes('hs_code'))).toBe(true)
    expect(aliasHelp.some((entry) => entry.column === 'value' && entry.aliases.includes('fob'))).toBe(true)
  })
})