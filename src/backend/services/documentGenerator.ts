import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'

type PdfDocumentInstance = InstanceType<typeof PDFDocument>

interface CalculationFormData {
  hsCode: string
  value: number
  originCountry: string
  destinationPort: string
  currency: string
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
  totalLandedCost: number
}

export class DocumentGenerator {
  private writeCalculationReport(doc: PdfDocumentInstance, payload: {
    formData: CalculationFormData
    results: CalculationResultsData
    generatedAt?: string
  }): void {
    const now = payload.generatedAt || new Date().toISOString()
    const dutyRate = payload.results.duty?.rate || 0
    const dutyAmount = payload.results.duty?.amount || 0
    const surcharge = payload.results.duty?.surcharge || 0
    const vatRate = payload.results.vat?.rate || 0
    const vatAmount = payload.results.vat?.amount || 0

    doc.fontSize(20).text('Philippines Customs Calculation Report', { align: 'left' })
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor('#666').text(`Generated: ${now}`)
    doc.moveDown(1)

    doc.fillColor('#000').fontSize(13).text('Shipment Details')
    doc.moveDown(0.3)
    doc.fontSize(11)
    doc.text(`HS Code: ${payload.formData.hsCode}`)
    doc.text(`Declared Value: ${payload.formData.value.toFixed(2)} ${payload.formData.currency}`)
    doc.text(`Origin Country: ${payload.formData.originCountry || 'N/A'}`)
    doc.text(`Destination Port: ${payload.formData.destinationPort}`)
    doc.moveDown(1)

    doc.fontSize(13).text('Tax and Duty Breakdown')
    doc.moveDown(0.3)
    doc.fontSize(11)
    doc.text(`Duty Rate: ${dutyRate.toFixed(2)}%`)
    doc.text(`Duty Amount: ${dutyAmount.toFixed(2)} ${payload.formData.currency}`)
    doc.text(`Surcharge: ${surcharge.toFixed(2)} ${payload.formData.currency}`)
    doc.text(`VAT Rate: ${vatRate.toFixed(2)}%`)
    doc.text(`VAT Amount: ${vatAmount.toFixed(2)} ${payload.formData.currency}`)
    doc.moveDown(0.7)
    doc.fontSize(12).text(
      `Total Landed Cost: ${payload.results.totalLandedCost.toFixed(2)} ${payload.formData.currency}`,
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
