import { describe, expect, it } from 'vitest'
import {
  CUSTOMS_DOCUMENTARY_STAMP_PHP,
  BIR_DOCUMENTARY_STAMP_TAX_PHP,
  BROKERAGE_FEE_SCHEDULE,
  TRANSIT_CHARGE_PHP,
  VAT_RATE,
  getBrokerageFeeDescription,
  getBrokerageFeePhp,
  getContainerSecurityFeeUsd,
  getImportProcessingChargePhp,
  normalizeDestinationPort,
} from './customsRules'

describe('customsRules', () => {
  it('exposes the current fixed fee constants', () => {
    expect(TRANSIT_CHARGE_PHP).toBe(1000)
    expect(CUSTOMS_DOCUMENTARY_STAMP_PHP).toBe(100)
    expect(BIR_DOCUMENTARY_STAMP_TAX_PHP).toBe(30)
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
})
