type ApiResponse<T> = Promise<{ success: boolean; data?: T; error?: string }>

type DutyResult = {
  rate: number
  amount: number
  surcharge: number
  notes?: string
}

type VATResult = {
  rate: number
  amount: number
  notes?: string
}

type HSCodeRow = {
  code: string
  description: string
  category: string
}

type TariffRateRow = {
  hs_code: string
  duty_rate: number
  vat_rate: number
  surcharge_rate: number
  effective_date: string
  end_date?: string | null
  notes?: string
}

type ComplianceRuleRow = {
  hs_code_range: string
  category: string
  required_documents: string
  restrictions: string
  special_conditions: string
}

type ShipmentRow = {
  hsCode: string
  value: number
  originCountry: string
  currency: string
}

type ImportPreviewRow = {
  rowNumber: number
  raw: Record<string, unknown>
  normalized?: Record<string, unknown>
  errors: string[]
}

const todayDate = new Date().toISOString().split('T')[0]

const hsCodes: HSCodeRow[] = [
  { code: '8471.30', description: 'Automatic data processing machines, portable', category: 'Electronics' },
  { code: '8517.62', description: 'Cellular telephones for mobile networks', category: 'Electronics' },
  { code: '6204.62', description: "Women's suits of synthetic fibers", category: 'Textiles' },
  { code: '6203.42', description: "Men's suits of synthetic fibers", category: 'Textiles' },
  { code: '8704.21', description: 'Trucks, gross vehicle weight not exceeding 5 tonnes', category: 'Vehicles' },
  { code: '0207.14', description: 'Chicken meat, frozen', category: 'Food' },
  { code: '0406.10', description: 'Fresh cheese (unripened)', category: 'Food' },
  { code: '8544.30', description: 'Insulated electric conductors', category: 'Electronics' },
  { code: '7326.90', description: 'Steel articles, miscellaneous', category: 'Steel' },
  { code: '4418.90', description: 'Wood articles, miscellaneous', category: 'Wood' },
]

const tariffRates: TariffRateRow[] = [
  { hs_code: '8471.30', duty_rate: 0.05, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8517.62', duty_rate: 0.03, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '6204.62', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '6203.42', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8704.21', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '0207.14', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '0406.10', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8544.30', duty_rate: 0.08, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '7326.90', duty_rate: 0.12, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '4418.90', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
]

const complianceRules: ComplianceRuleRow[] = [
  {
    hs_code_range: '8471.30',
    category: 'Electronics',
    required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
    restrictions: 'None',
    special_conditions: 'None',
  },
  {
    hs_code_range: '8517.62',
    category: 'Electronics',
    required_documents: 'Commercial Invoice, Bill of Lading, NTC Certification',
    restrictions: 'Must comply with Philippine radio regulations',
    special_conditions: 'NTC Type Approval Certificate Required',
  },
  {
    hs_code_range: '6204.62',
    category: 'Textiles',
    required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
    restrictions: 'Subject to Rules of Origin - must meet COO requirements',
    special_conditions: 'Possible safeguard duties may apply',
  },
  {
    hs_code_range: '0207.14',
    category: 'Food',
    required_documents: 'Commercial Invoice, Bill of Lading, Health Certificate, BOC Permit',
    restrictions: 'Requires Bureau of Animal Industry (BAI) clearance',
    special_conditions: 'Cold storage monitoring required during transit',
  },
]

const fallbackRates: Record<string, number> = {
  USD: 1,
  PHP: 56,
  EUR: 0.92,
  CNY: 7.24,
  SGD: 1.35,
  JPY: 149.5,
  GBP: 0.79,
  INR: 83.12,
}

const importJobs: Array<Record<string, unknown>> = []
const pendingReviewRows: Record<number, Array<Record<string, unknown>>> = {}

const normalizeHSCode = (value: string): string => {
  const normalizedValue = value.trim().toUpperCase()
  const compactValue = normalizedValue.replace(/\./g, '')

  const exactMatch = hsCodes.find((row) => row.code.toUpperCase() === normalizedValue)
  if (exactMatch) {
    return exactMatch.code
  }

  const compactMatch = hsCodes.find((row) => row.code.replace(/\./g, '').toUpperCase() === compactValue)
  if (compactMatch) {
    return compactMatch.code
  }

  return normalizedValue
}

const resolveKnownHSCode = (value: string): HSCodeRow | null => {
  const normalizedCode = normalizeHSCode(value)
  return hsCodes.find((row) => row.code === normalizedCode) || null
}

const findCurrentTariff = (hsCode: string): TariffRateRow | undefined => {
  const normalizedCode = normalizeHSCode(hsCode)
  return tariffRates
    .filter((row) => row.hs_code === normalizedCode)
    .sort((left, right) => right.effective_date.localeCompare(left.effective_date))[0]
}

const searchHSRows = (query: string): HSCodeRow[] => {
  const normalizedQuery = query.trim().toUpperCase()
  const compactQuery = normalizedQuery.replace(/\./g, '')
  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean)

  if (!normalizedQuery) {
    return []
  }

  return [...hsCodes]
    .filter((row) => {
      const normalizedCode = row.code.toUpperCase()
      const compactCode = normalizedCode.replace(/\./g, '')
      const normalizedDescription = row.description.toUpperCase()
      return (
        normalizedCode.includes(normalizedQuery) ||
        compactCode.includes(compactQuery) ||
        normalizedDescription.includes(normalizedQuery) ||
        queryTerms.every((term) => normalizedDescription.includes(term))
      )
    })
    .sort((left, right) => {
      const score = (row: HSCodeRow): number => {
        const normalizedCode = row.code.toUpperCase()
        const compactCode = normalizedCode.replace(/\./g, '')
        const normalizedDescription = row.description.toUpperCase()

        if (compactCode === compactQuery) return 0
        if (normalizedCode === normalizedQuery) return 1
        if (normalizedCode.startsWith(normalizedQuery)) return 2
        if (compactCode.startsWith(compactQuery)) return 3
        if (normalizedDescription.includes(normalizedQuery)) return 4
        return 5
      }

      return score(left) - score(right) || left.code.localeCompare(right.code)
    })
    .slice(0, 20)
}

const getRequirements = (hsCode: string, value: number): {
  requiredDocuments: string[]
  restrictions: string[]
  warnings: string[]
} => {
  const requiredDocuments: string[] = []
  const restrictions: string[] = []
  const warnings: string[] = []
  const normalizedCode = normalizeHSCode(hsCode)

  const rule = complianceRules.find((row) => row.hs_code_range === normalizedCode)
  if (rule) {
    requiredDocuments.push(...rule.required_documents.split(',').map((item) => item.trim()))
    restrictions.push(...rule.restrictions.split(',').map((item) => item.trim()))
    warnings.push(...rule.special_conditions.split(',').map((item) => item.trim()))
  }

  if (!requiredDocuments.includes('Commercial Invoice')) {
    requiredDocuments.push('Commercial Invoice')
  }
  if (!requiredDocuments.includes('Bill of Lading/Airway Bill')) {
    requiredDocuments.push('Bill of Lading/Airway Bill')
  }

  if (value > 10000) {
    requiredDocuments.push('Packing List')
    warnings.push('High value shipment - expect detailed inspection')
  }

  const category = hsCodes.find((row) => row.code === normalizedCode)?.category || 'General'
  if (category === 'Electronics') {
    requiredDocuments.push("Manufacturer's Specification Sheet")
  }
  if (category === 'Food') {
    requiredDocuments.push('Health Certificate')
    requiredDocuments.push('Certificate of Free Sale')
    restrictions.push('Subject to Bureau of Animal Industry (BAI) clearance')
  }
  if (category === 'Textiles') {
    restrictions.push('Subject to Rules of Origin compliance')
    warnings.push('Tariff rate may vary based on country of origin')
  }

  return {
    requiredDocuments: [...new Set(requiredDocuments.filter(Boolean))],
    restrictions: [...new Set(restrictions.filter((item) => item && item !== 'None'))],
    warnings: [...new Set(warnings.filter((item) => item && item !== 'None'))],
  }
}

const convertCurrencyAmount = (amount: number, fromCurrency: string, toCurrency: string) => {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()

  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: amount,
      targetCurrency: to,
      rate: 1,
      source: 'identity',
      timestamp: new Date().toISOString(),
    }
  }

  const fromRate = fallbackRates[from] || 1
  const toRate = fallbackRates[to] || 1
  const rate = toRate / fromRate

  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount: amount * rate,
    targetCurrency: to,
    rate,
    source: 'fallback',
    timestamp: new Date().toISOString(),
  }
}

const browserDownload = (content: string, fileName: string, contentType: string): string => {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return `Downloaded ${fileName} in browser`
}

const makeSuccess = <T>(data: T) => Promise.resolve({ success: true, data })
const makeError = (error: unknown) => Promise.resolve({ success: false, error: String(error) })
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const callApi = async <T>(path: string): ApiResponse<T> => {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        Accept: 'application/json',
      },
    })

    const payload = (await response.json()) as { success?: boolean; data?: T; error?: string }

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        error: payload.error || `Request failed with status ${response.status}`,
      }
    }

    return {
      success: true,
      data: payload.data as T,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const appApi = {
  initDB: (): ApiResponse<undefined> => makeSuccess(undefined),

  calculateDuty: async (payload: {
    value: number
    hsCode: string
    originCountry: string
  }): ApiResponse<DutyResult> => {
    try {
      const row = findCurrentTariff(payload.hsCode)
      const dutyRate = row?.duty_rate || 0
      const surchargeRate = row?.surcharge_rate || 0
      return makeSuccess({
        rate: dutyRate * 100,
        amount: payload.value * dutyRate,
        surcharge: payload.value * surchargeRate,
        notes: row?.notes || '',
      })
    } catch (error) {
      return makeError(error)
    }
  },

  calculateVAT: async (payload: { dutiableValue: number; hsCode: string }): ApiResponse<VATResult> => {
    try {
      const row = findCurrentTariff(payload.hsCode)
      const vatRate = row?.vat_rate || 0.12
      return makeSuccess({
        rate: vatRate * 100,
        amount: payload.dutiableValue * vatRate,
        notes: row?.notes || '',
      })
    } catch (error) {
      return makeError(error)
    }
  },

  searchHSCodes: async (query: string): ApiResponse<HSCodeRow[]> => makeSuccess(searchHSRows(query)),

  getTariffCatalog: async (payload: {
    query?: string
    category?: string
    limit?: number
  }) => {
    try {
      const searchTerm = payload?.query?.trim().toUpperCase() || ''
      const selectedCategory = payload?.category || 'All'
      const rows = tariffRates
        .map((rateRow) => {
          const hsCodeRow = hsCodes.find((row) => row.code === rateRow.hs_code)
          if (!hsCodeRow) {
            return null
          }

          return {
            hsCode: hsCodeRow.code,
            description: hsCodeRow.description,
            category: hsCodeRow.category,
            dutyRate: rateRow.duty_rate * 100,
            vatRate: rateRow.vat_rate * 100,
            surchargeRate: rateRow.surcharge_rate * 100,
            effectiveDate: rateRow.effective_date,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .filter((row) => {
          const compactSearchTerm = searchTerm.replace(/\./g, '')
          const compactRowCode = row.hsCode.toUpperCase().replace(/\./g, '')
          const matchesQuery =
            !searchTerm ||
            row.hsCode.toUpperCase().includes(searchTerm) ||
            compactRowCode.includes(compactSearchTerm) ||
            row.description.toUpperCase().includes(searchTerm)
          const matchesCategory = selectedCategory === 'All' || row.category === selectedCategory
          return matchesQuery && matchesCategory
        })
        .slice(0, payload?.limit || 200)

      return makeSuccess(rows)
    } catch (error) {
      return makeError(error)
    }
  },

  getTariffCategories: async (): ApiResponse<string[]> => {
    const categories = [...new Set(hsCodes.map((row) => row.category))].sort((left, right) => left.localeCompare(right))
    return makeSuccess(categories)
  },

  getComplianceRequirements: async (payload: {
    hsCode: string
    value: number
    destination: string
  }) => {
    try {
      return makeSuccess(getRequirements(payload.hsCode, payload.value))
    } catch (error) {
      return makeError(error)
    }
  },

  convertCurrency: async (payload: {
    amount: number
    fromCurrency: string
    toCurrency: string
  }) => makeSuccess(convertCurrencyAmount(payload.amount, payload.fromCurrency, payload.toCurrency)),

  batchCalculate: async (shipments: ShipmentRow[]) => {
    try {
      const results = []
      for (const shipment of shipments) {
        const shipmentCurrency = shipment.currency.toUpperCase()
        const converted = convertCurrencyAmount(shipment.value, shipmentCurrency, 'PHP')
        const valueInPhp = shipmentCurrency === 'PHP' ? shipment.value : converted.convertedAmount
        const tariffRow = findCurrentTariff(shipment.hsCode)
        const dutyAmount = valueInPhp * (tariffRow?.duty_rate || 0)
        const surchargeAmount = valueInPhp * (tariffRow?.surcharge_rate || 0)
        const dutiableValue = valueInPhp + dutyAmount + surchargeAmount
        const vatAmount = dutiableValue * (tariffRow?.vat_rate || 0.12)
        const convertFromPhp = (amount: number) => (shipmentCurrency === 'PHP' ? amount : amount / converted.rate)

        results.push({
          ...shipment,
          duty: {
            amount: convertFromPhp(dutyAmount),
            surcharge: convertFromPhp(surchargeAmount),
            rate: (tariffRow?.duty_rate || 0) * 100,
          },
          vat: {
            amount: convertFromPhp(vatAmount),
            rate: (tariffRow?.vat_rate || 0.12) * 100,
          },
          totalLandedCost: convertFromPhp(dutiableValue + vatAmount),
          fx: {
            applied: shipmentCurrency !== 'PHP',
            rateToPhp: converted.rate,
            inputCurrency: shipmentCurrency,
            baseCurrency: 'PHP',
          },
        })
      }

      return makeSuccess(results)
    } catch (error) {
      return makeError(error)
    }
  },

  previewTariffImport: async (payload: { csvText?: string; rows?: Record<string, unknown>[] }) => {
    try {
      const rows = payload.rows || []
      const previewRows: ImportPreviewRow[] = rows.map((row, index) => ({
        rowNumber: index + 1,
        raw: row,
        normalized: row,
        errors: [],
      }))
      return makeSuccess({
        totalRows: previewRows.length,
        validRows: previewRows.length,
        invalidRows: 0,
        rows: previewRows,
      })
    } catch (error) {
      return makeError(error)
    }
  },

  importTariffData: async (payload: Record<string, unknown>) => {
    const importJobId = importJobs.length + 1
    const job = {
      id: importJobId,
      source_id: importJobId,
      status: 'completed',
      total_rows: Array.isArray(payload.rows) ? payload.rows.length : 0,
      imported_rows: Array.isArray(payload.rows) ? payload.rows.length : 0,
      pending_review_rows: 0,
      error_rows: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }
    importJobs.unshift(job)
    pendingReviewRows[importJobId] = []
    return makeSuccess({
      sourceId: importJobId,
      importJobId,
      totalRows: job.total_rows,
      importedRows: job.imported_rows,
      pendingReviewRows: 0,
      errorRows: 0,
      status: 'completed',
    })
  },

  getImportJobs: async () => makeSuccess(importJobs),

  getPendingReviewRows: async (payload: { importJobId: number }) => makeSuccess(pendingReviewRows[payload.importJobId] || []),

  fetchWebsiteContent: async (payload: { url: string; query?: string }) => {
    const params = new URLSearchParams({ url: payload.url })
    if (payload.query?.trim()) {
      params.set('query', payload.query.trim())
    }

    return callApi(`/api/fetch-website-content?${params.toString()}`)
  },

  fetchRegulatoryUpdates: async (payload: { source: 'boc' | 'bir' | 'tariff-commission'; query?: string }) => {
    const params = new URLSearchParams({ source: payload.source })
    if (payload.query?.trim()) {
      params.set('query', payload.query.trim())
    }

    return callApi(`/api/fetch-regulatory-updates?${params.toString()}`)
  },

  generateCalculationDocument: async (payload: { formData: Record<string, unknown>; results: Record<string, unknown> }) => {
    try {
      const fileName = `customs-calculation-${todayDate}.html`
      const content = `<!doctype html><html><head><meta charset="utf-8"><title>Customs Calculation Report</title></head><body><h1>Customs Calculation Report</h1><pre>${JSON.stringify(payload, null, 2)}</pre></body></html>`
      const path = browserDownload(content, fileName, 'text/html;charset=utf-8;')
      return makeSuccess({ path })
    } catch (error) {
      return makeError(error)
    }
  },
}

export type AppApi = typeof appApi

export const hsCodeLookup = {
  normalizeHSCode,
  resolveKnownHSCode,
  searchHSRows,
}