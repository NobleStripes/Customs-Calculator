import cron from 'node-cron'
import { WebsiteFetcherService, type RegulatorySource } from './websiteFetcher'
import { TariffDataIngestionService } from './tariffDataIngestion'
import { getRuntimeSettings } from './runtimeSettings'
import { downloadSourceFileBase64, sourceAdapters } from './sourceAdapters'

const CRON_SCHEDULE = '0 2 * * *'
const MONTHLY_FULL_SYNC_SCHEDULE = '0 3 1 * *'
const MAX_RETRIES = 3
const OFFLINE_FAILURE_THRESHOLD = 3

// Consecutive-failure counter per source. Resets on any successful fetch cycle.
const sourceFailureCounts = new Map<string, number>()

const markSourceOutcome = (source: string, success: boolean, note?: string): void => {
  const prev = sourceFailureCounts.get(source) ?? 0
  if (success) {
    if (prev > 0) {
      console.log(`[AutoFetcher] Source "${source}" recovered after ${prev} consecutive failure(s).`)
    }
    sourceFailureCounts.set(source, 0)
    return
  }

  const next = prev + 1
  sourceFailureCounts.set(source, next)
  if (next >= OFFLINE_FAILURE_THRESHOLD) {
    console.warn(
      `[AutoFetcher] Source "${source}" has failed ${next} consecutive time(s) — may be offline or HTML structure has changed.` +
      (note ? ` Details: ${note}` : '')
    )
  } else {
    console.warn(`[AutoFetcher] Source "${source}" failure #${next}. ${note ?? ''}`)
  }
}

type SyncMode = 'incremental' | 'full-sync'

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

const sleepMs = (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs))

const runWithRetry = async <T>(operation: () => Promise<T>, label: string): Promise<T> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      console.warn(`[AutoFetcher] ${label} failed on attempt ${attempt}/${MAX_RETRIES}:`, error)
      if (attempt < MAX_RETRIES) {
        await sleepMs(Math.pow(2, attempt - 1) * 1000)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const runAdapterImport = async (
  ingestion: TariffDataIngestionService,
  source: RegulatorySource,
  mode: SyncMode,
  href: string,
  fileName: string,
  contentBase64: string
): Promise<boolean> => {
  for (const adapter of sourceAdapters) {
    if (!adapter.canHandle({ href, fileName, contentBase64, source, mode })) {
      continue
    }

    const parsed = await adapter.parse({ href, fileName, contentBase64, source, mode }, ingestion)
    if (!parsed) {
      continue
    }

    if (await ingestion.hasSourceReference(parsed.sourceType, href)) {
      console.log(`[AutoFetcher] Skipping previously imported source ${href} (${parsed.adapterId})`)
      return true
    }

    if (parsed.kind === 'tariff-rates') {
      const tariffRows = parsed.rows as Array<{ hsCode: string; dutyRate: string | number; notes?: string }>
      const summary = await ingestion.importRows({
        sourceName: `${mode}:${source}:${parsed.adapterId}`,
        sourceType: parsed.sourceType,
        sourceReference: href,
        rows: tariffRows.map((row) => ({
          ...row,
          notes: [row.notes, `${mode === 'full-sync' ? 'Full-sync' : 'Auto-fetched'} from ${href}`].filter(Boolean).join(' | '),
        })),
        autoApproveThreshold: 100,
      })

      console.log(
        `[AutoFetcher] ${mode} tariff import via ${parsed.adapterId} from ${fileName}: ` +
        `${summary.importedRows} imported, ${summary.pendingReviewRows} pending, ${summary.errorRows} errors, ` +
        `${summary.duplicateRows} duplicates, ${summary.conflictRows} conflicts`
      )
      return true
    }

    const summary = await ingestion.importHSCatalog({
      sourceName: `${mode}:${source}:${parsed.adapterId}`,
      sourceType: parsed.sourceType,
      sourceReference: href,
      rows: parsed.rows as Awaited<ReturnType<TariffDataIngestionService['parseHSCatalogRows']>>,
    })

    console.log(
      `[AutoFetcher] ${mode} catalog import via ${parsed.adapterId} from ${fileName}: ` +
      `${summary.importedRows} imported, ${summary.pendingReviewRows} pending, ${summary.errorRows} errors, ` +
      `${summary.duplicateRows} duplicates, ${summary.conflictRows} conflicts`
    )
    return true
  }

  return false
}

const fetchAndIngest = async (source: RegulatorySource, mode: SyncMode = 'incremental'): Promise<void> => {
  const fetcher = new WebsiteFetcherService()
  const ingestion = new TariffDataIngestionService()

  console.log(`[AutoFetcher] Starting ${mode} fetch for ${source}...`)

  let updates
  try {
    updates = await fetcher.fetchRegulatoryUpdates(source)
    markSourceOutcome(source, true)
  } catch (err) {
    console.error(`[AutoFetcher] Failed to fetch regulatory updates for ${source}:`, err)
    markSourceOutcome(source, false, String(err))
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
            console.warn(
              `[AutoFetcher] No HS-code/rate tables found in HTML on ${update.url} — ` +
              `the page structure may have changed. Manual review recommended.`
            )
            markSourceOutcome(source, false, `0 rows parsed from ${update.url} — possible HTML structure change`)
            continue
          }

          const rowsWithConfidence = rows.map((r) => ({ ...r, confidenceScore: confidence }))
          const sourceType = `${getAutoFetchSourceType('tariff-rates', source, 'html')}${mode === 'full-sync' ? '-full-sync' : ''}`
          if (await ingestion.hasSourceReference(sourceType, update.url)) {
            console.log(`[AutoFetcher] Skipping previously imported HTML source ${update.url}`)
            continue
          }

          const summary = await ingestion.importRows({
            sourceName: `${mode}:auto-fetch-html:${source}`,
            sourceType,
            sourceReference: update.url,
            rows: rowsWithConfidence,
            autoApproveThreshold: 100,
          })

          console.log(
            `[AutoFetcher] HTML import for ${update.url}: ${summary.importedRows} imported, ` +
            `${summary.pendingReviewRows} pending review, ${summary.errorRows} errors, ` +
            `${summary.duplicateRows} duplicates, ${summary.conflictRows} conflicts`
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
        contentBase64 = await runWithRetry(() => downloadSourceFileBase64(link.href), `download ${link.href}`)
      } catch (err) {
        console.warn(`[AutoFetcher] Could not download ${link.href}:`, err)
        continue
      }

      try {
        const imported = await runWithRetry(
          () => runAdapterImport(ingestion, source, mode, link.href, fileName, contentBase64),
          `adapter import ${link.href}`
        )

        if (!imported) {
          console.log(`[AutoFetcher] No adapter produced rows for ${fileName}`)
        }
      } catch (err) {
        console.error(`[AutoFetcher] Import failed for ${fileName}:`, err)
      }
    }
  }

  console.log(`[AutoFetcher] Completed ${mode} fetch for ${source}`)
}

const runFullSync = async (): Promise<void> => {
  console.log('[AutoFetcher] Starting monthly full-sync run')

  const sources: RegulatorySource[] = ['boc', 'bir', 'tariff-commission']
  for (const source of sources) {
    try {
      await fetchAndIngest(source, 'full-sync')
    } catch (error) {
      console.error(`[AutoFetcher] Full-sync failed for ${source}:`, error)
    }
  }

  console.log('[AutoFetcher] Completed monthly full-sync run')
}

export const startAutoFetching = (): void => {
  cron.schedule(CRON_SCHEDULE, async () => {
    if (!getRuntimeSettings().autoFetcherEnabled) {
      console.log('[AutoFetcher] Skipping scheduled run because runtime settings disabled it')
      return
    }

    await fetchAndIngest('boc', 'incremental')
    await fetchAndIngest('bir', 'incremental')
    await fetchAndIngest('tariff-commission', 'incremental')
  })
  console.log(`[AutoFetcher] Scheduled with cron: ${CRON_SCHEDULE}`)

  cron.schedule(MONTHLY_FULL_SYNC_SCHEDULE, async () => {
    if (!getRuntimeSettings().autoFetcherEnabled) {
      console.log('[AutoFetcher] Skipping monthly full-sync because runtime settings disabled auto fetch')
      return
    }

    await runFullSync()
  })
  console.log(`[AutoFetcher] Scheduled monthly full-sync with cron: ${MONTHLY_FULL_SYNC_SCHEDULE}`)
}
