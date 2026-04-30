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

const DEFAULT_SETTINGS = {
  defaultScheduleCode: 'MFN',
  defaultOriginCountry: '',
  autoFetcherEnabled: true,
  fxCacheTtlHours: 24,
}

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

  const loadRuntimeState = async () => {
    setIsRefreshingRuntime(true)
    setRuntimeError(null)

    try {
      const [settingsResult, statusResult] = await Promise.all([
        appApi.getRuntimeSettings(),
        appApi.getRuntimeStatus(),
      ])

      if (settingsResult.success && settingsResult.data) {
        setLocalSettings(settingsResult.data)
        updateSettings(settingsResult.data)
      }

      if (statusResult.success && statusResult.data) {
        setAutoFetcherLastRun(statusResult.data.autoFetcherLastRun)
        setLatestSource(statusResult.data.latestSource)
      } else {
        setRuntimeError(statusResult.error || 'Runtime status is temporarily unavailable.')
      }
    } catch {
      setRuntimeError('Runtime status is temporarily unavailable.')
    } finally {
      setIsRefreshingRuntime(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRuntimeState()
    // initial load should run once and keep store sync from runtime endpoint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
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
    await loadRuntimeState()
  }

  const handleReset = async () => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await appApi.updateRuntimeSettings(DEFAULT_SETTINGS)
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

  return (
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
                <option key={opt.code} value={opt.code}>{`${opt.code} - ${opt.displayName}`}</option>
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

          <div className="settings-field settings-field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={localSettings.fxPreferBocRate ?? true}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, fxPreferBocRate: e.target.checked }))}
              />
              <span>Use BOC Weekly Exchange Rate (recommended for compliance)</span>
            </label>
            <p className="settings-hint">
              When enabled, the Bureau of Customs weekly published rate is used as the primary FX source for
              PHP conversion (cached for 7 days). Falls back to live market rates if the BOC page is unavailable.
              Required for formal entry declarations per BOC regulations.
            </p>
          </div>

          <div className="settings-field">
            <label htmlFor="fx-ttl">Market FX Cache TTL (fallback rates)</label>
            <select
              id="fx-ttl"
              value={localSettings.fxCacheTtlHours}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, fxCacheTtlHours: Number(e.target.value) }))}
            >
              {FX_TTL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="settings-hint">How long cached market exchange rates are considered fresh when BOC rate is unavailable. Longer TTL reduces external API calls.</p>
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

          {autoFetcherLastRun && (
            <p className="settings-last-run">
              Last auto-fetch run: <strong>{new Date(autoFetcherLastRun).toLocaleString()}</strong>
            </p>
          )}
          {!autoFetcherLastRun && (
            <p className="settings-last-run">No auto-fetch records found (server may not have run yet).</p>
          )}
        </section>

        <section className="settings-card">
          <h2>Catalog &amp; Ingestion</h2>

          <div className="settings-field settings-field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={localSettings.stagedCutoverEnabled ?? false}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, stagedCutoverEnabled: e.target.checked }))}
              />
              <span>Enable staged catalog cutover</span>
            </label>
            <p className="settings-hint">
              When enabled, the system switches from seed-fallback to official-catalog mode only after the coverage
              threshold below is met during a full sync.
            </p>
          </div>

          <div className="settings-field">
            <label htmlFor="cutover-threshold">Cutover coverage threshold (%)</label>
            <input
              id="cutover-threshold"
              type="number"
              min={90}
              max={100}
              step={1}
              value={localSettings.cutoverCoverageThreshold ?? 99}
              onChange={(e) => {
                const parsed = Number(e.target.value)
                if (Number.isFinite(parsed)) {
                  setLocalSettings((prev) => ({ ...prev, cutoverCoverageThreshold: Math.min(100, Math.max(90, parsed)) }))
                }
              }}
            />
            <p className="settings-hint">
              Percentage of HS codes that must be covered by the imported catalog before a staged cutover is allowed.
              Accepted range: 90–100.
            </p>
          </div>

          <div className="settings-field settings-field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={localSettings.fullSyncIdempotencyGuardEnabled ?? true}
                onChange={(e) => setLocalSettings((prev) => ({ ...prev, fullSyncIdempotencyGuardEnabled: e.target.checked }))}
              />
              <span>Enable full-sync idempotency guard</span>
            </label>
            <p className="settings-hint">
              Prevents duplicate full-sync imports within the same day. Disable only during manual re-ingestion recovery.
            </p>
          </div>
        </section>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </button>
          <button className="btn btn-outline" onClick={() => void handleReset()} disabled={isSaving}>
            Reset to Defaults
          </button>
        </div>

        {saveError && <p className="settings-error">{saveError}</p>}
      </div>
    </div>
  )
}
