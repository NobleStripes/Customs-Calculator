import { describe, expect, it } from 'vitest'
import { calculatePenaltyAmounts, calculateTradeRemedyDuties } from './calculationSteps'

describe('shared calculation steps', () => {
  it('applies positive trade-remedy rates to the dutiable value and clamps negative rates only for amounts', () => {
    const result = calculateTradeRemedyDuties(100_000, {
      antiDumpingDutyRate: -0.1,
      countervailingDutyRate: 0.03,
      safeguardDutyRate: 'invalid',
    })
    expect(result.rates).toEqual({ antiDumping: -0.1, countervailing: 0.03, safeguard: 0 })
    expect(result.amounts).toEqual({ antiDumping: 0, countervailing: 3_000, safeguard: 0, total: 3_000 })
  })

  it('starts the undervaluation surcharge only above 110% of dutiable value', () => {
    const input = {
      dutiableValuePhp: 100_000,
      dutyRate: 0.05,
      surchargeRate: 0.01,
      tradeRemedyRate: 0.02,
      vatRate: 0.12,
      baseDutyTaxPhp: 20_000,
    }
    expect(calculatePenaltyAmounts({ ...input, assessedCustomsValuePhp: 110_000 }).amounts.undervaluationSurcharge).toBe(0)
    expect(calculatePenaltyAmounts({ ...input, assessedCustomsValuePhp: 110_000.01 }).amounts.undervaluationSurcharge).toBeCloseTo(5_000.005)
  })

  it('suppresses the misclassification surcharge for clerical error and applies late interest by days', () => {
    const input = {
      assessedCustomsValuePhp: 0,
      dutiableValuePhp: 100_000,
      dutyRate: 0.05,
      surchargeRate: 0,
      tradeRemedyRate: 0,
      vatRate: 0.12,
      baseDutyTaxPhp: 20_000,
      misclassificationDetected: true,
      latePaymentDays: 30,
    }
    const ordinary = calculatePenaltyAmounts(input)
    const clerical = calculatePenaltyAmounts({ ...input, clericalError: true })
    expect(ordinary.amounts.misclassificationSurcharge).toBe(50_000)
    expect(clerical.amounts.misclassificationSurcharge).toBe(0)
    expect(clerical.amounts.latePaymentInterest).toBeCloseTo(20_000 * 0.2 * 30 / 365)
    expect(calculatePenaltyAmounts({ ...input, latePaymentDays: -1 }).latePaymentDays).toBe(0)
  })
})
