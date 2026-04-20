import { getDatabase } from '../db/database'

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
  description: string
  category: string
  dutyRate: number
  vatRate: number
  surchargeRate: number
  effectiveDate: string
}

export class TariffCalculator {
  private db = getDatabase()

  private normalizeHSCode(value: string): string {
    return value.trim().toUpperCase()
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

      this.db.get(sql, [normalizedHSCode, compactHSCode, normalizedHSCode], (err, row: any) => {
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
    fields: string
  ): Promise<any | null> {
    return new Promise((resolve, reject) => {
      this.resolveCanonicalHSCode(hsCode)
        .then((normalizedHSCode) => {
          const sql = `
            SELECT ${fields}
            FROM tariff_rates
            WHERE hs_code = ?
              AND effective_date <= date('now')
              AND (end_date IS NULL OR end_date > date('now'))
              AND (import_status = 'approved' OR import_status IS NULL)
            ORDER BY effective_date DESC
            LIMIT 1
          `

          this.db.get(sql, [normalizedHSCode], (err, row: any) => {
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

  /**
   * Calculate import duty for a product
   */
  calculateDuty(value: number, hsCode: string, _originCountry: string): Promise<DutyResult> {
    return new Promise(async (resolve, reject) => {
      try {
        const row = await this.getCurrentTariffRateRow(hsCode, 'duty_rate, surcharge_rate, notes')

        const dutyRate = row?.duty_rate || 0
        const surchargeRate = row?.surcharge_rate || 0

        const dutyAmount = value * dutyRate
        const surcharge = value * surchargeRate

        resolve({
          rate: dutyRate * 100,
          amount: dutyAmount,
          surcharge,
          notes: row?.notes || '',
        })
      } catch (err: any) {
        console.error('Error calculating duty:', err)
        reject(new Error(`Failed to calculate duty: ${err.message}`))
      }
    })
  }

  /**
   * Calculate VAT on dutiable value
   */
  calculateVAT(dutiableValue: number, hsCode: string): Promise<VATResult> {
    return new Promise(async (resolve, reject) => {
      try {
        const row = await this.getCurrentTariffRateRow(hsCode, 'vat_rate, notes')
        const vatRate = row?.vat_rate || 0.12
        const vatAmount = dutiableValue * vatRate

        resolve({
          rate: vatRate * 100,
          amount: vatAmount,
          notes: row?.notes || '',
        })
      } catch (err: any) {
        console.error('Error calculating VAT:', err)
        reject(new Error(`Failed to calculate VAT: ${err.message}`))
      }
    })
  }

  /**
   * Search for HS codes by code or description
   */
  searchHSCodes(query: string): Promise<Array<{ code: string; description: string; category: string }>> {
    return new Promise((resolve, reject) => {
      const normalizedQuery = query.trim().toUpperCase()
      const compactQuery = normalizedQuery.replace(/\./g, '')

      if (!normalizedQuery) {
        resolve([])
        return
      }

      const searchQuery = `%${normalizedQuery}%`
      const compactSearchQuery = `%${compactQuery}%`
      const startsWithQuery = `${normalizedQuery}%`
      const compactStartsWithQuery = `${compactQuery}%`

      const sql = `
        SELECT
          code,
          description,
          category,
          CASE
            WHEN REPLACE(code, '.', '') = ? THEN 0
            WHEN code = ? THEN 1
            WHEN code LIKE ? THEN 2
            WHEN REPLACE(code, '.', '') LIKE ? THEN 3
            WHEN UPPER(description) LIKE ? THEN 4
            ELSE 5
          END AS rank
        FROM hs_codes
        WHERE UPPER(code) LIKE ?
          OR REPLACE(UPPER(code), '.', '') LIKE ?
          OR UPPER(description) LIKE ?
        ORDER BY rank, code
        LIMIT 20
      `

      this.db.all(
        sql,
        [compactQuery, normalizedQuery, startsWithQuery, compactStartsWithQuery, searchQuery, searchQuery, compactSearchQuery, searchQuery],
        (err, rows: any) => {
        if (err) {
          console.error('Error searching HS codes:', err)
          reject(new Error(`Failed to search HS codes: ${err.message}`))
          return
        }

        resolve(
          rows?.map((r: any) => ({
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

      this.db.get(sql, [normalizedCode, compactCode, normalizedCode], (err, row: any) => {
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
   * Get all tariff rates for a product category
   */
  getTariffsByCategory(category: string): Promise<Array<{ hs_code: string; duty_rate: number; vat_rate: number }>> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT DISTINCT tr.hs_code, tr.duty_rate, tr.vat_rate
        FROM tariff_rates tr
        JOIN hs_codes hc ON tr.hs_code = hc.code
        WHERE hc.category = ? AND tr.effective_date <= date('now')
        AND (tr.end_date IS NULL OR tr.end_date > date('now'))
        ORDER BY tr.hs_code
      `

      this.db.all(sql, [category], (err, rows: any) => {
        if (err) {
          console.error('Error fetching tariffs by category:', err)
          reject(new Error(`Failed to fetch tariffs: ${err.message}`))
          return
        }

        resolve(
          rows?.map((r: any) => ({
            hs_code: r.hs_code,
            duty_rate: r.duty_rate,
            vat_rate: r.vat_rate,
          })) || []
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
    limit: number = 200
  ): Promise<TariffCatalogRow[]> {
    return new Promise((resolve, reject) => {
      const searchQuery = `%${query.trim().toUpperCase()}%`

      let sql = `
        SELECT
          hc.code AS hs_code,
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
            AND tr2.effective_date <= date('now')
            AND (tr2.end_date IS NULL OR tr2.end_date > date('now'))
            AND (tr2.import_status = 'approved' OR tr2.import_status IS NULL)
          ORDER BY tr2.effective_date DESC, COALESCE(tr2.last_modified_at, tr2.created_at) DESC, tr2.id DESC
          LIMIT 1
        )
        WHERE (hc.code LIKE ? OR hc.description LIKE ?)
      `

      const params: Array<string | number> = [searchQuery, searchQuery]

      if (category && category !== 'All') {
        sql += ' AND hc.category = ?'
        params.push(category)
      }

      sql += ' ORDER BY hc.category, hc.code LIMIT ?'
      params.push(limit)

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching tariff catalog:', err)
          reject(new Error(`Failed to fetch tariff catalog: ${err.message}`))
          return
        }

        resolve(
          rows?.map((row) => ({
            hsCode: row.hs_code,
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

      this.db.all(sql, (err, rows: any[]) => {
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
   * Calculate total landed cost
   */
  async calculateTotalLandedCost(
    value: number,
    hsCode: string,
    originCountry: string
  ): Promise<{
    value: number
    duty: number
    vat: number
    total: number
  }> {
    try {
      const dutyResult = await this.calculateDuty(value, hsCode, originCountry)
      const dutiableValue = value + dutyResult.amount + dutyResult.surcharge
      const vatResult = await this.calculateVAT(dutiableValue, hsCode)

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
    productValue: number
    currency: string
    originCountry: string
    dutyAmount: number
    vatAmount: number
    totalLandedCost: number
  }): void {
    const sql = `
      INSERT INTO calculation_history
      (hs_code, product_value, currency, origin_country, duty_amount, vat_amount, total_landed_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `

    this.db.run(
      sql,
      [
        data.hsCode,
        data.productValue,
        data.currency,
        data.originCountry,
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

      this.db.all(sql, [limit], (err, rows: any) => {
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

