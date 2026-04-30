export const TRANSIT_CHARGE_PHP = 1000
export const CUSTOMS_DOCUMENTARY_STAMP_PHP = 100
export const BIR_DOCUMENTARY_STAMP_TAX_PHP = 30
export const LEGAL_RESEARCH_FUND_PHP = 10
export const VAT_RATE = 0.12

export const DE_MINIMIS_THRESHOLD_PHP = 10000

// BOC insurance benchmark rates when actual insurance is not provided
export const INSURANCE_BENCHMARK_GENERAL = 0.02
export const INSURANCE_BENCHMARK_DANGEROUS = 0.04

// HS chapters for excise-liable goods — de minimis exemption does NOT apply to these
// Chapter 22: Beverages, spirits and vinegar; Chapter 24: Tobacco
const EXCISE_ALWAYS_TAXED_CHAPTERS = new Set([22, 24])

export const BROKERAGE_FEE_SCHEDULE = [
  { maxTaxableValuePhp: 50000, feePhp: 1000 },
  { maxTaxableValuePhp: 75000, feePhp: 1500 },
  { maxTaxableValuePhp: 100000, feePhp: 2000 },
  { maxTaxableValuePhp: 150000, feePhp: 2500 },
  { maxTaxableValuePhp: 200000, feePhp: 3000 },
  { maxTaxableValuePhp: 250000, feePhp: 3500 },
  { maxTaxableValuePhp: 300000, feePhp: 4000 },
  { maxTaxableValuePhp: 400000, feePhp: 4500 },
  { maxTaxableValuePhp: 500000, feePhp: 5000 },
  { maxTaxableValuePhp: 750000, feePhp: 5500 },
  { maxTaxableValuePhp: 1000000, feePhp: 6000 },
  { maxTaxableValuePhp: 1500000, feePhp: 7000 },
  { maxTaxableValuePhp: 2000000, feePhp: 8000 },
  { maxTaxableValuePhp: 5000000, feePhp: 9000 },
] as const

export const PHILIPPINE_PORT_CODE_ALIASES: Record<string, string> = {
  BACOLOD: 'BAC',
  BATANGAS: 'BAT',
  BUTUAN: 'BXU',
  CAGAYANDEORO: 'CGY',
  CDO: 'CGY',
  CEB: 'CEB',
  CEBU: 'CEB',
  CLARK: 'CLA',
  COTABATO: 'CBO',
  DAVAO: 'DVO',
  DUMAGUETE: 'DUM',
  GENERALSANTOS: 'GEN',
  ILO: 'ILO',
  ILOILO: 'ILO',
  LEGASPI: 'LEG',
  LEGAZPI: 'LEG',
  MANILA: 'MNL',
  MNL: 'MNL',
  NAIA: 'NAIA',
  OZAMIZ: 'OZM',
  PPS: 'PPS',
  PUERTOPRINCESA: 'PPS',
  ROXAS: 'RXS',
  SANFERNANDO: 'SAN',
  SFS: 'SFS',
  SUB: 'SUB',
  SUBIC: 'SUB',
  SURIGAO: 'SUG',
  TACLOBAN: 'TAC',
  TAGBILARAN: 'TGN',
  ZAMBOANGA: 'ZAM',
}

export const PHILIPPINE_PORT_CODES = new Set<string>([
  'MNL',
  'NAIA',
  'SFS',
  'SUB',
  'CLA',
  'BAT',
  'LEG',
  'SAN',
  'CAL',
  'CEB',
  'ILO',
  'BAC',
  'TAC',
  'OZM',
  'CBO',
  'TGN',
  'DUM',
  'RXS',
  'DVO',
  'CGY',
  'ZAM',
  'GEN',
  'IAO',
  'BXU',
  'CDO',
  'SUG',
  'DAP',
  'KOT',
  'PPS',
  'CYP',
  'LGP',
])

export type EntryType = 'de_minimis' | 'informal' | 'formal'

const getHsChapter = (hsCode: string): number => {
  const digits = hsCode.replace(/[^0-9]/g, '')
  return digits.length >= 2 ? Number(digits.slice(0, 2)) : 0
}

/**
 * Determine whether a shipment qualifies for the de minimis exemption.
 * Under CMO 36-2019 / CMTA Sec. 423: FOB/FCA value ≤ ₱10,000 → no duty/tax,
 * EXCEPT for tobacco (ch 24) and alcohol (ch 22) which are always taxed.
 */
export const checkDeMinimis = (fobValuePhp: number, hsCode: string): { exempt: boolean; reason?: string } => {
  if (fobValuePhp > DE_MINIMIS_THRESHOLD_PHP) {
    return { exempt: false }
  }
  const chapter = getHsChapter(hsCode)
  if (EXCISE_ALWAYS_TAXED_CHAPTERS.has(chapter)) {
    return {
      exempt: false,
      reason: `Chapter ${chapter} goods (alcohol/tobacco) are subject to excise tax regardless of value`,
    }
  }
  return { exempt: true, reason: 'FOB value does not exceed the ₱10,000 de minimis threshold' }
}

/**
 * Apply BOC insurance benchmark when actual insurance amount is not provided.
 * General cargo: 2% of FOB. Dangerous goods (ch 28, 36, 38): 4% of FOB.
 */
export const applyInsuranceBenchmark = (
  fobPhp: number,
  insurance: number,
  hsCode: string
): { insurance: number; benchmarkApplied: boolean } => {
  if (insurance > 0) {
    return { insurance, benchmarkApplied: false }
  }
  const chapter = getHsChapter(hsCode)
  const isDangerous = chapter === 28 || chapter === 36 || chapter === 38
  const rate = isDangerous ? INSURANCE_BENCHMARK_DANGEROUS : INSURANCE_BENCHMARK_GENERAL
  return { insurance: fobPhp * rate, benchmarkApplied: true }
}

/**
 * Classify shipment by entry type based on dutiable value in PHP.
 * De minimis: ≤ ₱10,000 FOB. Informal entry: dutiable value ≤ ₱50,000. Formal entry: > ₱50,000.
 */
export const getEntryType = (dutiableValuePhp: number): EntryType => {
  if (dutiableValuePhp <= DE_MINIMIS_THRESHOLD_PHP) return 'de_minimis'
  if (dutiableValuePhp <= 50000) return 'informal'
  return 'formal'
}

export const getImportProcessingChargePhp = (dutiableValuePhp: number): number => {
  if (dutiableValuePhp <= 25000) return 250
  if (dutiableValuePhp <= 50000) return 500
  if (dutiableValuePhp <= 250000) return 750
  if (dutiableValuePhp <= 500000) return 1000
  if (dutiableValuePhp <= 750000) return 1500
  if (dutiableValuePhp <= 1000000) return 2000
  if (dutiableValuePhp <= 2000000) return 2500
  if (dutiableValuePhp <= 5000000) return 3000
  return 4000
}

export const getContainerSecurityFeeUsd = (containerSize: string): number => {
  if (containerSize === '40ft') return 10
  if (containerSize === '20ft') return 5
  return 0
}

export const getBrokerageFeePhp = (taxableValuePhp: number): number => {
  for (const tier of BROKERAGE_FEE_SCHEDULE) {
    if (taxableValuePhp <= tier.maxTaxableValuePhp) {
      return tier.feePhp
    }
  }

  return 10000
}

export const getBrokerageFeeDescription = (): string =>
  'Tiered BOC brokerage schedule based on taxable value in PHP.'

export type ImporterStatus = 'standard' | 'balikbayan' | 'returning_resident' | 'ofw'
export type ItemCondition = 'new' | 'used'

export type PortHandlingFeeResult = {
  arrivalDateApplied: string
  tariffTranche: 'pre-2026' | '2026-h1' | '2026-h2'
  arrastre: number
  wharfage: number
  storage: number
  freeStorageDays: number
  chargeableStorageDays: number
  totalPortHandling: number
  notes: string[]
}

type PortHandlingFeeInput = {
  arrivalDate?: string
  containerSize?: string
  storageDelayDays?: number
  dutiableValuePhp: number
}

const getPortTariffTranche = (date: Date): PortHandlingFeeResult['tariffTranche'] => {
  const h1Start = new Date('2026-01-01T00:00:00.000Z')
  const h2Start = new Date('2026-07-01T00:00:00.000Z')
  if (date >= h2Start) return '2026-h2'
  if (date >= h1Start) return '2026-h1'
  return 'pre-2026'
}

export const estimatePortHandlingFees = ({
  arrivalDate,
  containerSize,
  storageDelayDays,
  dutiableValuePhp,
}: PortHandlingFeeInput): PortHandlingFeeResult => {
  const parsedArrivalDate = arrivalDate ? new Date(`${arrivalDate}T00:00:00.000Z`) : new Date()
  const arrival = Number.isNaN(parsedArrivalDate.getTime()) ? new Date() : parsedArrivalDate
  const tranche = getPortTariffTranche(arrival)
  const freeStorageDays = 5
  const delay = Number.isFinite(Number(storageDelayDays)) ? Number(storageDelayDays) : 0
  const chargeableStorageDays = Math.max(0, Math.floor(delay) - freeStorageDays)
  const normalizedContainer = String(containerSize || 'none').toLowerCase()

  const arrastre20ftByTranche = {
    'pre-2026': 1465,
    '2026-h1': 1612,
    '2026-h2': 1758,
  } as const

  const wharfageRateByTranche = {
    'pre-2026': 0.0014,
    '2026-h1': 0.0016,
    '2026-h2': 0.0018,
  } as const

  const storageDaily20ftByTranche = {
    'pre-2026': 110,
    '2026-h1': 120,
    '2026-h2': 132,
  } as const

  const containerMultiplier = normalizedContainer === '40ft' ? 2 : normalizedContainer === '20ft' ? 1 : 0
  const arrastre = containerMultiplier > 0 ? arrastre20ftByTranche[tranche] * containerMultiplier : 0
  const wharfage = dutiableValuePhp > 0
    ? Math.max(250, dutiableValuePhp * wharfageRateByTranche[tranche])
    : 250
  const storageDailyRate = containerMultiplier > 0
    ? storageDaily20ftByTranche[tranche] * containerMultiplier
    : Math.round(storageDaily20ftByTranche[tranche] * 0.75)
  const storage = chargeableStorageDays * storageDailyRate
  const totalPortHandling = arrastre + wharfage + storage

  return {
    arrivalDateApplied: arrival.toISOString().slice(0, 10),
    tariffTranche: tranche,
    arrastre,
    wharfage,
    storage,
    freeStorageDays,
    chargeableStorageDays,
    totalPortHandling,
    notes: [
      'PPA handling tariff estimate uses 2026 tranche tables and container defaults.',
      'Actual billed arrastre/wharfage/storage may vary by port operator and commodity class.',
    ],
  }
}

export type Section800ExemptionResult = {
  eligible: boolean
  exemptionType: 'none' | 'balikbayan' | 'returning_resident' | 'ofw'
  exemptAmountPhp: number
  reason: string
  warnings: string[]
}

type Section800ExemptionInput = {
  importerStatus?: string
  itemCondition?: string
  fobValuePhp: number
  monthsAbroad?: number
  balikbayanBoxesThisYear?: number
  isCommercialQuantity?: boolean
  ofwHomeApplianceClaim?: boolean
  ofwHomeApplianceAlreadyAvailedThisYear?: boolean
}

const getReturningResidentExemptionCap = (monthsAbroad: number): number => {
  if (monthsAbroad >= 120) return 350000
  if (monthsAbroad >= 60) return 250000
  if (monthsAbroad >= 6) return 150000
  return 0
}

export const evaluateSection800Exemption = ({
  importerStatus,
  itemCondition,
  fobValuePhp,
  monthsAbroad,
  balikbayanBoxesThisYear,
  isCommercialQuantity,
  ofwHomeApplianceClaim,
  ofwHomeApplianceAlreadyAvailedThisYear,
}: Section800ExemptionInput): Section800ExemptionResult => {
  const normalizedStatus = (importerStatus || 'standard') as ImporterStatus
  const normalizedCondition = (itemCondition || 'new') as ItemCondition

  if (normalizedStatus === 'balikbayan') {
    const boxes = Number.isFinite(Number(balikbayanBoxesThisYear)) ? Number(balikbayanBoxesThisYear) : 1
    if (boxes <= 3 && fobValuePhp <= 150000 && !isCommercialQuantity) {
      return {
        eligible: true,
        exemptionType: 'balikbayan',
        exemptAmountPhp: Math.min(fobValuePhp, 150000),
        reason: 'CMTA Sec. 800 balikbayan privilege applied (up to 3 boxes/year, non-commercial, up to ₱150,000 total).',
        warnings: [],
      }
    }

    return {
      eligible: false,
      exemptionType: 'none',
      exemptAmountPhp: 0,
      reason: 'Balikbayan exemption conditions are not met.',
      warnings: [
        boxes > 3 ? 'More than 3 balikbayan boxes declared for the year.' : '',
        fobValuePhp > 150000 ? 'Declared value exceeds the ₱150,000 balikbayan exemption ceiling.' : '',
        isCommercialQuantity ? 'Commercial quantity was indicated; balikbayan privilege does not apply.' : '',
      ].filter(Boolean),
    }
  }

  if (normalizedStatus === 'returning_resident') {
    const months = Number.isFinite(Number(monthsAbroad)) ? Number(monthsAbroad) : 0
    const cap = getReturningResidentExemptionCap(months)
    if (normalizedCondition === 'used' && cap > 0) {
      return {
        eligible: true,
        exemptionType: 'returning_resident',
        exemptAmountPhp: Math.min(fobValuePhp, cap),
        reason: `Returning resident personal-effects exemption applied (used goods, ${months} months abroad, cap ₱${cap.toLocaleString('en-PH')}).`,
        warnings: [],
      }
    }

    return {
      eligible: false,
      exemptionType: 'none',
      exemptAmountPhp: 0,
      reason: 'Returning resident exemption conditions are not met.',
      warnings: [
        normalizedCondition !== 'used' ? 'Returning resident exemption typically applies to used personal effects.' : '',
        months < 6 ? 'Minimum 6 months stay abroad is usually required for Section 800 personal-effects exemption.' : '',
      ].filter(Boolean),
    }
  }

  if (normalizedStatus === 'ofw') {
    if (ofwHomeApplianceClaim && !ofwHomeApplianceAlreadyAvailedThisYear) {
      return {
        eligible: true,
        exemptionType: 'ofw',
        exemptAmountPhp: Math.min(fobValuePhp, 150000),
        reason: 'OFW home-appliance privilege applied (once per year, one of each kind; conservative cap applied in estimate mode).',
        warnings: [],
      }
    }

    return {
      eligible: false,
      exemptionType: 'none',
      exemptAmountPhp: 0,
      reason: 'OFW privilege conditions are not met.',
      warnings: [
        !ofwHomeApplianceClaim ? 'No OFW home-appliance privilege claim was selected.' : '',
        ofwHomeApplianceAlreadyAvailedThisYear ? 'OFW appliance privilege appears already availed for the current year.' : '',
      ].filter(Boolean),
    }
  }

  return {
    eligible: false,
    exemptionType: 'none',
    exemptAmountPhp: 0,
    reason: 'No Section 800 exemption selected.',
    warnings: [],
  }
}

export type ValuationReferenceRisk = {
  flagged: boolean
  level: 'low' | 'medium' | 'high'
  declaredValuePhp: number
  indicativeMinimumPhp?: number
  referenceLabel?: string
  notes: string[]
}

const REFERENCE_MIN_BY_HEADING: Record<string, { minimumPhp: number; label: string }> = {
  '8471': { minimumPhp: 18000, label: 'Portable ADP machines / laptops' },
  '8517': { minimumPhp: 12000, label: 'Mobile phones and telecom devices' },
  '8703': { minimumPhp: 300000, label: 'Passenger motor vehicles' },
  '8802': { minimumPhp: 400000, label: 'Aircraft and helicopters' },
}

export const evaluateValuationReferenceRisk = (hsCode: string, declaredValuePhp: number): ValuationReferenceRisk => {
  const compact = hsCode.replace(/[^0-9]/g, '')
  const heading = compact.slice(0, 4)
  const reference = REFERENCE_MIN_BY_HEADING[heading]

  if (!reference || declaredValuePhp <= 0) {
    return {
      flagged: false,
      level: 'low',
      declaredValuePhp,
      notes: ['No valuation reference trigger found for this heading.'],
    }
  }

  if (declaredValuePhp < reference.minimumPhp * 0.5) {
    return {
      flagged: true,
      level: 'high',
      declaredValuePhp,
      indicativeMinimumPhp: reference.minimumPhp,
      referenceLabel: reference.label,
      notes: [
        'Declared value is significantly below indicative reference values for this heading.',
        'BOC may apply customs valuation reference uplift, increasing duty and VAT.',
      ],
    }
  }

  if (declaredValuePhp < reference.minimumPhp) {
    return {
      flagged: true,
      level: 'medium',
      declaredValuePhp,
      indicativeMinimumPhp: reference.minimumPhp,
      referenceLabel: reference.label,
      notes: [
        'Declared value is below indicative reference values for this heading.',
        'Supporting commercial documents may be requested during customs valuation review.',
      ],
    }
  }

  return {
    flagged: false,
    level: 'low',
    declaredValuePhp,
    indicativeMinimumPhp: reference.minimumPhp,
    referenceLabel: reference.label,
    notes: ['Declared value is within indicative reference range for this heading.'],
  }
}

export const normalizeDestinationPort = (value: string | undefined): string => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (!normalized) {
    return 'MNL'
  }

  return PHILIPPINE_PORT_CODE_ALIASES[normalized] || normalized
}
