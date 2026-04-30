import {
  FALLBACK_CONFIDENCE_SCORE,
  LOCAL_CATALOG_CONFIDENCE_SCORE,
  isCodeLikeQuery,
  normalizeExactHsCode,
} from '../../shared/hsLookupQuery'

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
  confidence?: number
  sourceType?: 'local-catalog' | 'local-fallback' | 'official-site' | 'official-site-cache'
  sourceLabel?: string
  sourceUrl?: string
  matchedBy?: 'code' | 'description' | 'mixed'
  officialDutyRate?: number
  officialVatRate?: number
  officialScheduleCode?: string
  authorityRank?: number
  authorityLabel?: string
}

type LiveHSLookupResponse = {
  query: string
  sourceUrl: string
  status: 'live' | 'cache' | 'fallback'
  fetchedAt: string
  cacheExpiresAt: string
  fallbackUsed: boolean
  message?: string
  results: HSCodeRow[]
}

type TariffRateRow = {
  hs_code: string
  schedule_code: string
  duty_rate: number
  vat_rate: number
  surcharge_rate: number
  effective_date: string
  end_date?: string | null
  notes?: string
}

type TariffScheduleOption = {
  code: string
  displayName: string
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
  scheduleCode?: string
  value: number
  freight: number
  insurance: number
  originCountry: string
  destinationPort?: string
  currency: string
  declarationType: 'consumption' | 'warehousing' | 'transit'
  containerSize: 'none' | '20ft' | '40ft'
  arrastreWharfage: number
  doxStampOthers: number
  /** Excise tax category (auto-detected from HS code if omitted) */
  exciseCategory?: string
  /** Quantity in exciseUnit for excise tax calculation */
  exciseQuantity?: number
  /** Unit of measure for excise quantity */
  exciseUnit?: string
  /** Net Retail Price or manufacturer's wholesale price in input currency (for ad valorem excise) */
  exciseNrp?: number
  /** Sugar type for sweetened beverages ('sucrose_glucose' | 'hfcs' | 'other') */
  sweetenedBeverageSugarType?: string
  /** Product type for petroleum excise */
  petroleumProductType?: string
}

type ExciseTaxBreakdown = {
  amount: number
  adValorem: number
  specific: number
  category: string
  basis: string
  notes: string
}

/** CMTA import classification category */
export type ImportType = 'free' | 'regulated' | 'restricted' | 'prohibited'

export type ImportClassificationResult = {
  importType: ImportType
  /** Regulatory agency acronyms whose prior permit is required before BOC release */
  agencies: string[]
  /** Full names parallel to `agencies` */
  agencyFullNames: string[]
  /** Human-readable explanation */
  notes: string
  isStrategicTradeGood: boolean
  strategicTradeNotes?: string
  isVatExempt: boolean
  vatExemptBasis?: string
  /** True when a non-MFN FTA schedule is selected — CoO required to claim preference */
  requiresCertificateOfOrigin: boolean
  certificateOfOriginForm?: string
  warnings: string[]
}

type BatchResultRow = ShipmentRow & {
  scheduleCode: string
  deMinimisExempt: boolean
  deMinimisReason?: string
  entryType: 'de_minimis' | 'informal' | 'formal'
  insuranceBenchmarkApplied: boolean
  importClassification: ImportClassificationResult
  duty: { amount: number; surcharge: number; rate: number; notes?: string }
  exciseTax: ExciseTaxBreakdown
  vat: { rate: number; amount: number }
  costBase: {
    taxableValue: number; brokerageFee: number; arrastreWharfage: number; doxStampOthers: number; vatBase: number
  }
  breakdown: {
    itemTaxes: { cud: number; excise: number; vat: number; totalItemTax: number }
    globalFees: { transitCharge: number; ipc: number; csf: number; cds: number; irs: number; lrf: number; totalGlobalTax: number }
    totalTaxAndFees: number
  }
  landedCostSubtotal: number
  totalLandedCost: number
  calculationCurrency: 'PHP'
  fx: { applied: boolean; rateToPhp: number; inputCurrency: string; baseCurrency: 'PHP'; source?: string; timestamp?: string }
}

type ImportPreviewRow = {
  rowNumber: number
  raw: Record<string, unknown>
  normalized?: Record<string, unknown>
  errors: string[]
}

type CalculationDocumentFormData = {
  hsCode?: string
  scheduleCode?: string
  value?: number
  freight?: number
  insurance?: number
  originCountry?: string
  destinationPort?: string
  currency?: string
  containerSize?: string
  arrastreWharfage?: number
  doxStampOthers?: number
  declarationType?: string
}

type CalculationDocumentResults = {
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
    requirements?: string[]
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
      totalItemTax?: number
    }
    globalFees?: {
      transitCharge?: number
      ipc?: number
      csf?: number
      cds?: number
      irs?: number
      lrf?: number
      totalGlobalTax?: number
    }
    totalTaxAndFees?: number
  }
  exciseTax?: {
    amount?: number
    adValorem?: number
    specific?: number
    category?: string
    basis?: string
    notes?: string
  }
  landedCostSubtotal?: number
  deMinimisExempt?: boolean
  entryType?: 'de_minimis' | 'informal' | 'formal'
  insuranceBenchmarkApplied?: boolean
  totalLandedCost?: number
  calculationCurrency?: string
}

type TariffImportSummary = {
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

type RuntimeSettings = {
  defaultScheduleCode: string
  defaultOriginCountry: string
  autoFetcherEnabled: boolean
  fxCacheTtlHours: number
  calculatorMode: 'estimate'
  catalogMode: 'seed-fallback' | 'official-catalog-required'
  stagedCutoverEnabled: boolean
  cutoverCoverageThreshold: number
  fullSyncIdempotencyGuardEnabled: boolean
  fxPreferBocRate: boolean
}

type RuntimeStatus = {
  settings: RuntimeSettings
  latestSource: Record<string, unknown> | null
  autoFetcherLastRun: string | null
  health?: {
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
  }
}

type PendingReviewRow = {
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
}

export type ReviewRowProvenance = {
  row: Record<string, unknown>
  source: Record<string, unknown>
  importJob: Record<string, unknown>
  recentAudit: Array<Record<string, unknown>>
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
  { hs_code: '8471.30', schedule_code: 'MFN', duty_rate: 0.05, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8517.62', schedule_code: 'MFN', duty_rate: 0.03, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '6204.62', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '6203.42', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8704.21', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8421.23', schedule_code: 'MFN', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8511.10', schedule_code: 'MFN', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.30', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.80', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8708.99', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '0207.14', schedule_code: 'MFN', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '0406.10', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '8544.30', schedule_code: 'MFN', duty_rate: 0.08, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '7326.90', schedule_code: 'MFN', duty_rate: 0.12, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
  { hs_code: '4418.90', schedule_code: 'MFN', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0, effective_date: todayDate },
]

const tariffScheduleOptions: TariffScheduleOption[] = [
  { code: 'MFN', displayName: 'Most-Favored-Nation' },
  { code: 'AANZFTA', displayName: 'ASEAN-Australia-New Zealand Free Trade Agreement' },
  { code: 'ACFTA', displayName: 'ASEAN-China Free Trade Agreement' },
  { code: 'AHKFTA', displayName: 'ASEAN-Hong Kong, China Free Trade Agreement' },
  { code: 'AIFTA', displayName: 'ASEAN-India Free Trade Agreement' },
  { code: 'AJCEPA', displayName: 'ASEAN-Japan Comprehensive Economic Partnership Agreement' },
  { code: 'AKFTA', displayName: 'ASEAN-Korea Free Trade Agreement' },
  { code: 'ATIGA', displayName: 'ASEAN Trade in Goods Agreement' },
  { code: 'PH-EFTA FTA (CHE/LIE)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Switzerland/Liechtenstein)' },
  { code: 'PH-EFTA FTA (ISL)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Iceland)' },
  { code: 'PH-EFTA FTA (NOR)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Norway)' },
  { code: 'PH-KR FTA', displayName: 'Philippines-Korea Free Trade Agreement' },
  { code: 'PJEPA', displayName: 'Philippines-Japan Economic Partnership Agreement' },
  { code: 'RCEP', displayName: 'Regional Comprehensive Economic Partnership Agreement' },
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
const TRANSIT_CHARGE_PHP = 1000

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

const getBrokerageFeePhp = (taxableValuePhp: number): number => {
  // Tiered schedule based on BOC CMO 11-2014 brokerage fee schedule
  if (taxableValuePhp <= 50000) return 1000
  if (taxableValuePhp <= 75000) return 1500
  if (taxableValuePhp <= 100000) return 2000
  if (taxableValuePhp <= 150000) return 2500
  if (taxableValuePhp <= 200000) return 3000
  if (taxableValuePhp <= 250000) return 3500
  if (taxableValuePhp <= 300000) return 4000
  if (taxableValuePhp <= 400000) return 4500
  if (taxableValuePhp <= 500000) return 5000
  if (taxableValuePhp <= 750000) return 5500
  if (taxableValuePhp <= 1000000) return 6000
  if (taxableValuePhp <= 1500000) return 7000
  if (taxableValuePhp <= 2000000) return 8000
  if (taxableValuePhp <= 5000000) return 9000
  return 10000
}

const importJobs: Array<Record<string, unknown>> = []
const pendingReviewRows: Record<number, Array<Record<string, unknown>>> = {}

const normalizeScheduleCode = (value?: string): string => value?.trim().toUpperCase() || 'MFN'

const normalizeDestinationPort = (value?: string): string => {
  const normalizedValue = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  return ({
    MANILA: 'MNL',
    MNL: 'MNL',
    CEBU: 'CEB',
    CEB: 'CEB',
    DAVAO: 'DVO',
    DVO: 'DVO',
    ILOILO: 'ILO',
    ILO: 'ILO',
    SUBIC: 'SUB',
    SUB: 'SUB',
  } as Record<string, string>)[normalizedValue] || normalizedValue || 'MNL'
}

const normalizeHSCode = (value: string): string => {
  const normalizedValue = normalizeExactHsCode(value) || value.trim().toUpperCase()
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

const findCurrentTariff = (hsCode: string, scheduleCode: string = 'MFN'): TariffRateRow | undefined => {
  const normalizedCode = normalizeHSCode(hsCode)
  const normalizedScheduleCode = normalizeScheduleCode(scheduleCode)
  return tariffRates
    .filter((row) => row.hs_code === normalizedCode && normalizeScheduleCode(row.schedule_code) === normalizedScheduleCode)
    .sort((left, right) => right.effective_date.localeCompare(left.effective_date))[0]
}

const requireCurrentTariff = (hsCode: string, scheduleCode: string = 'MFN'): TariffRateRow => {
  const row = findCurrentTariff(hsCode, scheduleCode)
  if (row) {
    return row
  }

  throw new Error(`No approved tariff rate found for HS code ${hsCode} under schedule ${normalizeScheduleCode(scheduleCode)}`)
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

const createLocalLookupRows = (
  rows: HSCodeRow[],
  sourceType: HSCodeRow['sourceType'],
  sourceLabel: string,
  query: string
): HSCodeRow[] => {
  const fallbackConfidenceScore =
    sourceType === 'local-fallback'
      ? FALLBACK_CONFIDENCE_SCORE
      : LOCAL_CATALOG_CONFIDENCE_SCORE

  return rows.map((row) => ({
    ...row,
    sourceType,
    sourceLabel,
    sourceUrl: '',
    confidence: row.confidence ?? fallbackConfidenceScore,
    matchedBy: isCodeLikeQuery(query) ? 'code' : 'description',
  }))
}

const wrapLocalLiveLookupFallback = (
  query: string,
  rows: HSCodeRow[],
  message: string,
  sourceType: HSCodeRow['sourceType']
): LiveHSLookupResponse => ({
  query: query.trim(),
  sourceUrl: '',
  status: 'fallback',
  fetchedAt: new Date().toISOString(),
  cacheExpiresAt: new Date().toISOString(),
  fallbackUsed: true,
  message,
  results: createLocalLookupRows(
    rows,
    sourceType,
    sourceType === 'local-fallback' ? 'Local browser fallback catalog' : 'Approved local tariff catalog',
    query
  ),
})

const findExactHsMatch = (rows: HSCodeRow[], code: string): HSCodeRow | null => {
  const normalizedCode = normalizeHSCode(code)
  const compactCode = normalizedCode.replace(/\./g, '')

  const normalizedMatch = rows.find((row) => normalizeHSCode(row.code) === normalizedCode)
  if (normalizedMatch) {
    return normalizedMatch
  }

  return rows.find((row) => normalizeHSCode(row.code).replace(/\./g, '') === compactCode) || null
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

const buildDocumentMarkup = (payload: { formData: CalculationDocumentFormData; results: CalculationDocumentResults }) => {
  const formData = payload.formData
  const results = payload.results
  const calculationCurrency = results.calculationCurrency || 'PHP'
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
          <tr><th>Tariff Schedule</th><td>${escapeHtml(results.tariff?.scheduleCode || formData.scheduleCode || 'MFN')}</td></tr>
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
          <tr><th>Taxable Value PH</th><td>${escapeHtml(results.costBase?.taxableValue || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Brokerage Fee</th><td>${escapeHtml(results.costBase?.brokerageFee || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Arrastre / Wharfage</th><td>${escapeHtml(results.costBase?.arrastreWharfage || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Dox Stamp & Others</th><td>${escapeHtml(results.costBase?.doxStampOthers || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>VAT Base / TLC</th><td>${escapeHtml(results.costBase?.vatBase || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>CUD</th><td>${escapeHtml(results.duty?.amount || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>VAT</th><td>${escapeHtml(results.vat?.amount || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Total Item Tax</th><td>${escapeHtml(results.breakdown?.itemTaxes?.totalItemTax || ((results.duty?.amount || 0) + (results.vat?.amount || 0)))} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>TC</th><td>${escapeHtml(results.breakdown?.globalFees?.transitCharge || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>IPC</th><td>${escapeHtml(results.breakdown?.globalFees?.ipc || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>CSF</th><td>${escapeHtml(results.breakdown?.globalFees?.csf || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>CDS</th><td>${escapeHtml(results.breakdown?.globalFees?.cds || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>IRS</th><td>${escapeHtml(results.breakdown?.globalFees?.irs || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Total Global Tax</th><td>${escapeHtml(results.breakdown?.globalFees?.totalGlobalTax || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Total Tax and Fees</th><td>${escapeHtml(results.breakdown?.totalTaxAndFees || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Duty Rate</th><td>${escapeHtml(results.duty?.rate || 0)}%</td></tr>
          <tr><th>Duty Amount</th><td>${escapeHtml(results.duty?.amount || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Surcharge</th><td>${escapeHtml(results.duty?.surcharge || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>VAT Rate</th><td>${escapeHtml(results.vat?.rate || 0)}%</td></tr>
          <tr><th>VAT Amount</th><td>${escapeHtml(results.vat?.amount || 0)} ${escapeHtml(calculationCurrency)}</td></tr>
          <tr><th>Total Landed Cost</th><td>${escapeHtml(results.totalLandedCost)} ${escapeHtml(calculationCurrency)}</td></tr>
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

const searchHSCodesRemote = async (query: string, limit?: number): ApiResponse<HSCodeRow[]> => {
  const params = new URLSearchParams({ query: query.trim() })
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(Math.max(5, Math.min(100, Math.floor(limit)))))
  }
  return callApi<HSCodeRow[]>(`/api/hs-codes/search?${params.toString()}`)
}

const searchLiveHSCodesRemote = async (query: string, limit?: number): ApiResponse<LiveHSLookupResponse> => {
  const params = new URLSearchParams({ query: query.trim() })
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(Math.max(5, Math.min(100, Math.floor(limit)))))
  }
  return callApi<LiveHSLookupResponse>(`/api/hs-codes/live-search?${params.toString()}`)
}

const getTariffCatalogRemote = async (payload: { query?: string; category?: string; scheduleCode?: string; limit?: number }) => {
  const params = new URLSearchParams()

  if (payload.query?.trim()) {
    params.set('query', payload.query.trim())
  }

  if (payload.category?.trim()) {
    params.set('category', payload.category.trim())
  }

  if (payload.scheduleCode?.trim()) {
    params.set('scheduleCode', normalizeScheduleCode(payload.scheduleCode))
  }

  if (typeof payload.limit === 'number') {
    params.set('limit', String(payload.limit))
  }

  return callApi<Array<{
    hsCode: string
    scheduleCode: string
    description: string
    category: string
    dutyRate: number
    vatRate: number
    surchargeRate: number
    effectiveDate: string
  }>>(`/api/tariff-catalog?${params.toString()}`)
}

const getTariffHistoryRemote = async (payload: {
  query?: string
  category?: string
  scheduleCode?: string
  limit?: number
}) => {
  const params = new URLSearchParams()

  if (payload.query?.trim()) {
    params.set('query', payload.query.trim())
  }

  if (payload.category?.trim()) {
    params.set('category', payload.category.trim())
  }

  if (payload.scheduleCode?.trim()) {
    params.set('scheduleCode', normalizeScheduleCode(payload.scheduleCode))
  }

  if (typeof payload.limit === 'number') {
    params.set('limit', String(payload.limit))
  }

  return callApi<Array<{
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
  }>>(`/api/tariff-catalog/history?${params.toString()}`)
}

const getTariffCategoriesRemote = async (): ApiResponse<string[]> => callApi<string[]>('/api/tariff-categories')
const getTariffSchedulesRemote = async (): ApiResponse<TariffScheduleOption[]> => callApi<TariffScheduleOption[]>('/api/tariff-schedules')
const getRuntimeSettingsRemote = async (): ApiResponse<RuntimeSettings> => callApi<RuntimeSettings>('/api/runtime-settings')
const getRuntimeStatusRemote = async (): ApiResponse<RuntimeStatus> => callApi<RuntimeStatus>('/api/runtime-status')
const getCatalogHealthRemote = async () => callApi<NonNullable<RuntimeStatus['health']>>('/api/catalog-health')

const calculateDutyRemote = async (payload: {
  value: number
  hsCode: string
  originCountry: string
  scheduleCode?: string
}) => postApi<DutyResult>('/api/calculate/duty', payload)

const calculateVatRemote = async (payload: { dutiableValue: number; hsCode: string; scheduleCode?: string }) =>
  postApi<VATResult>('/api/calculate/vat', payload)

const getComplianceRequirementsRemote = async (payload: {
  hsCode: string
  value: number
  destination: string
}) => postApi<{ requiredDocuments: string[]; restrictions: string[]; warnings: string[] }>('/api/compliance/requirements', payload)

const batchCalculateRemote = async (shipments: ShipmentRow[]) =>
  postApi<BatchResultRow[]>('/api/calculate/batch', { shipments })

const previewTariffImportRemote = async (payload: { csvText?: string; contentBase64?: string; fileName?: string; rows?: Record<string, unknown>[] }) =>
  postApi<{ totalRows: number; validRows: number; invalidRows: number; rows: ImportPreviewRow[] }>('/api/import/tariff-rates/preview', payload)

const importTariffDataRemote = async (payload: Record<string, unknown>) =>
  postApi<TariffImportSummary>('/api/import/tariff-rates', payload)
const importHSCatalogRemote = async (payload: Record<string, unknown>) =>
  postApi<TariffImportSummary>('/api/import/hs-codes', payload)

const getImportJobsRemote = async () => callApi<Array<Record<string, unknown>>>('/api/import-jobs')

const getPendingReviewRowsRemote = async (payload: { importJobId: number }) =>
  callApi<PendingReviewRow[]>(`/api/import-jobs/${payload.importJobId}/pending-review`)

const getReviewRowProvenanceRemote = async (payload: { rowId: number }) =>
  callApi<ReviewRowProvenance>(`/api/review-rows/${payload.rowId}/provenance`)

export const appApi = {
  initDB: (): ApiResponse<undefined> => makeSuccess(undefined),

  calculateDuty: async (payload: {
    value: number
    hsCode: string
    originCountry: string
    scheduleCode?: string
  }): ApiResponse<DutyResult> => {
    const remoteResult = await calculateDutyRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const row = requireCurrentTariff(payload.hsCode, payload.scheduleCode)
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

  calculateVAT: async (payload: { dutiableValue: number; hsCode: string; scheduleCode?: string }): ApiResponse<VATResult> => {
    const remoteResult = await calculateVatRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const row = requireCurrentTariff(payload.hsCode, payload.scheduleCode)
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
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    const localMatch = resolveKnownHSCode(code)
    if (localMatch) {
      return makeSuccess(localMatch)
    }

    const liveLookupResult = await appApi.searchLiveHSCodes(code, { limit: 10 })
    if (liveLookupResult.success && liveLookupResult.data) {
      return makeSuccess(findExactHsMatch(liveLookupResult.data.results, code))
    }

    return makeSuccess(null)
  },

  searchHSCodes: async (query: string, options?: { limit?: number }): ApiResponse<HSCodeRow[]> => {
    const remoteResult = await searchHSCodesRemote(query, options?.limit)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess(searchHSRows(query))
  },

  searchLiveHSCodes: async (query: string, options?: { limit?: number }): ApiResponse<LiveHSLookupResponse> => {
    const remoteResult = await searchLiveHSCodesRemote(query, options?.limit)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    const runtimeSettingsResult = await appApi.getRuntimeSettings()
    const catalogMode = runtimeSettingsResult.success && runtimeSettingsResult.data
      ? runtimeSettingsResult.data.catalogMode
      : 'seed-fallback'

    if (catalogMode === 'official-catalog-required') {
      return makeError(
        remoteResult.error || 'Official HS lookup is unavailable and local seed fallback is disabled by catalog mode.'
      )
    }

    const fallbackRows = searchHSRows(query)
    return makeSuccess(
      wrapLocalLiveLookupFallback(
        query,
        fallbackRows,
        remoteResult.error || 'Official tariff lookup is unavailable. Showing local browser fallback results instead.',
        'local-fallback'
      )
    )
  },

  getTariffCatalog: async (payload: {
    query?: string
    category?: string
    scheduleCode?: string
    limit?: number
  }): ApiResponse<Array<{ hsCode: string; scheduleCode: string; description: string; category: string; dutyRate: number; vatRate: number; surchargeRate: number; effectiveDate: string }>> => {
    const remoteResult = await getTariffCatalogRemote(payload || {})
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const searchTerm = payload?.query?.trim().toUpperCase() || ''
      const selectedCategory = payload?.category || 'All'
      const selectedScheduleCode = normalizeScheduleCode(payload?.scheduleCode)
      const rows = tariffRates
        .filter((rateRow) => normalizeScheduleCode(rateRow.schedule_code) === selectedScheduleCode)
        .map((rateRow) => {
          const hsCodeRow = hsCodes.find((row) => row.code === rateRow.hs_code)
          if (!hsCodeRow) {
            return null
          }

          return {
            hsCode: hsCodeRow.code,
            scheduleCode: normalizeScheduleCode(rateRow.schedule_code),
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

  getTariffHistory: async (payload: {
    query?: string
    category?: string
    scheduleCode?: string
    limit?: number
  }): ApiResponse<Array<{ hsCode: string; scheduleCode: string; description: string; category: string; dutyRate: number; vatRate: number; surchargeRate: number; effectiveDate: string; endDate: string | null; importStatus: string | null }>> => {
    const remoteResult = await getTariffHistoryRemote(payload || {})
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const catalogResult = await appApi.getTariffCatalog(payload)
      if (!catalogResult.success || !catalogResult.data) {
        return makeError(catalogResult.error || 'Unable to load tariff history fallback')
      }

      return makeSuccess(
        catalogResult.data.map((row) => ({
          ...row,
          endDate: null,
          importStatus: 'approved',
        }))
      )
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

  getTariffSchedules: async (): ApiResponse<TariffScheduleOption[]> => {
    const remoteResult = await getTariffSchedulesRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess(tariffScheduleOptions)
  },

  getComplianceRequirements: async (payload: {
    hsCode: string
    value: number
    destination: string
  }): ApiResponse<{ requiredDocuments: string[]; restrictions: string[]; warnings: string[] }> => {
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

  batchCalculate: async (shipments: ShipmentRow[]): ApiResponse<BatchResultRow[]> => {
    const remoteResult = await batchCalculateRemote(shipments)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const results: BatchResultRow[] = []
      for (const shipment of shipments) {
        const shipmentCurrency = shipment.currency.toUpperCase()
        const scheduleCode = normalizeScheduleCode(shipment.scheduleCode)
        const taxableInputAmount = shipment.value + shipment.freight + shipment.insurance
        const conversionResult = await getCurrencyConversion(taxableInputAmount, shipmentCurrency, 'PHP')
        if (!conversionResult.success || !conversionResult.data) {
          throw new Error(conversionResult.error || 'Batch currency conversion failed')
        }

        const converted = conversionResult.data
        const valueInPhp = shipmentCurrency === 'PHP' ? taxableInputAmount : converted.convertedAmount
        const destinationPort = normalizeDestinationPort(shipment.destinationPort)
        const tariffRow = requireCurrentTariff(shipment.hsCode, scheduleCode)
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

        const transitChargePhp = shipment.declarationType === 'transit' ? TRANSIT_CHARGE_PHP : 0
        const ipcPhp = shipment.declarationType === 'transit' ? 250 : getImportProcessingChargePhp(valueInPhp)
        const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
        const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
        const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp
        const vatBasePhp = valueInPhp + dutyAmount + surchargeAmount + brokerageFeePhp + shipment.arrastreWharfage + shipment.doxStampOthers + totalGlobalFeesPhp
        const vatAmount = vatBasePhp * (tariffRow?.vat_rate || 0.12)
        results.push({
          ...shipment,
          scheduleCode,
          destinationPort,
          deMinimisExempt: false,
          entryType: 'informal' as const,
          insuranceBenchmarkApplied: false,
          importClassification: {
            importType: 'free' as const,
            agencies: [],
            agencyFullNames: [],
            notes: 'Classification unavailable in offline mode',
            isStrategicTradeGood: false,
            isVatExempt: false,
            requiresCertificateOfOrigin: false,
            warnings: [],
          },
          duty: {
            amount: dutyAmount,
            surcharge: surchargeAmount,
            rate: (tariffRow?.duty_rate || 0) * 100,
          },
          vat: {
            amount: vatAmount,
            rate: (tariffRow?.vat_rate || 0.12) * 100,
          },
          costBase: {
            taxableValue: valueInPhp,
            brokerageFee: brokerageFeePhp,
            arrastreWharfage: shipment.arrastreWharfage,
            doxStampOthers: shipment.doxStampOthers,
            vatBase: vatBasePhp,
          },
          breakdown: {
            itemTaxes: {
              cud: dutyAmount,
              excise: 0,
              vat: vatAmount,
              totalItemTax: dutyAmount + vatAmount,
            },
            globalFees: {
              transitCharge: transitChargePhp,
              ipc: ipcPhp,
              csf: csfPhp,
              cds: cdsPhp,
              irs: irsPhp,
              lrf: 0,
              totalGlobalTax: totalGlobalFeesPhp,
            },
            totalTaxAndFees: dutyAmount + vatAmount + totalGlobalFeesPhp,
          },
          exciseTax: { amount: 0, adValorem: 0, specific: 0, category: 'none', basis: 'N/A', notes: 'Not calculated in offline mode' },
          landedCostSubtotal: vatBasePhp,
          totalLandedCost: vatBasePhp + vatAmount,
          calculationCurrency: 'PHP',
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

  previewTariffImport: async (payload: { csvText?: string; contentBase64?: string; fileName?: string; rows?: Record<string, unknown>[] }): ApiResponse<{ totalRows: number; validRows: number; invalidRows: number; rows: ImportPreviewRow[] }> => {
    const remoteResult = await previewTariffImportRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    try {
      const rows = payload.rows || []
      const previewRows: ImportPreviewRow[] = rows.map((row, index) => ({
        rowNumber: index + 1,
        raw: row,
        normalized: {
          ...row,
          scheduleCode: normalizeScheduleCode(typeof row.scheduleCode === 'string' ? row.scheduleCode : undefined),
        },
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
    const remoteResult = await importTariffDataRemote(payload)
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
      duplicateRows: 0,
      conflictRows: 0,
      skippedRows: 0,
      status: 'completed',
    })
  },

  importHSCatalog: async (payload: Record<string, unknown>) => {
    const remoteResult = await importHSCatalogRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeError('HS catalog import requires the backend server')
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

  getReviewRowProvenance: async (payload: { rowId: number }) => {
    const remoteResult = await getReviewRowProvenanceRemote(payload)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeError(remoteResult.error || 'Review row provenance is unavailable')
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

  generateCalculationDocument: async (payload: { formData: CalculationDocumentFormData; results: CalculationDocumentResults; format: 'pdf' | 'word' | 'excel' }): ApiResponse<{ path: string }> => {
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

  getCalculationHistory: async (limit: number = 50) => {
    const remoteResult = await callApi<Array<Record<string, unknown>>>(`/api/calculation-history?limit=${limit}`)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }
    return makeSuccess([])
  },

  getTariffSources: async (limit: number = 50) => {
    const remoteResult = await callApi<Array<Record<string, unknown>>>(`/api/tariff-sources?limit=${limit}`)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }
    return makeSuccess([])
  },

  getRuntimeSettings: async (): ApiResponse<RuntimeSettings> => {
    const remoteResult = await getRuntimeSettingsRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess({
      defaultScheduleCode: 'MFN',
      defaultOriginCountry: '',
      autoFetcherEnabled: true,
      fxCacheTtlHours: 24,
      fxPreferBocRate: true,
      calculatorMode: 'estimate',
      catalogMode: 'seed-fallback',
      stagedCutoverEnabled: false,
      cutoverCoverageThreshold: 99,
      fullSyncIdempotencyGuardEnabled: true,
    })
  },

  updateRuntimeSettings: async (payload: Partial<RuntimeSettings>): ApiResponse<RuntimeSettings> => {
    return callApi<RuntimeSettings>('/api/runtime-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  getRuntimeStatus: async (): ApiResponse<RuntimeStatus> => {
    const remoteResult = await getRuntimeStatusRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess({
      settings: {
        defaultScheduleCode: 'MFN',
        defaultOriginCountry: '',
        autoFetcherEnabled: true,
        fxCacheTtlHours: 24,
        fxPreferBocRate: true,
        calculatorMode: 'estimate',
        catalogMode: 'seed-fallback',
        stagedCutoverEnabled: false,
        cutoverCoverageThreshold: 99,
        fullSyncIdempotencyGuardEnabled: true,
      },
      latestSource: null,
      autoFetcherLastRun: null,
      health: {
        totalHsCodes: 0,
        hsCodesWithApprovedMfnRate: 0,
        mfnCoveragePercent: 0,
        pendingReviewRows: 0,
        latestFullSyncAt: null,
        latestFullSyncStatus: null,
        importFailureCountLast30d: 0,
        recommendedCutover: false,
        cutoverCoverageThreshold: 99,
        stagedCutoverEnabled: false,
      },
    })
  },

  getCatalogHealth: async () => {
    const remoteResult = await getCatalogHealthRemote()
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }

    return makeSuccess({
      totalHsCodes: 0,
      hsCodesWithApprovedMfnRate: 0,
      mfnCoveragePercent: 0,
      pendingReviewRows: 0,
      latestFullSyncAt: null,
      latestFullSyncStatus: null,
      importFailureCountLast30d: 0,
      recommendedCutover: false,
      cutoverCoverageThreshold: 99,
      stagedCutoverEnabled: false,
    })
  },

  getRateChangeAudit: async (payload: { hsCode?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (payload.hsCode?.trim()) params.set('hs_code', payload.hsCode.trim())
    if (typeof payload.limit === 'number') params.set('limit', String(payload.limit))
    if (typeof payload.offset === 'number') params.set('offset', String(payload.offset))
    const remoteResult = await callApi<Array<Record<string, unknown>>>(`/api/rate-change-audit?${params.toString()}`)
    if (remoteResult.success && remoteResult.data) {
      return remoteResult
    }
    return makeSuccess([])
  },

  reviewRow: async (payload: { importJobId: number; rowId: number; action: 'approve' | 'reject'; notes?: string }) => {
    return callApi<undefined>(`/api/import-jobs/${payload.importJobId}/review-rows/${payload.rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: payload.action, notes: payload.notes }),
    })
  },

  reviewRowsBulk: async (payload: {
    importJobId: number
    rowIds: number[]
    action: 'approve' | 'reject'
    notes?: string
  }) => {
    return callApi<{ processedRows: number; approved: number; rejected: number }>(
      `/api/import-jobs/${payload.importJobId}/review-rows/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({ rowIds: payload.rowIds, action: payload.action, notes: payload.notes }),
      }
    )
  },
}

export type AppApi = typeof appApi
export type AppHsCodeRow = HSCodeRow
export type AppLiveHSLookupResponse = LiveHSLookupResponse

export const hsCodeLookup = {
  normalizeHSCode,
  resolveKnownHSCode,
  searchHSRows,
}
