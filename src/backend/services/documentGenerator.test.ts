import { describe, expect, it } from 'vitest'
import { DocumentGenerator } from './documentGenerator'

const minimalFormData = {
  hsCode: '8471.30',
  value: 10000,
  originCountry: 'US',
  destinationPort: 'MNL',
  currency: 'PHP',
}

const minimalResults = {
  totalLandedCost: 13000,
}

describe('DocumentGenerator.generateCalculationReportBuffer', () => {
  it('returns a non-empty Buffer', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: minimalFormData,
      results: minimalResults,
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('produces a valid PDF (starts with %PDF magic bytes)', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: minimalFormData,
      results: minimalResults,
    })

    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('generates a PDF with full duty/VAT breakdown without errors', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: {
        hsCode: '8421.23',
        scheduleCode: 'MFN',
        value: 30000,
        freight: 1500,
        insurance: 300,
        originCountry: 'JPN',
        destinationPort: 'CEB',
        currency: 'PHP',
        containerSize: '20ft',
        arrastreWharfage: 4500,
        doxStampOthers: 265,
        declarationType: 'consumption',
      },
      results: {
        tariff: { scheduleCode: 'MFN' },
        duty: { rate: 7, amount: 2100, surcharge: 0 },
        vat: { rate: 12, amount: 4228.8 },
        costBase: {
          taxableValue: 30000,
          brokerageFee: 5000,
          arrastreWharfage: 4500,
          doxStampOthers: 265,
          vatBase: 35240,
        },
        breakdown: {
          itemTaxes: { cud: 2100, excise: 0, vat: 4228.8, totalItemTax: 6328.8 },
          tradeRemedies: { antiDumping: 0, countervailing: 0, safeguard: 0, total: 0 },
          penalties: {
            undervaluationSurcharge: 0,
            misclassificationSurcharge: 0,
            latePaymentInterest: 0,
            total: 0,
          },
          globalFees: {
            transitCharge: 0,
            ipc: 500,
            csf: 280,
            cds: 100,
            irs: 10,
            totalGlobalTax: 890,
          },
          totalTaxAndFees: 7218.8,
        },
        compliance: {
          requiredDocuments: ['Commercial Invoice', 'Bill of Lading/Airway Bill', 'Packing List'],
          restrictions: [],
          warnings: [],
        },
        totalPayable: 43068.8,
        totalLandedCost: 43068.8,
      },
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('generates a PDF with penalties section when totalPenalties > 0', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: minimalFormData,
      results: {
        ...minimalResults,
        penalties: {
          totalPenalties: 5000,
          notes: ['Undervaluation surcharge applied under CMO 14-2019'],
        },
        breakdown: {
          penalties: {
            undervaluationSurcharge: 3000,
            misclassificationSurcharge: 1000,
            latePaymentInterest: 1000,
            total: 5000,
          },
        },
        totalLandedCost: 18000,
      },
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('generates a PDF with compliance section when compliance data is provided', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: minimalFormData,
      results: {
        ...minimalResults,
        compliance: {
          requiredDocuments: ['NTC Type Acceptance Certificate', 'Commercial Invoice'],
          restrictions: ['Requires NTC clearance per RA 7925'],
          warnings: ['Subject to Bureau of Customs inspection'],
        },
      },
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('uses a fixed generatedAt timestamp when provided', async () => {
    const generator = new DocumentGenerator()

    // Should not throw and should produce a valid PDF regardless of the provided date
    const buffer = await generator.generateCalculationReportBuffer({
      formData: minimalFormData,
      results: minimalResults,
      generatedAt: '2026-01-15T08:30:00.000Z',
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('handles transit declaration type without errors', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: {
        ...minimalFormData,
        declarationType: 'transit',
        containerSize: '40ft',
      },
      results: {
        ...minimalResults,
        breakdown: {
          globalFees: {
            transitCharge: 1000,
            ipc: 250,
            csf: 560,
            cds: 100,
            irs: 10,
            totalGlobalTax: 1920,
          },
        },
      },
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('handles zero-value optional fields gracefully', async () => {
    const generator = new DocumentGenerator()

    const buffer = await generator.generateCalculationReportBuffer({
      formData: {
        hsCode: '2203.00.00',
        value: 5000,
        freight: 0,
        insurance: 0,
        originCountry: 'DEU',
        destinationPort: 'MNL',
        currency: 'EUR',
      },
      results: {
        duty: { rate: 20, amount: 1000, surcharge: 0 },
        vat: { rate: 12, amount: 720 },
        totalLandedCost: 7720,
      },
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
  })
})
