import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../lib/settingsStore'
import { appApi } from '../lib/appApi'
import './Settings.css'

const FX_TTL_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (default)' },
  { value: 48, label: '48 hours' },
]

const SCHEDULE_OPTIONS = [
  { code: 'MFN', displayName: 'Most-Favored-Nation (default)' },
  { code: 'AANZFTA', displayName: 'AANZFTA' },
  { code: 'ACFTA', displayName: 'ACFTA' },
  { code: 'AHKFTA', displayName: 'AHKFTA' },
  { code: 'AIFTA', displayName: 'AIFTA' },
  { code: 'AJCEPA', displayName: 'AJCEPA' },
  { code: 'AKFTA', displayName: 'AKFTA' },
  { code: 'ATIGA', displayName: 'ATIGA' },
  { code: 'PH-EFTA FTA (CHE/LIE)', displayName: 'PH-EFTA (CHE/LIE)' },
  { code: 'PH-EFTA FTA (ISL)', displayName: 'PH-EFTA (ISL)' },
  { code: 'PH-EFTA FTA (NOR)', displayName: 'PH-EFTA (NOR)' },
  { code: 'PH-KR FTA', displayName: 'PH-KR FTA' },
  { code: 'PJEPA', displayName: 'PJEPA' },
  { code: 'RCEP', displayName: 'RCEP' },
]

export const Settings: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState(settings)
  const [latestSource, setLatestSource] = useState<Record<string, unknown> | null>(null)
  const [autoFetcherLastRun, setAutoFetcherLastRun] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isRefreshingRuntime, setIsRefreshingRuntime] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const loadRuntimeState = async () => {
      setIsRefreshingRuntime(true)
      setRuntimeError(null)

      try {
        const [settingsResult, statusResult] = await Promise.all([
          appApi.getRuntimeSettings(),
          appApi.getRuntimeStatus(),
        ])

        if (settingsResult.success && settingsResult.data) {
          const loadRuntimeState = async () => {
          setLatestSource(statusResult.data.latestSource)
          return
            setIsRefreshingRuntime(true)

        setRuntimeError(statusResult.error || 'Runtime status is temporarily unavailable.')
            setRuntimeError(null)
        setRuntimeError('Runtime status is temporarily unavailable.')
      } finally {
        setIsRefreshingRuntime(false)
            try {
              const [settingsResult, statusResult] = await Promise.all([
                appApi.getRuntimeSettings(),
                appApi.getRuntimeStatus(),
              ])

              if (settingsResult.success && settingsResult.data) {
    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await appApi.updateRuntimeSettings(localSettings)
      if (!result.success || !result.data) {
        setSaveError(result.error || 'Failed to save runtime settings.')
        return
      }

      updateSettings(result.data)
      setLocalSettings(result.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setSaveError('Failed to save runtime settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshRuntime = async () => {
    setIsRefreshingRuntime(true)
    setRuntimeError(null)

    try {
      const statusResult = await appApi.getRuntimeStatus()
      if (statusResult.success && statusResult.data) {
        setAutoFetcherLastRun(statusResult.data.autoFetcherLastRun)
        setLatestSource(statusResult.data.latestSource)
        return
      }

      setRuntimeError(statusResult.error || 'Runtime status is temporarily unavailable.')
    } catch {
      setRuntimeError('Runtime status is temporarily unavailable.')
    } finally {
      setIsRefreshingRuntime(false)
    }
              if (statusResult.success && statusResult.data) {
                setAutoFetcherLastRun(statusResult.data.autoFetcherLastRun)
  const handleReset = async () => {
    setIsSaving(true)
    setSaveError(null)

    const defaultSettings = {

              setRuntimeError(statusResult.error || 'Runtime status is temporarily unavailable.')
            } catch {
              setRuntimeError('Runtime status is temporarily unavailable.')
    }

    try {
      const result = await appApi.updateRuntimeSettings(defaultSettings)
      if (!result.success || !result.data) {
        setSaveError(result.error || 'Failed to reset runtime settings.')
        return
      }

      resetSettings()
      updateSettings(result.data)
      setLocalSettings(result.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setSaveError('Failed to reset runtime settings.')
    } finally {
      setIsSaving(false)
    }
              setIsRefreshingRuntime(false)

  const latestSourceName = typeof latestSource?.source_name === 'string' ? latestSource.source_name : null
  const latestSourceType = typeof latestSource?.source_type === 'string' ? latestSource.source_type : null
  const latestSourceStatus = typeof latestSource?.status === 'string' ? latestSource.status : null
  const latestSourceFetchedAt = typeof latestSource?.fetched_at === 'string' ? latestSource.fetched_at : null
  const isRuntimeHealthy = !runtimeError && latestSourceStatus !== 'failed'

  const formatDateTime = (value: string | null): string => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString()
  }
            }
          }

          void loadRuntimeState()

  const handleReset = () => {
    resetSettings()
          setIsSaving(true)
          setSaveError(null)

          try {
            const result = await appApi.updateRuntimeSettings(localSettings)
            if (!result.success || !result.data) {
              setSaveError(result.error || 'Failed to save runtime settings.')
              return
            }

            updateSettings(result.data)
            setLocalSettings(result.data)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
          } catch {
            setSaveError('Failed to save runtime settings.')
          } finally {
            setIsSaving(false)
          }
      fxCacheTtlHours: 24,
    })
  }
          setIsRefreshingRuntime(true)
          setRuntimeError(null)

          try {
            const statusResult = await appApi.getRuntimeStatus()
            if (statusResult.success && statusResult.data) {
              setAutoFetcherLastRun(statusResult.data.autoFetcherLastRun)
              setLatestSource(statusResult.data.latestSource)
              return
            }

            setRuntimeError(statusResult.error || 'Runtime status is temporarily unavailable.')
          } catch {
            setRuntimeError('Runtime status is temporarily unavailable.')
          } finally {
            setIsRefreshingRuntime(false)
          }
        }

        const handleReset = async () => {
          setIsSaving(true)
          setSaveError(null)

          const defaultSettings = {
            defaultScheduleCode: 'MFN',
            defaultOriginCountry: '',
            autoFetcherEnabled: true,
            fxCacheTtlHours: 24,
          }

          try {
            const result = await appApi.updateRuntimeSettings(defaultSettings)
            if (!result.success || !result.data) {
              setSaveError(result.error || 'Failed to reset runtime settings.')
              return
            }

            resetSettings()
            updateSettings(result.data)
            setLocalSettings(result.data)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
          } catch {
            setSaveError('Failed to reset runtime settings.')
          } finally {
            setIsSaving(false)
          }
        }
  return (
        const latestSourceName = typeof latestSource?.source_name === 'string' ? latestSource.source_name : null
        const latestSourceType = typeof latestSource?.source_type === 'string' ? latestSource.source_type : null
        const latestSourceStatus = typeof latestSource?.status === 'string' ? latestSource.status : null
        const latestSourceFetchedAt = typeof latestSource?.fetched_at === 'string' ? latestSource.fetched_at : null
        const isRuntimeHealthy = !runtimeError && latestSourceStatus !== 'failed'

        const formatDateTime = (value: string | null): string => {
          if (!value) return 'N/A'
          const date = new Date(value)
          if (Number.isNaN(date.getTime())) return 'N/A'
          return date.toLocaleString()
    <div className="settings-container">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Configure default calculation and system preferences.</p>
      </header>

      <div className="settings-body">
        <section className="settings-card">
          <h2>Calculation Defaults</h2>

          <div className="settings-field">
            <label htmlFor="default-schedule">Default Tariff Schedule</label>
            <select
              id="default-schedule"
              value={localSettings.defaultScheduleCode}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, defaultScheduleCode: e.target.value }))}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>{`${opt.code} — ${opt.displayName}`}</option>
              ))}
            </select>
            <p className="settings-hint">Used as the pre-selected schedule on the Calculator page.</p>
          </div>

          <div className="settings-field">
            <label htmlFor="default-origin">Default Origin Country (ISO 3)</label>
            <input
              id="default-origin"
              type="text"
              maxLength={3}
              value={localSettings.defaultOriginCountry}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, defaultOriginCountry: e.target.value.toUpperCase() }))}
              placeholder="e.g. CHN"
            />
            <p className="settings-hint">Leave blank to require manual entry each time.</p>
          </div>
        </section>

        <section className="settings-card">
          <h2>Runtime Operations</h2>

          <div className={`settings-runtime-state ${isRuntimeHealthy ? 'is-healthy' : 'is-degraded'}`}>
            <strong>{isRuntimeHealthy ? 'Operational state: Healthy' : 'Operational state: Degraded'}</strong>
            <span>
              {runtimeError
                ? runtimeError
                : 'Status is derived from the latest ingestion source and runtime endpoint availability.'}
            </span>
          </div>

          <div className="settings-runtime-grid">
            <div>
              <p className="settings-runtime-label">Latest source</p>
              <p className="settings-runtime-value">{latestSourceName || 'No source data yet'}</p>
            </div>
            <div>
              <p className="settings-runtime-label">Source type</p>
              <p className="settings-runtime-value">{latestSourceType || 'N/A'}</p>
            </div>
            <div>
              <p className="settings-runtime-label">Source status</p>
              <p className="settings-runtime-value">{latestSourceStatus || 'N/A'}</p>
            </div>
            <div>
              <p className="settings-runtime-label">Latest fetched at</p>
              <p className="settings-runtime-value">{formatDateTime(latestSourceFetchedAt)}</p>
            </div>
          </div>

          <button
            className="btn btn-outline"
            onClick={() => void handleRefreshRuntime()}
            disabled={isRefreshingRuntime}
          >
            {isRefreshingRuntime ? 'Refreshing...' : 'Refresh Runtime Status'}
          </button>
        </section>

        <section className="settings-card">
          <h2>Exchange Rate Cache</h2>

          <div className="settings-field">
            <label htmlFor="fx-ttl">FX Cache TTL</label>
            <select
              id="fx-ttl"
              value={localSettings.fxCacheTtlHours}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, fxCacheTtlHours: Number(e.target.value) }))}
            >
              {FX_TTL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="settings-hint">How long cached exchange rates are considered fresh. Longer TTL reduces external API calls.</p>
          </div>
        </section>

        <section className="settings-card">
          <h2>Automated Regulatory Fetcher</h2>

          <div className="settings-field settings-field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={localSettings.autoFetcherEnabled}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, autoFetcherEnabled: e.target.checked }))}
              />
              <span>Enable auto-fetcher (BOC &amp; Tariff Commission)</span>
            </label>
            <p className="settings-hint">
              When enabled the server runs a daily cron job that discovers and queues data files from approved government sources for human review.
              Disable to pause automatic discovery.
            </p>
          </div>
                      <button className="btn btn-primary" onClick={() => void handleSave()} disabled={isSaving}>
                        {isSaving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
            <p className="settings-last-run">
                      <button className="btn btn-outline" onClick={() => void handleReset()} disabled={isSaving}>
            </p>
          )}
          {!autoFetcherLastRun && (

                    {saveError && <p className="settings-error">{saveError}</p>}
            <p className="settings-last-run">No auto-fetch records found (server may not have run yet).</p>
          )}
        </section>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
                <button className="btn btn-primary" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
                <button className="btn btn-outline" onClick={() => void handleReset()} disabled={isSaving}>
      </div>
    </div>
  )

              {saveError && <p className="settings-error">{saveError}</p>}
}
