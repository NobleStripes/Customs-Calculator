import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { sourceAdapters, downloadSourceFileBase64 } from './sourceAdapters'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockedAxiosGet = vi.mocked(axios.get)

afterEach(() => {
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// tabular-tariff adapter
// ─────────────────────────────────────────────────────────────────────────────

describe('sourceAdapters[tabular-tariff].canHandle', () => {
  const adapter = sourceAdapters.find((a) => a.id === 'tabular-tariff')!

  const baseInput = {
    contentBase64: '',
    source: 'boc' as const,
    mode: 'incremental' as const,
  }

  it('accepts CSV files by fileName extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff.csv', href: '' })).toBe(true)
  })

  it('accepts XLSX files by fileName extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff.xlsx', href: '' })).toBe(true)
  })

  it('accepts XLS files by fileName extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff.xls', href: '' })).toBe(true)
  })

  it('accepts CSV files detected via href when fileName is empty', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: '', href: 'https://example.gov.ph/data/tariff.csv' })).toBe(true)
  })

  it('accepts XLSX files detected via href with query string appended after the extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: '', href: 'https://example.gov.ph/tariff.xlsx?v=2' })).toBe(true)
  })

  it('rejects PDF files', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff.pdf', href: '' })).toBe(false)
  })

  it('rejects HTML files', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff.html', href: '' })).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'tariff', href: '' })).toBe(false)
  })

  it('is case-insensitive for CSV extensions', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'TARIFF.CSV', href: '' })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// tabular-hs-catalog adapter
// ─────────────────────────────────────────────────────────────────────────────

describe('sourceAdapters[tabular-hs-catalog].canHandle', () => {
  const adapter = sourceAdapters.find((a) => a.id === 'tabular-hs-catalog')!

  const baseInput = {
    contentBase64: '',
    source: 'tariff-commission' as const,
    mode: 'full-sync' as const,
  }

  it('accepts CSV by fileName', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'catalog.csv', href: '' })).toBe(true)
  })

  it('accepts XLSX by fileName', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'catalog.xlsx', href: '' })).toBe(true)
  })

  it('accepts XLS by href when fileName is absent', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: '', href: 'https://example.gov.ph/catalog.xls' })).toBe(true)
  })

  it('rejects PDF files', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'catalog.pdf', href: '' })).toBe(false)
  })

  it('rejects files with no recognisable extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: '', href: 'https://example.gov.ph/data' })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// pdf-tariff adapter
// ─────────────────────────────────────────────────────────────────────────────

describe('sourceAdapters[pdf-tariff].canHandle', () => {
  const adapter = sourceAdapters.find((a) => a.id === 'pdf-tariff')!

  const baseInput = {
    contentBase64: '',
    source: 'boc' as const,
    mode: 'incremental' as const,
  }

  it('accepts PDF files by fileName', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'memorandum.pdf', href: '' })).toBe(true)
  })

  it('accepts PDF detected via href', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: '', href: 'https://customs.gov.ph/cao.pdf' })).toBe(true)
  })

  it('is case-insensitive for PDF extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'MEMO.PDF', href: '' })).toBe(true)
  })

  it('rejects CSV files', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'data.csv', href: '' })).toBe(false)
  })

  it('rejects XLSX files', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'data.xlsx', href: '' })).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(adapter.canHandle({ ...baseInput, fileName: 'document', href: '' })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// adapter registry ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('sourceAdapters registry', () => {
  it('exports exactly three adapters in the expected order', () => {
    expect(sourceAdapters).toHaveLength(3)
    expect(sourceAdapters[0]?.id).toBe('tabular-tariff')
    expect(sourceAdapters[1]?.id).toBe('tabular-hs-catalog')
    expect(sourceAdapters[2]?.id).toBe('pdf-tariff')
  })

  it('all adapters expose id, canHandle, and parse', () => {
    for (const adapter of sourceAdapters) {
      expect(typeof adapter.id).toBe('string')
      expect(typeof adapter.canHandle).toBe('function')
      expect(typeof adapter.parse).toBe('function')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// downloadSourceFileBase64
// ─────────────────────────────────────────────────────────────────────────────

describe('downloadSourceFileBase64', () => {
  it('downloads binary content and returns it as a base64 string', async () => {
    const fakeBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]) // %PDF magic bytes
    mockedAxiosGet.mockResolvedValue({ data: fakeBytes, status: 200 })

    const result = await downloadSourceFileBase64('https://customs.gov.ph/tariff.pdf')

    expect(typeof result).toBe('string')
    expect(Buffer.from(result, 'base64').slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('propagates errors when the HTTP request fails', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('Connection refused'))

    await expect(downloadSourceFileBase64('https://customs.gov.ph/missing.pdf'))
      .rejects.toThrow('Connection refused')
  })

  it('calls axios with arraybuffer response type and a 15-second timeout', async () => {
    mockedAxiosGet.mockResolvedValue({ data: new ArrayBuffer(0), status: 200 })

    await downloadSourceFileBase64('https://example.gov.ph/file.csv')

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://example.gov.ph/file.csv',
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 15000,
      })
    )
  })
})
