import React, { useEffect, useState } from 'react'
import { HSCodeSearch } from '../components/HSCodeSearch'
import { CalculationResults } from '../components/CalculationResults'
import { appApi, hsCodeLookup } from '../lib/appApi'
import './Calculator.css'

interface CalculationPayload {
  value: number
  hsCode: string
  originCountry: string
  destinationPort: string
  currency: string
}

export const Calculator: React.FC = () => {
  const [formData, setFormData] = useState<CalculationPayload>({
    value: 0,
    hsCode: '',
    originCountry: '',
    destinationPort: 'MNL', // Manila by default
    currency: 'USD',
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

  const handleHSCodeSelect = (code: string) => {
    setFormData((prev) => ({ ...prev, hsCode: code }))

    if (!code.trim()) {
      setHsCodeValidationMessage(null)
      return
    }

    const resolvedCode = hsCodeLookup.resolveKnownHSCode(code)
    setHsCodeValidationMessage(
      resolvedCode
        ? null
        : 'Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.'
    )
  }

  const handleCalculate = async () => {
    const resolvedCode = hsCodeLookup.resolveKnownHSCode(formData.hsCode)

    if (!formData.hsCode || formData.value <= 0) {
      setError('Please enter a valid HS code and product value')
      return
    }

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
      let calculationValue = formData.value
      let fxRateToPhp = 1
      const inputCurrency = formData.currency.toUpperCase()

      if (inputCurrency !== 'PHP') {
        const conversionResult = await appApi.convertCurrency({
          amount: formData.value,
          fromCurrency: inputCurrency,
          toCurrency: 'PHP',
        })

        if (!conversionResult.success || !conversionResult.data) {
          throw new Error(conversionResult.error || 'Currency conversion failed')
        }

        calculationValue = conversionResult.data.convertedAmount
        fxRateToPhp = conversionResult.data.rate
      }

      // Calculate duty
      const dutyResult = await appApi.calculateDuty({
        value: calculationValue,
        hsCode: canonicalHsCode,
        originCountry: formData.originCountry,
      })

      if (!dutyResult.success) {
        throw new Error(dutyResult.error)
      }

      const dutyAmount = dutyResult.data.amount
      const surchargeAmount = dutyResult.data.surcharge || 0
      const dutiableValue = calculationValue + dutyAmount + surchargeAmount

      // Calculate VAT
      const vatResult = await appApi.calculateVAT({
        dutiableValue,
        hsCode: canonicalHsCode,
      })

      if (!vatResult.success) {
        throw new Error(vatResult.error)
      }

      // Get compliance requirements
      const complianceResult = await appApi.getComplianceRequirements({
        hsCode: canonicalHsCode,
        value: calculationValue,
        destination: formData.destinationPort,
      })

      const convertFromPhp = (amount: number): number => {
        if (inputCurrency === 'PHP') {
          return amount
        }

        return amount / fxRateToPhp
      }

      const convertedDutyAmount = convertFromPhp(dutyAmount)
      const convertedSurchargeAmount = convertFromPhp(surchargeAmount)
      const convertedVatAmount = convertFromPhp(vatResult.data.amount || 0)
      const convertedTotal = convertFromPhp(dutiableValue + (vatResult.data.amount || 0))

      setResults({
        duty: {
          ...dutyResult.data,
          amount: convertedDutyAmount,
          surcharge: convertedSurchargeAmount,
        },
        vat: {
          ...vatResult.data,
          amount: convertedVatAmount,
        },
        compliance: complianceResult.success ? complianceResult.data : null,
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
                <label htmlFor="value">Product Value</label>
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
                  maxLength="3"
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
