import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type StorageState = Record<string, string>

const STORAGE_KEY = 'customs-calculator-settings'

const createLocalStorageMock = (initialState: StorageState = {}) => {
  const state = new Map(Object.entries(initialState))

  return {
    getItem: vi.fn((key: string) => state.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      state.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      state.delete(key)
    }),
    clear: vi.fn(() => {
      state.clear()
    }),
  }
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads persisted settings and merges them with defaults', async () => {
    vi.stubGlobal(
      'localStorage',
      createLocalStorageMock({
        [STORAGE_KEY]: JSON.stringify({
          defaultOriginCountry: 'JPN',
          autoFetcherEnabled: false,
        }),
      })
    )

    const { useSettingsStore } = await import('./settingsStore')

    expect(useSettingsStore.getState().settings).toEqual({
      defaultScheduleCode: 'MFN',
      defaultOriginCountry: 'JPN',
      autoFetcherEnabled: false,
      fxCacheTtlHours: 24,
    })
  })

  it('falls back to defaults when persisted storage is invalid', async () => {
    vi.stubGlobal(
      'localStorage',
      createLocalStorageMock({
        [STORAGE_KEY]: '{invalid json',
      })
    )

    const { useSettingsStore } = await import('./settingsStore')

    expect(useSettingsStore.getState().settings).toEqual({
      defaultScheduleCode: 'MFN',
      defaultOriginCountry: '',
      autoFetcherEnabled: true,
      fxCacheTtlHours: 24,
    })
  })

  it('persists updates and can reset back to defaults', async () => {
    const localStorageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorageMock)

    const { useSettingsStore } = await import('./settingsStore')

    useSettingsStore.getState().updateSettings({
      defaultScheduleCode: 'AHTN',
      fxCacheTtlHours: 48,
    })

    expect(useSettingsStore.getState().settings).toEqual({
      defaultScheduleCode: 'AHTN',
      defaultOriginCountry: '',
      autoFetcherEnabled: true,
      fxCacheTtlHours: 48,
    })
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEY,
      JSON.stringify({
        defaultScheduleCode: 'AHTN',
        defaultOriginCountry: '',
        autoFetcherEnabled: true,
        fxCacheTtlHours: 48,
      })
    )

    useSettingsStore.getState().resetSettings()

    expect(useSettingsStore.getState().settings).toEqual({
      defaultScheduleCode: 'MFN',
      defaultOriginCountry: '',
      autoFetcherEnabled: true,
      fxCacheTtlHours: 24,
    })
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEY,
      JSON.stringify({
        defaultScheduleCode: 'MFN',
        defaultOriginCountry: '',
        autoFetcherEnabled: true,
        fxCacheTtlHours: 24,
      })
    )
  })
})
