// Utility to parse tariff HTML from BOC and Tariff Commission
// This is a stub. Real extraction logic should be added for production use.
import type { TariffImportRow } from './tariffDataIngestion'

export function parseTariffHtml(source: 'boc' | 'tariff-commission', html: string): TariffImportRow[] {
  // TODO: Implement real HTML parsing for each source
  // For now, return an empty array
  // Example: Use regex, cheerio, or other HTML parsing to extract rows
  return []
}
