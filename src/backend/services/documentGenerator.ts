import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'

type PdfDocumentInstance = InstanceType<typeof PDFDocument>

interface CalculationFormData {
  hsCode: string
  value: number
  freight?: number
  insurance?: number
  originCountry: string
  destinationPort: string
  currency: string
  containerSize?: 'none' | '20ft' | '40ft'
  arrastreWharfage?: number
  doxStampOthers?: number
  declarationType?: 'consumption' | 'warehousing' | 'transit'
}

interface CalculationResultsData {
  duty?: {
    rate?: number
    amount?: number
    surcharge?: number
  }
  vat?: {
    rate?: number
    amount?: number
  }
  compliance?: {
    requiredDocuments?: string[]
    restrictions?: string[]
    warnings?: string[]
  }
  costBase?: {
    taxableValue?: number
    brokerageFee?: number
    arrastreWharfage?: number
    doxStampOthers?: number
    vatBase?: number
  }
  breakdown?: {
    itemTaxes?: {
      cud?: number
      vat?: number
      totalItemTax?: number
    }
    globalFees?: {
      transitCharge?: number
      ipc?: number
      csf?: number
      cds?: number
      irs?: number
      totalGlobalTax?: number
    }
    totalTaxAndFees?: number
  }
  totalLandedCost: number
}

export class DocumentGenerator {
  private writeCalculationReport(doc: PdfDocumentInstance, payload: {
    formData: CalculationFormData
    results: CalculationResultsData
    generatedAt?: string
  }): void {
    const calculationCurrency = 'PHP'
    const now = payload.generatedAt || new Date().toISOString()
    const dutyRate = payload.results.duty?.rate || 0
    const dutyAmount = payload.results.duty?.amount || 0
    const surcharge = payload.results.duty?.surcharge || 0
    const vatRate = payload.results.vat?.rate || 0
    const vatAmount = payload.results.vat?.amount || 0
    const taxableValue = payload.results.costBase?.taxableValue || 0
    const brokerageFee = payload.results.costBase?.brokerageFee || 0
    const arrastreWharfage = payload.results.costBase?.arrastreWharfage || 0
    const doxStampOthers = payload.results.costBase?.doxStampOthers || 0
    const vatBase = payload.results.costBase?.vatBase || 0
    const itemTaxTotal = payload.results.breakdown?.itemTaxes?.totalItemTax || (dutyAmount + vatAmount)
    const transitCharge = payload.results.breakdown?.globalFees?.transitCharge || 0
    const ipc = payload.results.breakdown?.globalFees?.ipc || 0
    const csf = payload.results.breakdown?.globalFees?.csf || 0
    const cds = payload.results.breakdown?.globalFees?.cds || 0
    const irs = payload.results.breakdown?.globalFees?.irs || 0
    const totalGlobalTax = payload.results.breakdown?.globalFees?.totalGlobalTax || (transitCharge + ipc + csf + cds + irs)
    const totalTaxAndFees = payload.results.breakdown?.totalTaxAndFees || (itemTaxTotal + totalGlobalTax)

    doc.fontSize(20).text('Philippines Customs Calculation Report', { align: 'left' })
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor('#666').text(`Generated: ${now}`)
    doc.moveDown(1)

    doc.fillColor('#000').fontSize(13).text('Shipment Details')
    doc.moveDown(0.3)
    doc.fontSize(11)
    doc.text(`HS Code: ${payload.formData.hsCode}`)
    doc.text(`FOB Value: ${payload.formData.value.toFixed(2)} ${payload.formData.currency}`)
    doc.text(`Freight: ${(payload.formData.freight || 0).toFixed(2)} ${payload.formData.currency}`)
    doc.text(`Insurance: ${(payload.formData.insurance || 0).toFixed(2)} ${payload.formData.currency}`)
    doc.text(`Origin Country: ${payload.formData.originCountry || 'N/A'}`)
    doc.text(`Destination Port: ${payload.formData.destinationPort}`)
    doc.text(`Declaration Type: ${payload.formData.declarationType || 'consumption'}`)
    doc.text(`Container Size: ${payload.formData.containerSize || 'none'}`)
    doc.text(`Arrastre / Wharfage: ${(payload.formData.arrastreWharfage || 0).toFixed(2)} PHP`)
    doc.text(`Dox Stamp & Others: ${(payload.formData.doxStampOthers || 0).toFixed(2)} PHP`)
    doc.moveDown(1)

    doc.fontSize(13).text('Tax and Duty Breakdown')
    doc.moveDown(0.3)
    doc.fontSize(11)
    doc.text(`Taxable Value PH: ${taxableValue.toFixed(2)} ${calculationCurrency}`)
    doc.text(`Brokerage Fee: ${brokerageFee.toFixed(2)} ${calculationCurrency}`)
    doc.text(`Arrastre / Wharfage: ${arrastreWharfage.toFixed(2)} ${calculationCurrency}`)
    doc.text(`Dox Stamp & Others: ${doxStampOthers.toFixed(2)} ${calculationCurrency}`)
    doc.text(`VAT Base / TLC: ${vatBase.toFixed(2)} ${calculationCurrency}`)
    doc.moveDown(0.3)
    doc.text(`CUD: ${dutyAmount.toFixed(2)} ${calculationCurrency}`)
    doc.text(`VAT: ${vatAmount.toFixed(2)} ${calculationCurrency}`)
    doc.text(`Total Item Tax: ${itemTaxTotal.toFixed(2)} ${calculationCurrency}`)
    doc.moveDown(0.3)
    if (transitCharge > 0) {
      doc.text(`TC: ${transitCharge.toFixed(2)} ${calculationCurrency}`)
    }
    doc.text(`IPC: ${ipc.toFixed(2)} ${calculationCurrency}`)
    doc.text(`CSF: ${csf.toFixed(2)} ${calculationCurrency}`)
    doc.text(`CDS: ${cds.toFixed(2)} ${calculationCurrency}`)
    doc.text(`IRS: ${irs.toFixed(2)} ${calculationCurrency}`)
    doc.text(`Total Global Tax: ${totalGlobalTax.toFixed(2)} ${calculationCurrency}`)
    doc.moveDown(0.3)
    doc.text(`Duty Rate: ${dutyRate.toFixed(2)}%`)
    doc.text(`VAT Rate: ${vatRate.toFixed(2)}%`)
    doc.text(`Surcharge: ${surcharge.toFixed(2)} ${calculationCurrency}`)
    doc.moveDown(0.7)
    doc.fontSize(12).text(
      `Total Tax and Fees: ${totalTaxAndFees.toFixed(2)} ${calculationCurrency}`,
      { underline: true }
    )
    doc.moveDown(0.4)
    doc.fontSize(12).text(
      `Total Landed Cost: ${payload.results.totalLandedCost.toFixed(2)} ${calculationCurrency}`,
      { underline: true }
    )

    const compliance = payload.results.compliance
    if (compliance) {
      doc.moveDown(1)
      doc.fontSize(13).text('Compliance Notes')
      doc.moveDown(0.3)

      const writeList = (title: string, entries: string[] = []) => {
        doc.fontSize(11).text(title)
        if (entries.length === 0) {
          doc.text('- None')
          return
        }
        entries.forEach((entry) => doc.text(`- ${entry}`))
      }

      writeList('Required Documents', compliance.requiredDocuments || [])
      doc.moveDown(0.3)
      writeList('Restrictions', compliance.restrictions || [])
      doc.moveDown(0.3)
      writeList('Warnings', compliance.warnings || [])
    }

    doc.moveDown(1)
    doc.fontSize(9).fillColor('#666').text('For planning/reference purposes only. Validate with BOC before filing.', {
      align: 'left',
    })
  }

  generateCalculationReportBuffer(payload: {
    formData: CalculationFormData
    results: CalculationResultsData
    generatedAt?: string
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 48 })
        const chunks: Buffer[] = []

        doc.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', (error: Error) => reject(error))

        this.writeCalculationReport(doc, payload)
        doc.end()
      } catch (error) {
        reject(error)
      }
    })
  }

  generateCalculationReport(payload: {
    formData: CalculationFormData
    results: CalculationResultsData
    generatedAt?: string
  }, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 48 })
        const stream = createWriteStream(outputPath)

        doc.pipe(stream)

        this.writeCalculationReport(doc, payload)

        doc.end()

        stream.on('finish', () => resolve(outputPath))
        stream.on('error', (error: Error) => reject(error))
      } catch (error) {
        reject(error)
      }
    })
  }
}
