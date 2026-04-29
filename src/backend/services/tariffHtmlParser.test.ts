import { describe, expect, it } from 'vitest'
import { parseTariffHtml } from './tariffHtmlParser'

describe('parseTariffHtml', () => {
  it('extracts tariff rows from tariff commission style HTML tables', () => {
    const html = `
      <section>
        <h2>AHTN Schedule</h2>
        <table>
          <thead>
            <tr>
              <th>HS Code</th>
              <th>Description</th>
              <th>Duty Rate</th>
              <th>VAT Rate</th>
              <th>Schedule Code</th>
              <th>Effective Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>8471.30</td>
              <td>Portable ADP machines</td>
              <td>1%</td>
              <td>12%</td>
              <td>AHTN</td>
              <td>2026-01-01</td>
            </tr>
            <tr>
              <td>8517.62</td>
              <td>Network devices</td>
              <td>3%</td>
              <td>12%</td>
              <td>MFN</td>
              <td>2026-01-01</td>
            </tr>
          </tbody>
        </table>
      </section>
    `

    const rows = parseTariffHtml('tariff-commission', html)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      hsCode: '8471.30',
      description: 'Portable ADP machines',
      dutyRate: '1%',
      vatRate: '12%',
      scheduleCode: 'AHTN',
      effectiveDate: '2026-01-01',
    })
    expect(rows[0]?.notes).toContain('Tariff Commission')
    expect(rows[0]?.notes).toContain('AHTN Schedule')
  })

  it('deduplicates repeated HTML rows and keeps BOC notes', () => {
    const html = `
      <table>
        <caption>BOC Reference</caption>
        <tr>
          <th>Tariff Code</th>
          <th>Duty</th>
          <th>Surcharge</th>
        </tr>
        <tr>
          <td>8708.30</td>
          <td>10%</td>
          <td>0%</td>
        </tr>
        <tr>
          <td>8708.30</td>
          <td>10%</td>
          <td>0%</td>
        </tr>
      </table>
    `

    const rows = parseTariffHtml('boc', html)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      hsCode: '8708.30',
      dutyRate: '10%',
      surchargeRate: '0%',
    })
    expect(rows[0]?.notes).toContain('BOC')
    expect(rows[0]?.notes).toContain('BOC Reference')
  })
})