import sqlite3 from 'sqlite3'
import { getDatabase } from '../db/database'

export interface TariffImportRow {
  hsCode: string
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
    description: string
    category: string
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
  status: 'completed' | 'completed_with_errors' | 'failed'
}

const DEFAULT_THRESHOLD = 85

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

const normalizeRate = (value: string | number | undefined, fallback: number): number => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'number') {
    return value > 1 ? value / 100 : value
  }

  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    return fallback
  }

  const numeric = Number(trimmed.replace('%', '').replace('percent', '').trim())
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return numeric > 1 ? numeric / 100 : numeric
}

const normalizeHsCode = (hsCode: string): string => hsCode.trim().toUpperCase()

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

const validateRow = (row: TariffImportRow, rowNumber: number): TariffImportPreviewRow => {
  const errors: string[] = []

  const hsCode = normalizeHsCode(row.hsCode || '')
  if (!hsCode) {
    errors.push('HS code is required')
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
        description: (row.description || 'Imported from source').trim() || 'Imported from source',
        category: (row.category || 'Imported').trim() || 'Imported',
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

export class TariffDataIngestionService {
  parseCsvText(input: string): TariffImportRow[] {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      return []
    }

    const firstRowParts = lines[0].split(',').map((part) => part.trim().toLowerCase())
    const hasHeader =
      firstRowParts.includes('hscode') ||
      firstRowParts.includes('hs_code') ||
      firstRowParts.includes('dutyrate') ||
      firstRowParts.includes('duty_rate')

    const dataLines = hasHeader ? lines.slice(1) : lines

    return dataLines.map((line) => {
      const parts = line.split(',').map((part) => part.trim())

      return {
        hsCode: parts[0] || '',
        description: parts[1] || undefined,
        category: parts[2] || undefined,
        dutyRate: parts[3] || '',
        vatRate: parts[4] || undefined,
        surchargeRate: parts[5] || undefined,
        effectiveDate: parts[6] || undefined,
        endDate: parts[7] || undefined,
        notes: parts[8] || undefined,
        confidenceScore: parts[9] ? Number(parts[9]) : undefined,
      }
    })
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

  async importRows(request: TariffImportRequest): Promise<TariffImportSummary> {
    const threshold = request.autoApproveThreshold ?? DEFAULT_THRESHOLD
    const preview = this.previewRows(request.rows)

    const sourceInsert = await run(
      `
        INSERT INTO tariff_sources (source_name, source_type, source_reference, status, fetched_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `,
      [request.sourceName, request.sourceType || 'manual', request.sourceReference || null]
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
              `Below auto-approval threshold (${threshold})`,
            ]
          )
          continue
        }

        await run(
          'INSERT OR IGNORE INTO hs_codes (code, description, category) VALUES (?, ?, ?)',
          [row.normalized.hsCode, row.normalized.description, row.normalized.category]
        )

        const existingRate = await get<{
          id: number
          duty_rate: number
          vat_rate: number
          surcharge_rate: number
          effective_date: string
          end_date: string | null
        }>(
          `
            SELECT id, duty_rate, vat_rate, surcharge_rate, effective_date, end_date
            FROM tariff_rates
            WHERE hs_code = ?
              AND (end_date IS NULL OR end_date > date('now'))
            ORDER BY effective_date DESC
            LIMIT 1
          `,
          [row.normalized.hsCode]
        )

        const hasRateChange =
          !existingRate ||
          existingRate.duty_rate !== row.normalized.dutyRate ||
          existingRate.vat_rate !== row.normalized.vatRate ||
          existingRate.surcharge_rate !== row.normalized.surchargeRate

        if (!hasRateChange) {
          continue
        }

        if (existingRate) {
          await run('UPDATE tariff_rates SET end_date = ?, last_modified_at = CURRENT_TIMESTAMP WHERE id = ?', [
            row.normalized.effectiveDate,
            existingRate.id,
          ])
        }

        await run(
          `
            INSERT INTO tariff_rates
            (hs_code, duty_rate, vat_rate, surcharge_rate, effective_date, end_date, notes, source_id, confidence_score, import_status, last_modified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
          `,
          [
            row.normalized.hsCode,
            row.normalized.dutyRate,
            row.normalized.vatRate,
            row.normalized.surchargeRate,
            row.normalized.effectiveDate,
            row.normalized.endDate,
            row.normalized.notes,
            sourceId,
            row.normalized.confidenceScore,
          ]
        )

        await run(
          `
            INSERT INTO rate_change_audit
            (hs_code, old_duty_rate, new_duty_rate, old_vat_rate, new_vat_rate, old_surcharge_rate, new_surcharge_rate, reason, source_id, import_job_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            row.normalized.hsCode,
            existingRate?.duty_rate ?? null,
            row.normalized.dutyRate,
            existingRate?.vat_rate ?? null,
            row.normalized.vatRate,
            existingRate?.surcharge_rate ?? null,
            row.normalized.surchargeRate,
            'Source import',
            sourceId,
            importJobId,
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
    row_number: number
    raw_payload: string
    normalized_payload: string | null
    confidence_score: number
    review_notes: string | null
    created_at: string
  }>> {
    return all(
      `
        SELECT id, row_number, raw_payload, normalized_payload, confidence_score, review_notes, created_at
        FROM extracted_rows_review
        WHERE import_job_id = ? AND review_status = 'pending'
        ORDER BY row_number ASC
      `,
      [importJobId]
    )
  }
}
