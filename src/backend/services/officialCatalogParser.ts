import { load } from 'cheerio'
import { getHsCodeMetadata, normalizeExactHsCode } from '../../shared/hsLookupQuery'

export type OfficialCatalogItem = {
  code?: unknown
  desc?: unknown
  status?: unknown
  agreement_id?: unknown
  fta?: unknown
}

const cleanDescription = (value: string): string =>
  load(value).text().replace(/\s+/g, ' ').replace(/^(?:-\s*)+/, '').trim().replace(/\s*:\s*$/, '')

/** Only base nomenclature rows belong in the catalog; FTA-specific "ex" rows are not new HS codes. */
export const parseOfficialCatalog = (items: OfficialCatalogItem[]): Array<[string, string]> => {
  const descriptions = new Map<string, string>()
  for (const item of items) {
    if (item.status !== undefined && item.status !== 'active') continue
    if (item.agreement_id != null || (typeof item.fta === 'string' && item.fta.trim())) continue
    if (typeof item.code !== 'string' || !/^[\d.\s]+$/.test(item.code)) continue
    if (typeof item.desc !== 'string') continue
    const digits = item.code.replace(/[^0-9]/g, '')
    if (![4, 6, 8, 10].includes(digits.length)) continue
    const description = cleanDescription(item.desc)
    if (description && !descriptions.has(digits)) descriptions.set(digits, description)
  }

  const rows: Array<[string, string]> = []
  for (const [digits, description] of descriptions) {
    const code = normalizeExactHsCode(digits)
    if (!code || !getHsCodeMetadata(code)) continue
    const context = [4, 6, 8]
      .filter((length) => length < digits.length)
      .map((length) => descriptions.get(digits.slice(0, length)))
      .filter((part): part is string => Boolean(part))
    rows.push([code, [...new Set([...context, description])].join(' — ')])
  }
  return rows.sort(([left], [right]) => left.localeCompare(right))
}
