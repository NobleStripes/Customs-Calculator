import React, { useState } from 'react'
import { appApi } from '../lib/appApi'
import './CalculationResults.css'

interface CalculationResultsProps {
  results: any
  formData: any
}

export const CalculationResults: React.FC<CalculationResultsProps> = ({
  results,
  formData,
}) => {
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'word' | 'excel'>('pdf')

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  const handleExportDocument = async () => {
    setExportMessage(null)
    setExporting(true)

    try {
      const response = await appApi.generateCalculationDocument({
        formData,
        results,
        format: exportFormat,
      })

      if (!response.success || !response.data?.path) {
        throw new Error(response.error || 'Unable to generate document')
      }

      setExportMessage(`Saved report to: ${response.data.path}`)
    } catch (error) {
      setExportMessage(String(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="calculation-results">
      <h2>Calculation Results</h2>

      <div className="results-section">
        <div className="result-card summary">
          <h3>Total Landed Cost</h3>
          <p className="amount">
            {formatCurrency(results.totalLandedCost, formData.currency)}
          </p>
          <p className="detail">
            FOB Value: {formatCurrency(formData.value, formData.currency)}
          </p>
          {results.fx?.applied && (
            <p className="detail fx-note">
              FX applied: 1 {results.fx.inputCurrency} = {formatNumber(results.fx.rateToPhp)} PHP
              {results.fx.source ? ` (${results.fx.source})` : ''}
              {results.fx.timestamp ? ` as of ${new Date(results.fx.timestamp).toLocaleString()}` : ''}
            </p>
          )}
          {results.fx?.source === 'fallback' && (
            <p className="detail fx-warning">Live or cached exchange rates were unavailable, so fallback rates were used.</p>
          )}
        </div>

        <div className="result-card">
          <h3>Import Duty</h3>
          <p className="amount">
            {formatCurrency(results.duty?.amount || 0, formData.currency)}
          </p>
          <p className="detail">
            Rate: {formatNumber(results.duty?.rate || 0)}%
          </p>
        </div>

        <div className="result-card">
          <h3>Value Added Tax (VAT)</h3>
          <p className="amount">
            {formatCurrency(results.vat?.amount || 0, formData.currency)}
          </p>
          <p className="detail">
            Rate: {formatNumber(results.vat?.rate || 0)}%
          </p>
        </div>

        {results.duty?.surcharge && (
          <div className="result-card">
            <h3>Additional Surcharges</h3>
            <p className="amount">
              {formatCurrency(
                results.duty.surcharge,
                formData.currency
              )}
            </p>
            <p className="detail">Applied surcharges and fees</p>
          </div>
        )}
      </div>

      {results.compliance?.warnings && results.compliance.warnings.length > 0 && (
        <div className="compliance-section warning">
          <h3>⚠️ Compliance Warnings</h3>
          <ul>
            {results.compliance.warnings.map((warning: string, idx: number) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {results.compliance?.requirements &&
        results.compliance.requirements.length > 0 && (
          <div className="compliance-section">
            <h3>📋 Required Documents</h3>
            <ul>
              {results.compliance.requirements.map(
                (req: string, idx: number) => (
                  <li key={idx}>{req}</li>
                )
              )}
            </ul>
          </div>
        )}

      {results.compliance?.restrictions &&
        results.compliance.restrictions.length > 0 && (
          <div className="compliance-section restriction">
            <h3>🚫 Import Restrictions</h3>
            <ul>
              {results.compliance.restrictions.map(
                (restriction: string, idx: number) => (
                  <li key={idx}>{restriction}</li>
                )
              )}
            </ul>
          </div>
        )}

      <div className="results-summary">
        {results.fx?.applied && (
          <p className="fx-banner">
            Calculations were performed in PHP for tariff accuracy and converted back to {formData.currency} for display.
          </p>
        )}
        <p>
          <strong>Tariff Calculation Details:</strong>
        </p>
        <ul>
          <li>Product Value: {formatCurrency(formData.value, formData.currency)}</li>
          <li>Duty Rate: {formatNumber(results.duty?.rate || 0)}%</li>
          <li>Duty Amount: {formatCurrency(results.duty?.amount || 0, formData.currency)}</li>
          <li>Surcharge: {formatCurrency(results.duty?.surcharge || 0, formData.currency)}</li>
          <li>
            Taxable Base: {formatCurrency(
              formData.value + (results.duty?.amount || 0) + (results.duty?.surcharge || 0),
              formData.currency
            )}
          </li>
          <li>VAT Rate: {formatNumber(results.vat?.rate || 0)}%</li>
          <li>VAT Amount: {formatCurrency(results.vat?.amount || 0, formData.currency)}</li>
          <li className="total">
            Total: {formatCurrency(results.totalLandedCost, formData.currency)}
          </li>
        </ul>
      </div>

      <div className="results-actions">
        <div className="export-controls">
          <select
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as 'pdf' | 'word' | 'excel')}
            disabled={exporting}
            className="export-format-select"
          >
            <option value="pdf">PDF</option>
            <option value="word">Word (.doc)</option>
            <option value="excel">Excel (.xls)</option>
          </select>
          <button className="btn-export" onClick={handleExportDocument} disabled={exporting}>
            {exporting ? `Generating ${exportFormat.toUpperCase()}...` : `Export ${exportFormat.toUpperCase()} Report`}
          </button>
        </div>
        {exportMessage && <p className="export-message">{exportMessage}</p>}
      </div>
    </div>
  )
}
