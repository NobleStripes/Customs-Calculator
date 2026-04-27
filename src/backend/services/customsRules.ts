export const TRANSIT_CHARGE_PHP = 1000
export const CUSTOMS_DOCUMENTARY_STAMP_PHP = 100
export const BIR_DOCUMENTARY_STAMP_TAX_PHP = 30
export const VAT_RATE = 0.12

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

export const getImportProcessingChargePhp = (dutiableValuePhp: number): number => {
  if (dutiableValuePhp <= 25000) return 250
  if (dutiableValuePhp <= 50000) return 500
  if (dutiableValuePhp <= 250000) return 750
  if (dutiableValuePhp <= 500000) return 1000
  if (dutiableValuePhp <= 750000) return 1500
  return 2000
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
