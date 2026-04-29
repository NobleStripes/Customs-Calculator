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
      catalogMode: 'official-catalog-required',
      stagedCutoverEnabled: true,
      cutoverCoverageThreshold: 101,
      fullSyncIdempotencyGuardEnabled: false,
    })

    expect(updated).toEqual({
      defaultScheduleCode: 'AHTN',
      defaultOriginCountry: 'PHL',
      autoFetcherEnabled: false,
      fxCacheTtlHours: 168,
      calculatorMode: 'estimate',
      catalogMode: 'official-catalog-required',
      stagedCutoverEnabled: true,
      cutoverCoverageThreshold: 100,
      fullSyncIdempotencyGuardEnabled: false,
    })

    expect(runtimeSettingsModule.getRuntimeSettings()).toEqual(updated)
  })
})
