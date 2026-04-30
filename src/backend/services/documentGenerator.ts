import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'

type PdfDocumentInstance = InstanceType<typeof PDFDocument>

interface CalculationFormData {
  hsCode: string
  scheduleCode?: string
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
  tariff?: {
    scheduleCode?: string
  }
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
    const now = payload.generatedAt ? new Date(payload.generatedAt) : new Date()
    const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    const entryRef = `IE-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getTime()).slice(-5)}`

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
    const fob = payload.formData.value
    const freight = payload.formData.freight || 0
    const insurance = payload.formData.insurance || 0
    const cif = fob + freight + insurance
    const totalPayable = totalTaxAndFees + surcharge

    const php = (n: number) => `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const lbl = (label: string, value: string) => {
      doc.fontSize(10)
      const savedX = doc.x
      doc.text(label, savedX, doc.y, { continued: true, width: 200 })
      doc.text(value, { align: 'right' })
    }

    const sectionHeader = (title: string) => {
      doc.moveDown(0.4)
      doc.rect(48, doc.y, doc.page.width - 96, 18).fill('#2c3e50')
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
        .text(title, 52, doc.y - 14)
      doc.font('Helvetica').fillColor('#000000')
      doc.moveDown(0.6)
    }

    doc.font('Helvetica-Bold').fontSize(14).text('REPUBLIC OF THE PHILIPPINES', { align: 'center' })
    doc.fontSize(12).text('BUREAU OF CUSTOMS', { align: 'center' })
    doc.fontSize(9).font('Helvetica').fillColor('#555').text('Informal Entry Declaration (Reference Document)', { align: 'center' })
    doc.fillColor('#000').moveDown(0.6)
    doc.font('Helvetica').fontSize(10)
    doc.text(`Entry Reference No.:  ${entryRef}`, { align: 'right' })
    doc.text(`Date:  ${dateStr}`, { align: 'right' })
    doc.text(`Customs Station:  ${payload.formData.destinationPort || 'N/A'}`, { align: 'right' })
    doc.moveDown(0.8)

    sectionHeader('A. GOODS IDENTIFICATION')
    doc.fontSize(10)
    lbl('HS Code (AHTN):', payload.formData.hsCode)
    lbl('Tariff Schedule:', payload.results.tariff?.scheduleCode || payload.formData.scheduleCode || 'MFN (Most Favoured Nation)')
    lbl('Country of Origin:', payload.formData.originCountry || 'N/A')
    lbl('Port of Discharge:', payload.formData.destinationPort || 'N/A')
    lbl('Declaration Type:', payload.formData.declarationType || 'consumption')
    lbl('Container Size:', payload.formData.containerSize || 'none')

    sectionHeader('B. CUSTOMS VALUATION (Transaction Value Method — RA 9135)')
    doc.fontSize(10)
    lbl('FOB Value:', `${fob.toFixed(2)} ${payload.formData.currency}`)
    lbl('Freight:', `${freight.toFixed(2)} ${payload.formData.currency}`)
    lbl('Insurance:', `${insurance.toFixed(2)} ${payload.formData.currency}`)
    lbl('CIF / Dutiable Value:', `${cif.toFixed(2)} ${payload.formData.currency}`)
    lbl('Dutiable Value (PHP):', php(taxableValue))
    lbl('VAT Base (Landed Cost):', php(vatBase))

    sectionHeader('C. DUTY AND TAX ASSESSMENT')
    doc.fontSize(10)
    lbl(`Customs Duty (CUD) @ ${dutyRate.toFixed(2)}%:`, php(dutyAmount))
    if (surcharge > 0) {
      lbl('Surcharge:', php(surcharge))
    }
    lbl(`VAT @ ${vatRate.toFixed(2)}%:`, php(vatAmount))
    lbl('Total Item Tax (CUD + VAT):', php(itemTaxTotal))
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(9).fillColor('#555')
    doc.text('Government Fees:')
    doc.fillColor('#000')
    if (transitCharge > 0) lbl('  Transit Charge (TC):', php(transitCharge))
    lbl('  Import Processing Fee (IPF):', php(ipc))
    lbl('  Container Security Fee (CSF):', php(csf))
    lbl('  Customs Documentary Stamp (CDS):', php(cds))
    lbl('  Import Record Stamp (IRS):', php(irs))
    lbl('  Brokerage Fee:', php(brokerageFee))
    lbl('  Arrastre / Wharfage:', php(arrastreWharfage))
    if (doxStampOthers > 0) lbl('  Doc Stamp & Others:', php(doxStampOthers))
    lbl('Total Government Fees:', php(totalGlobalTax))

    sectionHeader('D. TOTAL ASSESSMENT')
    doc.fontSize(11).font('Helvetica-Bold')
    lbl('TOTAL TAX AND FEES:', php(totalTaxAndFees))
    lbl('TOTAL LANDED COST:', php(payload.results.totalLandedCost))
    lbl('TOTAL PAYABLE TO BOC:', php(totalPayable))
    doc.font('Helvetica').fontSize(10)

    const compliance = payload.results.compliance
    if (compliance) {
      sectionHeader('E. COMPLIANCE REQUIREMENTS')
      doc.fontSize(10)

      const writeList = (title: string, entries: string[] = []) => {
        if (entries.length === 0) return
        doc.font('Helvetica-Bold').text(title)
        doc.font('Helvetica')
        entries.forEach((entry) => doc.text(`  • ${entry}`))
        doc.moveDown(0.3)
      }

      writeList('Required Documents:', compliance.requiredDocuments || [])
      writeList('Import Restrictions:', compliance.restrictions || [])
      writeList('Compliance Warnings:', compliance.warnings || [])
    }

    doc.moveDown(1)
    doc.rect(48, doc.y, doc.page.width - 96, 1).fill('#cccccc')
    doc.moveDown(0.4)
    doc.fontSize(8).fillColor('#555').text(
      'FOR PLANNING AND REFERENCE PURPOSES ONLY. This document is not an official Bureau of Customs filing. ' +
      'All values must be validated with the BOC and confirmed with a licensed customs broker before lodging an entry. ' +
      'Rates effective as of date of calculation. Generated by Customs Calculator.',
      { align: 'center' }
    )

    void calculationCurrency
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
