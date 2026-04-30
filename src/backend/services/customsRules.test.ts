import { describe, expect, it } from 'vitest'
import {
  CUSTOMS_DOCUMENTARY_STAMP_PHP,
  BIR_DOCUMENTARY_STAMP_TAX_PHP,
  LEGAL_RESEARCH_FUND_PHP,
  DE_MINIMIS_THRESHOLD_PHP,
  BROKERAGE_FEE_SCHEDULE,
  TRANSIT_CHARGE_PHP,
  VAT_RATE,
  getBrokerageFeeDescription,
  getBrokerageFeePhp,
  getContainerSecurityFeeUsd,
  getImportProcessingChargePhp,
  normalizeDestinationPort,
  checkDeMinimis,
  applyInsuranceBenchmark,
  estimatePortHandlingFees,
  evaluateSection800Exemption,
  evaluateValuationReferenceRisk,
  getEntryType,
} from './customsRules'

describe('customsRules', () => {
  it('exposes the current fixed fee constants', () => {
    expect(TRANSIT_CHARGE_PHP).toBe(1000)
    expect(CUSTOMS_DOCUMENTARY_STAMP_PHP).toBe(100)
    expect(BIR_DOCUMENTARY_STAMP_TAX_PHP).toBe(30)
    expect(LEGAL_RESEARCH_FUND_PHP).toBe(10)
    expect(DE_MINIMIS_THRESHOLD_PHP).toBe(10000)
    expect(VAT_RATE).toBe(0.12)
  })

  it('returns the configured import processing charge across threshold boundaries', () => {
    expect(getImportProcessingChargePhp(25000)).toBe(250)
    expect(getImportProcessingChargePhp(25001)).toBe(500)
    expect(getImportProcessingChargePhp(50000)).toBe(500)
    expect(getImportProcessingChargePhp(50001)).toBe(750)
    expect(getImportProcessingChargePhp(250001)).toBe(1000)
    expect(getImportProcessingChargePhp(500001)).toBe(1500)
    expect(getImportProcessingChargePhp(750001)).toBe(2000)
    // Formal entry extended tiers
    expect(getImportProcessingChargePhp(1_000_000)).toBe(2000)
    expect(getImportProcessingChargePhp(1_000_001)).toBe(2500)
    expect(getImportProcessingChargePhp(2_000_000)).toBe(2500)
    expect(getImportProcessingChargePhp(2_000_001)).toBe(3000)
    expect(getImportProcessingChargePhp(5_000_000)).toBe(3000)
    expect(getImportProcessingChargePhp(5_000_001)).toBe(4000)
  })

  it('returns container security fees only for supported container sizes', () => {
    expect(getContainerSecurityFeeUsd('20ft')).toBe(5)
    expect(getContainerSecurityFeeUsd('40ft')).toBe(10)
    expect(getContainerSecurityFeeUsd('none')).toBe(0)
  })

  it('returns brokerage fees from the published tier schedule and default cap', () => {
    expect(getBrokerageFeePhp(BROKERAGE_FEE_SCHEDULE[0].maxTaxableValuePhp)).toBe(BROKERAGE_FEE_SCHEDULE[0].feePhp)
    expect(getBrokerageFeePhp(BROKERAGE_FEE_SCHEDULE[5].maxTaxableValuePhp)).toBe(BROKERAGE_FEE_SCHEDULE[5].feePhp)
    expect(getBrokerageFeePhp(5_000_001)).toBe(10000)
    expect(getBrokerageFeeDescription()).toContain('Tiered BOC brokerage schedule')
  })

  it('normalizes destination ports from aliases, formatting noise, and blanks', () => {
    expect(normalizeDestinationPort(undefined)).toBe('MNL')
    expect(normalizeDestinationPort('  ')).toBe('MNL')
    expect(normalizeDestinationPort('cebu')).toBe('CEB')
    expect(normalizeDestinationPort('Puerto Princesa')).toBe('PPS')
    expect(normalizeDestinationPort(' naia ')).toBe('NAIA')
    expect(normalizeDestinationPort('xyz')).toBe('XYZ')
  })

  describe('checkDeMinimis', () => {
    it('exempts non-excise goods with FOB ≤ ₱10,000', () => {
      const result = checkDeMinimis(9000, '8471.30.00')
      expect(result.exempt).toBe(true)
    })

    it('does NOT exempt alcohol/tobacco regardless of FOB value', () => {
      // HS chapter 22 — fermented liquors
      expect(checkDeMinimis(500, '2203.00.00').exempt).toBe(false)
      // HS chapter 24 — tobacco
      expect(checkDeMinimis(500, '2402.20.10').exempt).toBe(false)
    })

    it('does NOT exempt when FOB > ₱10,000', () => {
      expect(checkDeMinimis(15000, '8471.30.00').exempt).toBe(false)
    })

    it('exempts at exactly the threshold', () => {
      expect(checkDeMinimis(10000, '8471.30.00').exempt).toBe(true)
    })
  })

  describe('applyInsuranceBenchmark', () => {
    it('applies 2% benchmark when insurance is 0', () => {
      const result = applyInsuranceBenchmark(100000, 0, '8471.30.00')
      expect(result.insurance).toBe(2000)
      expect(result.benchmarkApplied).toBe(true)
    })

    it('preserves provided insurance when > 0', () => {
      const result = applyInsuranceBenchmark(100000, 500, '8471.30.00')
      expect(result.insurance).toBe(500)
      expect(result.benchmarkApplied).toBe(false)
    })

    it('applies 4% benchmark for dangerous goods (chapters 28, 36, 38)', () => {
      // chapter 28 = inorganic chemicals
      const result = applyInsuranceBenchmark(100000, 0, '2801.10.00')
      expect(result.insurance).toBe(4000)
      expect(result.benchmarkApplied).toBe(true)
    })
  })

  describe('getEntryType', () => {
    it('classifies de minimis for DV ≤ ₱10,000', () => {
      expect(getEntryType(9999)).toBe('de_minimis')
      expect(getEntryType(10000)).toBe('de_minimis')
    })

    it('classifies informal entry for ₱10,001–₱50,000', () => {
      expect(getEntryType(10001)).toBe('informal')
      expect(getEntryType(50000)).toBe('informal')
    })

    it('classifies formal entry for DV > ₱50,000', () => {
      expect(getEntryType(50001)).toBe('formal')
      expect(getEntryType(1_000_000)).toBe('formal')
    })
  })

  describe('estimatePortHandlingFees', () => {
    it('applies 2026 H1 tranche for April arrivals', () => {
      const result = estimatePortHandlingFees({
        arrivalDate: '2026-04-20',
        containerSize: '20ft',
        storageDelayDays: 8,
        dutiableValuePhp: 100000,
      })
      expect(result.tariffTranche).toBe('2026-h1')
      expect(result.arrastre).toBe(1612)
      expect(result.chargeableStorageDays).toBe(3)
      expect(result.totalPortHandling).toBeGreaterThan(0)
    })

    it('applies 2026 H2 tranche for July arrivals', () => {
      const result = estimatePortHandlingFees({
        arrivalDate: '2026-07-10',
        containerSize: '20ft',
        storageDelayDays: 5,
        dutiableValuePhp: 100000,
      })
      expect(result.tariffTranche).toBe('2026-h2')
      expect(result.arrastre).toBe(1758)
      expect(result.storage).toBe(0)
    })
  })

  describe('evaluateSection800Exemption', () => {
    it('grants balikbayan exemption when conditions are met', () => {
      const result = evaluateSection800Exemption({
        importerStatus: 'balikbayan',
        fobValuePhp: 120000,
        balikbayanBoxesThisYear: 2,
        isCommercialQuantity: false,
      })
      expect(result.eligible).toBe(true)
      expect(result.exemptAmountPhp).toBe(120000)
    })

    it('grants returning resident exemption for used personal effects with long stay abroad', () => {
      const result = evaluateSection800Exemption({
        importerStatus: 'returning_resident',
        itemCondition: 'used',
        monthsAbroad: 130,
        fobValuePhp: 500000,
      })
      expect(result.eligible).toBe(true)
      expect(result.exemptAmountPhp).toBe(350000)
    })
  })

  describe('evaluateValuationReferenceRisk', () => {
    it('flags high risk when declared value is far below reference value', () => {
      const result = evaluateValuationReferenceRisk('8517.12.00', 5000)
      expect(result.flagged).toBe(true)
      expect(result.level).toBe('high')
    })

    it('returns low risk when value is within the indicative range', () => {
      const result = evaluateValuationReferenceRisk('8471.30.00', 25000)
      expect(result.flagged).toBe(false)
      expect(result.level).toBe('low')
    })
  })
})
