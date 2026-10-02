type TradeRemedyInputs = {
  antiDumpingDutyRate?: unknown
  countervailingDutyRate?: unknown
  safeguardDutyRate?: unknown
}

const numericRateOrZero = (value: unknown): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0

export const calculateTradeRemedyDuties = (dutiableValuePhp: number, input: TradeRemedyInputs) => {
  const antiDumpingDutyRate = numericRateOrZero(input.antiDumpingDutyRate)
  const countervailingDutyRate = numericRateOrZero(input.countervailingDutyRate)
  const safeguardDutyRate = numericRateOrZero(input.safeguardDutyRate)

  const antiDumpingDutyAmount = dutiableValuePhp * Math.max(0, antiDumpingDutyRate)
  const countervailingDutyAmount = dutiableValuePhp * Math.max(0, countervailingDutyRate)
  const safeguardDutyAmount = dutiableValuePhp * Math.max(0, safeguardDutyRate)

  return {
    rates: {
      antiDumping: antiDumpingDutyRate,
      countervailing: countervailingDutyRate,
      safeguard: safeguardDutyRate,
    },
    amounts: {
      antiDumping: antiDumpingDutyAmount,
      countervailing: countervailingDutyAmount,
      safeguard: safeguardDutyAmount,
      total: antiDumpingDutyAmount + countervailingDutyAmount + safeguardDutyAmount,
    },
  }
}

type PenaltyInputs = {
  assessedCustomsValuePhp: number
  dutiableValuePhp: number
  dutyRate: number
  surchargeRate: number
  tradeRemedyRate: number
  vatRate: number
  baseDutyTaxPhp: number
  misclassificationDetected?: unknown
  clericalError?: unknown
  latePaymentDays?: unknown
}

export const calculatePenaltyAmounts = (input: PenaltyInputs) => {
  const undervaluationDetected = input.assessedCustomsValuePhp > input.dutiableValuePhp * 1.1
  const valuationDeficiencyPhp = Math.max(0, input.assessedCustomsValuePhp - input.dutiableValuePhp)
  const deficiencyDutyTaxPhp = valuationDeficiencyPhp * (
    input.dutyRate + input.surchargeRate + input.tradeRemedyRate + input.vatRate
  )
  const undervaluationSurcharge = undervaluationDetected ? deficiencyDutyTaxPhp * 2.5 : 0

  const misclassificationDetected = Boolean(input.misclassificationDetected)
  const clericalError = Boolean(input.clericalError)
  const misclassificationSurcharge = misclassificationDetected && !clericalError
    ? input.baseDutyTaxPhp * 2.5
    : 0

  const latePaymentDays = Number.isFinite(Number(input.latePaymentDays))
    ? Math.max(0, Number(input.latePaymentDays))
    : 0
  const latePaymentInterest = input.baseDutyTaxPhp * 0.20 * (latePaymentDays / 365)

  return {
    undervaluationDetected,
    misclassificationDetected,
    clericalError,
    latePaymentDays,
    amounts: {
      undervaluationSurcharge,
      misclassificationSurcharge,
      latePaymentInterest,
      totalPenalties: undervaluationSurcharge + misclassificationSurcharge + latePaymentInterest,
    },
  }
}
