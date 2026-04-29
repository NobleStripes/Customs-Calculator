import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebsiteFetcherService } from './websiteFetcher'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockedAxiosGet = vi.mocked(axios.get)

describe('WebsiteFetcherService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects private and disallowed hosts before issuing a request', async () => {
    const service = new WebsiteFetcherService()

    await expect(service.fetchWebsite({ url: 'http://127.0.0.1/admin' })).rejects.toThrow(
      'Private or local network hosts are not allowed'
    )
    await expect(service.fetchWebsite({ url: 'https://example.com/' })).rejects.toThrow('Host is not allowed')
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('fetches a page, strips non-content tags, extracts links, and returns query snippets', async () => {
    mockedAxiosGet.mockResolvedValue({
      status: 200,
      data: `
        <html>
          <head>
            <title>  Customs Advisory  </title>
            <style>.hidden { display:none }</style>
            <script>window.ignore = true</script>
          </head>
          <body>
            <p>Revenue memorandum for importers and brokers.</p>
            <a href="/revenue-issuances-details">Revenue Issuances</a>
            <a href="#skip">Skip</a>
            <a href="javascript:void(0)">Bad</a>
          </body>
        </html>
      `,
      request: {
        res: {
          responseUrl: 'https://www.bir.gov.ph/revenue-issuances-details',
        },
      },
    } as never)

    const service = new WebsiteFetcherService()
    const result = await service.fetchWebsite({
      url: 'https://www.bir.gov.ph/',
      query: 'memorandum',
      maxTextLength: 80,
    })

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://www.bir.gov.ph/',
      expect.objectContaining({
        timeout: 10000,
        responseType: 'text',
      })
    )
    expect(result.title).toBe('Customs Advisory')
    expect(result.textContent).toContain('Revenue memorandum for importers and brokers.')
    expect(result.textContent).not.toContain('window.ignore')
    expect(result.textContent).not.toContain('display:none')
    expect(result.links).toEqual([
      {
        href: 'https://www.bir.gov.ph/revenue-issuances-details',
        text: 'Revenue Issuances',
      },
    ])
    expect(result.matchedSnippets).toHaveLength(1)
    expect(result.matchedSnippets[0]?.toLowerCase()).toContain('memorandum')
    expect(result.fetchedAt).toBe('2026-04-28T00:00:00.000Z')
  })

  it('discovers regulatory pages from seed links and fetches the prioritized results', async () => {
    mockedAxiosGet.mockImplementation(async (url: string) => {
      if (url === 'https://customs.gov.ph/') {
        return {
          status: 200,
          data: `
            <a href="/memoranda-2026/">Memoranda</a>
            <a href="/customs-administrative-order-cao-2026/">CAO 2026</a>
          `,
          request: { res: { responseUrl: url } },
        } as never
      }

      if (url === 'https://customs.gov.ph/memoranda-2026/') {
        return {
          status: 200,
          data: '<title>Memoranda 2026</title><p>Latest customs memoranda</p>',
          request: { res: { responseUrl: url } },
        } as never
      }

      if (url === 'https://customs.gov.ph/customs-administrative-order-cao-2026/') {
        return {
          status: 200,
          data: '<title>CAO 2026</title><p>Administrative orders</p>',
          request: { res: { responseUrl: url } },
        } as never
      }

      if (
        url === 'https://customs.gov.ph/customs-memorandum-order-cmo-2026/' ||
        url === 'https://customs.gov.ph/customs-memorandum-circular-cmc-2026/'
      ) {
        return {
          status: 200,
          data: `<title>${url}</title><p>Other customs notices</p>`,
          request: { res: { responseUrl: url } },
        } as never
      }

      throw new Error(`Unexpected URL ${url}`)
    })

    const service = new WebsiteFetcherService()
    const results = await service.fetchRegulatoryUpdates('boc', 'memoranda')

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.finalUrl).toBe('https://customs.gov.ph/memoranda-2026/')
    expect(results.map((result) => result.finalUrl)).toContain('https://customs.gov.ph/customs-administrative-order-cao-2026/')
  })
})
