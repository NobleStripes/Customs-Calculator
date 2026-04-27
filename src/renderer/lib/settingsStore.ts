import { create } from 'zustand'

const STORAGE_KEY = 'customs-calculator-settings'

export interface AppSettings {
  defaultScheduleCode: string
  defaultOriginCountry: string
  autoFetcherEnabled: boolean
  fxCacheTtlHours: number
}

interface SettingsState {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultScheduleCode: 'MFN',
  defaultOriginCountry: '',
  autoFetcherEnabled: true,
  fxCacheTtlHours: 24,
}

const loadSettings = (): AppSettings => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return DEFAULT_SETTINGS

    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const saveSettings = (settings: AppSettings): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  } catch {
    // ignore storage errors
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadSettings(),

  updateSettings: (patch) => {
    set((state) => {
      const next = { ...state.settings, ...patch }
      saveSettings(next)
      return { settings: next }
    })
  },

  resetSettings: () => {
    saveSettings(DEFAULT_SETTINGS)
    set({ settings: DEFAULT_SETTINGS })
  },
}))
