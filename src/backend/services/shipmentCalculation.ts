import {
  BIR_DOCUMENTARY_STAMP_TAX_PHP,
  CUSTOMS_DOCUMENTARY_STAMP_PHP,
  LEGAL_RESEARCH_FUND_PHP,
  TRANSIT_CHARGE_PHP,
  estimatePortHandlingFees,
  getBrokerageFeePhp,
  getContainerSecurityFeeUsd,
  getImportProcessingChargePhp,
} from './customsRules'
import {
  calculateExciseTax,
  getExciseCategoryForHsCode,
  type ExciseTaxCategory,
  type ExciseTaxUnit,
  type PetroleumProductType,
  type SweetenedBeverageSugarType,
} from './exciseTax'
import type { CurrencyConverter } from './currencyConverter'

type ShipmentInput = Record<string, unknown>

export const estimateShipmentPortFees = (shipment: ShipmentInput, dutiableValuePhp: number) =>
  estimatePortHandlingFees({
    arrivalDate: typeof shipment.arrivalDate === 'string' ? shipment.arrivalDate : undefined,
    containerSize: typeof shipment.containerSize === 'string' ? shipment.containerSize : '20ft',
    storageDelayDays: Number.isFinite(Number(shipment.storageDelayDays)) ? Number(shipment.storageDelayDays) : 0,
    dutiableValuePhp,
  })

export const getArrastreWharfagePhp = (shipment: ShipmentInput, estimatedPortHandlingPhp: number): number =>
  Number(shipment.arrastreWharfage || 0) > 0
    ? Number(shipment.arrastreWharfage || 0)
    : estimatedPortHandlingPhp

export const calculateShipmentExcise = (shipment: ShipmentInput, hsCode: string, dutiableValuePhp: number) => {
  const category: ExciseTaxCategory | 'none' =
    (typeof shipment.exciseCategory === 'string' && shipment.exciseCategory !== 'none'
      ? shipment.exciseCategory as ExciseTaxCategory
      : getExciseCategoryForHsCode(hsCode))
  let tax = {
    amount: 0, adValorem: 0, specific: 0,
    category: category === 'none' ? 'none' : category,
    basis: 'N/A', notes: 'No excise tax applicable',
  }
  if (category !== 'none') {
    const quantity = Number.isFinite(Number(shipment.exciseQuantity)) ? Number(shipment.exciseQuantity) : 0
    if (quantity > 0) {
      tax = {
        ...calculateExciseTax({
          category,
          quantity,
          unit: (shipment.exciseUnit as ExciseTaxUnit) ?? 'liter',
          nrpOrDutiableValue: Number.isFinite(Number(shipment.exciseNrp)) ? Number(shipment.exciseNrp) : dutiableValuePhp,
          sweetenedBeverageSugarType: shipment.sweetenedBeverageSugarType as SweetenedBeverageSugarType | undefined,
          petroleumProductType: shipment.petroleumProductType as PetroleumProductType | undefined,
        }),
        category,
      }
    }
  }
  return { category, tax }
}

export const calculateShipmentFees = async (
  shipment: ShipmentInput,
  dutiableValuePhp: number,
  estimatedPortHandlingPhp: number,
  currencyConverter: Pick<CurrencyConverter, 'convert'>
) => {
  const brokerageFeePhp = getBrokerageFeePhp(dutiableValuePhp)
  const csfUsd = getContainerSecurityFeeUsd(String(shipment.containerSize || '20ft').toLowerCase())
  let csfPhp = 0
  if (csfUsd > 0) {
    const csfConversionResult = await currencyConverter.convert(csfUsd, 'USD', 'PHP')
    csfPhp = csfConversionResult.convertedAmount
  }
  const declarationType = String(shipment.declarationType || 'consumption').toLowerCase()
  const transitChargePhp = declarationType === 'transit' ? TRANSIT_CHARGE_PHP : 0
  const ipcPhp = declarationType === 'transit' ? 250 : getImportProcessingChargePhp(dutiableValuePhp)
  const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
  const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
  const lrfPhp = LEGAL_RESEARCH_FUND_PHP
  const arrastreWharfagePhp = getArrastreWharfagePhp(shipment, estimatedPortHandlingPhp)
  const doxStampOthersPhp = Number(shipment.doxStampOthers || 0)
  const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp + lrfPhp

  return {
    brokerageFeePhp,
    csfPhp,
    transitChargePhp,
    ipcPhp,
    cdsPhp,
    irsPhp,
    lrfPhp,
    arrastreWharfagePhp,
    doxStampOthersPhp,
    totalGlobalFeesPhp,
  }
}

type VatBaseInputs = {
  dutiableValuePhp: number
  dutyAmountPhp: number
  dutySurchargePhp: number
  tradeRemedyDutyPhp: number
  exciseTaxPhp: number
  fees: Awaited<ReturnType<typeof calculateShipmentFees>>
}

export const calculateLandedCostSubtotal = ({
  dutiableValuePhp,
  dutyAmountPhp,
  dutySurchargePhp,
  tradeRemedyDutyPhp,
  exciseTaxPhp,
  fees,
}: VatBaseInputs): number =>
  dutiableValuePhp +
  dutyAmountPhp +
  dutySurchargePhp +
  tradeRemedyDutyPhp +
  exciseTaxPhp +
  fees.brokerageFeePhp +
  fees.ipcPhp +
  fees.cdsPhp +
  fees.irsPhp +
  fees.lrfPhp +
  fees.transitChargePhp +
  fees.csfPhp +
  fees.arrastreWharfagePhp +
  fees.doxStampOthersPhp
