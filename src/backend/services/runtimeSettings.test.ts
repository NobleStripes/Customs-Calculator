import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

describe('runtimeSettings', () => {
  beforeEach(() => {
    process.env.APPDATA = path.join(os.tmpdir(), `customs-calculator-runtime-${Date.now()}`)
  })

  it('persists sanitized runtime settings', async () => {
    const runtimeSettingsModule = await import('./runtimeSettings')

    const updated = runtimeSettingsModule.updateRuntimeSettings({
      defaultScheduleCode: ' ahtn ',
      defaultOriginCountry: 'phl',
      autoFetcherEnabled: false,
      fxCacheTtlHours: 999,
    })

    expect(updated).toEqual({
      defaultScheduleCode: 'AHTN',
      defaultOriginCountry: 'PHL',
      autoFetcherEnabled: false,
      fxCacheTtlHours: 168,
      calculatorMode: 'estimate',
    })

    expect(runtimeSettingsModule.getRuntimeSettings()).toEqual(updated)
  })
})
