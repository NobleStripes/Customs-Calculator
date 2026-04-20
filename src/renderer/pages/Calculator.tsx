import React, { useEffect, useState } from 'react'
import { HSCodeSearch } from '../components/HSCodeSearch'
import { CalculationResults } from '../components/CalculationResults'
import { appApi } from '../lib/appApi'
import './Calculator.css'

interface CalculationPayload {
  value: number
  freight: number
  insurance: number
  hsCode: string
  originCountry: string
  destinationPort: string
  currency: string
  containerSize: 'none' | '20ft' | '40ft'
  arrastreWharfage: number
  doxStampOthers: number
  declarationType: 'consumption' | 'warehousing' | 'transit'
}

const TRANSIT_CHARGE_PHP = 1000
const CUSTOMS_DOCUMENTARY_STAMP_PHP = 100
const BIR_DOCUMENTARY_STAMP_TAX_PHP = 30
const VAT_RATE = 0.12

const getContainerSecurityFeeUsd = (containerSize: CalculationPayload['containerSize']): number => {
  if (containerSize === '40ft') return 10
  if (containerSize === '20ft') return 5
  return 0
}

const getBrokerageFeePhp = (taxableValuePhp: number): number =>
  ((taxableValuePhp - 200000) * 0.00125) + 5300

const getImportProcessingChargePhp = (dutiableValuePhp: number): number => {
  if (dutiableValuePhp <= 25000) return 250
  if (dutiableValuePhp <= 50000) return 500
  if (dutiableValuePhp <= 250000) return 750
  if (dutiableValuePhp <= 500000) return 1000
  if (dutiableValuePhp <= 750000) return 1500
  return 2000
}

export const Calculator: React.FC = () => {
  const [formData, setFormData] = useState<CalculationPayload>({
    value: 0,
    freight: 0,
    insurance: 0,
    hsCode: '',
    originCountry: '',
    destinationPort: 'MNL', // Manila by default
    currency: 'USD',
    containerSize: '20ft',
    arrastreWharfage: 0,
    doxStampOthers: 0,
    declarationType: 'consumption',
  })

  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fxPreview, setFxPreview] = useState<{
    inputCurrency: string
    rateToPhp: number
    source?: string
  } | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [hsCodeValidationMessage, setHsCodeValidationMessage] = useState<string | null>(null)

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

    if (!normalizedInput) {
      setHsCodeValidationMessage(null)
      return
    }

    if (compactInput.length < 4) {
      setHsCodeValidationMessage(null)
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
          : 'Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.'
      )
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(validateHandle)
    }
  }, [formData.hsCode])

  const handleHSCodeSelect = (code: string) => {
    setFormData((prev) => ({ ...prev, hsCode: code }))
  }

  const handleCalculate = async () => {
    if (!formData.hsCode || formData.value <= 0) {
      setError('Please enter a valid HS code and product value')
      return
    }

    const resolvedResult = await appApi.resolveHSCode(formData.hsCode)
    const resolvedCode = resolvedResult.success ? resolvedResult.data : null

    if (!resolvedCode) {
      setError('Typed HS code does not resolve to a known tariff code. Choose a suggestion or enter a full valid HS code before calculating.')
      setHsCodeValidationMessage('Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.')
      return
    }

    setLoading(true)
    setError(null)
    setHsCodeValidationMessage(null)

    try {
      const canonicalHsCode = resolvedCode.code
      setFormData((prev) => ({ ...prev, hsCode: canonicalHsCode }))
      let taxableValuePhp = formData.value + formData.freight + formData.insurance
      let fxRateToPhp = 1
      const inputCurrency = formData.currency.toUpperCase()

      if (inputCurrency !== 'PHP') {
        const conversionResult = await appApi.convertCurrency({
          amount: formData.value + formData.freight + formData.insurance,
          fromCurrency: inputCurrency,
          toCurrency: 'PHP',
        })

        if (!conversionResult.success || !conversionResult.data) {
          throw new Error(conversionResult.error || 'Currency conversion failed')
        }

        taxableValuePhp = conversionResult.data.convertedAmount
        fxRateToPhp = conversionResult.data.rate
      }

      // Calculate duty
      const dutyResult = await appApi.calculateDuty({
        value: taxableValuePhp,
        hsCode: canonicalHsCode,
        originCountry: formData.originCountry,
      })

      if (!dutyResult.success) {
        throw new Error(dutyResult.error)
      }

      if (!dutyResult.data) {
        throw new Error('Duty calculation returned no data')
      }

      const dutyData = dutyResult.data

      const dutyAmount = dutyData.amount
      const surchargeAmount = dutyData.surcharge || 0

      // Get compliance requirements
      const complianceResult = await appApi.getComplianceRequirements({
        hsCode: canonicalHsCode,
        value: taxableValuePhp,
        destination: formData.destinationPort,
      })

      const complianceData =
        typeof complianceResult === 'object' &&
        complianceResult !== null &&
        'data' in complianceResult
          ? complianceResult.data ?? null
          : null

      const convertFromPhp = (amount: number): number => {
        if (inputCurrency === 'PHP') {
          return amount
        }

        return amount / fxRateToPhp
      }

      const convertedDutyAmount = convertFromPhp(dutyAmount)
      const convertedSurchargeAmount = convertFromPhp(surchargeAmount)
      const brokerageFeePhp = getBrokerageFeePhp(taxableValuePhp)
      const arrastreWharfagePhp = formData.arrastreWharfage
      const doxStampOthersPhp = formData.doxStampOthers
      const csfUsd = getContainerSecurityFeeUsd(formData.containerSize)
      let csfPhp = 0

      if (csfUsd > 0) {
        const csfConversion = await appApi.convertCurrency({
          amount: csfUsd,
          fromCurrency: 'USD',
          toCurrency: 'PHP',
        })

        if (!csfConversion.success || !csfConversion.data) {
          throw new Error(csfConversion.error || 'CSF conversion failed')
        }

        csfPhp = csfConversion.data.convertedAmount
      }

      const transitChargePhp = formData.declarationType === 'transit' ? TRANSIT_CHARGE_PHP : 0
      const ipcPhp = formData.declarationType === 'transit' ? 250 : getImportProcessingChargePhp(taxableValuePhp)
      const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
      const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
      const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp
      const vatBasePhp =
        taxableValuePhp +
        dutyAmount +
        surchargeAmount +
        brokerageFeePhp +
        arrastreWharfagePhp +
        doxStampOthersPhp +
        totalGlobalFeesPhp
      const vatAmountPhp = vatBasePhp * VAT_RATE
      const totalTaxAndFeesPhp = dutyAmount + vatAmountPhp + totalGlobalFeesPhp
      const convertedVatAmount = convertFromPhp(vatAmountPhp)
      const convertedTotal = convertFromPhp(vatBasePhp + vatAmountPhp)
      const convertedTaxableValue = convertFromPhp(taxableValuePhp)
      const convertedBrokerageFee = convertFromPhp(brokerageFeePhp)
      const convertedArrastreWharfage = convertFromPhp(arrastreWharfagePhp)
      const convertedDoxStampOthers = convertFromPhp(doxStampOthersPhp)
      const convertedVatBase = convertFromPhp(vatBasePhp)

      setResults({
        duty: {
          ...dutyData,
          amount: convertedDutyAmount,
          surcharge: convertedSurchargeAmount,
        },
        vat: {
          rate: VAT_RATE * 100,
          amount: convertedVatAmount,
        },
        compliance: complianceData,
        costBase: {
          fob: formData.value,
          freight: formData.freight,
          insurance: formData.insurance,
          taxableValue: convertedTaxableValue,
          brokerageFee: convertedBrokerageFee,
          arrastreWharfage: convertedArrastreWharfage,
          doxStampOthers: convertedDoxStampOthers,
          vatBase: convertedVatBase,
        },
        breakdown: {
          itemTaxes: {
            cud: convertedDutyAmount,
            vat: convertedVatAmount,
            totalItemTax: convertedDutyAmount + convertedVatAmount,
          },
          globalFees: {
            transitCharge: convertFromPhp(transitChargePhp),
            ipc: convertFromPhp(ipcPhp),
            csf: convertFromPhp(csfPhp),
            cds: convertFromPhp(cdsPhp),
            irs: convertFromPhp(irsPhp),
            totalGlobalTax: convertFromPhp(totalGlobalFeesPhp),
          },
          totalTaxAndFees: convertFromPhp(totalTaxAndFeesPhp),
        },
        totalLandedCost: convertedTotal,
        calculationCurrency: 'PHP',
        fx: {
          applied: inputCurrency !== 'PHP',
          rateToPhp: fxRateToPhp,
          inputCurrency,
          baseCurrency: 'PHP',
        },
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="calculator-container">
      <header className="calculator-header">
        <h1>Customs Duty Calculator</h1>
        <p>Calculate import duties, VAT, and compliance requirements</p>
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
              </div>
            </div>

            <div className="form-row">
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
                  <option value="CEBU">Cebu (CEBU)</option>
                  <option value="DAVAO">Davao (DAVAO)</option>
                  <option value="ILOILO">Iloilo (ILOILO)</option>
                  <option value="SUBIC">Subic (SUBIC)</option>
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
    </div>
  )
}
