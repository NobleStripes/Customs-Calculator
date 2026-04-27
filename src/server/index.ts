import express from 'express'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { initializeDatabase } from '../backend/db/database'
import { ComplianceChecker } from '../backend/services/complianceChecker'
import { TariffDataIngestionService } from '../backend/services/tariffDataIngestion'
import { TariffCalculator } from '../backend/services/tariffCalculator'
import { CurrencyConverter } from '../backend/services/currencyConverter'
import { DocumentGenerator } from '../backend/services/documentGenerator'
import { WebsiteFetcherService, type RegulatorySource } from '../backend/services/websiteFetcher'
import { startAutoFetching } from '../backend/services/autoFetcher'
import {
  BIR_DOCUMENTARY_STAMP_TAX_PHP,
  CUSTOMS_DOCUMENTARY_STAMP_PHP,
  TRANSIT_CHARGE_PHP,
  getBrokerageFeePhp,
  getContainerSecurityFeeUsd,
  getImportProcessingChargePhp,
  normalizeDestinationPort,
} from '../backend/services/customsRules'
import { getRuntimeSettings, updateRuntimeSettings } from '../backend/services/runtimeSettings'

const app = express()
const websiteFetcher = new WebsiteFetcherService()
const complianceChecker = new ComplianceChecker()
const tariffDataIngestion = new TariffDataIngestionService()
const tariffCalculator = new TariffCalculator()
const currencyConverter = new CurrencyConverter()
const documentGenerator = new DocumentGenerator()
const port = Number(process.env.PORT || 8787)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rendererDistPath = path.resolve(__dirname, '../renderer')

const regulatorySources = new Set<RegulatorySource>(['boc', 'bir', 'tariff-commission'])

const fetchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests — try again in a minute' },
})

const MIN_HS_SEARCH_QUERY_LENGTH = 2
const MAX_HS_SEARCH_QUERY_LENGTH = 100

const isCodeLikeQuery = (value: string): boolean => /^[\d.]+$/.test(value.trim())

const normalizeScheduleCode = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'MFN'
  }

  const normalized = value.trim().toUpperCase()
  return normalized || 'MFN'
}

const normalizeHsSearchQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedQuery = value.trim().replace(/\s+/g, ' ')
  if (!normalizedQuery) {
    return null
  }

  const minLength = isCodeLikeQuery(normalizedQuery) ? 1 : MIN_HS_SEARCH_QUERY_LENGTH

  if (normalizedQuery.length < minLength || normalizedQuery.length > MAX_HS_SEARCH_QUERY_LENGTH) {
    return null
  }

  return normalizedQuery
}

const sendError = (response: express.Response, statusCode: number, error: unknown) => {
  response.status(statusCode).json({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })
}

app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    success: true,
    data: {
      status: 'ok',
      service: 'customs-calculator-api',
    },
  })
})

app.get('/api/runtime-settings', (_request, response) => {
  response.json({
    success: true,
    data: getRuntimeSettings(),
  })
})

app.put('/api/runtime-settings', (request, response) => {
  try {
    const nextSettings = updateRuntimeSettings(request.body || {})
    currencyConverter.clearOldCache()
    return response.json({ success: true, data: nextSettings })
  } catch (error) {
    return sendError(response, 400, error)
  }
})

app.get('/api/runtime-status', async (_request, response) => {
  try {
    const sources = await tariffDataIngestion.getTariffSources(25)
    const [latestSource] = sources
    const latestAutoFetchSource = sources.find((source) =>
      source.source_type.startsWith('auto-fetch')
    )

    return response.json({
      success: true,
      data: {
        settings: getRuntimeSettings(),
        latestSource: latestSource || null,
        autoFetcherLastRun: latestAutoFetchSource?.fetched_at || null,
      },
    })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/calculate/duty', async (request, response) => {
  const { value, hsCode, originCountry, scheduleCode } = request.body || {}

  if (!Number.isFinite(Number(value))) {
    return sendError(response, 400, 'Request body field "value" must be a valid number')
  }

  if (typeof hsCode !== 'string' || !hsCode.trim()) {
    return sendError(response, 400, 'Request body field "hsCode" is required')
  }

  if (typeof originCountry !== 'string' || !originCountry.trim()) {
    return sendError(response, 400, 'Request body field "originCountry" is required')
  }

  try {
    const result = await tariffCalculator.calculateDuty(Number(value), hsCode, originCountry, normalizeScheduleCode(scheduleCode))
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/calculate/vat', async (request, response) => {
  const { dutiableValue, hsCode, scheduleCode } = request.body || {}

  if (!Number.isFinite(Number(dutiableValue))) {
    return sendError(response, 400, 'Request body field "dutiableValue" must be a valid number')
  }

  if (typeof hsCode !== 'string' || !hsCode.trim()) {
    return sendError(response, 400, 'Request body field "hsCode" is required')
  }

  try {
    const result = await tariffCalculator.calculateVAT(Number(dutiableValue), hsCode, normalizeScheduleCode(scheduleCode))
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/compliance/requirements', async (request, response) => {
  const { hsCode, value, destination } = request.body || {}

  if (typeof hsCode !== 'string' || !hsCode.trim()) {
    return sendError(response, 400, 'Request body field "hsCode" is required')
  }

  if (!Number.isFinite(Number(value))) {
    return sendError(response, 400, 'Request body field "value" must be a valid number')
  }

  if (typeof destination !== 'string' || !destination.trim()) {
    return sendError(response, 400, 'Request body field "destination" is required')
  }

  try {
    const result = await complianceChecker.getRequirements(hsCode, Number(value), destination)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/calculate/batch', async (request, response) => {
  const shipments = Array.isArray(request.body?.shipments) ? request.body.shipments : null

  if (!shipments) {
    return sendError(response, 400, 'Request body field "shipments" must be an array')
  }

  try {
    const results = []

    for (const shipment of shipments) {
      if (!Number.isFinite(Number(shipment?.value))) {
        throw new Error('Each shipment must include a valid numeric value')
      }

      if (!Number.isFinite(Number(shipment?.freight ?? 0)) || !Number.isFinite(Number(shipment?.insurance ?? 0))) {
        throw new Error('Each shipment must include valid freight and insurance values')
      }

      if (typeof shipment?.hsCode !== 'string' || !shipment.hsCode.trim()) {
        throw new Error('Each shipment must include an hsCode')
      }

      const resolvedCode = await tariffCalculator.getHSCodeDetails(shipment.hsCode)
      if (!resolvedCode) {
        throw new Error(`Unknown HS code: ${shipment.hsCode}`)
      }

      const shipmentCurrency = String(shipment.currency || 'USD').trim().toUpperCase()
      const scheduleCode = normalizeScheduleCode(shipment.scheduleCode)
      const destinationPort = normalizeDestinationPort(typeof shipment.destinationPort === 'string' ? shipment.destinationPort : 'MNL')
      const taxableInputAmount = Number(shipment.value) + Number(shipment.freight || 0) + Number(shipment.insurance || 0)
      const conversionResult = await currencyConverter.convert(taxableInputAmount, shipmentCurrency, 'PHP')
      const valueInPhp = shipmentCurrency === 'PHP' ? taxableInputAmount : conversionResult.convertedAmount
      const dutyResult = await tariffCalculator.calculateDuty(valueInPhp, resolvedCode.code, String(shipment.originCountry || ''), scheduleCode)
      const brokerageFeePhp = getBrokerageFeePhp(valueInPhp)
      const csfUsd = getContainerSecurityFeeUsd(String(shipment.containerSize || '20ft').toLowerCase())
      let csfPhp = 0

      if (csfUsd > 0) {
        const csfConversionResult = await currencyConverter.convert(csfUsd, 'USD', 'PHP')
        csfPhp = csfConversionResult.convertedAmount
      }

      const declarationType = String(shipment.declarationType || 'consumption').toLowerCase()
      const transitChargePhp = declarationType === 'transit' ? TRANSIT_CHARGE_PHP : 0
      const ipcPhp = declarationType === 'transit' ? 250 : getImportProcessingChargePhp(valueInPhp)
      const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
      const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
      const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp
      const vatBasePhp = valueInPhp + dutyResult.amount + dutyResult.surcharge + brokerageFeePhp + Number(shipment.arrastreWharfage || 0) + Number(shipment.doxStampOthers || 0) + totalGlobalFeesPhp
      const vatResult = await tariffCalculator.calculateVAT(vatBasePhp, resolvedCode.code, scheduleCode)
      const vatAmountPhp = vatResult.amount
      const complianceResult = await complianceChecker.getRequirements(resolvedCode.code, valueInPhp, destinationPort)
      results.push({
        ...shipment,
        hsCode: resolvedCode.code,
        scheduleCode,
        destinationPort,
        duty: {
          amount: dutyResult.amount,
          surcharge: dutyResult.surcharge,
          rate: dutyResult.rate,
          notes: dutyResult.notes,
        },
        vat: {
          amount: vatAmountPhp,
          rate: vatResult.rate,
        },
        compliance: complianceResult,
        costBase: {
          taxableValue: valueInPhp,
          brokerageFee: brokerageFeePhp,
          arrastreWharfage: Number(shipment.arrastreWharfage || 0),
          doxStampOthers: Number(shipment.doxStampOthers || 0),
          vatBase: vatBasePhp,
        },
        breakdown: {
          itemTaxes: {
            cud: dutyResult.amount,
            vat: vatAmountPhp,
            totalItemTax: dutyResult.amount + vatAmountPhp,
          },
          globalFees: {
            transitCharge: transitChargePhp,
            ipc: ipcPhp,
            csf: csfPhp,
            cds: cdsPhp,
            irs: irsPhp,
            totalGlobalTax: totalGlobalFeesPhp,
          },
          totalTaxAndFees: dutyResult.amount + vatAmountPhp + totalGlobalFeesPhp,
        },
        totalLandedCost: vatBasePhp + vatAmountPhp,
        calculationCurrency: 'PHP',
        fx: {
          applied: shipmentCurrency !== 'PHP',
          rateToPhp: conversionResult.rate,
          inputCurrency: shipmentCurrency,
          baseCurrency: 'PHP',
          source: conversionResult.source,
          timestamp: conversionResult.timestamp,
        },
      })
    }

    return response.json({ success: true, data: results })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/import/hs-codes/preview', async (request, response) => {
  try {
    const rows = await tariffDataIngestion.parseHSCatalogRows(request.body || {})
    const result = tariffDataIngestion.previewHSCatalogRows(rows)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 400, error)
  }
})

app.post('/api/import/hs-codes', async (request, response) => {
  const payload = request.body || {}

  if (typeof payload.sourceName !== 'string' || !payload.sourceName.trim()) {
    return sendError(response, 400, 'Request body field "sourceName" is required')
  }

  try {
    const rows = await tariffDataIngestion.parseHSCatalogRows(payload)
    const batchSize = typeof payload.batchSize === 'number' && Number.isFinite(payload.batchSize)
      ? Math.max(1, Math.floor(payload.batchSize))
      : undefined

    const result = batchSize
      ? await tariffDataIngestion.importHSCatalogBatched({
          sourceName: payload.sourceName,
          sourceType: typeof payload.sourceType === 'string' ? payload.sourceType : 'hs-catalog',
          sourceReference: typeof payload.sourceReference === 'string' ? payload.sourceReference : payload.fileName,
          rows,
          batchSize,
        })
      : await tariffDataIngestion.importHSCatalog({
          sourceName: payload.sourceName,
          sourceType: typeof payload.sourceType === 'string' ? payload.sourceType : 'hs-catalog',
          sourceReference: typeof payload.sourceReference === 'string' ? payload.sourceReference : payload.fileName,
          rows,
        })

    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 400, error)
  }
})

app.post('/api/import/tariff-rates/preview', async (request, response) => {
  try {
    const rows = tariffDataIngestion.parseCsvText(typeof request.body?.csvText === 'string' ? request.body.csvText : '')
    const result = tariffDataIngestion.previewRows(Array.isArray(request.body?.rows) ? request.body.rows : rows)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 400, error)
  }
})

app.post('/api/import/tariff-rates', async (request, response) => {
  const payload = request.body || {}

  if (typeof payload.sourceName !== 'string' || !payload.sourceName.trim()) {
    return sendError(response, 400, 'Request body field "sourceName" is required')
  }

  try {
    const rows = Array.isArray(payload.rows)
      ? payload.rows
      : tariffDataIngestion.parseCsvText(typeof payload.csvText === 'string' ? payload.csvText : '')

    const result = await tariffDataIngestion.importRows({
      sourceName: payload.sourceName,
      sourceType: typeof payload.sourceType === 'string' ? payload.sourceType : 'tariff-rates',
      sourceReference: typeof payload.sourceReference === 'string' ? payload.sourceReference : payload.fileName,
      rows,
      autoApproveThreshold: typeof payload.autoApproveThreshold === 'number' ? payload.autoApproveThreshold : undefined,
      forceApprove: Boolean(payload.forceApprove),
    })

    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 400, error)
  }
})

app.get('/api/import-jobs', async (request, response) => {
  const parsedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 20

  try {
    const result = await tariffDataIngestion.getImportJobs(Number.isFinite(parsedLimit) ? parsedLimit : 20)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/import-jobs/:importJobId/pending-review', async (request, response) => {
  const importJobId = Number(request.params.importJobId)

  if (!Number.isFinite(importJobId)) {
    return sendError(response, 400, 'Route parameter "importJobId" must be a valid number')
  }

  try {
    const result = await tariffDataIngestion.getPendingReviewRows(importJobId)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/hs-codes/search', async (request, response) => {
  const normalizedQuery = normalizeHsSearchQuery(request.query.query)
  const parsedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : undefined
  const normalizedLimit = Number.isFinite(parsedLimit)
    ? Math.max(5, Math.min(100, Math.floor(parsedLimit as number)))
    : 20

  if (!normalizedQuery) {
    return sendError(
      response,
      400,
      `Query parameter "query" must be code-like with at least 1 character, or text with at least ${MIN_HS_SEARCH_QUERY_LENGTH} characters, and at most ${MAX_HS_SEARCH_QUERY_LENGTH} characters`
    )
  }

  try {
    const result = await tariffCalculator.searchHSCodes(normalizedQuery, { limit: normalizedLimit })
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/hs-codes/resolve', async (request, response) => {
  const { code } = request.query

  if (typeof code !== 'string' || !code.trim()) {
    return sendError(response, 400, 'Query parameter "code" is required')
  }

  try {
    const result = await tariffCalculator.getHSCodeDetails(code)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/tariff-catalog', async (request, response) => {
  const { query, category, limit, scheduleCode } = request.query
  const parsedLimit = typeof limit === 'string' ? Number(limit) : undefined

  try {
    const result = await tariffCalculator.getTariffCatalog(
      typeof query === 'string' ? query : '',
      typeof category === 'string' ? category : 'All',
      normalizeScheduleCode(scheduleCode),
      Number.isFinite(parsedLimit) ? parsedLimit : 200
    )

    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/tariff-categories', async (_request, response) => {
  try {
    const result = await tariffCalculator.getTariffCategories()
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/tariff-schedules', async (_request, response) => {
  try {
    const result = await tariffCalculator.getTariffSchedules()
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/currency/convert', async (request, response) => {
  const { amount, from, to } = request.query
  const parsedAmount = Number(amount)

  if (!Number.isFinite(parsedAmount)) {
    return sendError(response, 400, 'Query parameter "amount" must be a valid number')
  }

  if (typeof from !== 'string' || !from.trim()) {
    return sendError(response, 400, 'Query parameter "from" is required')
  }

  if (typeof to !== 'string' || !to.trim()) {
    return sendError(response, 400, 'Query parameter "to" is required')
  }

  try {
    const result = await currencyConverter.convert(parsedAmount, from, to)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/currency/rate', async (request, response) => {
  const { from, to } = request.query

  if (typeof from !== 'string' || !from.trim()) {
    return sendError(response, 400, 'Query parameter "from" is required')
  }

  if (typeof to !== 'string' || !to.trim()) {
    return sendError(response, 400, 'Query parameter "to" is required')
  }

  try {
    const result = await currencyConverter.getRate(from, to)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/fetch-website-content', fetchLimiter, async (request, response) => {
  const { url, query } = request.query

  if (typeof url !== 'string' || !url.trim()) {
    return sendError(response, 400, 'Query parameter "url" is required')
  }

  try {
    const result = await websiteFetcher.fetchWebsite({
      url,
      query: typeof query === 'string' ? query : undefined,
    })

    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/fetch-regulatory-updates', fetchLimiter, async (request, response) => {
  const { source, query } = request.query

  if (typeof source !== 'string' || !regulatorySources.has(source as RegulatorySource)) {
    return sendError(response, 400, 'Query parameter "source" must be one of: boc, bir, tariff-commission')
  }

  try {
    const result = await websiteFetcher.fetchRegulatoryUpdates(
      source as RegulatorySource,
      typeof query === 'string' ? query : undefined
    )

    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/export/calculation-document/pdf', async (request, response) => {
  const payload = request.body

  if (!payload?.formData || !payload?.results) {
    return sendError(response, 400, 'Request body must include formData and results')
  }

  try {
    const pdfBuffer = await documentGenerator.generateCalculationReportBuffer({
      formData: payload.formData,
      results: payload.results,
      generatedAt: new Date().toISOString(),
    })

    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', 'attachment; filename="customs-calculation-report.pdf"')
    return response.send(pdfBuffer)
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/calculation-history', async (request, response) => {
  const parsedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 50

  try {
    const result = await tariffDataIngestion.getCalculationHistory(Number.isFinite(parsedLimit) ? parsedLimit : 50)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/tariff-sources', async (request, response) => {
  const parsedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 50

  try {
    const result = await tariffDataIngestion.getTariffSources(Number.isFinite(parsedLimit) ? parsedLimit : 50)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/rate-change-audit', async (request, response) => {
  const parsedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 50
  const parsedOffset = typeof request.query.offset === 'string' ? Number(request.query.offset) : 0
  const hsCode = typeof request.query.hs_code === 'string' && request.query.hs_code.trim()
    ? request.query.hs_code.trim()
    : undefined

  try {
    const result = await tariffDataIngestion.getRateChangeAudit(
      hsCode,
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
      Number.isFinite(parsedOffset) ? parsedOffset : 0
    )
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.patch('/api/import-jobs/:importJobId/review-rows/:rowId', async (request, response) => {
  const importJobId = Number(request.params.importJobId)
  const rowId = Number(request.params.rowId)

  if (!Number.isFinite(importJobId)) {
    return sendError(response, 400, 'Route parameter "importJobId" must be a valid number')
  }

  if (!Number.isFinite(rowId)) {
    return sendError(response, 400, 'Route parameter "rowId" must be a valid number')
  }

  const { action, notes } = request.body || {}

  if (action !== 'approve' && action !== 'reject') {
    return sendError(response, 400, 'Request body field "action" must be "approve" or "reject"')
  }

  try {
    if (action === 'approve') {
      await tariffDataIngestion.approveReviewRow(importJobId, rowId, typeof notes === 'string' ? notes : undefined)
    } else {
      await tariffDataIngestion.rejectReviewRow(importJobId, rowId, typeof notes === 'string' ? notes : undefined)
    }
    return response.json({ success: true })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.use(express.static(rendererDistPath))

app.get('*', (_request, response) => {
  response.sendFile(path.join(rendererDistPath, 'index.html'))
})

const startServer = async () => {
  await initializeDatabase()
  currencyConverter.clearOldCache()
  startAutoFetching()

  app.listen(port, () => {
    console.log(`Customs Calculator server listening on http://127.0.0.1:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start Customs Calculator server:', error)
  process.exit(1)
})
