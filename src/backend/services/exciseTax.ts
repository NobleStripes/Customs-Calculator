/**
 * Philippines Excise Tax Engine — 2026 Statutory Rates
 *
 * Rates are based on the NIRC (National Internal Revenue Code) as amended by:
 *  - RA 10963 (TRAIN Law)
 *  - RA 11467 (alcohol/tobacco amendments)
 *  - RA 10963 Sec. 148-150 (petroleum)
 *  - RA 11534 (CREATE) automobile provisions
 *
 * These are hardcoded statutory values. They change only by act of Congress.
 */

export type ExciseTaxCategory =
  | 'distilled_spirits'
  | 'fermented_liquors'
  | 'wines'
  | 'cigarettes'
  | 'cigars'
  | 'automobiles'
  | 'sweetened_beverages'
  | 'petroleum'

export type ExciseTaxUnit =
  | 'proof_liter'   // distilled spirits
  | 'liter'         // beer, wine, sweetened beverages, petroleum
  | 'pack_20s'      // cigarettes (per pack of 20)
  | 'unit'          // cigars (per cigar stick) or automobiles (per vehicle)
  | 'cc'            // automobiles by engine displacement (not used for ad valorem; retained for reference)

export type SweetenedBeverageSugarType = 'sucrose_glucose' | 'hfcs' | 'other'
export type PetroleumProductType =
  | 'unleaded_gasoline'
  | 'leaded_gasoline'
  | 'aviation_turbo_jet_fuel'
  | 'kerosene'
  | 'diesel_fuel'
  | 'liquefied_petroleum_gas'
  | 'naphtha'
  | 'bunker_fuel'
  | 'lubricating_oils'
  | 'waxes_petrolatum'
  | 'denatured_alcohol'
  | 'asphalts'
  | 'other'

export type ExciseTaxInput = {
  category: ExciseTaxCategory
  /** Quantity in the specified unit (e.g. liters, packs) */
  quantity: number
  unit: ExciseTaxUnit
  /**
   * Net Retail Price or manufacturer's net wholesale price in PHP.
   * Required for: distilled_spirits (ad valorem component), wines, cigars, automobiles.
   * For automobiles this should be the Net Manufacturer Price (NMP) / Net Importer Price in PHP.
   */
  nrpOrDutiableValue: number
  /** Sub-type for sweetened beverages (sugar type). Defaults to 'other' (uses lower rate). */
  sweetenedBeverageSugarType?: SweetenedBeverageSugarType
  /** Sub-type for petroleum products. */
  petroleumProductType?: PetroleumProductType
}

export type ExciseTaxResult = {
  amount: number
  adValorem: number
  specific: number
  category: ExciseTaxCategory
  basis: string
  notes: string
}

// ---------------------------------------------------------------------------
// 2026 STATUTORY RATES
// ---------------------------------------------------------------------------

/** Distilled spirits — RA 11467 Sec. 141:
 *   - Ad valorem: 22% of NRP
 *   - Specific: ₱74.16 / proof liter (2026 rate, indexed annually per RA 11467) */
const DISTILLED_SPIRITS_AD_VALOREM_RATE = 0.22
const DISTILLED_SPIRITS_SPECIFIC_PER_PROOF_LITER = 74.16

/** Fermented liquors (beer) — RA 11467 Sec. 143:
 *   - Specific: ₱35 / liter */
const FERMENTED_LIQUORS_PER_LITER = 35

/** Wines — RA 11467 Sec. 142:
 *   - ≤ ₱500 NRP/liter: ₱50/liter
 *   - > ₱500 NRP/liter: ₱100/liter */
const WINE_LOW_NRP_THRESHOLD = 500
const WINE_LOW_RATE_PER_LITER = 50
const WINE_HIGH_RATE_PER_LITER = 100

/** Cigarettes — RA 11467 Sec. 145:
 *   - ₱65 / pack of 20 sticks (2026 post-indexation rate) */
const CIGARETTES_PER_PACK = 65

/** Cigars — RA 11467 Sec. 144:
 *   - 20% of NRP per cigar */
const CIGARS_AD_VALOREM_RATE = 0.20

/** Automobiles (passenger cars, SUVs, wagons) — RA 8424 Sec. 149 as amended:
 *   Based on manufacturer's / importer's net wholesale price (NMP) in PHP.
 *   - ≤ ₱600,000: 4%
 *   - > ₱600,000 ≤ ₱1,100,000: ₱24,000 + 10% on excess over ₱600,000
 *   - > ₱1,100,000 ≤ ₱2,100,000: ₱74,000 + 20% on excess over ₱1,100,000
 *   - > ₱2,100,000: ₱274,000 + 50% on excess over ₱2,100,000 */
const AUTO_TIERS = [
  { maxNmp: 600_000, baseExcise: 0, rate: 0.04, excessOver: 0 },
  { maxNmp: 1_100_000, baseExcise: 24_000, rate: 0.10, excessOver: 600_000 },
  { maxNmp: 2_100_000, baseExcise: 74_000, rate: 0.20, excessOver: 1_100_000 },
  { maxNmp: Infinity, baseExcise: 274_000, rate: 0.50, excessOver: 2_100_000 },
] as const

/** Sweetened beverages — RA 10963 Sec. 150-B:
 *   - Beverages using sucrose/glucose: ₱6/liter
 *   - Beverages using HFCS: ₱12/liter
 *   - Other caloric/non-caloric sweeteners: ₱6/liter */
const SWEETENED_BEV_SUCROSE_GLUCOSE_PER_LITER = 6
const SWEETENED_BEV_HFCS_PER_LITER = 12

/** Petroleum — RA 10963 Sec. 148-150 (₱/liter unless noted) */
const PETROLEUM_RATES: Record<PetroleumProductType, number> = {
  unleaded_gasoline: 10,
  leaded_gasoline: 10,
  aviation_turbo_jet_fuel: 4,
  kerosene: 4,
  diesel_fuel: 6,
  liquefied_petroleum_gas: 3,
  naphtha: 10,
  bunker_fuel: 2.50,
  lubricating_oils: 10,
  waxes_petrolatum: 6,
  denatured_alcohol: 0,
  asphalts: 8,
  other: 0,
}

// ---------------------------------------------------------------------------
// HS chapter → excise category mapping
// ---------------------------------------------------------------------------

/** Chapters that trigger excise tax, mapped to default category.
 *  Caller should refine sub-category (e.g. wine vs. spirits) via their own logic. */
const HS_CHAPTER_TO_EXCISE_CATEGORY: Record<number, ExciseTaxCategory> = {
  22: 'fermented_liquors', // Beverages, spirits and vinegar (broad; refined below)
  24: 'cigarettes',        // Tobacco and manufactured tobacco substitutes
  27: 'petroleum',         // Mineral fuels, oils
  87: 'automobiles',       // Vehicles other than railway
}

/** More precise AHTN heading (first 4 digits) → category overrides */
const HS_HEADING_TO_EXCISE_CATEGORY: Record<string, ExciseTaxCategory> = {
  '2203': 'fermented_liquors',   // Beer made from malt
  '2204': 'wines',               // Wine of fresh grapes
  '2205': 'wines',               // Vermouth
  '2206': 'wines',               // Other fermented beverages
  '2208': 'distilled_spirits',   // Undenatured ethyl alcohol / spirits
  '2202': 'sweetened_beverages', // Waters, incl. mineral water and aerated water, with added sugar
}

/**
 * Determine the excise tax category for a given HS code.
 * Returns 'none' if no excise tax applies.
 */
export const getExciseCategoryForHsCode = (hsCode: string): ExciseTaxCategory | 'none' => {
  const digits = hsCode.replace(/[^0-9]/g, '')
  if (digits.length < 4) return 'none'

  const heading = digits.slice(0, 4)
  if (HS_HEADING_TO_EXCISE_CATEGORY[heading]) {
    return HS_HEADING_TO_EXCISE_CATEGORY[heading]
  }

  const chapter = Number(digits.slice(0, 2))
  return HS_CHAPTER_TO_EXCISE_CATEGORY[chapter] ?? 'none'
}

/**
 * Whether calculating this excise category requires a quantity input.
 * All categories except automobiles require a volume/unit quantity.
 */
export const requiresExciseQuantity = (category: ExciseTaxCategory): boolean => true

/**
 * Whether the category requires an NRP / manufacturer's price input.
 */
export const requiresExciseNrp = (category: ExciseTaxCategory): boolean =>
  category === 'distilled_spirits' ||
  category === 'wines' ||
  category === 'cigars' ||
  category === 'automobiles'

/**
 * Return the applicable unit label for a category.
 */
export const getDefaultExciseUnit = (category: ExciseTaxCategory): ExciseTaxUnit => {
  if (category === 'cigarettes') return 'pack_20s'
  if (category === 'cigars') return 'unit'
  if (category === 'distilled_spirits') return 'proof_liter'
  if (category === 'automobiles') return 'unit'
  return 'liter'
}

// ---------------------------------------------------------------------------
// Main calculation function
// ---------------------------------------------------------------------------

/**
 * Calculate Philippine excise tax for a single line item.
 */
export const calculateExciseTax = (input: ExciseTaxInput): ExciseTaxResult => {
  const { category, quantity, nrpOrDutiableValue } = input

  switch (category) {
    case 'distilled_spirits': {
      const adValorem = nrpOrDutiableValue * DISTILLED_SPIRITS_AD_VALOREM_RATE
      const specific = quantity * DISTILLED_SPIRITS_SPECIFIC_PER_PROOF_LITER
      const amount = adValorem + specific
      return {
        amount,
        adValorem,
        specific,
        category,
        basis: `22% of NRP (₱${nrpOrDutiableValue.toFixed(2)}) + ₱${DISTILLED_SPIRITS_SPECIFIC_PER_PROOF_LITER}/proof liter × ${quantity} proof liters`,
        notes: 'RA 11467 Sec. 141 — Distilled Spirits (2026 rate)',
      }
    }

    case 'fermented_liquors': {
      const specific = quantity * FERMENTED_LIQUORS_PER_LITER
      return {
        amount: specific,
        adValorem: 0,
        specific,
        category,
        basis: `₱${FERMENTED_LIQUORS_PER_LITER}/liter × ${quantity} liters`,
        notes: 'RA 11467 Sec. 143 — Fermented Liquors/Beer',
      }
    }

    case 'wines': {
      const nrpPerLiter = quantity > 0 ? nrpOrDutiableValue / quantity : 0
      const ratePerLiter = nrpPerLiter <= WINE_LOW_NRP_THRESHOLD
        ? WINE_LOW_RATE_PER_LITER
        : WINE_HIGH_RATE_PER_LITER
      const specific = quantity * ratePerLiter
      return {
        amount: specific,
        adValorem: 0,
        specific,
        category,
        basis: `₱${ratePerLiter}/liter × ${quantity} liters (NRP/liter: ₱${nrpPerLiter.toFixed(2)})`,
        notes: `RA 11467 Sec. 142 — Wines (${nrpPerLiter <= WINE_LOW_NRP_THRESHOLD ? '≤' : '>'} ₱${WINE_LOW_NRP_THRESHOLD} NRP/liter tier)`,
      }
    }

    case 'cigarettes': {
      const specific = quantity * CIGARETTES_PER_PACK
      return {
        amount: specific,
        adValorem: 0,
        specific,
        category,
        basis: `₱${CIGARETTES_PER_PACK}/pack × ${quantity} pack(s) of 20`,
        notes: 'RA 11467 Sec. 145 — Cigarettes packed by machine (2026 rate)',
      }
    }

    case 'cigars': {
      const adValorem = nrpOrDutiableValue * CIGARS_AD_VALOREM_RATE
      return {
        amount: adValorem,
        adValorem,
        specific: 0,
        category,
        basis: `20% of NRP (₱${nrpOrDutiableValue.toFixed(2)})`,
        notes: 'RA 11467 Sec. 144 — Cigars',
      }
    }

    case 'automobiles': {
      const nmp = nrpOrDutiableValue
      let excise = 0
      let tierNote = ''
      for (const tier of AUTO_TIERS) {
        if (nmp <= tier.maxNmp) {
          excise = tier.baseExcise + (nmp - tier.excessOver) * tier.rate
          tierNote = `₱${tier.baseExcise.toLocaleString()} + ${(tier.rate * 100).toFixed(0)}% of excess over ₱${tier.excessOver.toLocaleString()}`
          break
        }
      }
      return {
        amount: excise * quantity,
        adValorem: excise * quantity,
        specific: 0,
        category,
        basis: `${tierNote} = ₱${excise.toFixed(2)} × ${quantity} unit(s), NMP = ₱${nmp.toLocaleString()}`,
        notes: 'RA 8424 Sec. 149 as amended — Automobiles',
      }
    }

    case 'sweetened_beverages': {
      const sugarType = input.sweetenedBeverageSugarType ?? 'other'
      const ratePerLiter = sugarType === 'hfcs'
        ? SWEETENED_BEV_HFCS_PER_LITER
        : SWEETENED_BEV_SUCROSE_GLUCOSE_PER_LITER
      const specific = quantity * ratePerLiter
      return {
        amount: specific,
        adValorem: 0,
        specific,
        category,
        basis: `₱${ratePerLiter}/liter × ${quantity} liters (${sugarType})`,
        notes: 'RA 10963 Sec. 150-B — Sweetened Beverages',
      }
    }

    case 'petroleum': {
      const productType = input.petroleumProductType ?? 'other'
      const ratePerLiter = PETROLEUM_RATES[productType]
      const specific = quantity * ratePerLiter
      return {
        amount: specific,
        adValorem: 0,
        specific,
        category,
        basis: `₱${ratePerLiter}/liter × ${quantity} liters (${productType.replace(/_/g, ' ')})`,
        notes: 'RA 10963 Sec. 148-150 — Petroleum Products',
      }
    }

    default: {
      const _exhaustive: never = category
      return {
        amount: 0,
        adValorem: 0,
        specific: 0,
        category: _exhaustive,
        basis: 'N/A',
        notes: 'No excise tax applicable',
      }
    }
  }
}
