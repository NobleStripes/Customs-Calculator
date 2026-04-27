
import { WebsiteFetcherService } from './websiteFetcher'
import type { RegulatorySource } from './websiteFetcher'
import { importTariffData } from './tariffDataIngestion'
import { parseTariffHtml } from './tariffHtmlParser'
import cron from 'node-cron'

// Schedule: every day at 2am
const CRON_SCHEDULE = '0 2 * * *'

const fetchAndIngest = async (source: RegulatorySource) => {
  const fetcher = new WebsiteFetcherService()
  try {
    console.log(`[AutoFetcher] Fetching updates for ${source}...`)
    const updates = await fetcher.fetchRegulatoryUpdates(source)
    for (const update of updates) {
      // Parse HTML to extract tariff rows
      const parsedRows = parseTariffHtml(source, update.textContent)
      if (parsedRows.length > 0) {
        await importTariffData(parsedRows, {
          sourceName: source,
          sourceType: 'auto-fetch',
          sourceReference: update.url,
        })
        console.log(`[AutoFetcher] Imported ${parsedRows.length} rows from ${update.url}`)
      } else {
        console.log(`[AutoFetcher] No tariff data found in ${update.url}`)
      }
    }
    console.log(`[AutoFetcher] Completed fetching for ${source}`)
  } catch (err) {
    console.error(`[AutoFetcher] Error fetching for ${source}:`, err)
  }
}


export const startAutoFetching = () => {
  cron.schedule(CRON_SCHEDULE, async () => {
    await fetchAndIngest('boc')
    await fetchAndIngest('tariff-commission')
    // Add more sources as needed
  })
  console.log(`[AutoFetcher] Scheduled auto-fetching with cron: ${CRON_SCHEDULE}`)
}

// For manual run (dev/testing)
if (require.main === module) {
  startAutoFetching()
}
