import React, { useState } from 'react'
import { appApi } from '../lib/appApi'
import './CalculationResults.css'

interface CalculationFormData {
  hsCode: string
  scheduleCode: string
  value: number
  freight: number
  insurance: number
  originCountry: string
  destinationPort: string
  currency: string
  containerSize: 'none' | '20ft' | '40ft'
  arrivalDate?: string
  storageDelayDays?: number
  itemCondition?: 'new' | 'used'
  importerStatus?: 'standard' | 'balikbayan' | 'returning_resident' | 'ofw'
  monthsAbroad?: number
  balikbayanBoxesThisYear?: number
  isCommercialQuantity?: boolean
  ofwHomeApplianceClaim?: boolean
  ofwHomeApplianceAlreadyAvailedThisYear?: boolean
  arrastreWharfage: number
  doxStampOthers: number
  declarationType: 'consumption' | 'warehousing' | 'transit'
}

interface CalculationResultsData {
  tariff?: {
    scheduleCode?: string
  }
  duty?: {
    rate?: number
    amount?: number
    surcharge?: number
  }
  vat?: {
    rate?: number
    amount?: number
  }
  compliance?: {
    requiredDocuments?: string[]
    requirements?: string[]
    restrictions?: string[]
    warnings?: string[]
  }
  costBase?: {
    taxableValue?: number
    brokerageFee?: number
    arrastreWharfage?: number
    doxStampOthers?: number
    vatBase?: number
  }
  breakdown?: {
    globalFees?: {
      transitCharge?: number
      ipc?: number
      csf?: number
      cds?: number
      irs?: number
      lrf?: number
      totalGlobalTax?: number
    }
    totalTaxAndFees?: number
  }
  exciseTax?: {
    amount?: number
    adValorem?: number
    specific?: number
    category?: string
    basis?: string
    notes?: string
  }
  landedCostSubtotal?: number
  importClassification?: {
    importType: 'free' | 'regulated' | 'restricted' | 'prohibited'
    agencies: string[]
    agencyFullNames: string[]
    notes: string
    isStrategicTradeGood: boolean
    strategicTradeNotes?: string
    isVatExempt: boolean
    vatExemptBasis?: string
    requiresCertificateOfOrigin: boolean
    certificateOfOriginForm?: string
    warnings: string[]
  }
  section800Exemption?: {
    eligible?: boolean
    exemptionType?: 'none' | 'balikbayan' | 'returning_resident' | 'ofw'
    exemptAmountPhp?: number
    reason?: string
    warnings?: string[]
  }
  valuationReferenceRisk?: {
    flagged?: boolean
    level?: 'low' | 'medium' | 'high'
    declaredValuePhp?: number
    indicativeMinimumPhp?: number
    referenceLabel?: string
    notes?: string[]
  }
  portHandlingFees?: {
    arrivalDateApplied?: string
    tariffTranche?: 'pre-2026' | '2026-h1' | '2026-h2'
    arrastre?: number
    wharfage?: number
    storage?: number
    freeStorageDays?: number
    chargeableStorageDays?: number
    totalPortHandling?: number
    notes?: string[]
  }
  energyEmergencyNotice?: string
  deMinimisExempt?: boolean
  deMinimisReason?: string
  entryType?: 'de_minimis' | 'informal' | 'formal'
  insuranceBenchmarkApplied?: boolean
  fx?: {
    applied?: boolean
    rateToPhp?: number
    inputCurrency?: string
    source?: string
    timestamp?: string
  }
  calculationCurrency?: string
  totalLandedCost: number
}

interface CalculationResultsProps {
  results: CalculationResultsData
  formData: CalculationFormData
}

export const CalculationResults: React.FC<CalculationResultsProps> = ({
  results,
  formData,
}) => {
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'word' | 'excel'>('pdf')
  const calculationCurrency = results.calculationCurrency || 'PHP'

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

  const dutyAmount = results.duty?.amount || 0
  const vatAmount = results.vat?.amount || 0
  const exciseAmount = results.exciseTax?.amount || 0
  const itemTaxTotal = dutyAmount + exciseAmount + vatAmount
  const costBase = results.costBase || {}
  const extraFees = {
    transitCharge: results.breakdown?.globalFees?.transitCharge || 0,
    ipc: results.breakdown?.globalFees?.ipc || 0,
    csf: results.breakdown?.globalFees?.csf || 0,
    cds: results.breakdown?.globalFees?.cds || 0,
    irs: results.breakdown?.globalFees?.irs || 0,
    lrf: results.breakdown?.globalFees?.lrf || 0,
  }
  const globalTaxTotal = extraFees.transitCharge + extraFees.ipc + extraFees.csf + extraFees.cds + extraFees.irs + extraFees.lrf
  const totalTaxAndFees = results.breakdown?.totalTaxAndFees || (itemTaxTotal + globalTaxTotal)
  const requiredDocuments = results.compliance?.requiredDocuments || results.compliance?.requirements || []
  const landedCostSubtotal = results.landedCostSubtotal ?? (results.totalLandedCost - vatAmount)

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

      {/* Entry type badge */}
      {results.entryType && (
        <div className={`badge ${results.entryType === 'formal' ? 'badge-warning' : results.entryType === 'de_minimis' ? 'badge-success' : 'badge-info'}`}>
          {results.entryType === 'de_minimis' ? 'De Minimis Entry' : results.entryType === 'formal' ? 'Formal Entry' : 'Informal Entry'}
        </div>
      )}

      {/* Import Classification panel */}
      {results.importClassification && (() => {
        const ic = results.importClassification
        const importTypeBadgeClass =
          ic.importType === 'free'       ? 'badge-success'  :
          ic.importType === 'regulated'  ? 'badge-info'     :
          ic.importType === 'restricted' ? 'badge-warning'  : 'badge-danger'
        const importTypeLabel =
          ic.importType === 'free'       ? 'Free Importation' :
          ic.importType === 'regulated'  ? 'Regulated'        :
          ic.importType === 'restricted' ? 'Restricted'       : 'Prohibited'
        return (
          <div className="import-class-panel">
            <div className="import-class-header">
              <h3>Import Classification</h3>
              <span className={`badge ${importTypeBadgeClass}`}>{importTypeLabel}</span>
            </div>
            <p className="import-class-notes">{ic.notes}</p>

            {ic.agencies.length > 0 && (
              <div className="agency-list">
                <strong>Required Agency Clearances:</strong>
                <ul>
                  {ic.agencies.map((agency, i) => (
                    <li key={agency}>
                      <span className="agency-acronym">{agency}</span>
                      {ic.agencyFullNames[i] ? ` — ${ic.agencyFullNames[i]}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ic.requiresCertificateOfOrigin && (
              <div className="coo-alert">
                <strong>Certificate of Origin Required</strong>
                <p>
                  The selected FTA schedule requires a valid{' '}
                  <strong>{ic.certificateOfOriginForm ?? 'Certificate of Origin'}</strong>{' '}
                  to claim preferential duty rates. Goods without a valid CoO will be assessed at MFN rate.
                </p>
              </div>
            )}

            {ic.isStrategicTradeGood && (
              <div className="strategic-trade-warning">
                <strong>⚠ Strategic Trade Good (STMO)</strong>
                <p>
                  {ic.strategicTradeNotes ?? 'Requires Strategic Trade Authorization (STA) from the Strategic Trade Management Office (STMO) under RA 10697 before shipment.'}
                </p>
              </div>
            )}

            {ic.isVatExempt && (
              <div className="vat-exempt-note">
                <strong>VAT-Exempt Import</strong>
                <p>{ic.vatExemptBasis}</p>
              </div>
            )}
          </div>
        )
      })()}

      {results.section800Exemption && (
        <div className="result-card section-800-card">
          <h3>Section 800 Exemption</h3>
          <p className="detail">
            Status: <strong>{results.section800Exemption.eligible ? 'Eligible' : 'Not Eligible'}</strong>
          </p>
          <p className="detail">{results.section800Exemption.reason}</p>
          {(results.section800Exemption.exemptAmountPhp || 0) > 0 && (
            <p className="detail">
              Exempt Amount Applied: <strong>{formatCurrency(results.section800Exemption.exemptAmountPhp || 0, calculationCurrency)}</strong>
            </p>
          )}
          {(results.section800Exemption.warnings || []).length > 0 && (
            <ul className="detail-list">
              {(results.section800Exemption.warnings || []).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {results.valuationReferenceRisk?.flagged && (
        <div className={`result-card valuation-risk-card ${results.valuationReferenceRisk.level === 'high' ? 'high-risk' : 'medium-risk'}`}>
          <h3>Valuation Reference Risk</h3>
          <p className="detail">
            Risk Level: <strong>{String(results.valuationReferenceRisk.level || 'medium').toUpperCase()}</strong>
          </p>
          <p className="detail">
            Declared Value: <strong>{formatCurrency(results.valuationReferenceRisk.declaredValuePhp || 0, calculationCurrency)}</strong>
            {typeof results.valuationReferenceRisk.indicativeMinimumPhp === 'number'
              ? ` vs Indicative Reference ${formatCurrency(results.valuationReferenceRisk.indicativeMinimumPhp, calculationCurrency)}`
              : ''}
          </p>
          {(results.valuationReferenceRisk.notes || []).map((note) => (
            <p key={note} className="detail">{note}</p>
          ))}
        </div>
      )}

      {results.portHandlingFees && (
        <div className="result-card port-handling-card">
          <h3>Port & Handling Fees</h3>
          <div className="breakdown-table">
            <div className="breakdown-row">
              <span>Arrastre</span>
              <strong>{formatCurrency(results.portHandlingFees.arrastre || 0, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Wharfage</span>
              <strong>{formatCurrency(results.portHandlingFees.wharfage || 0, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Storage ({results.portHandlingFees.chargeableStorageDays || 0} chargeable days)</span>
              <strong>{formatCurrency(results.portHandlingFees.storage || 0, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row subtotal-row">
              <span>Total Port Handling</span>
              <strong>{formatCurrency(results.portHandlingFees.totalPortHandling || 0, calculationCurrency)}</strong>
            </div>
          </div>
          <p className="detail">
            Arrival date {results.portHandlingFees.arrivalDateApplied || 'N/A'} • tariff tranche {results.portHandlingFees.tariffTranche || 'N/A'} • free storage {results.portHandlingFees.freeStorageDays || 5} days
          </p>
        </div>
      )}

      {results.energyEmergencyNotice && (
        <div className="result-card energy-notice-card">
          <h3>Regulatory Notice</h3>
          <p className="detail">{results.energyEmergencyNotice}</p>
        </div>
      )}

      {/* De minimis exempt — short-circuit the full breakdown */}
      {results.deMinimisExempt && (
        <div className="result-card de-minimis-card">
          <h3>De Minimis Exempt</h3>
          <p className="de-minimis-msg">
            {results.deMinimisReason || 'FOB ≤ ₱10,000 — De Minimis exempt. No duties or taxes assessed.'}
          </p>
          <p className="detail">
            Total Landed Cost: <strong>{formatCurrency(results.totalLandedCost, calculationCurrency)}</strong>
          </p>
          {results.fx?.applied && (
            <p className="detail fx-note">
              FX applied: 1 {results.fx.inputCurrency} = {formatNumber(results.fx.rateToPhp ?? 0)} PHP
              {results.fx.source ? ` (${results.fx.source})` : ''}
            </p>
          )}
        </div>
      )}

      {!results.deMinimisExempt && (
      <div className="results-section">
        <div className="result-card summary">
          <h3>Total Landed Cost</h3>
          <p className="amount">
            {formatCurrency(results.totalLandedCost, calculationCurrency)}
          </p>
          <p className="detail">
            FOB Value: {formatCurrency(formData.value, formData.currency)}
          </p>
          {results.fx?.applied && (
            <p className="detail fx-note">
              FX applied: 1 {results.fx.inputCurrency} = {formatNumber(results.fx.rateToPhp ?? 0)} PHP
              {results.fx.source ? ` (${results.fx.source})` : ''}
              {results.fx.timestamp ? ` as of ${new Date(results.fx.timestamp).toLocaleString()}` : ''}
            </p>
          )}
          {results.fx?.source === 'fallback' && (
            <p className="detail fx-warning">Live or cached exchange rates were unavailable, so fallback rates were used.</p>
          )}
        </div>

        <div className="result-card">
          <h3>Taxable Value (PHP Base)</h3>
          <p className="amount">
            {formatCurrency(costBase.taxableValue || 0, calculationCurrency)}
          </p>
          <p className="detail">
            FOB + Freight + Insurance converted using the applied forex rate
            {results.insuranceBenchmarkApplied && (
              <span className="benchmark-note"> — 2% insurance benchmark applied</span>
            )}
          </p>
        </div>

        <div className="result-card">
          <h3>Brokerage Fee</h3>
          <p className="amount">
            {formatCurrency(costBase.brokerageFee || 0, calculationCurrency)}
          </p>
          <p className="detail">
            Tiered BOC brokerage schedule based on taxable value in PHP
          </p>
        </div>

        <div className="result-card breakdown-card">
          <h3>Tax Breakdown</h3>
          <div className="breakdown-table">
            <div className="breakdown-row">
              <span>CUD</span>
              <strong>{formatCurrency(dutyAmount, calculationCurrency)}</strong>
            </div>
            {exciseAmount > 0 && (
              <div className="breakdown-row">
                <span>Excise{results.exciseTax?.category ? ` (${results.exciseTax.category.replace(/_/g, ' ')})` : ''}</span>
                <strong>{formatCurrency(exciseAmount, calculationCurrency)}</strong>
              </div>
            )}
            <div className="breakdown-row subtotal-row">
              <span>Landed Cost (VAT Base)</span>
              <strong>{formatCurrency(landedCostSubtotal, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>VAT</span>
              <strong>{formatCurrency(vatAmount, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row total-row">
              <span>Total Item Tax</span>
              <strong>{formatCurrency(itemTaxTotal, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row spacer-row" aria-hidden="true" />
            {extraFees.transitCharge > 0 && (
              <div className="breakdown-row">
                <span>TC</span>
                <strong>{formatCurrency(extraFees.transitCharge, calculationCurrency)}</strong>
              </div>
            )}
            <div className="breakdown-row">
              <span>IPF</span>
              <strong>{formatCurrency(extraFees.ipc, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>CSF</span>
              <strong>{formatCurrency(extraFees.csf, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>CDS</span>
              <strong>{formatCurrency(extraFees.cds, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>IRS</span>
              <strong>{formatCurrency(extraFees.irs, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row">
              <span>LRF</span>
              <strong>{formatCurrency(extraFees.lrf, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row total-row">
              <span>Total Global Tax</span>
              <strong>{formatCurrency(globalTaxTotal, calculationCurrency)}</strong>
            </div>
            <div className="breakdown-row grand-total-row">
              <span>Total Tax and Fees</span>
              <strong>{formatCurrency(totalTaxAndFees, calculationCurrency)}</strong>
            </div>
          </div>
          <p className="detail breakdown-note">
            Taxable Value (PHP) uses FOB + Freight + Insurance. VAT Base equals the full Landed Cost (DV + Duty + Excise + all fees) per BOC formula. CSF uses USD 5 for 20-foot and USD 10 for 40-foot containers. Estimates should be validated with BOC before filing.
          </p>
        </div>

        <div className="result-card">
          <h3>Import Duty</h3>
          <p className="amount">
            {formatCurrency(results.duty?.amount || 0, calculationCurrency)}
          </p>
          <p className="detail">
            Rate: {formatNumber(results.duty?.rate || 0)}%
          </p>
        </div>

        {exciseAmount > 0 && (
          <div className="result-card">
            <h3>Excise Tax</h3>
            <p className="amount">{formatCurrency(exciseAmount, calculationCurrency)}</p>
            <p className="detail">
              {results.exciseTax?.category?.replace(/_/g, ' ')}
              {results.exciseTax?.adValorem ? ` — Ad valorem: ${formatCurrency(results.exciseTax.adValorem, calculationCurrency)}` : ''}
              {results.exciseTax?.specific ? ` — Specific: ${formatCurrency(results.exciseTax.specific, calculationCurrency)}` : ''}
            </p>
            {results.exciseTax?.notes && <p className="detail">{results.exciseTax.notes}</p>}
          </div>
        )}

        <div className="result-card">
          <h3>Value Added Tax (VAT)</h3>
          <p className="amount">
            {formatCurrency(results.vat?.amount || 0, calculationCurrency)}
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
                calculationCurrency
              )}
            </p>
            <p className="detail">Applied surcharges and fees</p>
          </div>
        )}
      </div>
      )}

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

      {requiredDocuments.length > 0 && (
          <div className="compliance-section">
            <h3>📋 Required Documents</h3>
            <ul>
              {requiredDocuments.map(
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
            Calculations were performed and are displayed in PHP for tariff accuracy.
          </p>
        )}
        <p>
          <strong>Tariff Calculation Details:</strong>
        </p>
        <ul>
          <li>Tariff Schedule: {results.tariff?.scheduleCode || formData.scheduleCode || 'MFN'}</li>
          <li>FOB Value: {formatCurrency(formData.value, formData.currency)}</li>
          <li>Freight: {formatCurrency(formData.freight || 0, formData.currency)}</li>
          <li>Insurance: {formatCurrency(formData.insurance || 0, formData.currency)}</li>
          <li>Taxable Value PH: {formatCurrency(costBase.taxableValue || 0, calculationCurrency)}</li>
          <li>Duty Rate: {formatNumber(results.duty?.rate || 0)}%</li>
          <li>Duty Amount: {formatCurrency(results.duty?.amount || 0, calculationCurrency)}</li>
          <li>Excise Tax: {formatCurrency(exciseAmount, calculationCurrency)}{results.exciseTax?.category && results.exciseTax.category !== 'none' ? ` (${results.exciseTax.category.replace(/_/g, ' ')})` : ''}</li>
          <li>Surcharge: {formatCurrency(results.duty?.surcharge || 0, calculationCurrency)}</li>
          <li>Brokerage Fee: {formatCurrency(costBase.brokerageFee || 0, calculationCurrency)}</li>
          <li>Arrastre / Wharfage: {formatCurrency(costBase.arrastreWharfage || 0, calculationCurrency)}</li>
          <li>Dox Stamp & Others: {formatCurrency(costBase.doxStampOthers || 0, calculationCurrency)}</li>
          <li>Landed Cost (VAT Base): {formatCurrency(landedCostSubtotal, calculationCurrency)}</li>
          <li>Total Item Tax: {formatCurrency(itemTaxTotal, calculationCurrency)}</li>
          <li>IPF: {formatCurrency(extraFees.ipc, calculationCurrency)}</li>
          <li>CSF: {formatCurrency(extraFees.csf, calculationCurrency)}</li>
          <li>CDS: {formatCurrency(extraFees.cds, calculationCurrency)}</li>
          <li>IRS: {formatCurrency(extraFees.irs, calculationCurrency)}</li>
          <li>LRF: {formatCurrency(extraFees.lrf, calculationCurrency)}</li>
          <li>Total Global Tax: {formatCurrency(globalTaxTotal, calculationCurrency)}</li>
          <li>Total Tax and Fees: {formatCurrency(totalTaxAndFees, calculationCurrency)}</li>
          <li>VAT Rate: {formatNumber(results.vat?.rate || 0)}%</li>
          <li>VAT Amount: {formatCurrency(results.vat?.amount || 0, calculationCurrency)}</li>
          <li className="total">
            Total: {formatCurrency(results.totalLandedCost, calculationCurrency)}
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
