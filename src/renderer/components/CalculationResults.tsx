import React, { useState } from 'react'
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

  const handleExportPdf = async () => {
    setExportMessage(null)
    setExporting(true)

    try {
      const response = await window.electronAPI.generateCalculationDocument({
        formData,
        results,
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
        <p>
          <strong>Tariff Calculation Details:</strong>
        </p>
        <ul>
          <li>Product Value: {formatCurrency(formData.value, formData.currency)}</li>
          <li>Duty Rate: {formatNumber(results.duty?.rate || 0)}%</li>
          <li>Duty Amount: {formatCurrency(results.duty?.amount || 0, formData.currency)}</li>
          <li>
            Taxable Base: {formatCurrency(
              formData.value + (results.duty?.amount || 0),
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
        <button className="btn-export" onClick={handleExportPdf} disabled={exporting}>
          {exporting ? 'Generating PDF...' : 'Export PDF Report'}
        </button>
        {exportMessage && <p className="export-message">{exportMessage}</p>}
      </div>
    </div>
  )
}
