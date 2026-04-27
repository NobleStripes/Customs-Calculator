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
  const [autoFetcherLastRun, setAutoFetcherLastRun] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const loadRuntimeState = async () => {
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
        }
      } catch {
        // non-critical
      }
    }

    void loadRuntimeState()
  }, [updateSettings])

  const handleSave = async () => {
    updateSettings(localSettings)
    await appApi.updateRuntimeSettings(localSettings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    resetSettings()
    setLocalSettings({
      defaultScheduleCode: 'MFN',
      defaultOriginCountry: '',
      autoFetcherEnabled: true,
      fxCacheTtlHours: 24,
    })
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

          {autoFetcherLastRun && (
            <p className="settings-last-run">
              Last auto-fetch run: <strong>{new Date(autoFetcherLastRun).toLocaleString()}</strong>
            </p>
          )}
          {!autoFetcherLastRun && (
            <p className="settings-last-run">No auto-fetch records found (server may not have run yet).</p>
          )}
        </section>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
          <button className="btn btn-outline" onClick={handleReset}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}
