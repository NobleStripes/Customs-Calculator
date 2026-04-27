import { WebsiteFetcherService, RegulatorySource } from './websiteFetcher'
import cron from 'node-cron'

// Schedule: every day at 2am
const CRON_SCHEDULE = '0 2 * * *'

const fetchAndIngest = async (source: RegulatorySource) => {
  const fetcher = new WebsiteFetcherService()
  try {
    console.log(`[AutoFetcher] Fetching updates for ${source}...`)
    const updates = await fetcher.fetchRegulatoryUpdates(source)
    for (const update of updates) {
      // TODO: Parse update.textContent and map to tariff/compliance data
      // Example: await importTariffData(parsedRows, { sourceName: source, sourceReference: update.url })
      console.log(`[AutoFetcher] Fetched from ${update.url} (title: ${update.title})`)
    }
    console.log(`[AutoFetcher] Completed fetching for ${source}`)
  } catch (err) {
    console.error(`[AutoFetcher] Error fetching for ${source}:`, err)
  }
}

export const startAutoFetching = () => {
  cron.schedule(CRON_SCHEDULE, async () => {
    await fetchAndIngest('boc')
    // Add more sources as needed
  })
  console.log(`[AutoFetcher] Scheduled auto-fetching with cron: ${CRON_SCHEDULE}`)
}

// For manual run (dev/testing)
if (require.main === module) {
  startAutoFetching()
}
