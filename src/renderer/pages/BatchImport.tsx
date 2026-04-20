import React, { useMemo, useState } from 'react'
import { appApi } from '../lib/appApi'
import './BatchImport.css'

type ShipmentRow = {
  hsCode: string
  value: number
  originCountry: string
  currency: string
}

type BatchResultRow = ShipmentRow & {
  duty?: {
    amount?: number
    rate?: number
  }
  vat?: {
    amount?: number
    rate?: number
  }
}

const DEFAULT_CURRENCY = 'USD'

const parseCsvText = (input: string): ShipmentRow[] => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  const firstRowParts = lines[0].split(',').map((part) => part.trim().toLowerCase())
  const hasHeader =
    firstRowParts.includes('hscode') ||
    firstRowParts.includes('hs_code') ||
    firstRowParts.includes('value')

  const dataLines = hasHeader ? lines.slice(1) : lines

  const rows: ShipmentRow[] = []

  for (const line of dataLines) {
    const parts = line.split(',').map((part) => part.trim())
    if (parts.length < 3) {
      continue
    }

    const hsCode = parts[0]
    const value = Number(parts[1])
    const originCountry = (parts[2] || '').toUpperCase()
    const currency = (parts[3] || DEFAULT_CURRENCY).toUpperCase()

    if (!hsCode || Number.isNaN(value) || value <= 0 || !originCountry) {
      continue
    }

    rows.push({
      hsCode,
      value,
      originCountry,
      currency,
    })
  }

  return rows
}

const toCsv = (rows: BatchResultRow[]): string => {
  const header = [
    'hsCode',
    'value',
    'originCountry',
    'currency',
    'dutyAmount',
    'dutyRate',
    'vatAmount',
    'vatRate',
    'totalLandedCost',
  ]

  const lines = rows.map((row) => {
    const dutyAmount = row.duty?.amount || 0
    const vatAmount = row.vat?.amount || 0
    const total = row.value + dutyAmount + vatAmount

    return [
      row.hsCode,
      row.value.toFixed(2),
      row.originCountry,
      row.currency,
      dutyAmount.toFixed(2),
      (row.duty?.rate || 0).toFixed(2),
      vatAmount.toFixed(2),
      (row.vat?.rate || 0).toFixed(2),
      total.toFixed(2),
    ].join(',')
  })

  return [header.join(','), ...lines].join('\n')
}

export const BatchImport: React.FC = () => {
  const [rawCsv, setRawCsv] = useState('')
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [results, setResults] = useState<BatchResultRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const totals = useMemo(() => {
    return results.reduce(
      (acc, row) => {
        const duty = row.duty?.amount || 0
        const vat = row.vat?.amount || 0
        acc.shipments += 1
        acc.declaredValue += row.value
        acc.totalDuty += duty
        acc.totalVat += vat
        acc.totalLanded += row.value + duty + vat
        return acc
      },
      {
        shipments: 0,
        declaredValue: 0,
        totalDuty: 0,
        totalVat: 0,
        totalLanded: 0,
      }
    )
  }, [results])

  const handleParse = () => {
    setError(null)
    const parsed = parseCsvText(rawCsv)

    if (parsed.length === 0) {
      setShipments([])
      setResults([])
      setError('No valid rows found. Expected columns: hsCode,value,originCountry,currency(optional).')
      return
    }

    setShipments(parsed)
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
          <p className="hint">Use header: hsCode,value,originCountry,currency</p>

          <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />

          <textarea
            value={rawCsv}
            onChange={(event) => setRawCsv(event.target.value)}
            placeholder="hsCode,value,originCountry,currency\n8471.30,1000,CHN,USD\n8517.62,2500,USA,USD"
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

          {error && <div className="error-message">{error}</div>}
        </section>

        <section className="batch-panel">
          <h2>Preview ({shipments.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>HS Code</th>
                  <th>Value</th>
                  <th>Origin</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {shipments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      Parse CSV to preview rows.
                    </td>
                  </tr>
                )}
                {shipments.map((row, index) => (
                  <tr key={`${row.hsCode}-${index}`}>
                    <td>{row.hsCode}</td>
                    <td>{row.value.toFixed(2)}</td>
                    <td>{row.originCountry}</td>
                    <td>{row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="batch-panel results">
        <h2>Batch Results ({results.length})</h2>
        <div className="summary-grid">
          <div className="summary-item">
            <label>Declared Value</label>
            <strong>{totals.declaredValue.toFixed(2)}</strong>
          </div>
          <div className="summary-item">
            <label>Total Duty</label>
            <strong>{totals.totalDuty.toFixed(2)}</strong>
          </div>
          <div className="summary-item">
            <label>Total VAT</label>
            <strong>{totals.totalVat.toFixed(2)}</strong>
          </div>
          <div className="summary-item">
            <label>Total Landed</label>
            <strong>{totals.totalLanded.toFixed(2)}</strong>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>HS Code</th>
                <th>Value</th>
                <th>Duty</th>
                <th>VAT</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    Run batch to see results.
                  </td>
                </tr>
              )}
              {results.map((row, index) => {
                const duty = row.duty?.amount || 0
                const vat = row.vat?.amount || 0
                const total = row.value + duty + vat

                return (
                  <tr key={`${row.hsCode}-result-${index}`}>
                    <td>{row.hsCode}</td>
                    <td>{row.value.toFixed(2)}</td>
                    <td>{duty.toFixed(2)}</td>
                    <td>{vat.toFixed(2)}</td>
                    <td>{total.toFixed(2)}</td>
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
