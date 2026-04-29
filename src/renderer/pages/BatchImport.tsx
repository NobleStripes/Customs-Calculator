import React, { useMemo, useState } from 'react'
import { appApi } from '../lib/appApi'
import {
  CSV_TEMPLATE_EXAMPLE,
  CSV_TEMPLATE_HEADER,
  RESULT_CURRENCY,
  getColumnAliasHelp,
  parseBatchImportCsv,
  type ShipmentRow,
} from '../lib/batchImportCsv'
import './BatchImport.css'

type BatchResultRow = ShipmentRow & {
  duty?: {
    amount?: number
    rate?: number
  }
  vat?: {
    amount?: number
    rate?: number
  }
  fx?: {
    applied?: boolean
    rateToPhp?: number
    inputCurrency?: string
    baseCurrency?: string
    source?: 'cache' | 'live' | 'fallback' | 'identity'
    timestamp?: string
  }
  calculationCurrency?: string
  costBase?: {
    taxableValue?: number
  }
  totalLandedCost?: number
}


const formatCurrency = (amount: number, currency: string = RESULT_CURRENCY) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)


const toCsv = (rows: BatchResultRow[]): string => {
  const header = [
    'hsCode',
    'scheduleCode',
    'value',
    'freight',
    'insurance',
    'originCountry',
    'destinationPort',
    'currency',
    'declarationType',
    'containerSize',
    'arrastreWharfage',
    'doxStampOthers',
    'dutyAmountPhp',
    'dutyRate',
    'vatAmountPhp',
    'vatRate',
    'totalLandedCostPhp',
  ]

  const lines = rows.map((row) => {
    const dutyAmount = row.duty?.amount || 0
    const vatAmount = row.vat?.amount || 0
    const total = row.totalLandedCost || (row.value + dutyAmount + vatAmount)

    return [
      row.hsCode,
      row.scheduleCode,
      row.value.toFixed(2),
      row.freight.toFixed(2),
      row.insurance.toFixed(2),
      row.originCountry,
      row.destinationPort,
      row.currency,
      row.declarationType,
      row.containerSize,
      row.arrastreWharfage.toFixed(2),
      row.doxStampOthers.toFixed(2),
      dutyAmount.toFixed(2),
      (row.duty?.rate || 0).toFixed(2),
      vatAmount.toFixed(2),
      (row.vat?.rate || 0).toFixed(2),
      total.toFixed(2),
    ].join(',')
  })

  return [header.join(','), ...lines].join('\n')
}

const downloadTemplate = () => {
  const content = `${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}`
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'batch-import-template.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export const BatchImport: React.FC = () => {
  const [rawCsv, setRawCsv] = useState('')
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [results, setResults] = useState<BatchResultRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [columnWarnings, setColumnWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const columnAliasHelp = useMemo(() => getColumnAliasHelp(), [])

  const totals = useMemo(() => {
    return results.reduce(
      (acc, row) => {
        const duty = row.duty?.amount || 0
        const vat = row.vat?.amount || 0
        acc.shipments += 1
        acc.taxableValuePhp += row.costBase?.taxableValue || 0
        acc.totalDuty += duty
        acc.totalVat += vat
        acc.totalLanded += row.totalLandedCost || (row.value + duty + vat)
        return acc
      },
      {
        shipments: 0,
        taxableValuePhp: 0,
        totalDuty: 0,
        totalVat: 0,
        totalLanded: 0,
      }
    )
  }, [results])

  const fallbackRateCount = useMemo(
    () => results.filter((row) => row.fx?.source === 'fallback').length,
    [results]
  )

  const handleParse = () => {
    setError(null)
    setColumnWarnings([])
    const { rows, columnWarnings: warnings } = parseBatchImportCsv(rawCsv)
    setColumnWarnings(warnings)

    if (rows.length === 0) {
      setShipments([])
      setResults([])
      setError('No valid rows found. Download the template above to see the expected column format.')
      return
    }

    setShipments(rows)
    setResults([])
  }

  const handleFileUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    setRawCsv(text)
    setShipments([])
    setResults([])
    setError(null)
    setColumnWarnings([])
  }

  const handleRunBatch = async () => {
    if (shipments.length === 0) {
      setError('Parse a CSV first before running calculations.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await appApi.batchCalculate(shipments)
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Batch calculation failed')
      }

      setResults(response.data as BatchResultRow[])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleExportResults = () => {
    if (results.length === 0) {
      setError('No batch results available to export.')
      return
    }

    const csvContent = toCsv(results)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'batch-calculation-results.csv'
    anchor.click()

    URL.revokeObjectURL(url)
  }

  return (
    <div className="batch-container">
      <header className="batch-header">
        <h1>Batch Import</h1>
        <p>Upload shipment rows and calculate duties in one run.</p>
      </header>

      <div className="batch-layout">
        <section className="batch-panel">
          <h2>Input CSV</h2>

          <div className="template-row">
            <p className="hint">Use the template or keep your own header order. Common aliases are mapped automatically.</p>
            <button className="btn btn-template" onClick={downloadTemplate}>
              ⬇ Download Template
            </button>
          </div>

          <div className="mapping-panel">
            <p className="mapping-title">Accepted header aliases</p>
            <div className="mapping-grid">
              {columnAliasHelp.map((entry) => (
                <div key={entry.column} className="mapping-item">
                  <strong>{entry.column}</strong>
                  <span>{entry.aliases.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>

          <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />

          <textarea
            value={rawCsv}
            onChange={(event) => setRawCsv(event.target.value)}
            placeholder={`${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}`}
          />

          <div className="actions">
            <button className="btn btn-secondary" onClick={handleParse}>
              Parse CSV
            </button>
            <button className="btn btn-primary" onClick={handleRunBatch} disabled={loading}>
              {loading ? 'Running...' : 'Run Batch'}
            </button>
            <button className="btn btn-outline" onClick={handleExportResults}>
              Export Results
            </button>
          </div>

          {columnWarnings.length > 0 && (
            <div className="column-warnings">
              {columnWarnings.map((w, i) => (
                <div key={i} className="column-warning">⚠ {w}</div>
              ))}
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </section>

        <section className="batch-panel">
          <h2>Preview ({shipments.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>HS Code</th>
                  <th>FOB</th>
                  <th>Schedule</th>
                  <th>Freight</th>
                  <th>Insurance</th>
                  <th>Origin</th>
                  <th>Currency</th>
                  <th>Declaration</th>
                  <th>Container</th>
                </tr>
              </thead>
              <tbody>
                {shipments.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-cell">
                      Parse CSV to preview rows.
                    </td>
                  </tr>
                )}
                {shipments.map((row, index) => (
                  <tr key={`${row.hsCode}-${index}`}>
                    <td>{row.hsCode}</td>
                    <td>{row.value.toFixed(2)}</td>
                    <td>{row.scheduleCode}</td>
                    <td>{row.freight.toFixed(2)}</td>
                    <td>{row.insurance.toFixed(2)}</td>
                    <td>{row.originCountry}</td>
                    <td>{row.currency}</td>
                    <td>{row.declarationType}</td>
                    <td>{row.containerSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="batch-panel results">
        <h2>Batch Results ({results.length})</h2>
        {fallbackRateCount > 0 && (
          <div className="error-message">
            {fallbackRateCount} shipment{fallbackRateCount === 1 ? '' : 's'} used fallback exchange rates because live or cached rates were unavailable.
          </div>
        )}
        <div className="summary-grid">
          <div className="summary-item">
            <label>Taxable Value (PHP)</label>
            <strong>{formatCurrency(totals.taxableValuePhp)}</strong>
          </div>
          <div className="summary-item">
            <label>Total Duty (PHP)</label>
            <strong>{formatCurrency(totals.totalDuty)}</strong>
          </div>
          <div className="summary-item">
            <label>Total VAT (PHP)</label>
            <strong>{formatCurrency(totals.totalVat)}</strong>
          </div>
          <div className="summary-item">
            <label>Total Landed (PHP)</label>
            <strong>{formatCurrency(totals.totalLanded)}</strong>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>HS Code</th>
                <th>Schedule</th>
                <th>FOB Input</th>
                <th>Duty (PHP)</th>
                <th>VAT (PHP)</th>
                <th>Total Landed (PHP)</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    Run batch to see results.
                  </td>
                </tr>
              )}
              {results.map((row, index) => {
                const duty = row.duty?.amount || 0
                const vat = row.vat?.amount || 0
                const total = row.totalLandedCost || (row.value + duty + vat)

                return (
                  <tr key={`${row.hsCode}-result-${index}`}>
                    <td>{row.hsCode}</td>
                    <td>{row.scheduleCode}</td>
                    <td>{formatCurrency(row.value, row.currency)}</td>
                    <td>{formatCurrency(duty)}</td>
                    <td>{formatCurrency(vat)}</td>
                    <td>{formatCurrency(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
