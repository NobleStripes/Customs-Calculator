import { describe, expect, it } from 'vitest'
import {
  applyInsuranceBenchmark,
  checkDeMinimis,
  estimatePortHandlingFees,
  evaluateSection800Exemption,
  getBrokerageFeePhp,
  getImportProcessingChargePhp,
} from './customsRules'
import { calculateExciseTax } from './exciseTax'

describe('calculation rule boundaries', () => {
  it('switches de minimis treatment immediately above 10,000 PHP, except for alcohol and tobacco', () => {
    expect(checkDeMinimis(10_000, '8471.30.10').exempt).toBe(true)
    expect(checkDeMinimis(10_000.01, '8471.30.10').exempt).toBe(false)
    expect(checkDeMinimis(0, '2203.00.00').exempt).toBe(false)
    expect(checkDeMinimis(0, '2402.20.10').exempt).toBe(false)
  })

  it('uses actual insurance when positive and benchmarks zero insurance by HS chapter', () => {
    expect(applyInsuranceBenchmark(50_000, 1, '8471.30.10')).toEqual({ insurance: 1, benchmarkApplied: false })
    expect(applyInsuranceBenchmark(50_000, 0, '8471.30.10')).toEqual({ insurance: 1_000, benchmarkApplied: true })
    expect(applyInsuranceBenchmark(50_000, 0, '2801.10.00')).toEqual({ insurance: 2_000, benchmarkApplied: true })
  })

  it.each([
    [25_000, 250, 1_000],
    [25_000.01, 500, 1_000],
    [50_000, 500, 1_000],
    [50_000.01, 750, 1_500],
    [5_000_000, 3_000, 9_000],
    [5_000_000.01, 4_000, 10_000],
  ])('keeps the processing and brokerage tiers at %s PHP', (value, processing, brokerage) => {
    expect(getImportProcessingChargePhp(value)).toBe(processing)
    expect(getBrokerageFeePhp(value)).toBe(brokerage)
  })

  it('allows exactly three balikbayan boxes at the value ceiling, then rejects the next box or cent', () => {
    const input = { importerStatus: 'balikbayan', fobValuePhp: 150_000, balikbayanBoxesThisYear: 3, isCommercialQuantity: false }
    expect(evaluateSection800Exemption(input)).toMatchObject({ eligible: true, exemptAmountPhp: 150_000 })
    expect(evaluateSection800Exemption({ ...input, balikbayanBoxesThisYear: 4 })).toMatchObject({ eligible: false, exemptAmountPhp: 0 })
    expect(evaluateSection800Exemption({ ...input, fobValuePhp: 150_000.01 })).toMatchObject({ eligible: false, exemptAmountPhp: 0 })
    expect(evaluateSection800Exemption({ ...input, isCommercialQuantity: true })).toMatchObject({ eligible: false, exemptAmountPhp: 0 })
  })

  it.each([
    [5, 0],
    [6, 150_000],
    [59, 150_000],
    [60, 250_000],
    [119, 250_000],
    [120, 350_000],
  ])('applies the returning-resident cap at %s months', (monthsAbroad, cap) => {
    const result = evaluateSection800Exemption({ importerStatus: 'returning_resident', itemCondition: 'used', monthsAbroad, fobValuePhp: 500_000 })
    expect(result.exemptAmountPhp).toBe(cap)
    expect(result.eligible).toBe(cap > 0)
  })

  it('requires used goods for returning residents and a first annual appliance claim for OFWs', () => {
    expect(evaluateSection800Exemption({ importerStatus: 'returning_resident', itemCondition: 'new', monthsAbroad: 120, fobValuePhp: 100_000 }).eligible).toBe(false)
    const ofw = { importerStatus: 'ofw', fobValuePhp: 200_000, ofwHomeApplianceClaim: true }
    expect(evaluateSection800Exemption(ofw)).toMatchObject({ eligible: true, exemptAmountPhp: 150_000 })
    expect(evaluateSection800Exemption({ ...ofw, ofwHomeApplianceAlreadyAvailedThisYear: true })).toMatchObject({ eligible: false, exemptAmountPhp: 0 })
  })

  it('changes port tariff on July 1 and starts storage after five free days', () => {
    const input = { containerSize: '20ft', dutiableValuePhp: 100_000 }
    const h1 = estimatePortHandlingFees({ ...input, arrivalDate: '2026-06-30', storageDelayDays: 5 })
    const h2 = estimatePortHandlingFees({ ...input, arrivalDate: '2026-07-01', storageDelayDays: 6 })
    expect(h1).toMatchObject({ tariffTranche: '2026-h1', arrastre: 1_612, chargeableStorageDays: 0, storage: 0 })
    expect(h2).toMatchObject({ tariffTranche: '2026-h2', arrastre: 1_758, chargeableStorageDays: 1, storage: 132 })
  })
})

describe('special excise-rate boundaries', () => {
  it('moves wine to the higher specific rate above 500 PHP NRP per liter', () => {
    const input = { category: 'wines' as const, quantity: 2, unit: 'liter' as const }
    expect(calculateExciseTax({ ...input, nrpOrDutiableValue: 1_000 }).amount).toBe(100)
    expect(calculateExciseTax({ ...input, nrpOrDutiableValue: 1_000.01 }).amount).toBe(200)
  })

  it.each([
    [600_000, 24_000],
    [600_001, 24_000.10],
    [1_100_000, 74_000],
    [1_100_001, 74_000.20],
    [2_100_000, 274_000],
    [2_100_001, 274_000.50],
  ])('keeps the automobile rate tier at %s PHP NMP', (nmp, amount) => {
    expect(calculateExciseTax({ category: 'automobiles', quantity: 1, unit: 'unit', nrpOrDutiableValue: nmp }).amount).toBeCloseTo(amount)
  })

  it('gives zero specific excise for zero quantity and the configured HFCS and diesel rates otherwise', () => {
    expect(calculateExciseTax({ category: 'fermented_liquors', quantity: 0, unit: 'liter', nrpOrDutiableValue: 0 }).amount).toBe(0)
    expect(calculateExciseTax({ category: 'sweetened_beverages', quantity: 2, unit: 'liter', nrpOrDutiableValue: 0, sweetenedBeverageSugarType: 'hfcs' }).amount).toBe(24)
    expect(calculateExciseTax({ category: 'petroleum', quantity: 10, unit: 'liter', nrpOrDutiableValue: 0, petroleumProductType: 'diesel_fuel' }).amount).toBe(60)
  })
})
