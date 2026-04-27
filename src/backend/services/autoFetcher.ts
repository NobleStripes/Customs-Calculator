import axios from 'axios'
import cron from 'node-cron'
import { WebsiteFetcherService, type RegulatorySource } from './websiteFetcher'
import { TariffDataIngestionService } from './tariffDataIngestion'

const CRON_SCHEDULE = '0 2 * * *'

const isDataFileUrl = (href: string): boolean => {
  const lower = href.toLowerCase()
  return lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls')
}

const fetchAndIngest = async (source: RegulatorySource): Promise<void> => {
  const fetcher = new WebsiteFetcherService()
  const ingestion = new TariffDataIngestionService()

  console.log(`[AutoFetcher] Starting fetch for ${source}...`)

  let updates
  try {
    updates = await fetcher.fetchRegulatoryUpdates(source)
  } catch (err) {
    console.error(`[AutoFetcher] Failed to fetch regulatory updates for ${source}:`, err)
    return
  }

  for (const update of updates) {
    console.log(`[AutoFetcher] Scanning ${update.url} for data files...`)

    const dataLinks = update.links.filter((link) => isDataFileUrl(link.href))

    if (dataLinks.length === 0) {
      // Attempt HTML table extraction from the page content
      if (update.rawHtml) {
        console.log(`[AutoFetcher] No data files found on ${update.url} — attempting HTML table extraction`)
        try {
          const { rows, confidence } = await ingestion.parseHtmlTables(update.rawHtml, update.url)
          if (rows.length === 0) {
            console.log(`[AutoFetcher] No HS-code/rate tables found in HTML on ${update.url}`)
            continue
          }

          const rowsWithConfidence = rows.map((r) => ({ ...r, confidenceScore: confidence }))
          const summary = await ingestion.importRows({
            sourceName: `auto-fetch-html:${source}`,
            sourceType: 'auto-fetch-html',
            sourceReference: update.url,
            rows: rowsWithConfidence,
            autoApproveThreshold: 100,
          })

          console.log(
            `[AutoFetcher] HTML import for ${update.url}: ${summary.importedRows} imported, ` +
            `${summary.pendingReviewRows} pending review, ${summary.errorRows} errors`
          )
        } catch (err) {
          console.error(`[AutoFetcher] HTML table extraction failed for ${update.url}:`, err)
        }
      } else {
        console.log(`[AutoFetcher] No data files found on ${update.url}`)
      }
      continue
    }

    for (const link of dataLinks) {
      const fileName = link.href.split('/').pop() || link.href
      console.log(`[AutoFetcher] Downloading ${fileName} from ${link.href}`)

      let contentBase64: string
      try {
        const fileResponse = await axios.get<ArrayBuffer>(link.href, {
          responseType: 'arraybuffer',
          timeout: 15000,
        })
        contentBase64 = Buffer.from(fileResponse.data).toString('base64')
      } catch (err) {
        console.warn(`[AutoFetcher] Could not download ${link.href}:`, err)
        continue
      }

      try {
        const rows = await ingestion.parseHSCatalogRows({ contentBase64, fileName })
        if (rows.length === 0) {
          console.log(`[AutoFetcher] No rows parsed from ${fileName}`)
          continue
        }

        const summary = await ingestion.importHSCatalog({
          sourceName: `auto-fetch:${source}`,
          sourceType: 'auto-fetch',
          sourceReference: link.href,
          rows,
        })

        console.log(
          `[AutoFetcher] Imported ${fileName}: ${summary.importedRows} rows imported, ` +
          `${summary.pendingReviewRows} pending review, ${summary.errorRows} errors`
        )
      } catch (err) {
        console.error(`[AutoFetcher] Import failed for ${fileName}:`, err)
      }
    }
  }

  console.log(`[AutoFetcher] Completed fetch for ${source}`)
}

export const startAutoFetching = (): void => {
  cron.schedule(CRON_SCHEDULE, async () => {
    await fetchAndIngest('boc')
    await fetchAndIngest('tariff-commission')
  })
  console.log(`[AutoFetcher] Scheduled with cron: ${CRON_SCHEDULE}`)
}
