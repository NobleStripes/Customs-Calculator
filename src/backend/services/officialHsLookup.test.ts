import { describe, expect, it, vi } from 'vitest'
import {
  OFFICIAL_TARIFF_LOOKUP_CONFIG,
  OfficialHsLookupService,
  extractOfficialHsLookupRows,
} from './officialHsLookup'

describe('extractOfficialHsLookupRows', () => {
  it('parses official finder table rows into normalized lookup results', () => {
    const rows = extractOfficialHsLookupRows(
      `
        <table>
          <thead>
            <tr>
              <th>AHTN Code</th>
              <th>Description</th>
              <th>Duty Rate</th>
              <th>VAT</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>847130</td>
              <td>Portable automatic data processing machines</td>
              <td>5%</td>
              <td>12%</td>
              <td>MFN</td>
            </tr>
          </tbody>
        </table>
      `,
      '847130',
      'https://finder.tariffcommission.gov.ph/search-by-code?ahtn=847130'
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      code: '8471.30',
      description: 'Portable automatic data processing machines',
      sourceType: 'official-site',
      matchedBy: 'code',
      officialDutyRate: 0.05,
      officialVatRate: 0.12,
      officialScheduleCode: 'MFN',
    })
  })
})

describe('OfficialHsLookupService', () => {
  it('returns cached results on repeated lookup calls', async () => {
    const fetchWebsite = vi.fn().mockResolvedValue({
      rawHtml: `
        <div>8471.30 - Portable automatic data processing machines - 5%</div>
      `,
      textContent: '',
      fetchedAt: '2026-04-27T00:00:00.000Z',
    })

    const service = new OfficialHsLookupService({ fetchWebsite })

    const firstResult = await service.search('847130')
    const secondResult = await service.search('847130')

    expect(fetchWebsite).toHaveBeenCalledTimes(1)
    expect(firstResult.status).toBe('live')
    expect(secondResult.status).toBe('cache')
    expect(secondResult.results[0]?.sourceType).toBe('official-site-cache')
    expect(secondResult.cacheExpiresAt).not.toBe(firstResult.fetchedAt)
  })

  it('uses the fixed Tariff Commission Finder lookup path', async () => {
    const fetchWebsite = vi.fn().mockResolvedValue({
      rawHtml: '<div>8471.30 - Portable automatic data processing machines</div>',
      textContent: '',
      fetchedAt: '2026-04-27T00:00:00.000Z',
    })

    const service = new OfficialHsLookupService({ fetchWebsite })
    await service.search('portable computers')

    const request = fetchWebsite.mock.calls[0]?.[0]
    expect(request?.url).toContain(`https://${OFFICIAL_TARIFF_LOOKUP_CONFIG.host}${OFFICIAL_TARIFF_LOOKUP_CONFIG.path}`)
    expect(request?.url).toContain('keyword=portable+computers')
  })
})
