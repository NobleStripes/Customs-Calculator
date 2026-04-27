import axios from 'axios'
import cron from 'node-cron'
import { WebsiteFetcherService, type RegulatorySource } from './websiteFetcher'
import { TariffDataIngestionService } from './tariffDataIngestion'
import { getRuntimeSettings } from './runtimeSettings'

const CRON_SCHEDULE = '0 2 * * *'

const getFileExtensionFromUrl = (href: string): string => {
  try {
    const parsedUrl = new URL(href)
    const pathSegment = parsedUrl.pathname.split('/').pop() || ''
    const dotIndex = pathSegment.lastIndexOf('.')
    return dotIndex >= 0 ? pathSegment.slice(dotIndex + 1).toLowerCase() : ''
  } catch {
    const cleanHref = href.split('?')[0].split('#')[0]
    const pathSegment = cleanHref.split('/').pop() || ''
    const dotIndex = pathSegment.lastIndexOf('.')
    return dotIndex >= 0 ? pathSegment.slice(dotIndex + 1).toLowerCase() : ''
  }
}

const isTabularDataFileUrl = (href: string): boolean => {
  const extension = getFileExtensionFromUrl(href)
  return extension === 'csv' || extension === 'xlsx' || extension === 'xls'
}

const isPdfFileUrl = (href: string): boolean => getFileExtensionFromUrl(href) === 'pdf'

const getAutoFetchSourceType = (
  kind: 'tariff-rates' | 'hs-catalog',
  source: RegulatorySource,
  method: 'html' | 'tabular'
): string => `auto-fetch-${kind}-${source}-${method}`

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

    const tabularLinks = update.links.filter((link) => isTabularDataFileUrl(link.href))
    const pdfLinks = update.links.filter((link) => isPdfFileUrl(link.href))
    const dataLinks = [...tabularLinks, ...pdfLinks]

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
          const sourceType = getAutoFetchSourceType('tariff-rates', source, 'html')
          if (await ingestion.hasSourceReference(sourceType, update.url)) {
            console.log(`[AutoFetcher] Skipping previously imported HTML source ${update.url}`)
            continue
          }

          const summary = await ingestion.importRows({
            sourceName: `auto-fetch-html:${source}`,
            sourceType,
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
        const tariffSourceType = getAutoFetchSourceType('tariff-rates', source, 'tabular')
        const hsCatalogSourceType = getAutoFetchSourceType('hs-catalog', source, 'tabular')
        const tariffPdfSourceType = getAutoFetchSourceType('tariff-rates', source, 'pdf')

        if (
          await ingestion.hasSourceReference(tariffSourceType, link.href) ||
          await ingestion.hasSourceReference(hsCatalogSourceType, link.href) ||
          await ingestion.hasSourceReference(tariffPdfSourceType, link.href)
        ) {
          console.log(`[AutoFetcher] Skipping previously imported source ${link.href}`)
          continue
        }

        if (isPdfFileUrl(link.href)) {
          const pdfRows = await ingestion.parsePdfTariffRows({
            contentBase64,
            sourceUrl: link.href,
          })

          if (pdfRows.length === 0) {
            console.log(`[AutoFetcher] No tariff rows extracted from PDF ${fileName}`)
            continue
          }

          const summary = await ingestion.importRows({
            sourceName: `auto-fetch-pdf:${source}`,
            sourceType: tariffPdfSourceType,
            sourceReference: link.href,
            rows: pdfRows,
            autoApproveThreshold: 100,
          })

          console.log(
            `[AutoFetcher] Imported PDF rows from ${fileName}: ${summary.importedRows} rows imported, ` +
            `${summary.pendingReviewRows} pending review, ${summary.errorRows} errors`
          )

          continue
        }

        const tariffRows = await ingestion.parseTariffRows({ contentBase64, fileName })
        const tariffPreview = ingestion.previewRows(tariffRows)
        if (tariffPreview.validRows > 0) {
          const summary = await ingestion.importRows({
            sourceName: `auto-fetch:${source}`,
            sourceType: tariffSourceType,
            sourceReference: link.href,
            rows: tariffRows.map((row) => ({
              ...row,
              notes: [row.notes, `Auto-fetched from ${link.href}`].filter(Boolean).join(' | '),
            })),
            autoApproveThreshold: 100,
          })

          console.log(
            `[AutoFetcher] Imported tariff rows from ${fileName}: ${summary.importedRows} rows imported, ` +
            `${summary.pendingReviewRows} pending review, ${summary.errorRows} errors`
          )
          continue
        }

        const rows = await ingestion.parseHSCatalogRows({ contentBase64, fileName })
        if (rows.length === 0) {
          console.log(`[AutoFetcher] No rows parsed from ${fileName}`)
          continue
        }

        const summary = await ingestion.importHSCatalog({
          sourceName: `auto-fetch:${source}`,
          sourceType: hsCatalogSourceType,
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
    if (!getRuntimeSettings().autoFetcherEnabled) {
      console.log('[AutoFetcher] Skipping scheduled run because runtime settings disabled it')
      return
    }

    await fetchAndIngest('boc')
    await fetchAndIngest('bir')
    await fetchAndIngest('tariff-commission')
  })
  console.log(`[AutoFetcher] Scheduled with cron: ${CRON_SCHEDULE}`)
}
