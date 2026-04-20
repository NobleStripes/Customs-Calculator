import React, { useEffect, useMemo, useState } from 'react'
import './TariffBrowser.css'

type TariffRow = {
  hsCode: string
  description: string
  category: string
  dutyRate: number
  vatRate: number
  surchargeRate: number
  effectiveDate: string
}

const RATE_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const TariffBrowser: React.FC = () => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [categories, setCategories] = useState<string[]>(['All'])
  const [rows, setRows] = useState<TariffRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = async () => {
    try {
      const response = await window.electronAPI.getTariffCategories()
      if (response.success && Array.isArray(response.data)) {
        setCategories(['All', ...response.data])
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }

  const fetchRows = async (searchTerm: string, selectedCategory: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await window.electronAPI.getTariffCatalog({
        query: searchTerm,
        category: selectedCategory,
        limit: 300,
      })

      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.error || 'Unable to load tariff catalog')
      }

      setRows(response.data as TariffRow[])
    } catch (err) {
      setRows([])
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchRows('', 'All')
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchRows(query, category)
    }, 250)

    return () => clearTimeout(handle)
  }, [query, category])

  const stats = useMemo(() => {
    const totalRows = rows.length
    const avgDuty = totalRows === 0 ? 0 : rows.reduce((sum, row) => sum + row.dutyRate, 0) / totalRows
    const avgVat = totalRows === 0 ? 0 : rows.reduce((sum, row) => sum + row.vatRate, 0) / totalRows

    return {
      totalRows,
      avgDuty,
      avgVat,
    }
  }, [rows])

  return (
    <div className="tariff-browser-container">
      <header className="tariff-browser-header">
        <h1>Tariff Browser</h1>
        <p>Search tariff lines and filter by product category.</p>
      </header>

      <section className="tariff-controls">
        <div className="control-group search">
          <label htmlFor="tariff-search">Search HS code or description</label>
          <input
            id="tariff-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g., 8471 or cellular telephones"
          />
        </div>

        <div className="control-group category">
          <label htmlFor="tariff-category">Category</label>
          <select
            id="tariff-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="tariff-stats">
        <div className="stat-card">
          <span>Rows</span>
          <strong>{stats.totalRows}</strong>
        </div>
        <div className="stat-card">
          <span>Avg Duty Rate</span>
          <strong>{RATE_FORMAT.format(stats.avgDuty)}%</strong>
        </div>
        <div className="stat-card">
          <span>Avg VAT Rate</span>
          <strong>{RATE_FORMAT.format(stats.avgVat)}%</strong>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      <section className="tariff-table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>HS Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>Duty Rate</th>
                <th>VAT Rate</th>
                <th>Surcharge</th>
                <th>Effective Date</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    No tariff rows found for the selected filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    Loading tariff catalog...
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((row) => (
                  <tr key={`${row.hsCode}-${row.effectiveDate}`}>
                    <td>{row.hsCode}</td>
                    <td className="description-cell">{row.description}</td>
                    <td>{row.category}</td>
                    <td>{RATE_FORMAT.format(row.dutyRate)}%</td>
                    <td>{RATE_FORMAT.format(row.vatRate)}%</td>
                    <td>{RATE_FORMAT.format(row.surchargeRate)}%</td>
                    <td>{row.effectiveDate}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
