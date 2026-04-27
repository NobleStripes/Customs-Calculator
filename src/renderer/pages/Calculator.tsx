import React, { useEffect, useState } from 'react'
import { HSCodeSearch } from '../components/HSCodeSearch'
import { CalculationResults } from '../components/CalculationResults'
import { appApi } from '../lib/appApi'
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
      vat: number
      totalItemTax: number
    }
    globalFees: {
      transitCharge: number
      ipc: number
      csf: number
      cds: number
      irs: number
      totalGlobalTax: number
    }
    totalTaxAndFees: number
  }
  totalLandedCost: number
  calculationCurrency: 'PHP'
  fx: {
    applied: boolean
    rateToPhp: number
    inputCurrency: string
    baseCurrency: 'PHP'
    source?: 'cache' | 'live' | 'fallback' | 'identity'
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
  }))

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
          : 'Typed HS code does not resolve to a known tariff code yet. Select a suggestion or enter a full valid code.'
      )
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(validateHandle)
    }
  }, [formData.hsCode])

  const handleHSCodeSelect = (code: string) => {
    setHsCodeValidationMessage(null)
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
        totalLandedCost: r.totalLandedCost,
        calculationCurrency: 'PHP',
        fx: r.fx,
      })
      // Refresh history after successful calculation
      reloadHistory()
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
              </div>
            </div>

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
