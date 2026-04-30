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
