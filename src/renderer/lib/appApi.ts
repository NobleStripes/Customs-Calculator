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

type CurrencyConversionResult = {
  originalAmount: number
  originalCurrency: string
  convertedAmount: number
  targetCurrency: string
  rate: number
  source: 'cache' | 'live' | 'fallback' | 'identity'
  timestamp: string
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
  freight: number
  insurance: number
  originCountry: string
  currency: string
  containerSize: 'none' | '20ft' | '40ft'
  arrastreWharfage: number
  doxStampOthers: number
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
  { code: '8421.23', description: 'Oil or petrol-filters for internal combustion engines', category: 'Vehicles' },
  { code: '8511.10', description: 'Spark plugs for spark-ignition or compression-ignition engines', category: 'Vehicles' },
  { code: '8708.30', description: 'Brakes and servo-brakes; parts thereof, for motor vehicles', category: 'Vehicles' },
  { code: '8708.80', description: 'Suspension shock absorbers for motor vehicles', category: 'Vehicles' },
  { code: '8708.99', description: 'Other parts and accessories of motor vehicles', category: 'Vehicles' },
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
  { hs_code: '8421.23', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8511.10', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.30', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.80', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.99', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
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
    hs_code_range: '8421.23',
    category: 'Vehicles',
    required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
    restrictions: 'None',
    special_conditions: 'Verify compatibility with declared vehicle model when applicable',
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

const CUSTOMS_DOCUMENTARY_STAMP_PHP = 100
const BIR_DOCUMENTARY_STAMP_TAX_PHP = 30
const VAT_RATE = 0.12

const getImportProcessingChargePhp = (dutiableValuePhp: number): number => {
  if (dutiableValuePhp <= 25000) return 250
  if (dutiableValuePhp <= 50000) return 500
  if (dutiableValuePhp <= 250000) return 750
  if (dutiableValuePhp <= 500000) return 1000
  if (dutiableValuePhp <= 750000) return 1500
  return 2000
}

const getContainerSecurityFeeUsd = (containerSize: ShipmentRow['containerSize']): number => {
  if (containerSize === '40ft') return 10
  if (containerSize === '20ft') return 5
  return 0
}

const getBrokerageFeePhp = (taxableValuePhp: number): number =>
  ((taxableValuePhp - 200000) * 0.00125) + 5300

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

const browserDownload = (content: string, fileName: string, contentType: string): string => {
  const blob = new Blob([content], { type: contentType })
  return downloadBlob(blob, fileName)
}

const downloadBlob = (blob: Blob, fileName: string): string => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return `Downloaded ${fileName} in browser`
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const buildDocumentMarkup = (payload: { formData: Record<string, unknown>; results: Record<string, any> }) => {
  const formData = payload.formData
  const results = payload.results
  const requiredDocuments = results.compliance?.requiredDocuments || results.compliance?.requirements || []
  const restrictions = results.compliance?.restrictions || []
  const warnings = results.compliance?.warnings || []

  const listMarkup = (title: string, items: string[]) => `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Customs Calculation Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
        h1 { margin-bottom: 8px; }
        h2 { margin-top: 24px; margin-bottom: 8px; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
        th { background: #f3f4f6; }
        .meta { color: #6b7280; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>Philippines Customs Calculation Report</h1>
      <p class="meta">Generated: ${escapeHtml(new Date().toISOString())}</p>
      <section>
        <h2>Shipment Details</h2>
        <table>
          <tr><th>HS Code</th><td>${escapeHtml(formData.hsCode)}</td></tr>
          <tr><th>FOB Value</th><td>${escapeHtml(formData.value)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Freight</th><td>${escapeHtml(formData.freight || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Insurance</th><td>${escapeHtml(formData.insurance || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Origin Country</th><td>${escapeHtml(formData.originCountry || 'N/A')}</td></tr>
          <tr><th>Destination Port</th><td>${escapeHtml(formData.destinationPort)}</td></tr>
          <tr><th>Declaration Type</th><td>${escapeHtml(formData.declarationType || 'consumption')}</td></tr>
          <tr><th>Container Size</th><td>${escapeHtml(formData.containerSize || 'none')}</td></tr>
          <tr><th>Arrastre / Wharfage</th><td>${escapeHtml(formData.arrastreWharfage || 0)} PHP</td></tr>
          <tr><th>Dox Stamp & Others</th><td>${escapeHtml(formData.doxStampOthers || 0)} PHP</td></tr>
        </table>
      </section>
      <section>
        <h2>Calculation Summary</h2>
        <table>
          <tr><th>Taxable Value PH</th><td>${escapeHtml(results.costBase?.taxableValue || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Brokerage Fee</th><td>${escapeHtml(results.costBase?.brokerageFee || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Arrastre / Wharfage</th><td>${escapeHtml(results.costBase?.arrastreWharfage || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Dox Stamp & Others</th><td>${escapeHtml(results.costBase?.doxStampOthers || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>VAT Base / TLC</th><td>${escapeHtml(results.costBase?.vatBase || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>CUD</th><td>${escapeHtml(results.duty?.amount || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>VAT</th><td>${escapeHtml(results.vat?.amount || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Total Item Tax</th><td>${escapeHtml(results.breakdown?.itemTaxes?.totalItemTax || ((results.duty?.amount || 0) + (results.vat?.amount || 0)))} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>TC</th><td>${escapeHtml(results.breakdown?.globalFees?.transitCharge || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>IPC</th><td>${escapeHtml(results.breakdown?.globalFees?.ipc || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>CSF</th><td>${escapeHtml(results.breakdown?.globalFees?.csf || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>CDS</th><td>${escapeHtml(results.breakdown?.globalFees?.cds || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>IRS</th><td>${escapeHtml(results.breakdown?.globalFees?.irs || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Total Global Tax</th><td>${escapeHtml(results.breakdown?.globalFees?.totalGlobalTax || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Total Tax and Fees</th><td>${escapeHtml(results.breakdown?.totalTaxAndFees || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Duty Rate</th><td>${escapeHtml(results.duty?.rate || 0)}%</td></tr>
          <tr><th>Duty Amount</th><td>${escapeHtml(results.duty?.amount || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Surcharge</th><td>${escapeHtml(results.duty?.surcharge || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>VAT Rate</th><td>${escapeHtml(results.vat?.rate || 0)}%</td></tr>
          <tr><th>VAT Amount</th><td>${escapeHtml(results.vat?.amount || 0)} ${escapeHtml(formData.currency)}</td></tr>
          <tr><th>Total Landed Cost</th><td>${escapeHtml(results.totalLandedCost)} ${escapeHtml(formData.currency)}</td></tr>
        </table>
      </section>
      ${requiredDocuments.length ? listMarkup('Required Documents', requiredDocuments) : ''}
      ${restrictions.length ? listMarkup('Restrictions', restrictions) : ''}
      ${warnings.length ? listMarkup('Warnings', warnings) : ''}
    </body>
  </html>`
}

const makeSuccess = <T>(data: T) => Promise.resolve({ success: true, data })
const makeError = (error: unknown) => Promise.resolve({ success: false, error: String(error) })
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const callApi = async <T>(path: string, init?: RequestInit): ApiResponse<T> => {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: init?.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
      body: init?.body,
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

const postApi = async <T>(path: string, payload: unknown): ApiResponse<T> =>
  callApi<T>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

const convertCurrencyLocally = (amount: number, fromCurrency: string, toCurrency: string): CurrencyConversionResult => {
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

const convertCurrencyRemote = async (amount: number, fromCurrency: string, toCurrency: string) => {
  const params = new URLSearchParams({
    amount: String(amount),
    from: fromCurrency.trim().toUpperCase(),
    to: toCurrency.trim().toUpperCase(),
  })

  return callApi<CurrencyConversionResult>(`/api/currency/convert?${params.toString()}`)
}

const getCurrencyConversion = async (amount: number, fromCurrency: string, toCurrency: string): ApiResponse<CurrencyConversionResult> => {
  const remoteResult = await convertCurrencyRemote(amount, fromCurrency, toCurrency)
  if (remoteResult.success && remoteResult.data) {
    return remoteResult
  }

  return {
    success: true,
    data: convertCurrencyLocally(amount, fromCurrency, toCurrency),
    error: remoteResult.error,
  }
}

const resolveHSCodeRemote = async (code: string): ApiResponse<HSCodeRow | null> => {
  const params = new URLSearchParams({ code: code.trim().toUpperCase() })
  return callApi<HSCodeRow | null>(`/api/hs-codes/resolve?${params.toString()}`)
}

const searchHSCodesRemote = async (query: string): ApiResponse<HSCodeRow[]> => {
  const params = new URLSearchParams({ query: query.trim() })
  return callApi<HSCodeRow[]>(`/api/hs-codes/search?${params.toString()}`)
}

const getTariffCatalogRemote = async (payload: { query?: string; category?: string; limit?: number }) => {
  const params = new URLSearchParams()

  if (payload.query?.trim()) {
    params.set('query', payload.query.trim())
  }

  if (payload.category?.trim()) {
    params.set('category', payload.category.trim())
  }

  if (typeof payload.limit === 'number') {
    params.set('limit', String(payload.limit))
  }

  return callApi<Array<{
    hsCode: string
    description: string
    category: string
    dutyRate: number
    vatRate: number
    surchargeRate: number
    effectiveDate: string
  }>>(`/api/tariff-catalog?${params.toString()}`)
}

const getTariffCategoriesRemote = async (): ApiResponse<string[]> => callApi<string[]>('/api/tariff-categories')

const calculateDutyRemote = async (payload: {
  value: number
  hsCode: string
  originCountry: string
}) => postApi<DutyResult>('/api/calculate/duty', payload)

const calculateVatRemote = async (payload: { dutiableValue: number; hsCode: string }) =>
  postApi<VATResult>('/api/calculate/vat', payload)

const getComplianceRequirementsRemote = async (payload: {
  hsCode: string
  value: number
  destination: string
}) => postApi<{ requiredDocuments: string[]; restrictions: string[]; warnings: string[] }>('/api/compliance/requirements', payload)

const batchCalculateRemote = async (shipments: ShipmentRow[]) =>
  postApi<Array<Record<string, unknown>>>('/api/calculate/batch', { shipments })

const previewHSCatalogImportRemote = async (payload: { csvText?: string; contentBase64?: string; fileName?: string; rows?: Record<string, unknown>[] }) =>
  postApi('/api/import/hs-codes/preview', payload)

const importHSCatalogRemote = async (payload: Record<string, unknown>) => postApi('/api/import/hs-codes', payload)

const getImportJobsRemote = async () => callApi<Array<Record<string, unknown>>>('/api/import-jobs')

const getPendingReviewRowsRemote = async (payload: { importJobId: number }) =>
  callApi<Array<Record<string, unknown>>>(`/api/import-jobs/${payload.importJobId}/pending-review`)

export const appApi = {
  initDB: (): ApiResponse<undefined> => makeSuccess(undefined),

  calculateDuty: async (payload: {
    value: number
    hsCode: string
    originCountry: string
  }): ApiResponse<DutyResult> => {
    const remoteResult = await calculateDutyRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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
    const remoteResult = await calculateVatRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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

  resolveHSCode: async (code: string): ApiResponse<HSCodeRow | null> => {
    const remoteResult = await resolveHSCodeRemote(code)
    if (remoteResult.success) {
      return remoteResult
    }

    return makeSuccess(resolveKnownHSCode(code))
  },

  searchHSCodes: async (query: string): ApiResponse<HSCodeRow[]> => {
    const remoteResult = await searchHSCodesRemote(query)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess(searchHSRows(query))
  },

  getTariffCatalog: async (payload: {
    query?: string
    category?: string
    limit?: number
  }) => {
    const remoteResult = await getTariffCatalogRemote(payload || {})
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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
    const remoteResult = await getTariffCategoriesRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    const categories = [...new Set(hsCodes.map((row) => row.category))].sort((left, right) => left.localeCompare(right))
    return makeSuccess(categories)
  },

  getComplianceRequirements: async (payload: {
    hsCode: string
    value: number
    destination: string
  }) => {
    const remoteResult = await getComplianceRequirementsRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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
  }) => getCurrencyConversion(payload.amount, payload.fromCurrency, payload.toCurrency),

  batchCalculate: async (shipments: ShipmentRow[]) => {
    const remoteResult = await batchCalculateRemote(shipments)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const results = []
      for (const shipment of shipments) {
        const shipmentCurrency = shipment.currency.toUpperCase()
        const taxableInputAmount = shipment.value + shipment.freight + shipment.insurance
        const conversionResult = await getCurrencyConversion(taxableInputAmount, shipmentCurrency, 'PHP')
        if (!conversionResult.success || !conversionResult.data) {
          throw new Error(conversionResult.error || 'Batch currency conversion failed')
        }

        const converted = conversionResult.data
        const valueInPhp = shipmentCurrency === 'PHP' ? taxableInputAmount : converted.convertedAmount
        const tariffRow = findCurrentTariff(shipment.hsCode)
        const dutyAmount = valueInPhp * (tariffRow?.duty_rate || 0)
        const surchargeAmount = valueInPhp * (tariffRow?.surcharge_rate || 0)
        const brokerageFeePhp = getBrokerageFeePhp(valueInPhp)
        const csfUsd = getContainerSecurityFeeUsd(shipment.containerSize)
        let csfPhp = 0

        if (csfUsd > 0) {
          const csfConversion = await getCurrencyConversion(csfUsd, 'USD', 'PHP')
          if (!csfConversion.success || !csfConversion.data) {
            throw new Error(csfConversion.error || 'CSF conversion failed')
          }

          csfPhp = csfConversion.data.convertedAmount
        }

        const transitChargePhp = 0
        const ipcPhp = getImportProcessingChargePhp(valueInPhp)
        const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
        const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
        const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp
        const vatBasePhp = valueInPhp + dutyAmount + surchargeAmount + brokerageFeePhp + shipment.arrastreWharfage + shipment.doxStampOthers + totalGlobalFeesPhp
        const vatAmount = vatBasePhp * VAT_RATE
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
            rate: VAT_RATE * 100,
          },
          costBase: {
            taxableValue: convertFromPhp(valueInPhp),
            brokerageFee: convertFromPhp(brokerageFeePhp),
            arrastreWharfage: convertFromPhp(shipment.arrastreWharfage),
            doxStampOthers: convertFromPhp(shipment.doxStampOthers),
            vatBase: convertFromPhp(vatBasePhp),
          },
          breakdown: {
            itemTaxes: {
              cud: convertFromPhp(dutyAmount),
              vat: convertFromPhp(vatAmount),
              totalItemTax: convertFromPhp(dutyAmount + vatAmount),
            },
            globalFees: {
              transitCharge: convertFromPhp(transitChargePhp),
              ipc: convertFromPhp(ipcPhp),
              csf: convertFromPhp(csfPhp),
              cds: convertFromPhp(cdsPhp),
              irs: convertFromPhp(irsPhp),
              totalGlobalTax: convertFromPhp(totalGlobalFeesPhp),
            },
            totalTaxAndFees: convertFromPhp(dutyAmount + vatAmount + totalGlobalFeesPhp),
          },
          totalLandedCost: convertFromPhp(vatBasePhp + vatAmount),
          fx: {
            applied: shipmentCurrency !== 'PHP',
            rateToPhp: converted.rate,
            inputCurrency: shipmentCurrency,
            baseCurrency: 'PHP',
            source: converted.source,
            timestamp: converted.timestamp,
          },
        })
      }

      return makeSuccess(results)
    } catch (error) {
      return makeError(error)
    }
  },

  previewTariffImport: async (payload: { csvText?: string; rows?: Record<string, unknown>[] }) => {
    const remoteResult = await previewHSCatalogImportRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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
    const remoteResult = await importHSCatalogRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

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

  getImportJobs: async () => {
    const remoteResult = await getImportJobsRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess(importJobs)
  },

  getPendingReviewRows: async (payload: { importJobId: number }) => {
    const remoteResult = await getPendingReviewRowsRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess(pendingReviewRows[payload.importJobId] || [])
  },

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

  generateCalculationDocument: async (payload: { formData: Record<string, unknown>; results: Record<string, any>; format: 'pdf' | 'word' | 'excel' }) => {
    try {
      const baseFileName = `customs-calculation-${todayDate}`

      if (payload.format === 'pdf') {
        const response = await fetch(`${apiBase}/api/export/calculation-document/pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/pdf',
          },
          body: JSON.stringify({
            formData: payload.formData,
            results: payload.results,
          }),
        })

        if (!response.ok) {
          throw new Error(`Unable to generate PDF export (${response.status})`)
        }

        const blob = await response.blob()
        const path = downloadBlob(blob, `${baseFileName}.pdf`)
        return makeSuccess({ path })
      }

      const content = buildDocumentMarkup(payload)
      const fileExtension = payload.format === 'word' ? 'doc' : 'xls'
      const mimeType = payload.format === 'word'
        ? 'application/msword;charset=utf-8;'
        : 'application/vnd.ms-excel;charset=utf-8;'
      const path = browserDownload(content, `${baseFileName}.${fileExtension}`, mimeType)
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