import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { initializeDatabase } from '../backend/db/database'
import { ComplianceChecker } from '../backend/services/complianceChecker'
import { TariffDataIngestionService } from '../backend/services/tariffDataIngestion'
import { TariffCalculator } from '../backend/services/tariffCalculator'
import { CurrencyConverter } from '../backend/services/currencyConverter'
import { DocumentGenerator } from '../backend/services/documentGenerator'
import { WebsiteFetcherService, type RegulatorySource } from '../backend/services/websiteFetcher'

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
const TRANSIT_CHARGE_PHP = 1000
const CUSTOMS_DOCUMENTARY_STAMP_PHP = 100
const BIR_DOCUMENTARY_STAMP_TAX_PHP = 30
const VAT_RATE = 0.12

const getImportProcessingChargePhp = (dutiableValuePhp: number): number => {
  if (dutiableValuePhp <= 25000) return 250
  if (dutiableValuePhp <= 50000) return 500
  if (dutiableValuePhp <= 250000) return 750
  if (dutiableValuePhp <= 500000) return 1000
  if (dutiableValuePhp <= 750000) return 1500
  return 2000
}

const getContainerSecurityFeeUsd = (containerSize: string): number => {
  if (containerSize === '40ft') return 10
  if (containerSize === '20ft') return 5
  return 0
}

const getBrokerageFeePhp = (taxableValuePhp: number): number =>
  ((taxableValuePhp - 200000) * 0.00125) + 5300

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

app.post('/api/calculate/duty', async (request, response) => {
  const { value, hsCode, originCountry } = request.body || {}

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
    const result = await tariffCalculator.calculateDuty(Number(value), hsCode, originCountry)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/calculate/vat', async (request, response) => {
  const { dutiableValue, hsCode } = request.body || {}

  if (!Number.isFinite(Number(dutiableValue))) {
    return sendError(response, 400, 'Request body field "dutiableValue" must be a valid number')
  }

  if (typeof hsCode !== 'string' || !hsCode.trim()) {
    return sendError(response, 400, 'Request body field "hsCode" is required')
  }

  try {
    const result = await tariffCalculator.calculateVAT(Number(dutiableValue), hsCode)
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
      const taxableInputAmount = Number(shipment.value) + Number(shipment.freight || 0) + Number(shipment.insurance || 0)
      const conversionResult = await currencyConverter.convert(taxableInputAmount, shipmentCurrency, 'PHP')
      const valueInPhp = shipmentCurrency === 'PHP' ? taxableInputAmount : conversionResult.convertedAmount
      const dutyResult = await tariffCalculator.calculateDuty(valueInPhp, resolvedCode.code, String(shipment.originCountry || ''))
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
      const vatAmountPhp = vatBasePhp * VAT_RATE
      const complianceResult = await complianceChecker.getRequirements(resolvedCode.code, valueInPhp, 'MNL')
      const convertFromPhp = (amount: number) => (shipmentCurrency === 'PHP' ? amount : amount / conversionResult.rate)

      results.push({
        ...shipment,
        hsCode: resolvedCode.code,
        duty: {
          amount: convertFromPhp(dutyResult.amount),
          surcharge: convertFromPhp(dutyResult.surcharge),
          rate: dutyResult.rate,
          notes: dutyResult.notes,
        },
        vat: {
          amount: convertFromPhp(vatAmountPhp),
          rate: VAT_RATE * 100,
        },
        compliance: complianceResult,
        costBase: {
          taxableValue: convertFromPhp(valueInPhp),
          brokerageFee: convertFromPhp(brokerageFeePhp),
          arrastreWharfage: convertFromPhp(Number(shipment.arrastreWharfage || 0)),
          doxStampOthers: convertFromPhp(Number(shipment.doxStampOthers || 0)),
          vatBase: convertFromPhp(vatBasePhp),
        },
        breakdown: {
          itemTaxes: {
            cud: convertFromPhp(dutyResult.amount),
            vat: convertFromPhp(vatAmountPhp),
            totalItemTax: convertFromPhp(dutyResult.amount + vatAmountPhp),
          },
          globalFees: {
            transitCharge: convertFromPhp(transitChargePhp),
            ipc: convertFromPhp(ipcPhp),
            csf: convertFromPhp(csfPhp),
            cds: convertFromPhp(cdsPhp),
            irs: convertFromPhp(irsPhp),
            totalGlobalTax: convertFromPhp(totalGlobalFeesPhp),
          },
          totalTaxAndFees: convertFromPhp(dutyResult.amount + vatAmountPhp + totalGlobalFeesPhp),
        },
        totalLandedCost: convertFromPhp(vatBasePhp + vatAmountPhp),
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
    const rows = tariffDataIngestion.parseHSCatalogRows(request.body || {})
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
    const rows = tariffDataIngestion.parseHSCatalogRows(payload)
    const result = await tariffDataIngestion.importHSCatalog({
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
  const { query } = request.query

  if (typeof query !== 'string' || !query.trim()) {
    return sendError(response, 400, 'Query parameter "query" is required')
  }

  try {
    const result = await tariffCalculator.searchHSCodes(query)
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
  const { query, category, limit } = request.query
  const parsedLimit = typeof limit === 'string' ? Number(limit) : undefined

  try {
    const result = await tariffCalculator.getTariffCatalog(
      typeof query === 'string' ? query : '',
      typeof category === 'string' ? category : 'All',
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

app.get('/api/fetch-website-content', async (request, response) => {
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

app.get('/api/fetch-regulatory-updates', async (request, response) => {
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

app.use(express.static(rendererDistPath))

app.get('*', (_request, response) => {
  response.sendFile(path.join(rendererDistPath, 'index.html'))
})

const startServer = async () => {
  await initializeDatabase()
  currencyConverter.clearOldCache()

  app.listen(port, () => {
    console.log(`Customs Calculator server listening on http://127.0.0.1:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start Customs Calculator server:', error)
  process.exit(1)
})