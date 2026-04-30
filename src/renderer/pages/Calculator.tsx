import React, { useEffect, useState } from 'react'
import { HSCodeSearch } from '../components/HSCodeSearch'
import { CalculationResults } from '../components/CalculationResults'
import { appApi, type AppHsCodeRow } from '../lib/appApi'
import { useSettingsStore } from '../lib/settingsStore'
import './Calculator.css'

interface CalculationPayload {
  value: number
  freight: number
  insurance: number
  hsCode: string
  scheduleCode: string
  originCountry: string
  destinationPort: string
  currency: string
  containerSize: 'none' | '20ft' | '40ft'
  arrastreWharfage: number
  doxStampOthers: number
  declarationType: 'consumption' | 'warehousing' | 'transit'
  exciseCategory?: string
  exciseQuantity?: number
  exciseUnit?: string
  exciseNrp?: number
  sweetenedBeverageSugarType?: string
  petroleumProductType?: string
}

interface CalculationResultsData {
  duty: {
    rate: number
    amount: number
    surcharge: number
    notes?: string
  }
  tariff: {
    scheduleCode: string
  }
  vat: {
    rate: number
    amount: number
  }
  compliance?: {
    requiredDocuments?: string[]
    requirements?: string[]
    restrictions?: string[]
    warnings?: string[]
  }
  costBase: {
    fob: number
    freight: number
    insurance: number
    taxableValue: number
    brokerageFee: number
    arrastreWharfage: number
    doxStampOthers: number
    vatBase: number
  }
  breakdown: {
    itemTaxes: {
      cud: number
      excise: number
      vat: number
      totalItemTax: number
    }
    globalFees: {
      transitCharge: number
      ipc: number
      csf: number
      cds: number
      irs: number
      lrf: number
      totalGlobalTax: number
    }
    totalTaxAndFees: number
  }
  exciseTax: {
    amount: number
    adValorem: number
    specific: number
    category: string
    basis: string
    notes: string
  }
  landedCostSubtotal: number
  deMinimisExempt: boolean
  deMinimisReason?: string
  entryType: 'de_minimis' | 'informal' | 'formal'
  insuranceBenchmarkApplied: boolean
  totalLandedCost: number
  calculationCurrency: 'PHP'
  fx: {
    applied: boolean
    rateToPhp: number
    inputCurrency: string
    baseCurrency: 'PHP'
    source?: 'cache' | 'live' | 'fallback' | 'identity' | 'boc'
    timestamp?: string
  }
}

type TariffScheduleOption = {
  code: string
  displayName: string
}

type HistoryEntry = {
  id: number
  hs_code: string
  value: number
  currency: string
  duty_amount: number
  vat_amount: number
  total_landed_cost: number
  created_at: string
}

const HISTORY_LIMIT = 10

const formatCurrency = (amount: number, currency = 'PHP') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

/** Detect excise category client-side for showing the excise input section. Mirrors server-side logic. */
function detectExciseCategory(hsCode: string): string | null {
  const compact = hsCode.replace(/\./g, '').replace(/\s/g, '')
  if (compact.length < 4) return null
  const chapter = parseInt(compact.slice(0, 2), 10)
  if (chapter === 22) {
    const heading = parseInt(compact.slice(0, 4), 10)
    if (heading === 2208) return 'distilled_spirits'
    if (heading === 2203) return 'fermented_liquors'
    if (heading >= 2204 && heading <= 2206) return 'wines'
    if (heading === 2202) return 'sweetened_beverages'
    return null
  }
  if (chapter === 24) {
    const heading = parseInt(compact.slice(0, 4), 10)
    return heading === 2402 ? 'cigars' : 'cigarettes'
  }
  if (chapter === 27) return 'petroleum'
  if (chapter === 87) {
    const heading = parseInt(compact.slice(0, 4), 10)
    if (heading >= 8703 && heading <= 8704) return 'automobiles'
  }
  return null
}

const EXCISE_UNIT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  distilled_spirits: [{ value: 'proof_liter', label: 'Proof Liter' }, { value: 'liter', label: 'Liter' }],
  fermented_liquors: [{ value: 'liter', label: 'Liter' }],
  wines: [{ value: 'liter', label: 'Liter' }],
  cigarettes: [{ value: 'pack_20s', label: 'Pack of 20' }],
  cigars: [{ value: 'unit', label: 'Unit (stick)' }],
  automobiles: [{ value: 'unit', label: 'Unit (vehicle)' }],
  sweetened_beverages: [{ value: 'liter', label: 'Liter' }],
  petroleum: [{ value: 'liter', label: 'Liter' }],
}

const EXCISE_NEEDS_NRP = new Set(['distilled_spirits', 'wines', 'cigars', 'automobiles'])

export const Calculator: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings)
  const [formData, setFormData] = useState<CalculationPayload>(() => ({
    value: 0,
    freight: 0,
    insurance: 0,
    hsCode: '',
    scheduleCode: settings.defaultScheduleCode || 'MFN',
    originCountry: settings.defaultOriginCountry || '',
    destinationPort: 'MNL',
    currency: 'USD',
    containerSize: '20ft',
    arrastreWharfage: 0,
    doxStampOthers: 0,
    declarationType: 'consumption',
    exciseCategory: undefined,
    exciseQuantity: undefined,
    exciseUnit: undefined,
    exciseNrp: undefined,
    sweetenedBeverageSugarType: undefined,
    petroleumProductType: undefined,
  }))

  const [detectedExciseCategory, setDetectedExciseCategory] = useState<string | null>(null)

  const [results, setResults] = useState<CalculationResultsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fxPreview, setFxPreview] = useState<{
    inputCurrency: string
    rateToPhp: number
    source?: string
  } | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [hsCodeValidationMessage, setHsCodeValidationMessage] = useState<string | null>(null)
  const [tariffSchedules, setTariffSchedules] = useState<TariffScheduleOption[]>([
    { code: 'MFN', displayName: 'Most-Favored-Nation' },
  ])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [selectedLookupRow, setSelectedLookupRow] = useState<AppHsCodeRow | null>(null)

  const reloadHistory = async () => {
    try {
      const result = await appApi.getCalculationHistory(HISTORY_LIMIT)
      if (result.success && result.data) {
        setHistory(result.data as HistoryEntry[])
      }
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      void reloadHistory()
    }, 0)

    return () => clearTimeout(handle)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadTariffSchedules = async () => {
      try {
        const result = await appApi.getTariffSchedules()
        if (!cancelled && result.success && result.data && result.data.length > 0) {
          setTariffSchedules(result.data)
        }
      } catch (scheduleError) {
        if (!cancelled) {
          console.error('Failed to load tariff schedules:', scheduleError)
        }
      }
    }

    loadTariffSchedules()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadFxPreview = async () => {
      const inputCurrency = formData.currency.toUpperCase()

      if (inputCurrency === 'PHP') {
        setFxPreview(null)
        return
      }

      setFxLoading(true)
      try {
        const result = await appApi.convertCurrency({
          amount: 1,
          fromCurrency: inputCurrency,
          toCurrency: 'PHP',
        })

        if (!cancelled && result.success && result.data) {
          setFxPreview({
            inputCurrency,
            rateToPhp: result.data.rate,
            source: result.data.source,
          })
        }
      } catch (fxError) {
        if (!cancelled) {
          setFxPreview(null)
          console.error('Failed to load FX preview:', fxError)
        }
      } finally {
        if (!cancelled) {
          setFxLoading(false)
        }
      }
    }

    loadFxPreview()

    return () => {
      cancelled = true
    }
  }, [formData.currency])

  useEffect(() => {
    let cancelled = false
    const normalizedInput = formData.hsCode.trim()
    const compactInput = normalizedInput.replace(/\./g, '')
    const selectedLookupMatchesInput =
      selectedLookupRow?.code.replace(/\./g, '').toUpperCase() === compactInput.toUpperCase()

    if (!normalizedInput) {
      return
    }

    if (compactInput.length < 4) {
      return
    }

    const validateHandle = setTimeout(async () => {
      const result = await appApi.resolveHSCode(normalizedInput)

      if (cancelled) {
        return
      }

      setHsCodeValidationMessage(
        result.success && result.data
          ? null
          : selectedLookupMatchesInput
            ? 'Matched an official Tariff Commission Finder result. Calculation will still require an approved local tariff row.'
            : 'Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.'
      )
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(validateHandle)
    }
  }, [formData.hsCode, selectedLookupRow])

  const handleHSCodeSelect = (code: string, selection?: AppHsCodeRow) => {
    setHsCodeValidationMessage(null)
    setSelectedLookupRow(selection || null)
    const detectedCat = detectExciseCategory(code)
    setDetectedExciseCategory(detectedCat)
    setFormData((prev) => ({
      ...prev,
      hsCode: code,
      exciseCategory: detectedCat ?? undefined,
      exciseUnit: detectedCat ? (EXCISE_UNIT_OPTIONS[detectedCat]?.[0]?.value ?? undefined) : undefined,
    }))
  }

  const handleCalculate = async () => {
    if (!formData.hsCode || formData.value <= 0) {
      setError('Please enter a valid HS code and product value')
      return
    }

    const resolvedResult = await appApi.resolveHSCode(formData.hsCode)
    const resolvedCode = resolvedResult.success ? resolvedResult.data : null

    if (!resolvedCode) {
      setError(
        selectedLookupRow?.sourceType === 'official-site' || selectedLookupRow?.sourceType === 'official-site-cache'
          ? 'The official tariff finder matched this HS code, but there is no approved local tariff row for calculation yet. Import or review the tariff data first.'
          : 'Typed HS code does not resolve to a known tariff code. Choose a suggestion or enter a full valid HS code before calculating.'
      )
      setHsCodeValidationMessage(
        selectedLookupRow?.sourceType === 'official-site' || selectedLookupRow?.sourceType === 'official-site-cache'
          ? 'Official tariff finder match selected. Calculation still depends on approved local tariff data.'
          : 'Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.'
      )
      return
    }

    const canonicalHsCode = resolvedCode.code
    setFormData((prev) => ({ ...prev, hsCode: canonicalHsCode }))
    setLoading(true)
    setError(null)
    setHsCodeValidationMessage(null)

    try {
      const batchResult = await appApi.batchCalculate([{
        hsCode: canonicalHsCode,
        scheduleCode: formData.scheduleCode,
        value: formData.value,
        freight: formData.freight,
        insurance: formData.insurance,
        originCountry: formData.originCountry,
        destinationPort: formData.destinationPort,
        currency: formData.currency,
        declarationType: formData.declarationType,
        containerSize: formData.containerSize,
        arrastreWharfage: formData.arrastreWharfage,
        doxStampOthers: formData.doxStampOthers,
        exciseCategory: formData.exciseCategory,
        exciseQuantity: formData.exciseQuantity,
        exciseUnit: formData.exciseUnit,
        exciseNrp: formData.exciseNrp,
        sweetenedBeverageSugarType: formData.sweetenedBeverageSugarType,
        petroleumProductType: formData.petroleumProductType,
      }])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchResultAny = batchResult as any
      if (!batchResultAny.success || !batchResultAny.data?.[0]) {
        throw new Error(batchResultAny.error || 'Calculation returned no data')
      }

      const r = batchResultAny.data[0]
      setResults({
        duty: r.duty,
        tariff: { scheduleCode: r.scheduleCode },
        vat: r.vat,
        compliance: r.compliance,
        costBase: {
          fob: formData.value,
          freight: formData.freight,
          insurance: formData.insurance,
          taxableValue: r.costBase.taxableValue,
          brokerageFee: r.costBase.brokerageFee,
          arrastreWharfage: r.costBase.arrastreWharfage,
          doxStampOthers: r.costBase.doxStampOthers,
          vatBase: r.costBase.vatBase,
        },
        breakdown: r.breakdown,
        exciseTax: r.exciseTax ?? { amount: 0, adValorem: 0, specific: 0, category: 'none', basis: '', notes: '' },
        landedCostSubtotal: r.landedCostSubtotal ?? r.totalLandedCost,
        deMinimisExempt: r.deMinimisExempt ?? false,
        deMinimisReason: r.deMinimisReason,
        entryType: r.entryType ?? 'informal',
        insuranceBenchmarkApplied: r.insuranceBenchmarkApplied ?? false,
        totalLandedCost: r.totalLandedCost,
        calculationCurrency: 'PHP',
        fx: r.fx,
      })
      // Refresh history after successful calculation
      reloadHistory()
    } catch (err) {
      const errorMessage = String(err)
      if (
        (selectedLookupRow?.sourceType === 'official-site' || selectedLookupRow?.sourceType === 'official-site-cache') &&
        (errorMessage.includes('Unknown HS code') || errorMessage.includes('No approved tariff rate found'))
      ) {
        setError('Official tariff finder lookup succeeded, but calculation still requires approved local tariff data for this HS code and schedule.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="calculator-container">
      <header className="calculator-header">
        <h1>Customs Duty Calculator</h1>
        <p>Calculate import duties, VAT, and compliance requirements</p>
        <p>Estimate only — validate rates, fees, and documentary requirements with BOC before filing.</p>
      </header>

      <div className="calculator-grid">
        <div className="calculator-panel">
          <div className="form-section">
            <h2>Shipment Details</h2>

            <div className="form-group">
              <label htmlFor="hs-code">HS Code</label>
              <HSCodeSearch
                onSelect={handleHSCodeSelect}
                selectedCode={formData.hsCode}
              />
              {hsCodeValidationMessage && (
                <p className="field-validation-message">{hsCodeValidationMessage}</p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="value">FOB Value</label>
                <input
                  id="value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.value}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      value: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <select
                  id="currency"
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      currency: e.target.value,
                    }))
                  }
                >
                  <option value="USD">USD</option>
                  <option value="PHP">PHP</option>
                  <option value="EUR">EUR</option>
                  <option value="CNY">CNY</option>
                  <option value="SGD">SGD</option>
                  <option value="JPY">JPY</option>
                </select>
                {formData.currency.toUpperCase() !== 'PHP' && (
                  <div className="fx-preview">
                    {fxLoading && <span>Loading exchange rate...</span>}
                    {!fxLoading && fxPreview && (
                      <span>
                        Indicative FX: 1 {fxPreview.inputCurrency} = {fxPreview.rateToPhp.toFixed(4)} PHP
                        {fxPreview.source ? ` (${fxPreview.source})` : ''}
                      </span>
                    )}
                    {!fxLoading && fxPreview?.source === 'fallback' && (
                      <span> Using offline fallback rates because live or cached rates were unavailable.</span>
                    )}
                    {!fxLoading && !fxPreview && (
                      <span>Exchange rate unavailable. Fallback rates may be used.</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="freight">Freight</label>
                <input
                  id="freight"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.freight}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      freight: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="insurance">Insurance</label>
                <input
                  id="insurance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.insurance}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      insurance: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                />
                {formData.insurance === 0 && (
                  <div className="field-help-text">Auto 2% benchmark will be applied if left at 0.</div>
                )}
              </div>
            </div>

            {/* De minimis & entry type badges */}
            {(() => {
              const fxRate = fxPreview?.rateToPhp ?? (formData.currency.toUpperCase() === 'PHP' ? 1 : 56)
              const fobPhp = formData.value * fxRate
              const isDeMinimis = fobPhp > 0 && fobPhp <= 10000
              const freightPhp = formData.freight * fxRate
              const insurancePhp = formData.insurance > 0 ? formData.insurance * fxRate : formData.value * fxRate * 0.02
              const dutiableValuePhp = fobPhp + freightPhp + insurancePhp
              const isFormal = dutiableValuePhp > 50000
              return (
                <>
                  {isDeMinimis && (
                    <div className="badge badge-success">
                      De Minimis — FOB ≤ ₱10,000. No duties or taxes assessed (unless alcohol/tobacco).
                    </div>
                  )}
                  {!isDeMinimis && fobPhp > 0 && (
                    <div className={`badge ${isFormal ? 'badge-warning' : 'badge-info'}`}>
                      {isFormal ? 'Formal Entry' : 'Informal Entry'} — Dutiable Value ≈ {formatCurrency(dutiableValuePhp)}
                    </div>
                  )}
                </>
              )
            })()}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="tariff-schedule">Tariff Schedule</label>
                <select
                  id="tariff-schedule"
                  value={formData.scheduleCode}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      scheduleCode: e.target.value,
                    }))
                  }
                >
                  {tariffSchedules.map((schedule) => (
                    <option key={schedule.code} value={schedule.code}>
                      {`${schedule.code} - ${schedule.displayName}`}
                    </option>
                  ))}
                </select>
                <div className="field-help-text">Schedule options now include the seeded FTA agreements, while imported tariff data still controls which rates are available under each code.</div>
              </div>

              <div className="form-group">
                <label htmlFor="origin">Origin Country</label>
                <input
                  id="origin"
                  type="text"
                  value={formData.originCountry}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      originCountry: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="e.g., CHN, USA"
                  maxLength={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="destination">Destination Port</label>
                <select
                  id="destination"
                  value={formData.destinationPort}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      destinationPort: e.target.value,
                    }))
                  }
                >
                  <option value="MNL">Manila (MNL)</option>
                    <option value="CEB">Cebu (CEB)</option>
                    <option value="DVO">Davao (DVO)</option>
                    <option value="ILO">Iloilo (ILO)</option>
                    <option value="SUB">Subic (SUB)</option>
                  </select>
                </div>
              </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="declaration-type">Declaration Type</label>
                <select
                  id="declaration-type"
                  value={formData.declarationType}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      declarationType: e.target.value as 'consumption' | 'warehousing' | 'transit',
                    }))
                  }
                >
                  <option value="consumption">Consumption</option>
                  <option value="warehousing">Warehousing</option>
                  <option value="transit">Transit</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="container-size">Container Size</label>
                <select
                  id="container-size"
                  value={formData.containerSize}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      containerSize: e.target.value as 'none' | '20ft' | '40ft',
                    }))
                  }
                >
                  <option value="none">None / Loose Cargo</option>
                  <option value="20ft">20-foot Container</option>
                  <option value="40ft">40-foot Container</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="arrastre-wharfage">Arrastre / Wharfage (PHP)</label>
                <input
                  id="arrastre-wharfage"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.arrastreWharfage}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      arrastreWharfage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Given amount for shipment"
                />
              </div>

              <div className="form-group">
                <label htmlFor="dox-stamp-others">Dox Stamp & Others (PHP)</label>
                <input
                  id="dox-stamp-others"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.doxStampOthers}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      doxStampOthers: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Given amount for shipment"
                />
              </div>
            </div>

            {/* Excise tax section — shown when HS code maps to an excise category */}
            {detectedExciseCategory && detectedExciseCategory !== 'none' && (
              <div className="form-section excise-section">
                <h3>Excise Tax Details</h3>
                <p className="field-help-text">
                  HS code maps to excise category: <strong>{detectedExciseCategory.replace(/_/g, ' ')}</strong>. Enter quantity to include excise in calculation.
                </p>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="excise-quantity">Quantity</label>
                    <input
                      id="excise-quantity"
                      type="number"
                      min="0"
                      step="0.001"
                      value={formData.exciseQuantity ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          exciseQuantity: parseFloat(e.target.value) || undefined,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="excise-unit">Unit</label>
                    <select
                      id="excise-unit"
                      value={formData.exciseUnit ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, exciseUnit: e.target.value }))
                      }
                    >
                      {(EXCISE_UNIT_OPTIONS[detectedExciseCategory] ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {EXCISE_NEEDS_NRP.has(detectedExciseCategory) && (
                  <div className="form-group">
                    <label htmlFor="excise-nrp">
                      {detectedExciseCategory === 'automobiles'
                        ? 'Net Manufacturer Price (NMP) in input currency'
                        : 'Net Retail Price (NRP) in input currency'}
                    </label>
                    <input
                      id="excise-nrp"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.exciseNrp ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          exciseNrp: parseFloat(e.target.value) || undefined,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}

                {detectedExciseCategory === 'sweetened_beverages' && (
                  <div className="form-group">
                    <label htmlFor="sugar-type">Sugar Type</label>
                    <select
                      id="sugar-type"
                      value={formData.sweetenedBeverageSugarType ?? 'sucrose_glucose'}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, sweetenedBeverageSugarType: e.target.value }))
                      }
                    >
                      <option value="sucrose_glucose">Sucrose / Glucose / Other caloric sweeteners (₱6/L)</option>
                      <option value="hfcs">High-Fructose Corn Syrup — HFCS (₱12/L)</option>
                    </select>
                  </div>
                )}

                {detectedExciseCategory === 'petroleum' && (
                  <div className="form-group">
                    <label htmlFor="petroleum-type">Petroleum Product</label>
                    <select
                      id="petroleum-type"
                      value={formData.petroleumProductType ?? 'other'}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, petroleumProductType: e.target.value }))
                      }
                    >
                      <option value="lubricating_oils">Lubricating Oils</option>
                      <option value="processed_gas">Processed Gas</option>
                      <option value="waxes_petrolatum">Waxes &amp; Petrolatum</option>
                      <option value="denatured_alcohol">Denatured Alcohol</option>
                      <option value="naphtha_gasoline">Naphtha / Unleaded Gasoline (₱10/L)</option>
                      <option value="aviation_turbo">Aviation Turbo Jet Fuel (₱4/L)</option>
                      <option value="kerosene">Kerosene (₱3/L)</option>
                      <option value="diesel">Diesel Fuel (₱6/L)</option>
                      <option value="liquefied_petroleum_gas">Liquefied Petroleum Gas (₱3/kg)</option>
                      <option value="asphalts">Asphalts</option>
                      <option value="bunker_fuel">Bunker Fuel Oil (₱2.50/L)</option>
                      <option value="petroleum_coke">Petroleum Coke (₱2.50/kg)</option>
                      <option value="other">Other Petroleum Products</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <button
              className="btn btn-primary"
              onClick={handleCalculate}
              disabled={loading}
            >
              {loading ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>

        <div className="results-panel">
          {results && !loading && (
            <CalculationResults
              results={results}
              formData={formData}
            />
          )}

          {!results && !loading && (
            <div className="empty-state">
              <p>👉 Enter shipment details and click Calculate to see results</p>
            </div>
          )}

          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Calculating...</p>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <section className="history-panel">
          <button
            className="history-toggle"
            onClick={() => setHistoryExpanded((prev) => !prev)}
          >
            🕒 Calculation History ({history.length} recent)
            <span className="history-toggle-icon">{historyExpanded ? '▲' : '▼'}</span>
          </button>

          {historyExpanded && (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>HS Code</th>
                    <th>FOB Value</th>
                    <th>Currency</th>
                    <th>Duty (PHP)</th>
                    <th>VAT (PHP)</th>
                    <th>Total Landed (PHP)</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.hs_code}</td>
                      <td>{entry.value.toLocaleString()}</td>
                      <td>{entry.currency}</td>
                      <td>{formatCurrency(entry.duty_amount)}</td>
                      <td>{formatCurrency(entry.vat_amount)}</td>
                      <td>{formatCurrency(entry.total_landed_cost)}</td>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
