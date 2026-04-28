import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { getDbPath } from '../db/database'

export interface RuntimeSettings {
  defaultScheduleCode: string
  defaultOriginCountry: string
  autoFetcherEnabled: boolean
  fxCacheTtlHours: number
  calculatorMode: 'estimate'
  catalogMode: 'seed-fallback' | 'official-catalog-required'
  stagedCutoverEnabled: boolean
  cutoverCoverageThreshold: number
  fullSyncIdempotencyGuardEnabled: boolean
}

const SETTINGS_FILE_NAME = 'runtime-settings.json'

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  defaultScheduleCode: 'MFN',
  defaultOriginCountry: '',
  autoFetcherEnabled: true,
  fxCacheTtlHours: 24,
  calculatorMode: 'estimate',
  catalogMode: 'seed-fallback',
  stagedCutoverEnabled: false,
  cutoverCoverageThreshold: 99,
  fullSyncIdempotencyGuardEnabled: true,
}

const settingsFilePath = (): string => {
  const dataDir = dirname(getDbPath())
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  return join(dataDir, SETTINGS_FILE_NAME)
}

const sanitizeSettings = (raw: Partial<RuntimeSettings> | null | undefined): RuntimeSettings => {
  const defaultScheduleCode = typeof raw?.defaultScheduleCode === 'string' && raw.defaultScheduleCode.trim()
    ? raw.defaultScheduleCode.trim().toUpperCase()
    : DEFAULT_RUNTIME_SETTINGS.defaultScheduleCode
  const defaultOriginCountry = typeof raw?.defaultOriginCountry === 'string'
    ? raw.defaultOriginCountry.trim().toUpperCase().slice(0, 3)
    : DEFAULT_RUNTIME_SETTINGS.defaultOriginCountry
  const fxCacheTtlHours = Number.isFinite(Number(raw?.fxCacheTtlHours))
    ? Math.min(168, Math.max(1, Number(raw?.fxCacheTtlHours)))
    : DEFAULT_RUNTIME_SETTINGS.fxCacheTtlHours
  const catalogMode = raw?.catalogMode === 'official-catalog-required'
    ? 'official-catalog-required'
    : DEFAULT_RUNTIME_SETTINGS.catalogMode
  const cutoverCoverageThreshold = Number.isFinite(Number(raw?.cutoverCoverageThreshold))
    ? Math.min(100, Math.max(90, Number(raw?.cutoverCoverageThreshold)))
    : DEFAULT_RUNTIME_SETTINGS.cutoverCoverageThreshold

  return {
    defaultScheduleCode,
    defaultOriginCountry,
    autoFetcherEnabled: typeof raw?.autoFetcherEnabled === 'boolean'
      ? raw.autoFetcherEnabled
      : DEFAULT_RUNTIME_SETTINGS.autoFetcherEnabled,
    fxCacheTtlHours,
    calculatorMode: 'estimate',
    catalogMode,
    stagedCutoverEnabled: typeof raw?.stagedCutoverEnabled === 'boolean'
      ? raw.stagedCutoverEnabled
      : DEFAULT_RUNTIME_SETTINGS.stagedCutoverEnabled,
    cutoverCoverageThreshold,
    fullSyncIdempotencyGuardEnabled: typeof raw?.fullSyncIdempotencyGuardEnabled === 'boolean'
      ? raw.fullSyncIdempotencyGuardEnabled
      : DEFAULT_RUNTIME_SETTINGS.fullSyncIdempotencyGuardEnabled,
  }
}

let cachedSettings: RuntimeSettings | null = null

export const getRuntimeSettings = (): RuntimeSettings => {
  if (cachedSettings) {
    return cachedSettings
  }

  try {
    const filePath = settingsFilePath()
    if (existsSync(filePath)) {
      cachedSettings = sanitizeSettings(JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<RuntimeSettings>)
      return cachedSettings
    }
  } catch (error) {
    console.warn('Failed to load runtime settings:', error)
  }

  cachedSettings = DEFAULT_RUNTIME_SETTINGS
  return cachedSettings
}

export const updateRuntimeSettings = (patch: Partial<RuntimeSettings>): RuntimeSettings => {
  const nextSettings = sanitizeSettings({
    ...getRuntimeSettings(),
    ...patch,
  })

  cachedSettings = nextSettings

  try {
    writeFileSync(settingsFilePath(), JSON.stringify(nextSettings, null, 2))
  } catch (error) {
    console.warn('Failed to persist runtime settings:', error)
  }

  return nextSettings
}

export const getDefaultRuntimeSettings = (): RuntimeSettings => DEFAULT_RUNTIME_SETTINGS
