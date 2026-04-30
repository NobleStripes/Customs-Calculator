import { describe, expect, it } from 'vitest'
import {
  calculateExciseTax,
  getExciseCategoryForHsCode,
  requiresExciseNrp,
  getDefaultExciseUnit,
} from './exciseTax'

describe('exciseTax', () => {
  // ---------------------------------------------------------------------------
  // getExciseCategoryForHsCode
  // ---------------------------------------------------------------------------
  describe('getExciseCategoryForHsCode', () => {
    it('maps beer headings (2203) to fermented_liquors', () => {
      expect(getExciseCategoryForHsCode('2203.00.00')).toBe('fermented_liquors')
    })

    it('maps wine headings (2204, 2205, 2206) to wines', () => {
      expect(getExciseCategoryForHsCode('2204.10.00')).toBe('wines')
      expect(getExciseCategoryForHsCode('2205.90.00')).toBe('wines')
      expect(getExciseCategoryForHsCode('2206.00.10')).toBe('wines')
    })

    it('maps spirits heading (2208) to distilled_spirits', () => {
      expect(getExciseCategoryForHsCode('2208.30.00')).toBe('distilled_spirits')
    })

    it('maps sweetened beverages (2202) to sweetened_beverages', () => {
      expect(getExciseCategoryForHsCode('2202.10.00')).toBe('sweetened_beverages')
    })

    it('maps tobacco chapter (24) to cigarettes', () => {
      expect(getExciseCategoryForHsCode('2402.20.10')).toBe('cigarettes')
    })

    it('maps petroleum chapter (27) to petroleum', () => {
      expect(getExciseCategoryForHsCode('2710.12.00')).toBe('petroleum')
    })

    it('maps automobiles chapter (87) to automobiles', () => {
      expect(getExciseCategoryForHsCode('8703.23.00')).toBe('automobiles')
    })

    it('returns none for non-excise goods', () => {
      expect(getExciseCategoryForHsCode('8471.30.00')).toBe('none')
      expect(getExciseCategoryForHsCode('6203.42.00')).toBe('none')
    })
  })

  // ---------------------------------------------------------------------------
  // requiresExciseNrp
  // ---------------------------------------------------------------------------
  describe('requiresExciseNrp', () => {
    it('requires NRP for distilled spirits, wines, cigars, and automobiles', () => {
      expect(requiresExciseNrp('distilled_spirits')).toBe(true)
      expect(requiresExciseNrp('wines')).toBe(true)
      expect(requiresExciseNrp('cigars')).toBe(true)
      expect(requiresExciseNrp('automobiles')).toBe(true)
    })

    it('does not require NRP for specific-only categories', () => {
      expect(requiresExciseNrp('fermented_liquors')).toBe(false)
      expect(requiresExciseNrp('cigarettes')).toBe(false)
      expect(requiresExciseNrp('sweetened_beverages')).toBe(false)
      expect(requiresExciseNrp('petroleum')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // getDefaultExciseUnit
  // ---------------------------------------------------------------------------
  describe('getDefaultExciseUnit', () => {
    it('returns correct default units per category', () => {
      expect(getDefaultExciseUnit('distilled_spirits')).toBe('proof_liter')
      expect(getDefaultExciseUnit('fermented_liquors')).toBe('liter')
      expect(getDefaultExciseUnit('wines')).toBe('liter')
      expect(getDefaultExciseUnit('cigarettes')).toBe('pack_20s')
      expect(getDefaultExciseUnit('cigars')).toBe('unit')
      expect(getDefaultExciseUnit('automobiles')).toBe('unit')
      expect(getDefaultExciseUnit('sweetened_beverages')).toBe('liter')
      expect(getDefaultExciseUnit('petroleum')).toBe('liter')
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Distilled Spirits
  // ---------------------------------------------------------------------------
  describe('distilled_spirits', () => {
    it('computes 22% NRP ad valorem + ₱74.16/proof liter specific for 1 proof liter at ₱1,000 NRP', () => {
      const result = calculateExciseTax({
        category: 'distilled_spirits',
        quantity: 1,
        nrpOrDutiableValue: 1000,
      })
      expect(result.adValorem).toBeCloseTo(220, 2)
      expect(result.specific).toBeCloseTo(74.16, 2)
      expect(result.amount).toBeCloseTo(294.16, 2)
    })

    it('scales linearly with quantity (2 proof liters)', () => {
      const result = calculateExciseTax({
        category: 'distilled_spirits',
        quantity: 2,
        nrpOrDutiableValue: 2000,
      })
      expect(result.specific).toBeCloseTo(148.32, 2)
      expect(result.adValorem).toBeCloseTo(440, 2)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Fermented Liquors (Beer)
  // ---------------------------------------------------------------------------
  describe('fermented_liquors (beer)', () => {
    it('computes ₱35/liter specific for 2 liters → ₱70', () => {
      const result = calculateExciseTax({
        category: 'fermented_liquors',
        quantity: 2,
        nrpOrDutiableValue: 0,
      })
      expect(result.amount).toBeCloseTo(70, 2)
      expect(result.adValorem).toBe(0)
      expect(result.specific).toBeCloseTo(70, 2)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Wines
  // ---------------------------------------------------------------------------
  describe('wines', () => {
    it('applies ₱50/liter when NRP/liter ≤ ₱500 (1L at ₱400 NRP → ₱50)', () => {
      const result = calculateExciseTax({
        category: 'wines',
        quantity: 1,
        nrpOrDutiableValue: 400,
      })
      expect(result.amount).toBeCloseTo(50, 2)
    })

    it('applies ₱100/liter when NRP/liter > ₱500 (1L at ₱600 NRP → ₱100)', () => {
      const result = calculateExciseTax({
        category: 'wines',
        quantity: 1,
        nrpOrDutiableValue: 600,
      })
      expect(result.amount).toBeCloseTo(100, 2)
    })

    it('applies ₱50/liter at exactly ₱500 NRP/liter threshold', () => {
      const result = calculateExciseTax({
        category: 'wines',
        quantity: 1,
        nrpOrDutiableValue: 500,
      })
      expect(result.amount).toBeCloseTo(50, 2)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Cigarettes
  // ---------------------------------------------------------------------------
  describe('cigarettes', () => {
    it('computes ₱65/pack for 1 pack → ₱65', () => {
      const result = calculateExciseTax({
        category: 'cigarettes',
        quantity: 1,
        nrpOrDutiableValue: 0,
      })
      expect(result.amount).toBeCloseTo(65, 2)
    })

    it('scales for multiple packs (3 packs → ₱195)', () => {
      const result = calculateExciseTax({
        category: 'cigarettes',
        quantity: 3,
        nrpOrDutiableValue: 0,
      })
      expect(result.amount).toBeCloseTo(195, 2)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Automobiles
  // ---------------------------------------------------------------------------
  describe('automobiles', () => {
    it('applies 4% for NMP ≤ ₱600,000 (₱500K → ₱20,000)', () => {
      const result = calculateExciseTax({
        category: 'automobiles',
        quantity: 1,
        nrpOrDutiableValue: 500_000,
      })
      expect(result.amount).toBeCloseTo(20_000, 0)
    })

    it('applies ₱24,000 + 10% on excess over ₱600K for NMP in second tier (₱800K)', () => {
      // excise = 24,000 + 10% × (800,000 - 600,000) = 24,000 + 20,000 = 44,000
      const result = calculateExciseTax({
        category: 'automobiles',
        quantity: 1,
        nrpOrDutiableValue: 800_000,
      })
      expect(result.amount).toBeCloseTo(44_000, 0)
    })

    it('applies ₱74,000 + 20% on excess over ₱1.1M for NMP in third tier (₱1.5M)', () => {
      // excise = 74,000 + 20% × (1,500,000 - 1,100,000) = 74,000 + 80,000 = 154,000
      const result = calculateExciseTax({
        category: 'automobiles',
        quantity: 1,
        nrpOrDutiableValue: 1_500_000,
      })
      expect(result.amount).toBeCloseTo(154_000, 0)
    })

    it('multiplies by quantity for multiple units', () => {
      const single = calculateExciseTax({ category: 'automobiles', quantity: 1, nrpOrDutiableValue: 500_000 })
      const double = calculateExciseTax({ category: 'automobiles', quantity: 2, nrpOrDutiableValue: 500_000 })
      expect(double.amount).toBeCloseTo(single.amount * 2, 0)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Sweetened Beverages
  // ---------------------------------------------------------------------------
  describe('sweetened_beverages', () => {
    it('applies ₱6/liter for sucrose/glucose sweeteners (1L → ₱6)', () => {
      const result = calculateExciseTax({
        category: 'sweetened_beverages',
        quantity: 1,
        nrpOrDutiableValue: 0,
        sweetenedBeverageSugarType: 'sucrose_glucose',
      })
      expect(result.amount).toBeCloseTo(6, 2)
    })

    it('applies ₱12/liter for HFCS sweeteners (2L → ₱24)', () => {
      const result = calculateExciseTax({
        category: 'sweetened_beverages',
        quantity: 2,
        nrpOrDutiableValue: 0,
        sweetenedBeverageSugarType: 'hfcs',
      })
      expect(result.amount).toBeCloseTo(24, 2)
    })

    it('defaults to ₱6/liter for other sweeteners', () => {
      const result = calculateExciseTax({
        category: 'sweetened_beverages',
        quantity: 1,
        nrpOrDutiableValue: 0,
        sweetenedBeverageSugarType: 'other',
      })
      expect(result.amount).toBeCloseTo(6, 2)
    })
  })

  // ---------------------------------------------------------------------------
  // calculateExciseTax — Petroleum
  // ---------------------------------------------------------------------------
  describe('petroleum', () => {
    it('applies ₱6/liter for diesel_fuel (10L → ₱60)', () => {
      const result = calculateExciseTax({
        category: 'petroleum',
        quantity: 10,
        nrpOrDutiableValue: 0,
        petroleumProductType: 'diesel_fuel',
      })
      expect(result.amount).toBeCloseTo(60, 2)
    })

    it('applies ₱10/liter for unleaded_gasoline (5L → ₱50)', () => {
      const result = calculateExciseTax({
        category: 'petroleum',
        quantity: 5,
        nrpOrDutiableValue: 0,
        petroleumProductType: 'unleaded_gasoline',
      })
      expect(result.amount).toBeCloseTo(50, 2)
    })

    it('applies ₱0 for denatured_alcohol', () => {
      const result = calculateExciseTax({
        category: 'petroleum',
        quantity: 100,
        nrpOrDutiableValue: 0,
        petroleumProductType: 'denatured_alcohol',
      })
      expect(result.amount).toBe(0)
    })
  })
})
