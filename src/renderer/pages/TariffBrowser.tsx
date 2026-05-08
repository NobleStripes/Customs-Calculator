import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { appApi } from '../lib/appApi'
import './TariffBrowser.css'

type TariffRow = {
  hsCode: string
  scheduleCode: string
  description: string
  category: string
  dutyRate: number
  vatRate: number
  surchargeRate: number
  effectiveDate: string
  endDate?: string | null
  importStatus?: string | null
}

type TariffScheduleOption = {
  code: string
  displayName: string
}

type SortKey = 'hsCode' | 'dutyRate' | 'vatRate' | 'surchargeRate' | 'effectiveDate'
type SortDir = 'asc' | 'desc'

const RATE_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const TariffBrowser: React.FC = () => {
  const [browseMode, setBrowseMode] = useState<'latest' | 'history'>('latest')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [scheduleCode, setScheduleCode] = useState('MFN')
  const [categories, setCategories] = useState<string[]>(['All'])
  const [schedules, setSchedules] = useState<TariffScheduleOption[]>([
    { code: 'MFN', displayName: 'Most-Favored-Nation' },
  ])
  const [rows, setRows] = useState<TariffRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('hsCode')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const fetchCategories = useCallback(async () => {
    try {
      const response = await appApi.getTariffCategories()
      if (response.success && Array.isArray(response.data)) {
        setCategories(['All', ...response.data])
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }, [])

  const fetchRows = useCallback(async (
    searchTerm: string,
    selectedCategory: string,
    selectedScheduleCode: string,
    mode: 'latest' | 'history'
  ) => {
    setLoading(true)
    setError(null)

    try {
      const response = mode === 'history'
        ? await appApi.getTariffHistory({
            query: searchTerm,
            category: selectedCategory,
            scheduleCode: selectedScheduleCode,
            limit: 400,
          })
        : await appApi.getTariffCatalog({
        query: searchTerm,
        category: selectedCategory,
        scheduleCode: selectedScheduleCode,
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
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchCategories()
      void appApi.getTariffSchedules().then((response) => {
        if (response.success && Array.isArray(response.data) && response.data.length > 0) {
          setSchedules(response.data)
        }
      })
      void fetchRows('', 'All', 'MFN', 'latest')
    }, 0)

    return () => clearTimeout(handle)
  }, [fetchCategories, fetchRows])

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchRows(query, category, scheduleCode, browseMode)
    }, 250)

    return () => clearTimeout(handle)
  }, [browseMode, category, fetchRows, query, scheduleCode])

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

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
    return sorted
  }, [rows, sortKey, sortDir])

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

        <div className="control-group category">
          <label htmlFor="tariff-browse-mode">Browse Mode</label>
          <select
            id="tariff-browse-mode"
            value={browseMode}
            onChange={(event) => setBrowseMode(event.target.value as 'latest' | 'history')}
          >
            <option value="latest">Latest Effective Rates</option>
            <option value="history">Historical Timeline</option>
          </select>
        </div>

        <div className="control-group category">
          <label htmlFor="tariff-schedule-filter">Tariff Schedule</label>
          <select
            id="tariff-schedule-filter"
            value={scheduleCode}
            onChange={(event) => setScheduleCode(event.target.value)}
          >
            {schedules.map((item) => (
              <option key={item.code} value={item.code}>
                {`${item.code} - ${item.displayName}`}
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
        <p className="tariff-row-count">
          {loading ? 'Loading…' : `${stats.totalRows} row${stats.totalRows !== 1 ? 's' : ''}`}
        </p>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">
              {browseMode === 'history' ? 'Tariff rate history' : 'Latest effective tariff rates'}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <button className="sort-btn" onClick={() => handleSort('hsCode')}>
                    HS Code{sortKey === 'hsCode' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th scope="col">Schedule</th>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">
                  <button className="sort-btn" onClick={() => handleSort('dutyRate')}>
                    Duty Rate{sortKey === 'dutyRate' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th scope="col">
                  <button className="sort-btn" onClick={() => handleSort('vatRate')}>
                    VAT Rate{sortKey === 'vatRate' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th scope="col">
                  <button className="sort-btn" onClick={() => handleSort('surchargeRate')}>
                    Surcharge{sortKey === 'surchargeRate' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th scope="col">
                  <button className="sort-btn" onClick={() => handleSort('effectiveDate')}>
                    Effective Date{sortKey === 'effectiveDate' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                {browseMode === 'history' && <th scope="col">End Date</th>}
                {browseMode === 'history' && <th scope="col">Import Status</th>}
              </tr>
            </thead>
            <tbody>
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={browseMode === 'history' ? 10 : 8}>
                    No tariff rows found for the selected filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="empty-cell" colSpan={browseMode === 'history' ? 10 : 8}>
                    {browseMode === 'history' ? 'Loading tariff history...' : 'Loading tariff catalog...'}
                  </td>
                </tr>
              )}

              {!loading &&
                sortedRows.map((row) => (
                  <tr key={`${row.hsCode}-${row.scheduleCode}-${row.effectiveDate}`}>
                    <td>{row.hsCode}</td>
                    <td>{row.scheduleCode}</td>
                    <td className="description-cell">{row.description}</td>
                    <td>{row.category}</td>
                    <td>{RATE_FORMAT.format(row.dutyRate)}%</td>
                    <td>{RATE_FORMAT.format(row.vatRate)}%</td>
                    <td>{RATE_FORMAT.format(row.surchargeRate)}%</td>
                    <td>{row.effectiveDate}</td>
                    {browseMode === 'history' && <td>{row.endDate || 'Active'}</td>}
                    {browseMode === 'history' && <td>{row.importStatus || 'n/a'}</td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
