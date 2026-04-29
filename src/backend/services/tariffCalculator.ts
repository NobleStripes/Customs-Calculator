// Generalized tax model types
export interface TaxComponentResult {
  taxType: string // e.g. 'DUTY', 'VAT', 'EXCISE', etc.
  rate: number
  rateType: string // 'percentage', 'fixed', etc.
  amount: number
  notes?: string
}

export interface MultiTaxCalculationResult {
  components: TaxComponentResult[]
  total: number
  breakdown: Record<string, number> // e.g. { duty: 100, vat: 120, excise: 0 }
}

// Multi-schedule tax calculation: returns results for all available schedules or a specific one
export async function calculateAllTaxes(
  value: number,
  hsCode: string,
  scheduleCode?: string,
  originCountry?: string,
  declarationType?: string
): Promise<{ [schedule: string]: MultiTaxCalculationResult }> {
  const calc = new TariffCalculator()
  const db = calc['db']
  // If a schedule is specified, only calculate for that schedule
  let schedules: string[] = []
  if (scheduleCode) {
    schedules = [scheduleCode.trim().toUpperCase()]
  } else {
    // Query all active schedules
    schedules = await new Promise<string[]>((resolve, reject) => {
      db.all('SELECT code FROM tariff_schedules WHERE is_active = 1', [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows.map((r: any) => r.code))
      })
    })
  }
  const results: { [schedule: string]: MultiTaxCalculationResult } = {}
  for (const sched of schedules) {
    const duty = await calc.calculateDuty(value, hsCode, originCountry || '', sched)
    const vat = await calc.calculateVAT(value, hsCode, sched)
    const components: TaxComponentResult[] = [
      { taxType: 'DUTY', rate: duty.rate, rateType: 'percentage', amount: duty.amount, notes: duty.notes },
      { taxType: 'VAT', rate: vat.rate, rateType: 'percentage', amount: vat.amount, notes: vat.notes },
    ]
    results[sched] = {
      components,
      total: components.reduce((sum, c) => sum + c.amount, 0),
      breakdown: { duty: duty.amount, vat: vat.amount },
    }
  }
  return results
}
import { getDatabase } from '../db/database'
import { normalizeExactHsCode } from '../../shared/hsLookupQuery'

export interface DutyResult {
  rate: number
  amount: number
  surcharge: number
  notes?: string
}

export interface VATResult {
  rate: number
  amount: number
  notes?: string
}

export interface TariffCatalogRow {
  hsCode: string
  scheduleCode: string
  description: string
  category: string
  dutyRate: number
  vatRate: number
  surchargeRate: number
  effectiveDate: string
}

export interface TariffHistoryRow {
  hsCode: string
  scheduleCode: string
  description: string
  category: string
  dutyRate: number
  vatRate: number
  surchargeRate: number
  effectiveDate: string
  endDate: string | null
  importStatus: string | null
}

export interface TariffScheduleOption {
  code: string
  displayName: string
}

type CanonicalHsCodeRow = {
  code: string
}

type NotesRateRow = {
  notes?: string
}

type DutyRateRow = NotesRateRow & {
  duty_rate?: number
  surcharge_rate?: number
}

type VatRateRow = NotesRateRow & {
  vat_rate?: number
}

type HSCodeLookupRow = {
  code: string
  description: string
  category: string
}

type TariffCatalogDbRow = {
  hs_code: string
  schedule_code: string
  description: string
  category: string
  duty_rate: number
  vat_rate: number
  surcharge_rate: number
  effective_date: string
}

type TariffHistoryDbRow = TariffCatalogDbRow & {
  end_date: string | null
  import_status: string | null
}

type TariffCategoryRow = {
  category: string
}

type TariffScheduleDbRow = {
  code: string
  display_name: string
}

type CalculationHistoryRow = {
  id: number
  hs_code: string
  product_value: number
  duty_amount: number
  vat_amount: number
  created_at: string
}

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class TariffCalculator {
  private db = getDatabase()

  private normalizeHSCode(value: string): string {
    return normalizeExactHsCode(value) || value.trim().toUpperCase()
  }

  private resolveCanonicalHSCode(hsCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const normalizedHSCode = this.normalizeHSCode(hsCode)
      const compactHSCode = normalizedHSCode.replace(/\./g, '')
      const sql = `
        SELECT code
        FROM hs_codes
        WHERE UPPER(code) = ?
          OR REPLACE(UPPER(code), '.', '') = ?
        ORDER BY CASE WHEN UPPER(code) = ? THEN 0 ELSE 1 END
        LIMIT 1
      `

      this.db.get(sql, [normalizedHSCode, compactHSCode, normalizedHSCode], (err, row: CanonicalHsCodeRow | undefined) => {
        if (err) {
          reject(err)
          return
        }

        resolve(row?.code || normalizedHSCode)
      })
    })
  }

  private getCurrentTariffRateRow(
    hsCode: string,
    fields: string,
    scheduleCode: string = 'MFN'
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve, reject) => {
      this.resolveCanonicalHSCode(hsCode)
        .then((normalizedHSCode) => {
          const normalizedScheduleCode = scheduleCode.trim().toUpperCase() || 'MFN'
          const sql = `
            SELECT ${fields}
            FROM tariff_rates
            WHERE hs_code = ?
              AND COALESCE(schedule_code, 'MFN') = ?
              AND effective_date <= date('now')
              AND (end_date IS NULL OR end_date > date('now'))
              AND (import_status = 'approved' OR import_status IS NULL)
            ORDER BY effective_date DESC
            LIMIT 1
          `

          this.db.get(sql, [normalizedHSCode, normalizedScheduleCode], (err, row: Record<string, unknown> | undefined) => {
            if (err) {
              reject(err)
              return
            }

            resolve(row || null)
          })
        })
        .catch(reject)
    })
  }

  private async requireCurrentTariffRateRow(
    hsCode: string,
    fields: string,
    scheduleCode: string = 'MFN'
  ): Promise<Record<string, unknown>> {
    const row = await this.getCurrentTariffRateRow(hsCode, fields, scheduleCode)
    if (row) {
      return row
    }

    const normalizedScheduleCode = scheduleCode.trim().toUpperCase() || 'MFN'
    throw new Error(`No approved tariff rate found for HS code ${hsCode} under schedule ${normalizedScheduleCode}`)
  }

  /**
   * Calculate import duty for a product
   */
  async calculateDuty(value: number, hsCode: string, _originCountry: string, scheduleCode: string = 'MFN'): Promise<DutyResult> {
    try {
      const row = await this.requireCurrentTariffRateRow(hsCode, 'duty_rate, surcharge_rate, notes', scheduleCode) as DutyRateRow

      const dutyRate = row?.duty_rate || 0
      const surchargeRate = row?.surcharge_rate || 0

      return {
        rate: dutyRate * 100,
        amount: value * dutyRate,
        surcharge: value * surchargeRate,
        notes: row?.notes || '',
      }
    } catch (error: unknown) {
      console.error('Error calculating duty:', error)
      throw new Error(`Failed to calculate duty: ${getErrorMessage(error)}`)
    }
  }

  /**
   * Calculate VAT on dutiable value
   */
  async calculateVAT(dutiableValue: number, hsCode: string, scheduleCode: string = 'MFN'): Promise<VATResult> {
    try {
      const row = await this.requireCurrentTariffRateRow(hsCode, 'vat_rate, notes', scheduleCode) as VatRateRow
      const vatRate = row?.vat_rate || 0.12

      return {
        rate: vatRate * 100,
        amount: dutiableValue * vatRate,
        notes: row?.notes || '',
      }
    } catch (error: unknown) {
      console.error('Error calculating VAT:', error)
      throw new Error(`Failed to calculate VAT: ${getErrorMessage(error)}`)
    }
  }

  /**
   * Search for HS codes by code or description
   */
  searchHSCodes(
    query: string,
    options?: { limit?: number }
  ): Promise<Array<{ code: string; description: string; category: string }>> {
    return new Promise((resolve, reject) => {
      const normalizedQuery = query.trim().toUpperCase()
      const compactQuery = normalizedQuery.replace(/\./g, '')
      const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean)
      const limit = Math.max(5, Math.min(100, Math.floor(options?.limit || 20)))

      if (!normalizedQuery) {
        resolve([])
        return
      }

      const searchQuery = `%${normalizedQuery}%`
      const compactSearchQuery = `%${compactQuery}%`
      const startsWithQuery = `${normalizedQuery}%`
      const compactStartsWithQuery = `${compactQuery}%`
      const descriptionTermClause = queryTerms.length > 0
        ? queryTerms.map(() => 'UPPER(description) LIKE ?').join(' AND ')
        : '0'
      const descriptionTermParams = queryTerms.map((term) => `%${term}%`)

      const sql = `
        SELECT
          code,
          description,
          category,
          CASE
            WHEN REPLACE(UPPER(code), '.', '') = ? THEN 0
            WHEN UPPER(code) = ? THEN 1
            WHEN UPPER(code) LIKE ? THEN 2
            WHEN REPLACE(UPPER(code), '.', '') LIKE ? THEN 3
            WHEN UPPER(description) LIKE ? THEN 4
            WHEN ${descriptionTermClause} THEN 5
            ELSE 6
          END AS rank
        FROM hs_codes
        WHERE UPPER(code) LIKE ?
          OR REPLACE(UPPER(code), '.', '') LIKE ?
          OR UPPER(description) LIKE ?
          OR ${descriptionTermClause}
        ORDER BY rank, LENGTH(code), code, description
        LIMIT ?
      `

      const sqlParams = [
        compactQuery,
        normalizedQuery,
        startsWithQuery,
        compactStartsWithQuery,
        searchQuery,
        ...descriptionTermParams,
        searchQuery,
        compactSearchQuery,
        searchQuery,
        ...descriptionTermParams,
        limit,
      ]

      this.db.all(
        sql,
        sqlParams,
        (err, rows: HSCodeLookupRow[]) => {
        if (err) {
          console.error('Error searching HS codes:', err)
          reject(new Error(`Failed to search HS codes: ${err.message}`))
          return
        }

        resolve(
          rows?.map((r) => ({
            code: r.code,
            description: r.description,
            category: r.category,
          })) || []
        )
      }
      )
    })
  }

  /**
   * Get HS code by exact code
   */
  getHSCodeDetails(code: string): Promise<{ code: string; description: string; category: string } | null> {
    return new Promise((resolve, reject) => {
      const normalizedCode = this.normalizeHSCode(code)
      const compactCode = normalizedCode.replace(/\./g, '')
      const sql = `
        SELECT code, description, category
        FROM hs_codes
        WHERE UPPER(code) = ? OR REPLACE(UPPER(code), '.', '') = ?
        ORDER BY CASE WHEN UPPER(code) = ? THEN 0 ELSE 1 END
        LIMIT 1
      `

      this.db.get(sql, [normalizedCode, compactCode, normalizedCode], (err, row: HSCodeLookupRow | undefined) => {
        if (err) {
          console.error('Error fetching HS code details:', err)
          reject(new Error(`Failed to fetch HS code details: ${err.message}`))
          return
        }

        resolve(
          row
            ? {
                code: row.code,
                description: row.description,
                category: row.category,
              }
            : null
        )
      })
    })
  }

  /**
   * Get tariff catalog rows for browser view
   */
  getTariffCatalog(
    query: string = '',
    category: string = 'All',
    scheduleCode: string = 'MFN',
    limit: number = 200
  ): Promise<TariffCatalogRow[]> {
    return new Promise((resolve, reject) => {
      const searchQuery = `%${query.trim().toUpperCase()}%`
      const normalizedScheduleCode = scheduleCode.trim().toUpperCase() || 'MFN'

      let sql = `
        SELECT
          hc.code AS hs_code,
          COALESCE(tr.schedule_code, 'MFN') AS schedule_code,
          hc.description,
          hc.category,
          tr.duty_rate,
          tr.vat_rate,
          tr.surcharge_rate,
          tr.effective_date
        FROM hs_codes hc
        JOIN tariff_rates tr ON tr.id = (
          SELECT tr2.id
          FROM tariff_rates tr2
          WHERE tr2.hs_code = hc.code
            AND COALESCE(tr2.schedule_code, 'MFN') = ?
            AND tr2.effective_date <= date('now')
            AND (tr2.end_date IS NULL OR tr2.end_date > date('now'))
            AND (tr2.import_status = 'approved' OR tr2.import_status IS NULL)
          ORDER BY tr2.effective_date DESC, COALESCE(tr2.last_modified_at, tr2.created_at) DESC, tr2.id DESC
          LIMIT 1
        )
        WHERE (hc.code LIKE ? OR hc.description LIKE ?)
      `

      const params: Array<string | number> = [normalizedScheduleCode, searchQuery, searchQuery]

      if (category && category !== 'All') {
        sql += ' AND hc.category = ?'
        params.push(category)
      }

      sql += ' ORDER BY hc.category, hc.code LIMIT ?'
      params.push(limit)

      this.db.all(sql, params, (err, rows: TariffCatalogDbRow[]) => {
        if (err) {
          console.error('Error fetching tariff catalog:', err)
          reject(new Error(`Failed to fetch tariff catalog: ${err.message}`))
          return
        }

        resolve(
          rows?.map((row) => ({
            hsCode: row.hs_code,
            scheduleCode: row.schedule_code,
            description: row.description,
            category: row.category,
            dutyRate: (row.duty_rate || 0) * 100,
            vatRate: (row.vat_rate || 0) * 100,
            surchargeRate: (row.surcharge_rate || 0) * 100,
            effectiveDate: row.effective_date,
          })) || []
        )
      })
    })
  }

  /**
   * Get available tariff categories
   */
  getTariffCategories(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT DISTINCT category FROM hs_codes ORDER BY category'

      this.db.all(sql, (err, rows: TariffCategoryRow[]) => {
        if (err) {
          console.error('Error fetching tariff categories:', err)
          reject(new Error(`Failed to fetch categories: ${err.message}`))
          return
        }

        resolve(rows?.map((row) => row.category) || [])
      })
    })
  }

  /**
   * Get historical tariff rate rows (includes expired/superseded entries)
   */
  getTariffHistory(
    query: string = '',
    category: string = 'All',
    scheduleCode: string = 'MFN',
    limit: number = 300
  ): Promise<TariffHistoryRow[]> {
    return new Promise((resolve, reject) => {
      const searchQuery = `%${query.trim().toUpperCase()}%`
      const normalizedScheduleCode = scheduleCode.trim().toUpperCase() || 'MFN'

      let sql = `
        SELECT
          hc.code AS hs_code,
          COALESCE(tr.schedule_code, 'MFN') AS schedule_code,
          hc.description,
          hc.category,
          tr.duty_rate,
          tr.vat_rate,
          tr.surcharge_rate,
          tr.effective_date,
          tr.end_date,
          tr.import_status
        FROM hs_codes hc
        JOIN tariff_rates tr ON tr.hs_code = hc.code
        WHERE COALESCE(tr.schedule_code, 'MFN') = ?
          AND (hc.code LIKE ? OR hc.description LIKE ?)
      `

      const params: Array<string | number> = [normalizedScheduleCode, searchQuery, searchQuery]

      if (category && category !== 'All') {
        sql += ' AND hc.category = ?'
        params.push(category)
      }

      sql += `
        ORDER BY
          CASE WHEN tr.end_date IS NULL THEN 0 ELSE 1 END,
          tr.effective_date DESC,
          COALESCE(tr.last_modified_at, tr.created_at) DESC,
          hc.code ASC
        LIMIT ?
      `
      params.push(limit)

      this.db.all(sql, params, (err, rows: TariffHistoryDbRow[]) => {
        if (err) {
          console.error('Error fetching tariff history:', err)
          reject(new Error(`Failed to fetch tariff history: ${err.message}`))
          return
        }

        resolve(
          rows?.map((row) => ({
            hsCode: row.hs_code,
            scheduleCode: row.schedule_code,
            description: row.description,
            category: row.category,
            dutyRate: (row.duty_rate || 0) * 100,
            vatRate: (row.vat_rate || 0) * 100,
            surchargeRate: (row.surcharge_rate || 0) * 100,
            effectiveDate: row.effective_date,
            endDate: row.end_date,
            importStatus: row.import_status,
          })) || []
        )
      })
    })
  }

  getTariffSchedules(): Promise<TariffScheduleOption[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT code, display_name
        FROM tariff_schedules
        WHERE is_active = 1
        ORDER BY code
      `

      this.db.all(sql, (err, rows: TariffScheduleDbRow[]) => {
        if (err) {
          console.error('Error fetching tariff schedules:', err)
          reject(new Error(`Failed to fetch tariff schedules: ${err.message}`))
          return
        }

        resolve(rows?.map((row) => ({ code: row.code, displayName: row.display_name })) || [])
      })
    })
  }

  /**
   * Calculate total landed cost
   */
  async calculateTotalLandedCost(
    value: number,
    hsCode: string,
    originCountry: string,
    scheduleCode: string = 'MFN'
  ): Promise<{
    value: number
    duty: number
    vat: number
    total: number
  }> {
    try {
      const dutyResult = await this.calculateDuty(value, hsCode, originCountry, scheduleCode)
      const dutiableValue = value + dutyResult.amount + dutyResult.surcharge
      const vatResult = await this.calculateVAT(dutiableValue, hsCode, scheduleCode)

      return {
        value,
        duty: dutyResult.amount + dutyResult.surcharge,
        vat: vatResult.amount,
        total: dutiableValue + vatResult.amount,
      }
    } catch (error) {
      console.error('Error calculating total landed cost:', error)
      throw new Error(`Failed to calculate total landed cost: ${String(error)}`)
    }
  }

  /**
   * Save calculation to history
   */
  saveCalculationHistory(data: {
    hsCode: string
    value: number
    currency: string
    dutyAmount: number
    vatAmount: number
    totalLandedCost: number
  }): void {
    const sql = `
      INSERT INTO calculation_history
      (hs_code, value, currency, duty_amount, vat_amount, total_landed_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `

    this.db.run(
      sql,
      [
        data.hsCode,
        data.value,
        data.currency,
        data.dutyAmount,
        data.vatAmount,
        data.totalLandedCost,
      ],
      (err) => {
        if (err) {
          console.error('Error saving calculation history:', err)
        }
      }
    )
  }

  /**
   * Get calculation history
   */
  getCalculationHistory(limit: number = 100): Promise<
    Array<{
      id: number
      hs_code: string
      product_value: number
      duty_amount: number
      vat_amount: number
      created_at: string
    }>
  > {
    return new Promise((resolve, _reject) => {
      const sql = `
        SELECT id, hs_code, product_value, duty_amount, vat_amount, created_at
        FROM calculation_history
        ORDER BY created_at DESC
        LIMIT ?
      `

      this.db.all(sql, [limit], (err, rows: CalculationHistoryRow[]) => {
        if (err) {
          console.error('Error fetching calculation history:', err)
          resolve([])
          return
        }

        resolve(rows || [])
      })
    })
  }
}
