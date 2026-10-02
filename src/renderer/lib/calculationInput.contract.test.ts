import { describe, expect, it } from 'vitest'
import { parseBatchImportCsv } from './batchImportCsv'

describe('batch calculation input parsing', () => {
  const header = 'hsCode,value,freight,insurance,originCountry'

  it('accepts a positive FOB with zero freight and insurance', () => {
    const result = parseBatchImportCsv(`${header}\n8471.30.10,100,0,0,JPN`)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ value: 100, freight: 0, insurance: 0, originCountry: 'JPN' })
  })

  it.each([
    '8471.30.10,0,0,0,JPN',
    '8471.30.10,-1,0,0,JPN',
    '8471.30.10,not-a-number,0,0,JPN',
    '8471.30.10,100,not-a-number,0,JPN',
    '8471.30.10,100,0,not-a-number,JPN',
    ',100,0,0,JPN',
    '8471.30.10,100,0,0,',
  ])('drops an invalid row: %s', (line) => {
    expect(parseBatchImportCsv(`${header}\n${line}`).rows).toEqual([])
  })

  it('keeps valid rows when another row is invalid', () => {
    const result = parseBatchImportCsv(`${header}\n8471.30.10,100,0,0,JPN\n8471.30.10,bad,0,0,JPN`)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.value).toBe(100)
  })
})
