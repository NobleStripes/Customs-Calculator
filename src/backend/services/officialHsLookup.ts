import { WebsiteFetcherService } from './websiteFetcher'

export const OFFICIAL_TARIFF_LOOKUP_CONFIG = {
  host: 'finder.tariffcommission.gov.ph',
  path: '/search-by-code',
  codeQueryParam: 'ahtn',
  textQueryParam: 'keyword',
  maxResults: 20,
  cacheTtlMs: 5 * 60 * 1000,
} as const

export type OfficialHsLookupResultSource = 'official-site' | 'official-site-cache'

export interface OfficialHsLookupResult {
  code: string
  description: string
  category: string
  confidence: number
  sourceType: OfficialHsLookupResultSource
  sourceLabel: string
  sourceUrl: string
  matchedBy: 'code' | 'description' | 'mixed'
  officialDutyRate?: number
  officialVatRate?: number
  officialScheduleCode?: string
}

export interface OfficialHsLookupResponse {
  query: string
  sourceUrl: string
  status: 'live' | 'cache'
  fetchedAt: string
  cacheExpiresAt: string
  results: OfficialHsLookupResult[]
}

type CachedLookup = {
  expiresAt: number
  payload: OfficialHsLookupResponse
}

type TariffLookupFetcher = Pick<WebsiteFetcherService, 'fetchWebsite'>

type ParsedLookupRow = Omit<OfficialHsLookupResult, 'sourceType' | 'sourceLabel' | 'sourceUrl'>

const normalizeSpaces = (value: string): string => value.replace(/\s+/g, ' ').trim()

const isCodeLikeQuery = (value: string): boolean => /^[\d.\s]+$/.test(value.trim())

const normalizeHSCode = (value: string): string => {
  const compact = value.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')

  if (/^\d{4}$/.test(compact)) {
    return compact
  }

  if (/^\d{6}$/.test(compact)) {
    return `${compact.slice(0, 4)}.${compact.slice(4)}`
  }

  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}.${compact.slice(4, 6)}.${compact.slice(6)}`
  }

  if (/^\d{10}$/.test(compact)) {
    return `${compact.slice(0, 4)}.${compact.slice(4, 6)}.${compact.slice(6, 8)}.${compact.slice(8)}`
  }

  return value.trim().toUpperCase()
}

const compactHSCode = (value: string): string => normalizeHSCode(value).replace(/\./g, '')

const normalizeRate = (value: string): number | undefined => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return undefined
  }

  const numeric = Number(normalizedValue.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(numeric)) {
    return undefined
  }

  return numeric > 1 ? numeric / 100 : numeric
}

const extractRateFromText = (value: string): number | undefined => {
  const match = value.match(/(\d{1,3}(?:\.\d{1,4})?)\s*%/)
  return match ? normalizeRate(match[1]) : undefined
}

const buildLookupUrl = (query: string): string => {
  const url = new URL(`https://${OFFICIAL_TARIFF_LOOKUP_CONFIG.host}${OFFICIAL_TARIFF_LOOKUP_CONFIG.path}`)
  const normalizedQuery = query.trim()

  url.searchParams.set(
    isCodeLikeQuery(normalizedQuery)
      ? OFFICIAL_TARIFF_LOOKUP_CONFIG.codeQueryParam
      : OFFICIAL_TARIFF_LOOKUP_CONFIG.textQueryParam,
    normalizedQuery
  )

  return url.toString()
}

const getCategoryFromDescription = (description: string): string => {
  const normalizedDescription = description.toLowerCase()

  if (normalizedDescription.includes('chapter')) return 'Chapter'
  if (normalizedDescription.includes('electrical') || normalizedDescription.includes('telephone')) return 'Electronics'
  if (normalizedDescription.includes('vehicle') || normalizedDescription.includes('motor')) return 'Vehicles'
  if (normalizedDescription.includes('food') || normalizedDescription.includes('meat')) return 'Food'

  return 'Official Tariff Finder'
}

const getMatchType = (query: string, row: { code: string; description: string }): 'code' | 'description' | 'mixed' => {
  const normalizedQuery = query.trim().toUpperCase()
  const compactQuery = normalizedQuery.replace(/\./g, '')
  const normalizedCode = row.code.toUpperCase()
  const normalizedDescription = row.description.toUpperCase()

  const codeMatch = normalizedCode.includes(normalizedQuery) || compactHSCode(normalizedCode).includes(compactQuery)
  const descriptionMatch = normalizedDescription.includes(normalizedQuery)

  if (codeMatch && descriptionMatch) return 'mixed'
  if (codeMatch) return 'code'
  return 'description'
}

const rankParsedRows = (query: string, rows: ParsedLookupRow[]): ParsedLookupRow[] => {
  const normalizedQuery = query.trim().toUpperCase()
  const compactQuery = normalizedQuery.replace(/\./g, '')

  return [...rows].sort((left, right) => {
    const getRank = (row: ParsedLookupRow): number => {
      const normalizedCode = row.code.toUpperCase()
      const compactCode = compactHSCode(row.code)
      const normalizedDescription = row.description.toUpperCase()

      if (compactCode === compactQuery) return 0
      if (normalizedCode === normalizedQuery) return 1
      if (normalizedCode.startsWith(normalizedQuery) || compactCode.startsWith(compactQuery)) return 2
      if (normalizedDescription.includes(normalizedQuery)) return 3
      return 4
    }

    return getRank(left) - getRank(right) || left.code.localeCompare(right.code) || left.description.localeCompare(right.description)
  })
}

export const extractOfficialHsLookupRows = (
  rawHtml: string,
  query: string,
  sourceUrl: string
): OfficialHsLookupResult[] => {
  const tableRows: ParsedLookupRow[] = []
  const textRows: ParsedLookupRow[] = []
  const seen = new Set<string>()

  const pushRow = (row: ParsedLookupRow): void => {
    const description = normalizeSpaces(row.description)
    const code = normalizeHSCode(row.code)
    if (!description || !compactHSCode(code)) {
      return
    }

    const dedupeKey = `${code}:${description}`
    if (seen.has(dedupeKey)) {
      return
    }

    seen.add(dedupeKey)
    const matchedBy = getMatchType(query, { code, description })
    const confidence = matchedBy === 'code' ? 96 : matchedBy === 'mixed' ? 92 : 88

    textRows.push({
      ...row,
      code,
      description,
      category: row.category || getCategoryFromDescription(description),
      matchedBy,
      confidence,
    })
  }

  const codePattern = /(\d{4}(?:[.\s]?\d{2}){0,3}|\d{6,10})/g

  const safeHtml = rawHtml || ''
  if (safeHtml.includes('<table')) {
    const tablePattern = /<table[\s\S]*?<\/table>/gi
    const tables = safeHtml.match(tablePattern) || []

    for (const table of tables) {
      const rowPattern = /<tr[\s\S]*?<\/tr>/gi
      const rows = table.match(rowPattern) || []
      const headers: string[] = []

      rows.forEach((rowHtml, rowIndex) => {
        const cellPattern = /<(t[hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi
        const cells = Array.from(rowHtml.matchAll(cellPattern)).map((match) =>
          normalizeSpaces(match[2].replace(/<[^>]+>/g, ' '))
        )

        if (cells.length === 0) {
          return
        }

        if (rowIndex === 0) {
          headers.push(...cells.map((cell) => cell.toLowerCase()))
          return
        }

        const hsColIndex = headers.findIndex((header) =>
          header.includes('ahtn') || header.includes('hs') || header.includes('code') || header.includes('commodity')
        )
        const descColIndex = headers.findIndex((header) => header.includes('description') || header.includes('article'))
        const dutyColIndex = headers.findIndex((header) => header.includes('duty') || header.includes('rate'))
        const vatColIndex = headers.findIndex((header) => header.includes('vat'))
        const scheduleColIndex = headers.findIndex((header) => header.includes('schedule') || header.includes('fta'))

        const hsValue = hsColIndex >= 0 ? cells[hsColIndex] : cells[0]
        const matchedCode = hsValue.match(codePattern)?.[0]
        if (!matchedCode) {
          return
        }

        const description = descColIndex >= 0 ? cells[descColIndex] : cells.filter(Boolean).slice(1).join(' ')
        const dutyRate = dutyColIndex >= 0 ? normalizeRate(cells[dutyColIndex]) : extractRateFromText(rowHtml)
        const vatRate = vatColIndex >= 0 ? normalizeRate(cells[vatColIndex]) : undefined
        const scheduleCode = scheduleColIndex >= 0 ? cells[scheduleColIndex] : undefined

        tableRows.push({
          code: matchedCode,
          description,
          category: getCategoryFromDescription(description),
          matchedBy: getMatchType(query, { code: matchedCode, description }),
          confidence: 96,
          officialDutyRate: dutyRate,
          officialVatRate: vatRate,
          officialScheduleCode: scheduleCode,
        })
      })
    }
  }

  if (tableRows.length > 0) {
    for (const row of tableRows) {
      pushRow(row)
    }
  }

  const textBlocks = Array.from(
    safeHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .matchAll(/<(?:li|p|div|span|a)[^>]*>([\s\S]*?)<\/(?:li|p|div|span|a)>/gi)
  ).map((match) => normalizeSpaces(match[1].replace(/<[^>]+>/g, ' ')))

  for (const block of textBlocks) {
    if (!block) {
      continue
    }

    const matchedCode = block.match(codePattern)?.[0]
    if (!matchedCode) {
      continue
    }

    const normalizedCode = normalizeHSCode(matchedCode)
    const description = normalizeSpaces(
      block
        .replace(matchedCode, ' ')
        .replace(/\b(?:MFN|AANZFTA|ACFTA|AHKFTA|AIFTA|AJCEPA|AKFTA|ATIGA|RCEP|PJEPA)\b/gi, ' ')
        .replace(/\d{1,3}(?:\.\d{1,4})?\s*%/g, ' ')
        .replace(/\s+-\s+/g, ' ')
    )

    if (!description) {
      continue
    }

    pushRow({
      code: normalizedCode,
      description,
      category: getCategoryFromDescription(description),
      matchedBy: getMatchType(query, { code: normalizedCode, description }),
      confidence: 88,
      officialDutyRate: extractRateFromText(block),
    })
  }

  return rankParsedRows(query, textRows)
    .slice(0, OFFICIAL_TARIFF_LOOKUP_CONFIG.maxResults)
    .map((row) => ({
      ...row,
      sourceLabel: `Tariff Commission Finder (${sourceUrl})`,
      sourceType: 'official-site',
      sourceUrl,
    }))
}

export class OfficialHsLookupService {
  private readonly fetcher: TariffLookupFetcher
  private readonly cache = new Map<string, CachedLookup>()

  constructor(fetcher: TariffLookupFetcher = new WebsiteFetcherService()) {
    this.fetcher = fetcher
  }

  clearCache(): void {
    this.cache.clear()
  }

  private getCached(query: string): OfficialHsLookupResponse | null {
    const cached = this.cache.get(query)
    if (!cached) {
      return null
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(query)
      return null
    }

    return {
      ...cached.payload,
      status: 'cache',
      results: cached.payload.results.map((row) => ({
        ...row,
        sourceType: 'official-site-cache',
      })),
    }
  }

  private setCached(query: string, response: OfficialHsLookupResponse): OfficialHsLookupResponse {
    const expiresAt = Date.now() + OFFICIAL_TARIFF_LOOKUP_CONFIG.cacheTtlMs
    const cachedPayload: OfficialHsLookupResponse = {
      ...response,
      status: 'live',
      cacheExpiresAt: new Date(expiresAt).toISOString(),
    }

    this.cache.set(query, {
      expiresAt,
      payload: cachedPayload,
    })

    return cachedPayload
  }

  async search(query: string): Promise<OfficialHsLookupResponse> {
    const normalizedQuery = normalizeSpaces(query)
    const cacheKey = normalizedQuery.toUpperCase()
    const cached = this.getCached(cacheKey)
    if (cached) {
      return cached
    }

    const sourceUrl = buildLookupUrl(normalizedQuery)
    const fetchedPage = await this.fetcher.fetchWebsite({
      url: sourceUrl,
      query: normalizedQuery,
      maxTextLength: 20000,
    })

    const results = extractOfficialHsLookupRows(
      fetchedPage.rawHtml || fetchedPage.textContent || '',
      normalizedQuery,
      sourceUrl
    )

    return this.setCached(cacheKey, {
      query: normalizedQuery,
      sourceUrl,
      status: 'live',
      fetchedAt: fetchedPage.fetchedAt || new Date().toISOString(),
      cacheExpiresAt: new Date(Date.now() + OFFICIAL_TARIFF_LOOKUP_CONFIG.cacheTtlMs).toISOString(),
      results,
    })
  }
}
