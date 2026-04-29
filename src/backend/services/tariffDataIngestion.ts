


import sqlite3 from 'sqlite3'
import { readSheet } from 'read-excel-file/node'
import { getDatabase } from '../db/database'
import { getHsCodeMetadata, normalizeExactHsCode } from '../../shared/hsLookupQuery'
import { getRuntimeSettings } from './runtimeSettings'
import { parseTariffHtml } from './tariffHtmlParser'

type TabularImportPayload = {
  csvText?: string
  contentBase64?: string
  fileName?: string
  rows?: Record<string, unknown>[]
}

export interface HSCatalogImportRow {
  hsCode: string
  description: string
  category?: string
  chapterCode?: string
  sectionCode?: string
  sectionName?: string
  metadataSource?: string
}

export interface HSCatalogImportPreviewRow {
  rowNumber: number
  raw: HSCatalogImportRow
  normalized?: {
    hsCode: string
    description: string
    category: string
    chapterCode: string
    sectionCode: string
    sectionName: string
    metadataSource: string
  }
  errors: string[]
}

export interface HSCatalogImportPreviewResult {
  totalRows: number
  validRows: number
  invalidRows: number
  rows: HSCatalogImportPreviewRow[]
}

export interface HSCatalogImportRequest {
  sourceName: string
  sourceType?: string
  sourceReference?: string
  rows: HSCatalogImportRow[]
}

export interface TariffImportRow {
  hsCode: string
  scheduleCode?: string
  description?: string
  category?: string
  dutyRate: string | number
  vatRate?: string | number
  surchargeRate?: string | number
  effectiveDate?: string
  endDate?: string
  notes?: string
  confidenceScore?: number
}

export interface TariffImportPreviewRow {
  rowNumber: number
  raw: TariffImportRow
  normalized?: {
    hsCode: string
    scheduleCode: string
    description: string
    category: string
    chapterCode: string
    sectionCode: string
    sectionName: string
    metadataSource: string
    dutyRate: number
    vatRate: number
    surchargeRate: number
    effectiveDate: string
    endDate: string | null
    notes: string
    confidenceScore: number
  }
  errors: string[]
}

type NormalizedTariffRow = NonNullable<TariffImportPreviewRow['normalized']>

type ConflictPayload = {
  type: 'conflict-tariff-rate'
  incoming: NormalizedTariffRow
  existing: {
    id: number
    scheduleCode: string
    dutyRate: number
    vatRate: number
    surchargeRate: number
    effectiveDate: string
    endDate: string | null
  }
}

export interface TariffImportPreviewResult {
  totalRows: number
  validRows: number
  invalidRows: number
  rows: TariffImportPreviewRow[]
}

export interface TariffImportRequest {
  sourceName: string
  sourceType?: string
  sourceReference?: string
  rows: TariffImportRow[]
  autoApproveThreshold?: number
  forceApprove?: boolean
}

export interface TariffImportSummary {
  sourceId: number
  importJobId: number
  totalRows: number
  importedRows: number
  pendingReviewRows: number
  errorRows: number
  duplicateRows: number
  conflictRows: number
  skippedRows: number
  status: 'completed' | 'completed_with_errors' | 'failed'
}

export interface BatchedHSCatalogImportSummary extends TariffImportSummary {
  batchSize: number
  totalBatches: number
  processedBatches: number
  batchResults: Array<
    TariffImportSummary & {
      batchNumber: number
      batchRows: number
    }
  >
}

const DEFAULT_THRESHOLD = 85

const inferTariffHtmlSource = (sourceUrl: string): 'boc' | 'tariff-commission' => {
  const normalized = sourceUrl.toLowerCase()
  return normalized.includes('tariffcommission') ? 'tariff-commission' : 'boc'
}

const normalizeHeaderKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const parseCsvRecords = (input: string): Record<string, unknown>[] => {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let insideQuotes = false

  const pushValue = (): void => {
    currentRow.push(currentValue)
    currentValue = ''
  }

  const pushRow = (): void => {
    pushValue()
    rows.push(currentRow)
    currentRow = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    const nextCharacter = input[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (!insideQuotes && character === ',') {
      pushValue()
      continue
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      pushRow()
      continue
    }

    currentValue += character
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    pushRow()
  }

  const [headerRow, ...dataRows] = rows.filter((row) => row.some((value) => value.trim() !== ''))
  if (!headerRow || headerRow.length === 0) {
    return []
  }

  return dataRows
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row) => {
      const record: Record<string, unknown> = {}
      headerRow.forEach((header, index) => {
        record[header] = row[index] ?? ''
      })
      return record
    })
}

const readWorkbookRows = async (contentBase64: string): Promise<Record<string, unknown>[]> => {
  const rows = await readSheet(Buffer.from(contentBase64, 'base64'))
  const [headerRow, ...dataRows] = rows

  if (!headerRow || headerRow.length === 0) {
    return []
  }

  const headers = Array.from(headerRow, (value) => String(value ?? '').trim())

  return dataRows
    .filter((row) => Array.from(row).some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const record: Record<string, unknown> = {}
      const rowValues = Array.from(row)
      headers.forEach((header, index) => {
        record[header] = String(rowValues[index] ?? '')
      })
      return record
    })
}

const getFieldValue = (row: Record<string, unknown>, aliases: string[]): string => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value] as const)

  for (const alias of aliases) {
    const match = normalizedEntries.find(([key]) => key === alias)
    if (match && match[1] !== undefined && match[1] !== null) {
      return String(match[1]).trim()
    }
  }

  return ''
}

const mapTabularRecordToTariffImportRow = (row: Record<string, unknown>): TariffImportRow => ({
  hsCode: getFieldValue(row, ['hscode', 'hs_code', 'code']),
  scheduleCode: getFieldValue(row, ['schedulecode', 'schedule_code', 'tariffschedule', 'tariff_schedule', 'schedule']) || undefined,
  description: getFieldValue(row, ['description', 'goodsdescription', 'productdescription']) || undefined,
  category: getFieldValue(row, ['category', 'section', 'chapterdescription']) || undefined,
  dutyRate: getFieldValue(row, ['dutyrate', 'dutyratepercent', 'duty_rate', 'duty']) || '',
  vatRate: getFieldValue(row, ['vatrate', 'vat_rate', 'vat']) || undefined,
  surchargeRate: getFieldValue(row, ['surchargerate', 'surcharge_rate', 'surcharge']) || undefined,
  effectiveDate: getFieldValue(row, ['effectivedate', 'effective_date']) || undefined,
  endDate: getFieldValue(row, ['enddate', 'end_date']) || undefined,
  notes: getFieldValue(row, ['notes', 'remark', 'remarks']) || undefined,
  confidenceScore: getFieldValue(row, ['confidencescore', 'confidence_score'])
    ? Number(getFieldValue(row, ['confidencescore', 'confidence_score']))
    : undefined,
})

const run = (sql: string, params: Array<string | number | null> = []): Promise<{ lastID: number; changes: number }> => {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(this: sqlite3.RunResult, err: Error | null) {
      if (err) {
        reject(err)
        return
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes,
      })
    })
  })
}

const get = <T>(sql: string, params: Array<string | number | null> = []): Promise<T | undefined> => {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T | undefined) => {
      if (err) {
        reject(err)
        return
      }

      resolve(row)
    })
  })
}

const all = <T>(sql: string, params: Array<string | number | null> = []): Promise<T[]> => {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) {
        reject(err)
        return
      }

      resolve(rows || [])
    })
  })
}

const todayIsoDate = (): string => new Date().toISOString().split('T')[0]

const normalizeScheduleCode = (value: string | undefined): string => {
  const normalizedValue = String(value || '').trim().toUpperCase()
  return normalizedValue || 'MFN'
}

const normalizeRate = (value: string | number | undefined, fallback: number): number => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'number') {
    return value > 1 ? value / 100 : value
  }

  const trimmed = value.trim().toLowerCase()
  const isPercentInput = trimmed.includes('%') || trimmed.includes('percent')
  if (!trimmed) {
    return fallback
  }

  const numeric = Number(trimmed.replace('%', '').replace('percent', '').trim())
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return isPercentInput || numeric > 1 ? numeric / 100 : numeric
}

const decodePdfLikeText = (pdfBuffer: Buffer): string => {
  const binary = pdfBuffer.toString('latin1')
  const textLiterals: string[] = []

  // Extract plain-text PDF text operators where available, e.g. (....) Tj / TJ
  const textLiteralPattern = /\(([^)]{1,500})\)\s*TJ?/g
  let match = textLiteralPattern.exec(binary)

  while (match) {
    const raw = String(match[1] || '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\')

    if (raw.trim()) {
      textLiterals.push(raw)
    }

    match = textLiteralPattern.exec(binary)
  }

  if (textLiterals.length > 0) {
    return textLiterals.join('\n')
  }

  // Fallback: keep printable ranges only.
  return binary.replace(/[^\x20-\x7E\r\n\t]+/g, ' ')
}

const parseTariffRowsFromText = (text: string, sourceUrl: string): TariffImportRow[] => {
  const rows: TariffImportRow[] = []
  const seen = new Set<string>()

  const normalizedText = text.replace(/\r/g, '\n').replace(/[\t ]+/g, ' ')

  // Match patterns like "8471.30 ... 5%" or "847130 ... 0.05"
  const rowPattern = /(\d{4}(?:[.\s]?\d{2}){0,3})[^\n]{0,180}?((?:\d{1,3}(?:\.\d{1,4})?)\s*%?)/g

  let match = rowPattern.exec(normalizedText)
  while (match) {
    const hsCode = normalizeExactHsCode(String(match[1] || '').replace(/\s+/g, ''))
    if (!hsCode) {
      match = rowPattern.exec(normalizedText)
      continue
    }
    const dutyRateRaw = String(match[2] || '').trim()

    const parsedRate = normalizeRate(dutyRateRaw, Number.NaN)
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1) {
      match = rowPattern.exec(normalizedText)
      continue
    }

    const dedupeKey = `${hsCode}:${parsedRate}`
    if (seen.has(dedupeKey)) {
      match = rowPattern.exec(normalizedText)
      continue
    }
    seen.add(dedupeKey)

    rows.push({
      hsCode,
      dutyRate: dutyRateRaw,
      notes: `Extracted from PDF source ${sourceUrl}`,
      confidenceScore: 45,
    })

    match = rowPattern.exec(normalizedText)
  }

  return rows
}

const parseDateOrFallback = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return date.toISOString().split('T')[0]
}

const buildHsMetadata = (hsCode: string): {
  chapterCode: string
  sectionCode: string
  sectionName: string
  metadataSource: string
} => {
  const metadata = getHsCodeMetadata(hsCode)
  if (!metadata) {
    return {
      chapterCode: '',
      sectionCode: '',
      sectionName: '',
      metadataSource: 'unknown',
    }
  }

  return {
    chapterCode: metadata.chapterCode,
    sectionCode: metadata.sectionCode,
    sectionName: metadata.sectionName,
    metadataSource: 'derived-section-map',
  }
}

const validateRow = (row: TariffImportRow, rowNumber: number): TariffImportPreviewRow => {
  const errors: string[] = []

  const hsCode = normalizeExactHsCode(row.hsCode || '')
  const scheduleCode = normalizeScheduleCode(row.scheduleCode)
  if (!hsCode) {
    errors.push('HS code must be a valid 6, 8, or 10-digit code')
  }

  const dutyRate = normalizeRate(row.dutyRate, Number.NaN)
  if (!Number.isFinite(dutyRate) || dutyRate < 0 || dutyRate > 1) {
    errors.push('Duty rate must be between 0 and 1 (or 0-100%)')
  }

  const vatRate = normalizeRate(row.vatRate, 0.12)
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
    errors.push('VAT rate must be between 0 and 1 (or 0-100%)')
  }

  const surchargeRate = normalizeRate(row.surchargeRate, 0)
  if (!Number.isFinite(surchargeRate) || surchargeRate < 0 || surchargeRate > 1) {
    errors.push('Surcharge rate must be between 0 and 1 (or 0-100%)')
  }

  const confidenceScore = row.confidenceScore ?? 100
  if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
    errors.push('Confidence score must be between 0 and 100')
  }

  const effectiveDate = parseDateOrFallback(row.effectiveDate, todayIsoDate())
  const endDate = row.endDate ? parseDateOrFallback(row.endDate, '') : null

  if (endDate && endDate <= effectiveDate) {
    errors.push('End date must be after effective date')
  }

  const normalized = errors.length
    ? undefined
    : {
        hsCode,
        scheduleCode,
        ...buildHsMetadata(hsCode),
        description: (row.description || 'Imported from source').trim() || 'Imported from source',
        category: (row.category || buildHsMetadata(hsCode).sectionName || 'Imported').trim() || 'Imported',
        dutyRate,
        vatRate,
        surchargeRate,
        effectiveDate,
        endDate,
        notes: (row.notes || '').trim(),
        confidenceScore,
      }

  return {
    rowNumber,
    raw: row,
    normalized,
    errors,
  }
}

const validateHSCatalogRow = (row: HSCatalogImportRow, rowNumber: number): HSCatalogImportPreviewRow => {
  const errors: string[] = []
  const hsCode = normalizeExactHsCode(row.hsCode || '')
  const description = String(row.description || '').trim()
  const category = String(row.category || 'Imported').trim() || 'Imported'

  if (!hsCode) {
    errors.push('HS code must be a valid 6, 8, or 10-digit code')
  }

  if (!description) {
    errors.push('Description is required')
  }

  return {
    rowNumber,
    raw: row,
    normalized: errors.length
      ? undefined
      : {
          hsCode,
          description,
          category: category || buildHsMetadata(hsCode).sectionName || 'Imported',
          ...buildHsMetadata(hsCode),
        },
    errors,
  }
}

const buildConfidenceReviewReason = (
  confidenceScore: number,
  threshold: number,
  sourceType: string | undefined,
  notes: string
): string => {
  const reasonCodes: string[] = ['LOW_CONFIDENCE']

  if ((sourceType || '').toLowerCase().includes('pdf') || notes.toLowerCase().includes('pdf source')) {
    reasonCodes.push('PDF_EXTRACT')
  }

  if ((sourceType || '').toLowerCase().includes('auto-fetch')) {
    reasonCodes.push('AUTO_FETCH')
  }

  reasonCodes.push(`SCORE_${Math.round(confidenceScore)}`)
  reasonCodes.push(`THRESHOLD_${Math.round(threshold)}`)

  return `${reasonCodes.join('|')}: below auto-approval threshold (${threshold})`
}

const updateImportJobStatus = async (
  jobId: number,
  status: 'completed' | 'completed_with_errors' | 'failed',
  importedRows: number,
  pendingReviewRows: number,
  errorRows: number,
  errorMessage: string | null = null
): Promise<void> => {
  await run(
    `
      UPDATE import_jobs
      SET status = ?,
          imported_rows = ?,
          pending_review_rows = ?,
          error_rows = ?,
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [status, importedRows, pendingReviewRows, errorRows, errorMessage, jobId]
  )
}

const upsertHsCode = async (normalized: {
  hsCode: string
  description: string
  category: string
  chapterCode?: string
  sectionCode?: string
  sectionName?: string
  metadataSource?: string
}): Promise<void> => {
  await run(
    `
      INSERT INTO hs_codes (code, description, category, chapter_code, section_code, section_name, metadata_source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        description = excluded.description,
        category = excluded.category,
        chapter_code = excluded.chapter_code,
        section_code = excluded.section_code,
        section_name = excluded.section_name,
        metadata_source = excluded.metadata_source
    `,
    [
      normalized.hsCode,
      normalized.description,
      normalized.category,
      normalized.chapterCode || null,
      normalized.sectionCode || null,
      normalized.sectionName || null,
      normalized.metadataSource || 'imported',
    ]
  )
}

const applyTariffRateAndAudit = async (payload: {
  normalized: NormalizedTariffRow
  sourceId: number
  importJobId: number
  reason: string
}): Promise<{ hadConflict: boolean; skippedAsDuplicate: boolean }> => {
  const { normalized, sourceId, importJobId, reason } = payload

  await upsertHsCode(normalized)

  const existingVersionRow = await get<{
    id: number
    duty_rate: number
    vat_rate: number
    surcharge_rate: number
  }>(
    `
      SELECT id, duty_rate, vat_rate, surcharge_rate
      FROM tariff_rates
      WHERE hs_code = ?
        AND COALESCE(schedule_code, 'MFN') = ?
        AND effective_date = ?
        AND (import_status = 'approved' OR import_status IS NULL)
      ORDER BY COALESCE(last_modified_at, created_at) DESC, id DESC
      LIMIT 1
    `,
    [normalized.hsCode, normalized.scheduleCode, normalized.effectiveDate]
  )

  if (existingVersionRow) {
    const isSameVersionValues =
      existingVersionRow.duty_rate === normalized.dutyRate &&
      existingVersionRow.vat_rate === normalized.vatRate &&
      existingVersionRow.surcharge_rate === normalized.surchargeRate

    if (isSameVersionValues) {
      return { hadConflict: true, skippedAsDuplicate: true }
    }

    await run(
      `
        UPDATE tariff_rates
        SET duty_rate = ?,
            vat_rate = ?,
            surcharge_rate = ?,
            schedule_code = ?,
            end_date = ?,
            notes = ?,
            source_id = ?,
            confidence_score = ?,
            import_status = 'approved',
            last_modified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        normalized.dutyRate,
        normalized.vatRate,
        normalized.surchargeRate,
        normalized.scheduleCode,
        normalized.endDate,
        normalized.notes,
        sourceId,
        normalized.confidenceScore,
        existingVersionRow.id,
      ]
    )

    await run(
      `
        INSERT INTO rate_change_audit
        (hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate, old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalized.hsCode,
        existingVersionRow.duty_rate,
        normalized.dutyRate,
        existingVersionRow.vat_rate,
        normalized.vatRate,
        existingVersionRow.surcharge_rate,
        normalized.surchargeRate,
        `${reason} [existing version updated]`,
        sourceId,
        importJobId,
      ]
    )

    return { hadConflict: true, skippedAsDuplicate: false }
  }

  const existingRate = await get<{
    id: number
    schedule_code: string | null
    duty_rate: number
    vat_rate: number
    surcharge_rate: number
    effective_date: string
    end_date: string | null
  }>(
    `
      SELECT id, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, end_date
      FROM tariff_rates
      WHERE hs_code = ?
        AND COALESCE(schedule_code, 'MFN') = ?
        AND (end_date IS NULL OR end_date > date('now'))
      ORDER BY effective_date DESC
      LIMIT 1
    `,
    [normalized.hsCode, normalized.scheduleCode]
  )

  const hasRateChange =
    !existingRate ||
    existingRate.duty_rate !== normalized.dutyRate ||
    existingRate.vat_rate !== normalized.vatRate ||
    existingRate.surcharge_rate !== normalized.surchargeRate

  if (!hasRateChange) {
    return { hadConflict: false, skippedAsDuplicate: true }
  }

  if (existingRate) {
    await run('UPDATE tariff_rates SET end_date = ?, last_modified_at = CURRENT_TIMESTAMP WHERE id = ?', [
      normalized.effectiveDate,
      existingRate.id,
    ])
  }

  await run(
    `
      INSERT INTO tariff_rates
      (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, end_date, notes, source_id, confidence_score, import_status, last_modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
    `,
    [
      normalized.hsCode,
      normalized.scheduleCode,
      normalized.dutyRate,
      normalized.vatRate,
      normalized.surchargeRate,
      normalized.effectiveDate,
      normalized.endDate,
      normalized.notes,
      sourceId,
      normalized.confidenceScore,
    ]
  )

  await run(
    `
      INSERT INTO rate_change_audit
      (hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate, old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.hsCode,
      existingRate?.duty_rate ?? null,
      normalized.dutyRate,
      existingRate?.vat_rate ?? null,
      normalized.vatRate,
      existingRate?.surcharge_rate ?? null,
      normalized.surchargeRate,
      reason,
      sourceId,
      importJobId,
    ]
  )

  return { hadConflict: Boolean(existingRate), skippedAsDuplicate: false }
}

export class TariffDataIngestionService {
  private async readTabularRows(payload: TabularImportPayload): Promise<Record<string, unknown>[]> {
    if (Array.isArray(payload.rows)) {
      return payload.rows
    }

    if (payload.contentBase64) {
      if ((payload.fileName || '').toLowerCase().endsWith('.csv')) {
        return parseCsvRecords(Buffer.from(payload.contentBase64, 'base64').toString('utf-8'))
      }

      return readWorkbookRows(payload.contentBase64)
    }

    if (payload.csvText) {
      return parseCsvRecords(payload.csvText)
    }

    return []
  }

  parseCsvText(input: string): TariffImportRow[] {
    const rows = parseCsvRecords(input)

    return rows.map(mapTabularRecordToTariffImportRow)
  }

  async parseTariffRows(payload: TabularImportPayload): Promise<TariffImportRow[]> {
    const rows = await this.readTabularRows(payload)
    return rows.map(mapTabularRecordToTariffImportRow)
  }

  async parseHSCatalogRows(payload: TabularImportPayload): Promise<HSCatalogImportRow[]> {
    const rows = await this.readTabularRows(payload)

    return rows.map((row) => ({
      hsCode: getFieldValue(row, ['hscode', 'hs_code', 'code', 'commoditycode', 'commodity_code', 'tariffcode', 'tariff_code']),
      description: getFieldValue(row, ['description', 'goodsdescription', 'productdescription', 'commoditydescription', 'commodity_description']),
      category: getFieldValue(row, ['category', 'section', 'chapterdescription', 'chapter_description']) || undefined,
    }))
  }

  async parsePdfTariffRows(payload: { contentBase64: string; sourceUrl: string }): Promise<TariffImportRow[]> {
    const buffer = Buffer.from(payload.contentBase64, 'base64')
    const extractedText = decodePdfLikeText(buffer)
    const rows = parseTariffRowsFromText(extractedText, payload.sourceUrl)
    return rows
  }

  previewRows(rows: TariffImportRow[]): TariffImportPreviewResult {
    const parsedRows = rows.map((row, idx) => validateRow(row, idx + 1))
    const validRows = parsedRows.filter((row) => row.errors.length === 0).length

    return {
      totalRows: rows.length,
      validRows,
      invalidRows: rows.length - validRows,
      rows: parsedRows,
    }
  }

  previewHSCatalogRows(rows: HSCatalogImportRow[]): HSCatalogImportPreviewResult {
    const parsedRows = rows.map((row, idx) => validateHSCatalogRow(row, idx + 1))
    const validRows = parsedRows.filter((row) => row.errors.length === 0).length

    return {
      totalRows: rows.length,
      validRows,
      invalidRows: rows.length - validRows,
      rows: parsedRows,
    }
  }

  async importHSCatalog(request: HSCatalogImportRequest): Promise<TariffImportSummary> {
    const preview = this.previewHSCatalogRows(request.rows)

    const sourceInsert = await run(
      `
        INSERT INTO tariff_sources (source_name, source_type, source_reference, status, fetched_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `,
      [request.sourceName, request.sourceType || 'hs-catalog', request.sourceReference || null]
    )
    const sourceId = sourceInsert.lastID

    const jobInsert = await run(
      `
        INSERT INTO import_jobs (source_id, status, total_rows)
        VALUES (?, 'running', ?)
      `,
      [sourceId, preview.totalRows]
    )
    const importJobId = jobInsert.lastID

    let importedRows = 0
    const pendingReviewRows = 0
    let errorRows = 0
    let duplicateRows = 0
    let conflictRows = 0
    let skippedRows = 0
    const seenInPayload = new Set<string>()

    try {
      for (const row of preview.rows) {
        if (!row.normalized) {
          errorRows += 1
          await run(
            `
              INSERT INTO extracted_rows_review
              (source_id, import_job_id, row_number, raw_payload, normalized_payload, confidence_score, review_status, review_notes)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            `,
            [
              sourceId,
              importJobId,
              row.rowNumber,
              JSON.stringify(row.raw),
              null,
              0,
              row.errors.join('; '),
            ]
          )
          continue
        }

        const dedupeKey = `${row.normalized.hsCode}:${row.normalized.description}:${row.normalized.category}`
        if (seenInPayload.has(dedupeKey)) {
          duplicateRows += 1
          skippedRows += 1
          continue
        }
        seenInPayload.add(dedupeKey)

        const existingCatalogRow = await get<{ description: string; category: string }>(
          'SELECT description, category FROM hs_codes WHERE code = ? LIMIT 1',
          [row.normalized.hsCode]
        )
        if (existingCatalogRow && (existingCatalogRow.description !== row.normalized.description || existingCatalogRow.category !== row.normalized.category)) {
          conflictRows += 1
        }

        await run(
          `
            INSERT INTO hs_codes (code, description, category, chapter_code, section_code, section_name, metadata_source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
              description = excluded.description,
              category = excluded.category,
              chapter_code = excluded.chapter_code,
              section_code = excluded.section_code,
              section_name = excluded.section_name,
              metadata_source = excluded.metadata_source
          `,
          [
            row.normalized.hsCode,
            row.normalized.description,
            row.normalized.category,
            row.normalized.chapterCode || null,
            row.normalized.sectionCode || null,
            row.normalized.sectionName || null,
            row.normalized.metadataSource || 'imported',
          ]
        )

        importedRows += 1
      }

      const finalStatus: TariffImportSummary['status'] =
        errorRows > 0 ? 'completed_with_errors' : 'completed'

      await run('UPDATE tariff_sources SET imported_at = CURRENT_TIMESTAMP WHERE id = ?', [sourceId])
      await updateImportJobStatus(importJobId, finalStatus, importedRows, pendingReviewRows, errorRows)

      return {
        sourceId,
        importJobId,
        totalRows: preview.totalRows,
        importedRows,
        pendingReviewRows,
        errorRows,
        duplicateRows,
        conflictRows,
        skippedRows,
        status: finalStatus,
      }
    } catch (error) {
      await updateImportJobStatus(importJobId, 'failed', importedRows, pendingReviewRows, errorRows + 1, String(error))
      throw error
    }
  }

  async importHSCatalogBatched(
    request: HSCatalogImportRequest & { batchSize?: number }
  ): Promise<BatchedHSCatalogImportSummary> {
    const normalizedBatchSize = Math.max(1, Math.floor(request.batchSize || 1000))
    const totalRows = request.rows.length
    const totalBatches = Math.max(1, Math.ceil(totalRows / normalizedBatchSize))

    const aggregate: BatchedHSCatalogImportSummary = {
      sourceId: 0,
      importJobId: 0,
      totalRows,
      importedRows: 0,
      pendingReviewRows: 0,
      errorRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
      skippedRows: 0,
      status: 'completed',
      batchSize: normalizedBatchSize,
      totalBatches,
      processedBatches: 0,
      batchResults: [],
    }

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
      const start = batchIndex * normalizedBatchSize
      const end = Math.min(start + normalizedBatchSize, totalRows)
      const batchRows = request.rows.slice(start, end)
      const batchNumber = batchIndex + 1

      const summary = await this.importHSCatalog({
        sourceName: `${request.sourceName} [batch ${batchNumber}/${totalBatches}]`,
        sourceType: request.sourceType || 'hs-catalog-batch',
        sourceReference: request.sourceReference
          ? `${request.sourceReference}#batch-${batchNumber}`
          : `batch-${batchNumber}`,
        rows: batchRows,
      })

      aggregate.sourceId = summary.sourceId
      aggregate.importJobId = summary.importJobId
      aggregate.importedRows += summary.importedRows
      aggregate.pendingReviewRows += summary.pendingReviewRows
      aggregate.errorRows += summary.errorRows
      aggregate.duplicateRows += summary.duplicateRows
      aggregate.conflictRows += summary.conflictRows
      aggregate.skippedRows += summary.skippedRows
      aggregate.processedBatches += 1

      if (summary.status === 'failed') {
        aggregate.status = 'failed'
      } else if (summary.status === 'completed_with_errors' && aggregate.status !== 'failed') {
        aggregate.status = 'completed_with_errors'
      }

      aggregate.batchResults.push({
        ...summary,
        batchNumber,
        batchRows: batchRows.length,
      })
    }

    return aggregate
  }

  async importRows(request: TariffImportRequest): Promise<TariffImportSummary> {
    const threshold = request.autoApproveThreshold ?? DEFAULT_THRESHOLD
    const preview = this.previewRows(request.rows)
    const sourceType = request.sourceType || 'manual'
    const runtimeSettings = getRuntimeSettings()

    if (
      runtimeSettings.fullSyncIdempotencyGuardEnabled &&
      sourceType.includes('full-sync') &&
      request.sourceReference &&
      request.sourceReference.trim() &&
      await this.hasSourceReference(sourceType, request.sourceReference)
    ) {
      const sourceInsert = await run(
        `
          INSERT INTO tariff_sources (source_name, source_type, source_reference, status, fetched_at, imported_at, notes)
          VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
        `,
        [
          request.sourceName,
          sourceType,
          request.sourceReference,
          'Idempotency guard skipped duplicate full-sync source reference',
        ]
      )
      const sourceId = sourceInsert.lastID

      const jobInsert = await run(
        `
          INSERT INTO import_jobs (source_id, status, total_rows, imported_rows, pending_review_rows, error_rows, started_at, completed_at)
          VALUES (?, 'completed', ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [sourceId, preview.totalRows]
      )

      return {
        sourceId,
        importJobId: jobInsert.lastID,
        totalRows: preview.totalRows,
        importedRows: 0,
        pendingReviewRows: 0,
        errorRows: 0,
        duplicateRows: preview.totalRows,
        conflictRows: 0,
        skippedRows: preview.totalRows,
        status: 'completed',
      }
    }

    const sourceInsert = await run(
      `
        INSERT INTO tariff_sources (source_name, source_type, source_reference, status, fetched_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `,
      [request.sourceName, sourceType, request.sourceReference || null]
    )
    const sourceId = sourceInsert.lastID

    const jobInsert = await run(
      `
        INSERT INTO import_jobs (source_id, status, total_rows)
        VALUES (?, 'running', ?)
      `,
      [sourceId, preview.totalRows]
    )
    const importJobId = jobInsert.lastID

    let importedRows = 0
    let pendingReviewRows = 0
    let errorRows = 0
    let duplicateRows = 0
    let conflictRows = 0
    let skippedRows = 0
    const seenInPayload = new Set<string>()

    try {
      for (const row of preview.rows) {
        if (!row.normalized) {
          errorRows += 1
          await run(
            `
              INSERT INTO extracted_rows_review
              (source_id, import_job_id, row_number, raw_payload, normalized_payload, confidence_score, review_status, review_notes)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            `,
            [
              sourceId,
              importJobId,
              row.rowNumber,
              JSON.stringify(row.raw),
              null,
              0,
              row.errors.join('; '),
            ]
          )
          continue
        }

        const dedupeKey = [
          row.normalized.hsCode,
          row.normalized.scheduleCode,
          row.normalized.effectiveDate,
          row.normalized.dutyRate,
          row.normalized.vatRate,
          row.normalized.surchargeRate,
        ].join('|')

        if (seenInPayload.has(dedupeKey)) {
          duplicateRows += 1
          skippedRows += 1
          continue
        }
        seenInPayload.add(dedupeKey)

        const shouldQueueForReview = !request.forceApprove && row.normalized.confidenceScore < threshold
        if (shouldQueueForReview) {
          pendingReviewRows += 1
          await run(
            `
              INSERT INTO extracted_rows_review
              (source_id, import_job_id, row_number, raw_payload, normalized_payload, confidence_score, review_status, review_notes)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            `,
            [
              sourceId,
              importJobId,
              row.rowNumber,
              JSON.stringify(row.raw),
              JSON.stringify(row.normalized),
              row.normalized.confidenceScore,
              buildConfidenceReviewReason(
                row.normalized.confidenceScore,
                threshold,
                request.sourceType,
                row.normalized.notes
              ),
            ]
          )
          continue
        }

        const existingRate = await get<{
          id: number
          schedule_code: string | null
          duty_rate: number
          vat_rate: number
          surcharge_rate: number
          effective_date: string
          end_date: string | null
        }>(
          `
            SELECT id, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date, end_date
            FROM tariff_rates
            WHERE hs_code = ?
              AND COALESCE(schedule_code, 'MFN') = ?
              AND (end_date IS NULL OR end_date > date('now'))
            ORDER BY effective_date DESC
            LIMIT 1
          `,
          [row.normalized.hsCode, row.normalized.scheduleCode]
        )

        const hasRateChange =
          !existingRate ||
          existingRate.duty_rate !== row.normalized.dutyRate ||
          existingRate.vat_rate !== row.normalized.vatRate ||
          existingRate.surcharge_rate !== row.normalized.surchargeRate

        if (!hasRateChange) {
          duplicateRows += 1
          skippedRows += 1
          continue
        }

        if (existingRate && !request.forceApprove) {
          conflictRows += 1
          pendingReviewRows += 1

          const conflictPayload: ConflictPayload = {
            type: 'conflict-tariff-rate',
            incoming: row.normalized,
            existing: {
              id: existingRate.id,
              scheduleCode: existingRate.schedule_code || row.normalized.scheduleCode,
              dutyRate: existingRate.duty_rate,
              vatRate: existingRate.vat_rate,
              surchargeRate: existingRate.surcharge_rate,
              effectiveDate: existingRate.effective_date,
              endDate: existingRate.end_date,
            },
          }

          await run(
            `
              INSERT INTO extracted_rows_review
              (source_id, import_job_id, row_number, raw_payload, normalized_payload, confidence_score, review_status, review_notes)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            `,
            [
              sourceId,
              importJobId,
              row.rowNumber,
              JSON.stringify(row.raw),
              JSON.stringify(conflictPayload),
              row.normalized.confidenceScore,
              'CONFLICT_EXISTING_RATE|requires_decision: incoming and existing rates differ for active row',
            ]
          )
          continue
        }

        const applyResult = await applyTariffRateAndAudit({
          normalized: row.normalized,
          sourceId,
          importJobId,
          reason: `Source import (${row.normalized.scheduleCode})`,
        })

        if (applyResult.skippedAsDuplicate) {
          duplicateRows += 1
          skippedRows += 1
          continue
        }

        if (applyResult.hadConflict) {
          conflictRows += 1
        }

        importedRows += 1
      }

      const finalStatus: TariffImportSummary['status'] =
        errorRows > 0 ? 'completed_with_errors' : 'completed'

      await run('UPDATE tariff_sources SET imported_at = CURRENT_TIMESTAMP WHERE id = ?', [sourceId])
      await updateImportJobStatus(importJobId, finalStatus, importedRows, pendingReviewRows, errorRows)

      return {
        sourceId,
        importJobId,
        totalRows: preview.totalRows,
        importedRows,
        pendingReviewRows,
        errorRows,
        duplicateRows,
        conflictRows,
        skippedRows,
        status: finalStatus,
      }
    } catch (error) {
      await updateImportJobStatus(importJobId, 'failed', importedRows, pendingReviewRows, errorRows + 1, String(error))
      throw error
    }
  }

  async getImportJobs(limit: number = 20): Promise<Array<{
    id: number
    source_id: number
    status: string
    total_rows: number
    imported_rows: number
    pending_review_rows: number
    error_rows: number
    started_at: string
    completed_at: string | null
  }>> {
    return all(
      `
        SELECT id, source_id, status, total_rows, imported_rows, pending_review_rows, error_rows, started_at, completed_at
        FROM import_jobs
        ORDER BY started_at DESC
        LIMIT ?
      `,
      [limit]
    )
  }

  async getPendingReviewRows(importJobId: number): Promise<Array<{
    id: number
    source_id: number
    source_name: string
    source_type: string
    source_reference: string | null
    import_job_status: string
    row_number: number
    raw_payload: string
    normalized_payload: string | null
    confidence_score: number
    review_notes: string | null
    created_at: string
  }>> {
    return all(
      `
        SELECT
          rr.id,
          rr.source_id,
          ts.source_name,
          ts.source_type,
          ts.source_reference,
          ij.status AS import_job_status,
          rr.row_number,
          rr.raw_payload,
          rr.normalized_payload,
          rr.confidence_score,
          rr.review_notes,
          rr.created_at
        FROM extracted_rows_review rr
        JOIN tariff_sources ts ON ts.id = rr.source_id
        JOIN import_jobs ij ON ij.id = rr.import_job_id
        WHERE rr.import_job_id = ? AND rr.review_status = 'pending'
        ORDER BY row_number ASC
      `,
      [importJobId]
    )
  }

  async getReviewRowProvenance(rowId: number): Promise<{
    row: {
      id: number
      import_job_id: number
      source_id: number
      row_number: number
      raw_payload: string
      normalized_payload: string | null
      confidence_score: number
      review_status: string
      review_notes: string | null
      created_at: string
      reviewed_at: string | null
    }
    source: {
      id: number
      source_name: string
      source_type: string
      source_reference: string | null
      status: string
      fetched_at: string
      imported_at: string | null
    }
    importJob: {
      id: number
      status: string
      total_rows: number
      imported_rows: number
      pending_review_rows: number
      error_rows: number
      started_at: string
      completed_at: string | null
    }
    recentAudit: Array<{
      id: number
      hs_code: string
      old_duty_rate: number | null
      new_duty_rate: number | null
      old_vat_rate: number | null
      new_vat_rate: number | null
      old_surcharge_rate: number | null
      new_surcharge_rate: number | null
      reason: string | null
      changed_at: string
    }>
  }> {
    const row = await get<{
      id: number
      import_job_id: number
      source_id: number
      row_number: number
      raw_payload: string
      normalized_payload: string | null
      confidence_score: number
      review_status: string
      review_notes: string | null
      created_at: string
      reviewed_at: string | null
    }>(
      `
        SELECT id, import_job_id, source_id, row_number, raw_payload, normalized_payload, confidence_score,
               review_status, review_notes, created_at, reviewed_at
        FROM extracted_rows_review
        WHERE id = ?
      `,
      [rowId]
    )

    if (!row) {
      throw new Error(`Review row ${rowId} not found`)
    }

    const source = await get<{
      id: number
      source_name: string
      source_type: string
      source_reference: string | null
      status: string
      fetched_at: string
      imported_at: string | null
    }>(
      `
        SELECT id, source_name, source_type, source_reference, status, fetched_at, imported_at
        FROM tariff_sources
        WHERE id = ?
      `,
      [row.source_id]
    )

    const importJob = await get<{
      id: number
      status: string
      total_rows: number
      imported_rows: number
      pending_review_rows: number
      error_rows: number
      started_at: string
      completed_at: string | null
    }>(
      `
        SELECT id, status, total_rows, imported_rows, pending_review_rows, error_rows, started_at, completed_at
        FROM import_jobs
        WHERE id = ?
      `,
      [row.import_job_id]
    )

    let hsCode = ''
    if (row.normalized_payload) {
      try {
        const parsed = JSON.parse(row.normalized_payload) as Record<string, unknown>
        if (parsed.type === 'conflict-tariff-rate' && parsed.incoming && typeof parsed.incoming === 'object') {
          hsCode = String((parsed.incoming as Record<string, unknown>).hsCode || '')
        } else {
          hsCode = String(parsed.hsCode || '')
        }
      } catch {
        hsCode = ''
      }
    }

    const recentAudit = hsCode
      ? await all<{
          id: number
          hs_code: string
          old_duty_rate: number | null
          new_duty_rate: number | null
          old_vat_rate: number | null
          new_vat_rate: number | null
          old_surcharge_rate: number | null
          new_surcharge_rate: number | null
          reason: string | null
          changed_at: string
        }>(
          `
            SELECT id, hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate,
                   old_surcharge_rate, new_surcharge_rate, reason, changed_at
            FROM rate_change_audit
            WHERE hs_code = ?
            ORDER BY changed_at DESC
            LIMIT 10
          `,
          [hsCode]
        )
      : []

    if (!source || !importJob) {
      throw new Error(`Provenance links missing for review row ${rowId}`)
    }

    return {
      row,
      source,
      importJob,
      recentAudit,
    }
  }

  async approveReviewRow(importJobId: number, rowId: number, notes?: string): Promise<void> {
    const row = await get<{
      id: number
      source_id: number
      normalized_payload: string | null
      confidence_score: number
    }>(
      'SELECT id, source_id, normalized_payload, confidence_score FROM extracted_rows_review WHERE id = ? AND import_job_id = ?',
      [rowId, importJobId]
    )

    if (!row) {
      throw new Error(`Review row ${rowId} not found for job ${importJobId}`)
    }

    if (!row.normalized_payload) {
      throw new Error(`Review row ${rowId} has no normalized payload and cannot be approved`)
    }

    let normalized: {
      hsCode: string
      scheduleCode: string
      description: string
      category: string
      chapterCode?: string
      sectionCode?: string
      sectionName?: string
      metadataSource?: string
      dutyRate: number
      vatRate: number
      surchargeRate: number
      effectiveDate: string
      endDate: string | null
      notes: string
      confidenceScore: number
    }
    let conflictIncoming: NormalizedTariffRow | null = null

    try {
      const parsed = JSON.parse(row.normalized_payload) as Record<string, unknown>

      if (parsed && parsed.type === 'conflict-tariff-rate' && parsed.incoming && typeof parsed.incoming === 'object') {
        conflictIncoming = parsed.incoming as NormalizedTariffRow
        normalized = conflictIncoming
      } else {
        normalized = parsed as typeof normalized
      }
    } catch {
      throw new Error(`Review row ${rowId} has invalid normalized payload JSON`)
    }

    await applyTariffRateAndAudit({
      normalized,
      sourceId: row.source_id,
      importJobId,
      reason: conflictIncoming
        ? `Conflict review decision (use incoming ${normalized.scheduleCode})`
        : `Manual review approval (${normalized.scheduleCode})`,
    })

    await run(
      `UPDATE extracted_rows_review
       SET review_status = 'approved', review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [notes ?? null, rowId]
    )
  }

  async rejectReviewRow(importJobId: number, rowId: number, notes?: string): Promise<void> {
    const exists = await get<{ id: number; source_id: number; normalized_payload: string | null }>(
      'SELECT id, source_id, normalized_payload FROM extracted_rows_review WHERE id = ? AND import_job_id = ?',
      [rowId, importJobId]
    )

    if (!exists) {
      throw new Error(`Review row ${rowId} not found for job ${importJobId}`)
    }

    if (exists.normalized_payload) {
      try {
        const parsed = JSON.parse(exists.normalized_payload) as Record<string, unknown>
        if (parsed.type === 'conflict-tariff-rate' && parsed.existing && typeof parsed.existing === 'object' && parsed.incoming && typeof parsed.incoming === 'object') {
          const existing = parsed.existing as { dutyRate?: number; vatRate?: number; surchargeRate?: number }
          const incoming = parsed.incoming as { hsCode?: string; dutyRate?: number; vatRate?: number; surchargeRate?: number }

          await run(
            `
              INSERT INTO rate_change_audit
              (hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate, old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              incoming.hsCode || '',
              existing.dutyRate ?? null,
              incoming.dutyRate ?? null,
              existing.vatRate ?? null,
              incoming.vatRate ?? null,
              existing.surchargeRate ?? null,
              incoming.surchargeRate ?? null,
              'Conflict review decision (keep existing rate)',
              exists.source_id,
              importJobId,
            ]
          )
        }
      } catch {
        // Ignore JSON parse errors for audit fallback on reject.
      }
    }

    await run(
      `UPDATE extracted_rows_review
       SET review_status = 'rejected', review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [notes ?? null, rowId]
    )
  }

  async getRateChangeAudit(hsCode?: string, limit: number = 50, offset: number = 0): Promise<Array<{
    id: number
    hs_code: string
    old_duty_rate: number | null
    new_duty_rate: number | null
    old_vat_rate: number | null
    new_vat_rate: number | null
    old_surcharge_rate: number | null
    new_surcharge_rate: number | null
    reason: string | null
    source_id: number | null
    import_job_id: number | null
    changed_at: string
  }>> {
    if (hsCode) {
      return all(
        `SELECT id, hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate,
                old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id, changed_at
         FROM rate_change_audit
         WHERE hs_code = ?
         ORDER BY changed_at DESC
         LIMIT ? OFFSET ?`,
        [hsCode, limit, offset]
      )
    }

    return all(
      `SELECT id, hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate,
              old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id, changed_at
       FROM rate_change_audit
       ORDER BY changed_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    )
  }

  async getTariffSources(limit: number = 50): Promise<Array<{
    id: number
    source_name: string
    source_type: string
    source_reference: string | null
    status: string
    fetched_at: string
    imported_at: string | null
    notes: string | null
    created_at: string
  }>> {
    return all(
      `SELECT id, source_name, source_type, source_reference, status, fetched_at, imported_at, notes, created_at
       FROM tariff_sources
       ORDER BY fetched_at DESC
       LIMIT ?`,
      [limit]
    )
  }

  async getCatalogHealthMetrics(): Promise<{
    totalHsCodes: number
    hsCodesWithApprovedMfnRate: number
    mfnCoveragePercent: number
    pendingReviewRows: number
    latestFullSyncAt: string | null
    latestFullSyncStatus: string | null
    importFailureCountLast30d: number
    recommendedCutover: boolean
    cutoverCoverageThreshold: number
    stagedCutoverEnabled: boolean
  }> {
    const runtimeSettings = getRuntimeSettings()
    const totals = await get<{ total: number }>('SELECT COUNT(1) AS total FROM hs_codes')
    const covered = await get<{ total: number }>(
      `
        SELECT COUNT(DISTINCT hc.code) AS total
        FROM hs_codes hc
        JOIN tariff_rates tr ON tr.hs_code = hc.code
        WHERE COALESCE(tr.schedule_code, 'MFN') = 'MFN'
          AND (tr.import_status = 'approved' OR tr.import_status IS NULL)
      `
    )
    const pending = await get<{ total: number }>(
      `
        SELECT COUNT(1) AS total
        FROM extracted_rows_review
        WHERE review_status = 'pending'
      `
    )

    const latestFullSync = await get<{ imported_at: string | null; status: string | null }>(
      `
        SELECT ts.imported_at, ij.status
        FROM tariff_sources ts
        LEFT JOIN import_jobs ij ON ij.source_id = ts.id
        WHERE ts.source_type LIKE '%full-sync%'
        ORDER BY COALESCE(ts.imported_at, ts.fetched_at) DESC
        LIMIT 1
      `
    )

    const failures = await get<{ total: number }>(
      `
        SELECT COUNT(1) AS total
        FROM import_jobs
        WHERE status = 'failed'
          AND started_at >= datetime('now', '-30 day')
      `
    )

    const totalHsCodes = totals?.total || 0
    const hsCodesWithApprovedMfnRate = covered?.total || 0
    const mfnCoveragePercent = totalHsCodes > 0
      ? Math.round((hsCodesWithApprovedMfnRate / totalHsCodes) * 10000) / 100
      : 0

    const recommendedCutover =
      mfnCoveragePercent >= runtimeSettings.cutoverCoverageThreshold &&
      (pending?.total || 0) === 0 &&
      (failures?.total || 0) === 0 &&
      latestFullSync?.status === 'completed' &&
      runtimeSettings.stagedCutoverEnabled

    return {
      totalHsCodes,
      hsCodesWithApprovedMfnRate,
      mfnCoveragePercent,
      pendingReviewRows: pending?.total || 0,
      latestFullSyncAt: latestFullSync?.imported_at || null,
      latestFullSyncStatus: latestFullSync?.status || null,
      importFailureCountLast30d: failures?.total || 0,
      recommendedCutover,
      cutoverCoverageThreshold: runtimeSettings.cutoverCoverageThreshold,
      stagedCutoverEnabled: runtimeSettings.stagedCutoverEnabled,
    }
  }

  async hasSourceReference(sourceType: string, sourceReference: string): Promise<boolean> {
    if (!sourceReference.trim()) {
      return false
    }

    const row = await get<{ id: number }>(
      `SELECT id
       FROM tariff_sources
       WHERE source_type = ? AND source_reference = ?
       LIMIT 1`,
      [sourceType, sourceReference]
    )

    return Boolean(row)
  }

  async getCalculationHistory(limit: number = 50): Promise<Array<{
    id: number
    hs_code: string
    value: number
    currency: string
    duty_amount: number
    vat_amount: number
    total_landed_cost: number
    created_at: string
  }>> {
    return all(
      `SELECT id, hs_code, value, currency, duty_amount, vat_amount, total_landed_cost, created_at
       FROM calculation_history
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    )
  }

  async parseHtmlTables(htmlContent: string, sourceUrl: string): Promise<{
    rows: TariffImportRow[]
    confidence: number
  }> {
    const extractedRows = parseTariffHtml(inferTariffHtmlSource(sourceUrl), htmlContent).map((row) => ({
      ...row,
      notes: [row.notes, `Source URL: ${sourceUrl}`].filter(Boolean).join(' | '),
    }))

    return {
      rows: extractedRows,
      confidence: extractedRows.length > 0 ? 65 : 0,
    }
  }
}
