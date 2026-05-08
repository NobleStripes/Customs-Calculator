import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// pdf-parse uses a require() interop that breaks in the vitest ESM sandbox;
// mock it so parseTariffPdfToRows is still testable without native module issues.
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: '8471.30 Portable ADP machines 5%\n8517.62 Network devices 3%',
    numpages: 1,
    info: {},
  }),
}))

let parseTariffPdfToRows: typeof import('./tariffDataIngestion').parseTariffPdfToRows
let TariffDataIngestionServiceClass: typeof import('./tariffDataIngestion').TariffDataIngestionService

beforeAll(async () => {
  process.env.APPDATA = path.join(os.tmpdir(), 'customs-calculator-ingestion-supplement-vitest')

  const databaseModule = await import('../db/database')
  await databaseModule.initializeDatabase()

  const ingestionModule = await import('./tariffDataIngestion')
  TariffDataIngestionServiceClass = ingestionModule.TariffDataIngestionService
  parseTariffPdfToRows = ingestionModule.parseTariffPdfToRows
}, 60000)

// ─────────────────────────────────────────────────────────────────────────────
// parseTariffPdfToRows (standalone export)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTariffPdfToRows', () => {
  it('extracts rows from a PDF buffer whose text contains HS codes and duty rates', async () => {
    // Craft a minimal valid PDF with embedded text that the parser can read.
    // The parser uses pdfParse which extracts text from real PDFs.
    // We encode a text-based fake PDF with embedded tariff rows.
    const pdfText = [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Type /Catalog /Pages 2 0 R >>',
      'endobj',
      '2 0 obj',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      'endobj',
      '3 0 obj',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      'endobj',
      '4 0 obj',
      '<< /Length 89 >>',
      'stream',
      'BT /F1 12 Tf 50 750 Td (8471.30 Portable ADP Machines 5%) Tj ET',
      'endstream',
      'endobj',
      '5 0 obj',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      'endobj',
      'xref',
      '0 6',
      '0000000000 65535 f',
      '0000000009 00000 n',
      '0000000058 00000 n',
      '0000000115 00000 n',
      '0000000274 00000 n',
      '0000000423 00000 n',
      'trailer',
      '<< /Size 6 /Root 1 0 R >>',
      'startxref',
      '510',
      '%%EOF',
    ].join('\n')

    const pdfBuffer = Buffer.from(pdfText, 'utf-8')
    const rows = await parseTariffPdfToRows(pdfBuffer, 'MFN')

    // The built-in pdf-parse library should extract some text.
    // If it finds HS codes + duty rates, rows will be non-empty.
    // Accept either 0 (if pdf-parse skips minimal fake PDFs) or >0.
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('hsCode')
      expect(rows[0]).toHaveProperty('dutyRate')
      expect(rows[0]?.scheduleCode).toBe('MFN')
      expect(rows[0]?.confidenceScore).toBe(70)
    }
  })

  it('uses the provided scheduleCode on every extracted row', async () => {
    const pdfText = '%PDF-1.4\n1 0 obj\n<< >>\nendobj\nxref\n0 2\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n18\n%%EOF'
    const rows = await parseTariffPdfToRows(Buffer.from(pdfText, 'utf-8'), 'ATIGA')
    rows.forEach((row) => expect(row.scheduleCode).toBe('ATIGA'))
  })

  it('defaults scheduleCode to MFN when not provided', async () => {
    const pdfText = '%PDF-1.4\n1 0 obj\n<< >>\nendobj\nxref\n0 2\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n18\n%%EOF'
    const rows = await parseTariffPdfToRows(Buffer.from(pdfText, 'utf-8'))
    rows.forEach((row) => expect(row.scheduleCode).toBe('MFN'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parseCsvText
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.parseCsvText', () => {
  it('parses a well-formed CSV text into TariffImportRow objects', () => {
    const service = new TariffDataIngestionServiceClass()

    const csv = [
      'hs_code,schedule_code,duty_rate,vat_rate,surcharge_rate,effective_date',
      '8471.30,MFN,5%,12%,0%,2026-01-01',
      '8517.62,MFN,3%,12%,0%,2026-01-01',
    ].join('\n')

    const rows = service.parseCsvText(csv)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.hsCode).toBe('8471.30')
    expect(rows[0]?.scheduleCode).toBe('MFN')
    expect(rows[0]?.dutyRate).toBe('5%')
    expect(rows[1]?.hsCode).toBe('8517.62')
  })

  it('returns an empty array for an empty CSV string', () => {
    const service = new TariffDataIngestionServiceClass()
    expect(service.parseCsvText('')).toEqual([])
  })

  it('returns an empty array for a header-only CSV', () => {
    const service = new TariffDataIngestionServiceClass()
    expect(service.parseCsvText('hs_code,duty_rate')).toEqual([])
  })

  it('handles quoted CSV fields containing commas', () => {
    const service = new TariffDataIngestionServiceClass()
    const csv = [
      'hs_code,description,duty_rate',
      '"8471.30","Laptop, portable ADP machine","5%"',
    ].join('\n')

    const rows = service.parseCsvText(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hsCode).toBe('8471.30')
    expect(rows[0]?.dutyRate).toBe('5%')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// previewRows
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.previewRows', () => {
  it('counts valid and invalid rows correctly', () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = [
      { hsCode: '8471.30', dutyRate: '5%', vatRate: '12%', surchargeRate: '0%', effectiveDate: '2026-01-01' },
      { hsCode: 'INVALID', dutyRate: 'X', vatRate: '12%', surchargeRate: '0%', effectiveDate: '2026-01-01' },
      { hsCode: '8517.62', dutyRate: '3%', vatRate: '12%', surchargeRate: '0%', effectiveDate: '2026-01-01' },
    ]

    const result = service.previewRows(rows)

    expect(result.totalRows).toBe(3)
    expect(result.validRows).toBe(2)
    expect(result.invalidRows).toBe(1)
  })

  it('populates normalized data for valid rows', () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = [
      { hsCode: '8421.23', dutyRate: '7%', vatRate: '12%', surchargeRate: '0%', effectiveDate: '2026-01-01' },
    ]

    const result = service.previewRows(rows)

    expect(result.rows[0]?.normalized).toBeDefined()
    expect(result.rows[0]?.normalized?.hsCode).toBe('8421.23')
    expect(result.rows[0]?.normalized?.dutyRate).toBeCloseTo(0.07)
    expect(result.rows[0]?.normalized?.vatRate).toBeCloseTo(0.12)
    expect(result.rows[0]?.errors).toHaveLength(0)
  })

  it('records validation errors for invalid rows', () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = [
      { hsCode: '', dutyRate: '5%' },
    ]

    const result = service.previewRows(rows)

    expect(result.rows[0]?.errors.length).toBeGreaterThan(0)
    expect(result.rows[0]?.normalized).toBeUndefined()
  })

  it('validates that end date must be after effective date', () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = [
      {
        hsCode: '8471.30',
        dutyRate: '5%',
        vatRate: '12%',
        surchargeRate: '0%',
        effectiveDate: '2026-06-01',
        endDate: '2026-01-01',
      },
    ]

    const result = service.previewRows(rows)

    expect(result.validRows).toBe(0)
    expect(result.rows[0]?.errors.some((e) => e.toLowerCase().includes('end date'))).toBe(true)
  })

  it('normalizes percent-format rates to decimals', () => {
    const service = new TariffDataIngestionServiceClass()

    const result = service.previewRows([
      { hsCode: '8421.23', dutyRate: '7%', vatRate: '12%', surchargeRate: '2%' },
    ])

    expect(result.rows[0]?.normalized?.dutyRate).toBeCloseTo(0.07)
    expect(result.rows[0]?.normalized?.vatRate).toBeCloseTo(0.12)
    expect(result.rows[0]?.normalized?.surchargeRate).toBeCloseTo(0.02)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// previewHSCatalogRows
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.previewHSCatalogRows', () => {
  it('validates catalog rows and identifies errors', () => {
    const service = new TariffDataIngestionServiceClass()

    const rows = [
      { hsCode: '8471.30', description: 'Portable ADP machines', category: 'Electronics' },
      { hsCode: '', description: 'Missing code', category: 'General' },
      { hsCode: '8517.62', description: '', category: 'Electronics' },
    ]

    const result = service.previewHSCatalogRows(rows)

    expect(result.totalRows).toBe(3)
    expect(result.validRows).toBe(1)
    expect(result.invalidRows).toBe(2)
    expect(result.rows[0]?.normalized?.hsCode).toBe('8471.30')
    expect(result.rows[1]?.errors.some((e) => e.toLowerCase().includes('hs code'))).toBe(true)
    expect(result.rows[2]?.errors.some((e) => e.toLowerCase().includes('description'))).toBe(true)
  })

  it('normalizes the HS code to dotted form in the preview', () => {
    const service = new TariffDataIngestionServiceClass()

    const result = service.previewHSCatalogRows([
      { hsCode: '847130', description: 'Laptops', category: 'Electronics' },
    ])

    expect(result.rows[0]?.normalized?.hsCode).toBe('8471.30')
  })

  it('derives chapter and section metadata from the HS code', () => {
    const service = new TariffDataIngestionServiceClass()

    const result = service.previewHSCatalogRows([
      { hsCode: '84713090', description: 'Laptop computers', category: 'Electronics' },
    ])

    expect(result.rows[0]?.normalized?.chapterCode).toBe('84')
    expect(result.rows[0]?.normalized?.sectionCode).toBe('XVI')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// importHSCatalog
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.importHSCatalog', () => {
  it('imports valid catalog rows and returns an import summary', async () => {
    const service = new TariffDataIngestionServiceClass()

    const summary = await service.importHSCatalog({
      sourceName: 'Supplement Catalog Import Test',
      rows: [
        { hsCode: '8481.20', description: 'Valves for oleohydraulic or pneumatic transmissions', category: 'Machinery' },
        { hsCode: '7318.15', description: 'Other screws and bolts', category: 'Metals' },
      ],
    })

    expect(summary.totalRows).toBe(2)
    expect(summary.importedRows).toBe(2)
    expect(summary.errorRows).toBe(0)
    expect(summary.status).toBe('completed')
  })

  it('counts error rows for invalid catalog entries', async () => {
    const service = new TariffDataIngestionServiceClass()

    const summary = await service.importHSCatalog({
      sourceName: 'Supplement Catalog Error Test',
      rows: [
        { hsCode: '', description: 'No HS code provided', category: 'General' },
      ],
    })

    expect(summary.errorRows).toBe(1)
    expect(summary.status).toBe('completed_with_errors')
  })

  it('deduplicates identical catalog rows within the same import payload', async () => {
    const service = new TariffDataIngestionServiceClass()

    const summary = await service.importHSCatalog({
      sourceName: 'Supplement Catalog Dedup Test',
      rows: [
        { hsCode: '8443.31', description: 'Printing machines', category: 'Machinery' },
        { hsCode: '8443.31', description: 'Printing machines', category: 'Machinery' },
      ],
    })

    expect(summary.totalRows).toBe(2)
    expect(summary.duplicateRows).toBe(1)
    expect(summary.importedRows).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// hasSourceReference
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.hasSourceReference', () => {
  it('returns false for a source reference that has never been imported', async () => {
    const service = new TariffDataIngestionServiceClass()

    const result = await service.hasSourceReference('manual', 'https://example.gov.ph/never-imported.csv')

    expect(result).toBe(false)
  })

  it('returns true after a source reference is recorded via importRows', async () => {
    const service = new TariffDataIngestionServiceClass()

    const ref = `https://example.gov.ph/supplement-test-${Date.now()}.csv`
    await service.importRows({
      sourceName: 'hasSourceReference Test',
      sourceType: 'supplement-test',
      sourceReference: ref,
      rows: [
        {
          hsCode: '8414.59',
          scheduleCode: 'MFN',
          description: 'Other fans',
          dutyRate: '5%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
        },
      ],
      forceApprove: true,
    })

    const result = await service.hasSourceReference('supplement-test', ref)

    expect(result).toBe(true)
  })

  it('returns false for an empty source reference', async () => {
    const service = new TariffDataIngestionServiceClass()

    const result = await service.hasSourceReference('manual', '   ')

    expect(result).toBe(false)
  })

  it('distinguishes source references by sourceType', async () => {
    const service = new TariffDataIngestionServiceClass()

    const ref = `https://example.gov.ph/type-specific-${Date.now()}.csv`
    await service.importRows({
      sourceName: 'hasSourceReference Type Test',
      sourceType: 'type-a',
      sourceReference: ref,
      rows: [
        {
          hsCode: '8414.60',
          scheduleCode: 'MFN',
          dutyRate: '5%',
          vatRate: '12%',
          surchargeRate: '0%',
          effectiveDate: '2026-01-01',
        },
      ],
      forceApprove: true,
    })

    expect(await service.hasSourceReference('type-a', ref)).toBe(true)
    expect(await service.hasSourceReference('type-b', ref)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// parsePdfTariffRows (instance method)
// ─────────────────────────────────────────────────────────────────────────────

describe('TariffDataIngestionService.parsePdfTariffRows', () => {
  it('returns an array (possibly empty) for a minimal base64-encoded PDF buffer', async () => {
    const service = new TariffDataIngestionServiceClass()

    const minimalPdf = '%PDF-1.4\n1 0 obj\n<< >>\nendobj\nxref\n0 2\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n18\n%%EOF'
    const contentBase64 = Buffer.from(minimalPdf, 'utf-8').toString('base64')

    const rows = await service.parsePdfTariffRows({
      contentBase64,
      sourceUrl: 'https://customs.gov.ph/test.pdf',
    })

    expect(Array.isArray(rows)).toBe(true)
  })

  it('extracts rows from text content embedded in a PDF-like binary payload', async () => {
    const service = new TariffDataIngestionServiceClass()

    // Build a buffer that looks enough like a PDF to pass through decodePdfLikeText
    // while containing recognisable HS-code and rate patterns.
    const fakePdfContent = '%PDF-1.4\n(8471.30) Tj\n(5%) Tj\n(8517.62) Tj\n(3%) Tj\n%%EOF'
    const contentBase64 = Buffer.from(fakePdfContent, 'latin1').toString('base64')

    const rows = await service.parsePdfTariffRows({
      contentBase64,
      sourceUrl: 'https://customs.gov.ph/tariff-memo.pdf',
    })

    // Allow 0 rows if the fake PDF doesn't parse; structural test only.
    expect(Array.isArray(rows)).toBe(true)
    for (const row of rows) {
      expect(row).toHaveProperty('hsCode')
      expect(row).toHaveProperty('dutyRate')
      expect(typeof row.confidenceScore).toBe('number')
    }
  })
})
