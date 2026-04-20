import axios from 'axios'

const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_MAX_HTML_LENGTH = 500000
const DEFAULT_MAX_TEXT_LENGTH = 12000
const DEFAULT_REGULATORY_RESULT_LIMIT = 6

const DEFAULT_ALLOWED_HOSTS = [
  'boc.gov.ph',
  'www.boc.gov.ph',
  'customs.gov.ph',
  'www.customs.gov.ph',
  'bir.gov.ph',
  'www.bir.gov.ph',
  'tariffcommission.gov.ph',
  'www.tariffcommission.gov.ph',
  'finder.tariffcommission.gov.ph',
]

export type RegulatorySource = 'boc' | 'bir' | 'tariff-commission'

const REGULATORY_SEED_URLS: Record<RegulatorySource, string[]> = {
  bir: [
    'https://www.bir.gov.ph/',
    'https://www.bir.gov.ph/revenue-issuances-details',
  ],
  boc: [
    'https://customs.gov.ph/',
    'https://customs.gov.ph/memoranda-2026/',
    'https://customs.gov.ph/customs-administrative-order-cao-2026/',
    'https://customs.gov.ph/customs-memorandum-order-cmo-2026/',
    'https://customs.gov.ph/customs-memorandum-circular-cmc-2026/',
  ],
  'tariff-commission': [
    'https://finder.tariffcommission.gov.ph/',
  ],
}

const REGULATORY_LINK_PATTERNS: Record<RegulatorySource, RegExp[]> = {
  bir: [
    /\/revenue-issuances-details/i,
    /\/revenue-issuances\//i,
    /revenue-regulations/i,
    /revenue-memorandum/i,
  ],
  boc: [
    /\/customs-administrative-order-cao-/i,
    /\/customs-memorandum-order-cmo-/i,
    /\/customs-memorandum-circular-cmc-/i,
    /\/memoranda-\d{4}\//i,
    /\/category\/announcements\//i,
  ],
  'tariff-commission': [
    /finder\.tariffcommission\.gov\.ph/i,
    /tariffcommission\.gov\.ph/i,
    /chapter/i,
    /search/i,
  ],
}

export interface WebsiteFetchRequest {
  url: string
  query?: string
  timeoutMs?: number
  maxTextLength?: number
  allowedHosts?: string[]
  allowNonGovernmentHosts?: boolean
}

export interface WebsiteFetchResult {
  url: string
  finalUrl: string
  hostname: string
  statusCode: number
  title: string
  textContent: string
  excerpt: string
  matchedSnippets: string[]
  links: Array<{ href: string; text: string }>
  fetchedAt: string
}

interface RawFetchResult {
  url: string
  finalUrl: string
  hostname: string
  statusCode: number
  rawHtml: string
}

const normalizeSpaces = (value: string): string => value.replace(/\s+/g, ' ').trim()

const stripHtml = (html: string): string => {
  const withoutScript = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
  const withoutStyle = withoutScript.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutStyle.replace(/<[^>]+>/g, ' ')
  return normalizeSpaces(withoutTags)
}

const extractTitle = (html: string): string => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) {
    return ''
  }

  return normalizeSpaces(match[1])
}

const extractLinks = (html: string, baseUrl: URL): Array<{ href: string; text: string }> => {
  const links: Array<{ href: string; text: string }> = []
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null = regex.exec(html)
  while (match && links.length < 25) {
    const rawHref = normalizeSpaces(match[1])
    const rawText = normalizeSpaces(stripHtml(match[2]))

    if (rawHref && !rawHref.startsWith('javascript:') && !rawHref.startsWith('#')) {
      try {
        const absoluteUrl = new URL(rawHref, baseUrl).toString()
        links.push({
          href: absoluteUrl,
          text: rawText || absoluteUrl,
        })
      } catch {
        // Skip malformed links
      }
    }

    match = regex.exec(html)
  }

  return links
}

const uniqueByHref = (links: Array<{ href: string; text: string }>): Array<{ href: string; text: string }> => {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (seen.has(link.href)) {
      return false
    }

    seen.add(link.href)
    return true
  })
}

const matchesAnyPattern = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => pattern.test(value))
}

const extractSnippets = (text: string, query?: string): string[] => {
  if (!query || !query.trim()) {
    return []
  }

  const normalizedQuery = query.trim().toLowerCase()
  const lowerText = text.toLowerCase()
  const snippets: string[] = []

  let searchIndex = 0
  while (snippets.length < 5) {
    const foundIndex = lowerText.indexOf(normalizedQuery, searchIndex)
    if (foundIndex === -1) {
      break
    }

    const start = Math.max(0, foundIndex - 100)
    const end = Math.min(text.length, foundIndex + normalizedQuery.length + 100)
    snippets.push(normalizeSpaces(text.slice(start, end)))
    searchIndex = foundIndex + normalizedQuery.length
  }

  return snippets
}

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

const isHostAllowed = (hostname: string, allowedHosts: string[]): boolean => {
  const normalizedHost = hostname.toLowerCase()
  return allowedHosts.some((candidate) => {
    const normalizedCandidate = candidate.toLowerCase()
    return (
      normalizedHost === normalizedCandidate ||
      normalizedHost.endsWith(`.${normalizedCandidate}`)
    )
  })
}

export class WebsiteFetcherService {
  private validateRequest(request: WebsiteFetchRequest): URL {
    const parsedUrl = new URL(request.url)

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP/HTTPS URLs are allowed')
    }

    if (isPrivateHost(parsedUrl.hostname)) {
      throw new Error('Private or local network hosts are not allowed')
    }

    const allowedHosts = request.allowedHosts?.length
      ? request.allowedHosts
      : DEFAULT_ALLOWED_HOSTS

    if (!request.allowNonGovernmentHosts && !isHostAllowed(parsedUrl.hostname, allowedHosts)) {
      throw new Error(`Host is not allowed: ${parsedUrl.hostname}`)
    }

    return parsedUrl
  }

  private async fetchRawWebsite(request: WebsiteFetchRequest): Promise<RawFetchResult> {
    const parsedUrl = this.validateRequest(request)

    const response = await axios.get<string>(parsedUrl.toString(), {
      timeout: request.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxContentLength: DEFAULT_MAX_HTML_LENGTH,
      responseType: 'text',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Customs-Calculator/1.0 (+web-proxy)',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    })

    return {
      url: parsedUrl.toString(),
      finalUrl: response.request?.res?.responseUrl || parsedUrl.toString(),
      hostname: parsedUrl.hostname,
      statusCode: response.status,
      rawHtml: typeof response.data === 'string' ? response.data : String(response.data),
    }
  }

  async fetchWebsite(request: WebsiteFetchRequest): Promise<WebsiteFetchResult> {
    const rawResult = await this.fetchRawWebsite(request)
    const title = extractTitle(rawResult.rawHtml)

    const maxTextLength = request.maxTextLength || DEFAULT_MAX_TEXT_LENGTH
    const textContent = stripHtml(rawResult.rawHtml).slice(0, maxTextLength)
    const links = extractLinks(rawResult.rawHtml, new URL(rawResult.finalUrl))
    const matchedSnippets = extractSnippets(textContent, request.query)

    return {
      url: rawResult.url,
      finalUrl: rawResult.finalUrl,
      hostname: rawResult.hostname,
      statusCode: rawResult.statusCode,
      title,
      textContent,
      excerpt: textContent.slice(0, 300),
      matchedSnippets,
      links,
      fetchedAt: new Date().toISOString(),
    }
  }

  private async discoverRegulatoryPages(
    source: RegulatorySource,
    query?: string
  ): Promise<string[]> {
    const seeds = REGULATORY_SEED_URLS[source]
    const patterns = REGULATORY_LINK_PATTERNS[source]
    const discovered = new Set<string>(seeds)

    for (const seedUrl of seeds) {
      try {
        const rawSeed = await this.fetchRawWebsite({
          url: seedUrl,
          query,
        })

        const links = uniqueByHref(extractLinks(rawSeed.rawHtml, new URL(rawSeed.finalUrl)))
        for (const link of links) {
          if (matchesAnyPattern(link.href, patterns) || matchesAnyPattern(link.text, patterns)) {
            discovered.add(link.href)
          }
        }
      } catch (error) {
        console.warn(`Unable to discover regulatory pages from ${seedUrl}:`, error)
      }
    }

    return Array.from(discovered)
  }

  private prioritizeRegulatoryUrls(urls: string[], source: RegulatorySource, query?: string): string[] {
    const normalizedQuery = query?.trim().toLowerCase() || ''
    const patterns = REGULATORY_LINK_PATTERNS[source]

    return [...urls]
      .sort((left, right) => {
        const leftScore =
          (normalizedQuery && left.toLowerCase().includes(normalizedQuery) ? 4 : 0) +
          (matchesAnyPattern(left, patterns) ? 2 : 0)
        const rightScore =
          (normalizedQuery && right.toLowerCase().includes(normalizedQuery) ? 4 : 0) +
          (matchesAnyPattern(right, patterns) ? 2 : 0)

        return rightScore - leftScore
      })
      .slice(0, DEFAULT_REGULATORY_RESULT_LIMIT * 3)
  }

  async fetchRegulatoryUpdates(
    source: RegulatorySource,
    query?: string
  ): Promise<WebsiteFetchResult[]> {
    const candidateUrls = this.prioritizeRegulatoryUrls(
      await this.discoverRegulatoryPages(source, query),
      source,
      query
    )

    const results: WebsiteFetchResult[] = []

    for (const url of candidateUrls) {
      if (results.length >= DEFAULT_REGULATORY_RESULT_LIMIT) {
        break
      }

      try {
        const result = await this.fetchWebsite({
          url,
          query,
        })
        results.push(result)
      } catch (error) {
        console.warn(`Unable to fetch ${url}:`, error)
      }
    }

    if (results.length === 0) {
      throw new Error(`No reachable ${source} regulatory pages were found`)
    }

    return results
  }
}
