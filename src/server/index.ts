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
import { OfficialHsLookupService } from '../backend/services/officialHsLookup'
import {
  FALLBACK_CONFIDENCE_SCORE,
  LOCAL_CATALOG_CONFIDENCE_SCORE,
  isCodeLikeQuery,
  isValidExactHsCode,
  normalizeExactHsCode,
} from '../shared/hsLookupQuery'
import { WebsiteFetcherService, type RegulatorySource } from '../backend/services/websiteFetcher'
import { startAutoFetching } from '../backend/services/autoFetcher'
import {
  BIR_DOCUMENTARY_STAMP_TAX_PHP,
  CUSTOMS_DOCUMENTARY_STAMP_PHP,
  LEGAL_RESEARCH_FUND_PHP,
  TRANSIT_CHARGE_PHP,
  applyInsuranceBenchmark,
  checkDeMinimis,
  getBrokerageFeePhp,
  getContainerSecurityFeeUsd,
  getEntryType,
  getImportProcessingChargePhp,
  normalizeDestinationPort,
} from '../backend/services/customsRules'
import {
  calculateExciseTax,
  getExciseCategoryForHsCode,
  type ExciseTaxCategory,
  type ExciseTaxUnit,
  type PetroleumProductType,
  type SweetenedBeverageSugarType,
} from '../backend/services/exciseTax'
import { getRuntimeSettings, updateRuntimeSettings } from '../backend/services/runtimeSettings'
import { classifyImport } from '../backend/services/importClassification'

const app = express()
const websiteFetcher = new WebsiteFetcherService()
const complianceChecker = new ComplianceChecker()
const tariffDataIngestion = new TariffDataIngestionService()
const tariffCalculator = new TariffCalculator()
const currencyConverter = new CurrencyConverter()
const documentGenerator = new DocumentGenerator()
const officialHsLookup = new OfficialHsLookupService()
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

  if (isCodeLikeQuery(normalizedQuery)) {
    const digitsOnlyLength = normalizedQuery.replace(/[^0-9]/g, '').length
    if (digitsOnlyLength >= 6 && !isValidExactHsCode(normalizedQuery)) {
      return null
    }
  }

  return normalizedQuery
}

const normalizeExactHsCodeFromRequest = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  return normalizeExactHsCode(value)
}

const isSeedFallbackMode = (): boolean => getRuntimeSettings().catalogMode === 'seed-fallback'

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
    const health = await tariffDataIngestion.getCatalogHealthMetrics()
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
        health,
      },
    })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.get('/api/catalog-health', async (_request, response) => {
  try {
    const result = await tariffDataIngestion.getCatalogHealthMetrics()
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/calculate/duty', async (request, response) => {
  const { value, hsCode, originCountry, scheduleCode } = request.body || {}

  if (!Number.isFinite(Number(value))) {
    return sendError(response, 400, 'Request body field "value" must be a valid number')
  }

  const normalizedHsCode = normalizeExactHsCodeFromRequest(hsCode)
  if (!normalizedHsCode) {
    return sendError(response, 400, 'Request body field "hsCode" must be a valid 6, 8, or 10-digit HS code')
  }

  if (typeof originCountry !== 'string' || !originCountry.trim()) {
    return sendError(response, 400, 'Request body field "originCountry" is required')
  }

  try {
    const result = await tariffCalculator.calculateDuty(Number(value), normalizedHsCode, originCountry, normalizeScheduleCode(scheduleCode))
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

  const normalizedHsCode = normalizeExactHsCodeFromRequest(hsCode)
  if (!normalizedHsCode) {
    return sendError(response, 400, 'Request body field "hsCode" must be a valid 6, 8, or 10-digit HS code')
  }

  try {
    const result = await tariffCalculator.calculateVAT(Number(dutiableValue), normalizedHsCode, normalizeScheduleCode(scheduleCode))
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/compliance/requirements', async (request, response) => {
  const { hsCode, value, destination } = request.body || {}

  const normalizedHsCode = normalizeExactHsCodeFromRequest(hsCode)
  if (!normalizedHsCode) {
    return sendError(response, 400, 'Request body field "hsCode" must be a valid 6, 8, or 10-digit HS code')
  }

  if (!Number.isFinite(Number(value))) {
    return sendError(response, 400, 'Request body field "value" must be a valid number')
  }

  if (typeof destination !== 'string' || !destination.trim()) {
    return sendError(response, 400, 'Request body field "destination" is required')
  }

  try {
    const result = await complianceChecker.getRequirements(normalizedHsCode, Number(value), destination)
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

  if (shipments.length > 100) {
    return sendError(response, 400, 'Request body field "shipments" must contain 100 or fewer items per request')
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

      // --- Step 1: Convert FOB to PHP for de minimis check ---
      const fobInput = Number(shipment.value)
      const freightInput = Number(shipment.freight || 0)
      const insuranceInput = Number(shipment.insurance || 0)

      const fobConversion = await currencyConverter.convert(fobInput, shipmentCurrency, 'PHP')
      const fobPhp = shipmentCurrency === 'PHP' ? fobInput : fobConversion.convertedAmount

      // --- Step 2: De minimis check (uses FOB value only, per CMTA Sec. 423) ---
      const deMinimisCheck = checkDeMinimis(fobPhp, resolvedCode.code)
      if (deMinimisCheck.exempt) {
        results.push({
          ...shipment,
          hsCode: resolvedCode.code,
          scheduleCode,
          destinationPort,
          deMinimisExempt: true,
          deMinimisReason: deMinimisCheck.reason,
          entryType: 'de_minimis' as const,
          insuranceBenchmarkApplied: false,
          duty: { amount: 0, surcharge: 0, rate: 0, notes: 'De minimis exempt' },
          exciseTax: { amount: 0, adValorem: 0, specific: 0, category: 'none', basis: 'N/A', notes: 'De minimis exempt' },
          vat: { amount: 0, rate: 12 },
          importClassification: classifyImport(resolvedCode.code, scheduleCode),
          compliance: await complianceChecker.getRequirements(resolvedCode.code, fobPhp, destinationPort),
          costBase: {
            taxableValue: fobPhp,
            brokerageFee: 0,
            arrastreWharfage: 0,
            doxStampOthers: 0,
            vatBase: 0,
          },
          breakdown: {
            itemTaxes: { cud: 0, excise: 0, vat: 0, totalItemTax: 0 },
            globalFees: { transitCharge: 0, ipc: 0, csf: 0, cds: 0, irs: 0, lrf: 0, totalGlobalTax: 0 },
            totalTaxAndFees: 0,
          },
          landedCostSubtotal: fobPhp,
          totalLandedCost: fobPhp,
          calculationCurrency: 'PHP' as const,
          fx: {
            applied: shipmentCurrency !== 'PHP',
            rateToPhp: fobConversion.rate,
            inputCurrency: shipmentCurrency,
            baseCurrency: 'PHP' as const,
            source: fobConversion.source,
            timestamp: fobConversion.timestamp,
          },
        })
        continue
      }

      // --- Step 3: Insurance benchmark (2% of FOB if not provided) ---
      const freightPhp = shipmentCurrency === 'PHP'
        ? freightInput
        : (await currencyConverter.convert(freightInput, shipmentCurrency, 'PHP')).convertedAmount
      const { insurance: insurancePhp, benchmarkApplied: insuranceBenchmarkApplied } =
        applyInsuranceBenchmark(fobPhp, insuranceInput > 0
          ? (shipmentCurrency === 'PHP' ? insuranceInput : (await currencyConverter.convert(insuranceInput, shipmentCurrency, 'PHP')).convertedAmount)
          : 0,
        resolvedCode.code)

      // --- Step 4: Dutiable value = FOB + insurance + freight (all in PHP) ---
      const dutiableValuePhp = fobPhp + insurancePhp + freightPhp
      const entryType = getEntryType(dutiableValuePhp)

      // --- Step 5: Customs duty ---
      const dutyResult = await tariffCalculator.calculateDuty(dutiableValuePhp, resolvedCode.code, String(shipment.originCountry || ''), scheduleCode)

      // --- Step 6: Excise tax ---
      const exciseCategory: ExciseTaxCategory | 'none' =
        (typeof shipment.exciseCategory === 'string' && shipment.exciseCategory !== 'none'
          ? shipment.exciseCategory as ExciseTaxCategory
          : getExciseCategoryForHsCode(resolvedCode.code))
      let exciseTaxResult = {
        amount: 0, adValorem: 0, specific: 0,
        category: exciseCategory === 'none' ? 'none' : exciseCategory,
        basis: 'N/A', notes: 'No excise tax applicable',
      }
      if (exciseCategory !== 'none') {
        const exciseQuantity = Number.isFinite(Number(shipment.exciseQuantity)) ? Number(shipment.exciseQuantity) : 0
        if (exciseQuantity > 0) {
          exciseTaxResult = {
            ...calculateExciseTax({
              category: exciseCategory,
              quantity: exciseQuantity,
              unit: (shipment.exciseUnit as ExciseTaxUnit) ?? 'liter',
              nrpOrDutiableValue: Number.isFinite(Number(shipment.exciseNrp)) ? Number(shipment.exciseNrp) : dutiableValuePhp,
              sweetenedBeverageSugarType: shipment.sweetenedBeverageSugarType as SweetenedBeverageSugarType | undefined,
              petroleumProductType: shipment.petroleumProductType as PetroleumProductType | undefined,
            }),
            category: exciseCategory,
          }
        }
      }

      // --- Step 7: Fixed fees ---
      const brokerageFeePhp = getBrokerageFeePhp(dutiableValuePhp)
      const csfUsd = getContainerSecurityFeeUsd(String(shipment.containerSize || '20ft').toLowerCase())
      let csfPhp = 0
      if (csfUsd > 0) {
        const csfConversionResult = await currencyConverter.convert(csfUsd, 'USD', 'PHP')
        csfPhp = csfConversionResult.convertedAmount
      }
      const declarationType = String(shipment.declarationType || 'consumption').toLowerCase()
      const transitChargePhp = declarationType === 'transit' ? TRANSIT_CHARGE_PHP : 0
      const ipcPhp = declarationType === 'transit' ? 250 : getImportProcessingChargePhp(dutiableValuePhp)
      const cdsPhp = CUSTOMS_DOCUMENTARY_STAMP_PHP
      const irsPhp = BIR_DOCUMENTARY_STAMP_TAX_PHP
      const lrfPhp = LEGAL_RESEARCH_FUND_PHP
      const arrastreWharfagePhp = Number(shipment.arrastreWharfage || 0)
      const doxStampOthersPhp = Number(shipment.doxStampOthers || 0)

      // --- Step 8: Landed Cost (BOC formula — this is the VAT base) ---
      // Landed Cost = Dutiable Value + Customs Duty + Excise Tax + Brokerage + IPF + CDS + DST + LRF
      const landedCostSubtotal =
        dutiableValuePhp +
        dutyResult.amount +
        dutyResult.surcharge +
        exciseTaxResult.amount +
        brokerageFeePhp +
        ipcPhp +
        cdsPhp +
        irsPhp +
        lrfPhp +
        transitChargePhp +
        csfPhp +
        arrastreWharfagePhp +
        doxStampOthersPhp

      // --- Step 9: VAT = 12% of Landed Cost ---
      const vatResult = await tariffCalculator.calculateVAT(landedCostSubtotal, resolvedCode.code, scheduleCode)
      const vatAmountPhp = vatResult.amount

      const totalGlobalFeesPhp = transitChargePhp + ipcPhp + csfPhp + cdsPhp + irsPhp + lrfPhp

      const complianceResult = await complianceChecker.getRequirements(resolvedCode.code, dutiableValuePhp, destinationPort)
      const importClassification = classifyImport(resolvedCode.code, scheduleCode)

      results.push({
        ...shipment,
        hsCode: resolvedCode.code,
        scheduleCode,
        destinationPort,
        deMinimisExempt: false,
        entryType,
        insuranceBenchmarkApplied,
        importClassification,
        duty: {
          amount: dutyResult.amount,
          surcharge: dutyResult.surcharge,
          rate: dutyResult.rate,
          notes: dutyResult.notes,
        },
        exciseTax: exciseTaxResult,
        vat: {
          amount: vatAmountPhp,
          rate: vatResult.rate,
        },
        compliance: complianceResult,
        costBase: {
          taxableValue: dutiableValuePhp,
          brokerageFee: brokerageFeePhp,
          arrastreWharfage: arrastreWharfagePhp,
          doxStampOthers: doxStampOthersPhp,
          vatBase: landedCostSubtotal,
        },
        breakdown: {
          itemTaxes: {
            cud: dutyResult.amount + dutyResult.surcharge,
            excise: exciseTaxResult.amount,
            vat: vatAmountPhp,
            totalItemTax: dutyResult.amount + dutyResult.surcharge + exciseTaxResult.amount + vatAmountPhp,
          },
          globalFees: {
            transitCharge: transitChargePhp,
            ipc: ipcPhp,
            csf: csfPhp,
            cds: cdsPhp,
            irs: irsPhp,
            lrf: lrfPhp,
            totalGlobalTax: totalGlobalFeesPhp,
          },
          totalTaxAndFees: dutyResult.amount + dutyResult.surcharge + exciseTaxResult.amount + vatAmountPhp + totalGlobalFeesPhp,
        },
        landedCostSubtotal,
        totalLandedCost: landedCostSubtotal + vatAmountPhp,
        calculationCurrency: 'PHP' as const,
        fx: {
          applied: shipmentCurrency !== 'PHP',
          rateToPhp: fobConversion.rate,
          inputCurrency: shipmentCurrency,
          baseCurrency: 'PHP' as const,
          source: fobConversion.source,
          timestamp: fobConversion.timestamp,
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
    const payload = request.body || {}
    const rows = Array.isArray(payload.rows)
      ? payload.rows
      : await tariffDataIngestion.parseTariffRows({
          csvText: typeof payload.csvText === 'string' ? payload.csvText : undefined,
          contentBase64: typeof payload.contentBase64 === 'string' ? payload.contentBase64 : undefined,
          fileName: typeof payload.fileName === 'string' ? payload.fileName : undefined,
        })
    const result = tariffDataIngestion.previewRows(rows)
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
      : await tariffDataIngestion.parseTariffRows({
          csvText: typeof payload.csvText === 'string' ? payload.csvText : undefined,
          contentBase64: typeof payload.contentBase64 === 'string' ? payload.contentBase64 : undefined,
          fileName: typeof payload.fileName === 'string' ? payload.fileName : undefined,
        })

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

app.get('/api/hs-codes/live-search', fetchLimiter, async (request, response) => {
  const normalizedQuery = normalizeHsSearchQuery(request.query.query)

  if (!normalizedQuery) {
    return sendError(
      response,
      400,
      `Query parameter "query" must be code-like with at least 1 character, or text with at least ${MIN_HS_SEARCH_QUERY_LENGTH} characters, and at most ${MAX_HS_SEARCH_QUERY_LENGTH} characters`
    )
  }

  try {
    const lookupResult = await officialHsLookup.search(normalizedQuery)

    const fallbackResults = await tariffCalculator.searchHSCodes(normalizedQuery, { limit: 20 })
    const localResults = fallbackResults.map((row) => ({
      ...row,
      confidence: LOCAL_CATALOG_CONFIDENCE_SCORE,
      sourceType: 'local-catalog',
      sourceLabel: 'Approved local tariff catalog',
      sourceUrl: '',
      matchedBy: isCodeLikeQuery(normalizedQuery) ? 'code' : 'description',
      authorityRank: 3,
      authorityLabel: 'Local catalog',
    }))

    const officialResults = lookupResult.results.map((row) => ({
      ...row,
      authorityRank: row.sourceType === 'official-site' ? 1 : 2,
      authorityLabel: row.sourceType === 'official-site' ? 'Official live' : 'Official cache',
    }))

    const mergedByCode = new Map<string, (typeof officialResults)[number] | (typeof localResults)[number]>()
    const mergeRows = [...officialResults, ...(isSeedFallbackMode() ? localResults : [])]
    for (const item of mergeRows) {
      const existing = mergedByCode.get(item.code)
      if (!existing) {
        mergedByCode.set(item.code, item)
        continue
      }

      const existingRank = Number((existing as { authorityRank?: number }).authorityRank ?? 99)
      const incomingRank = Number((item as { authorityRank?: number }).authorityRank ?? 99)
      const existingConfidence = Number((existing as { confidence?: number }).confidence ?? 0)
      const incomingConfidence = Number((item as { confidence?: number }).confidence ?? 0)
      if (incomingRank < existingRank || (incomingRank === existingRank && incomingConfidence > existingConfidence)) {
        mergedByCode.set(item.code, item)
      }
    }

    const rankedResults = Array.from(mergedByCode.values()).sort((left, right) => {
      const leftRank = Number((left as { authorityRank?: number }).authorityRank ?? 99)
      const rightRank = Number((right as { authorityRank?: number }).authorityRank ?? 99)
      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }
      const leftConfidence = Number((left as { confidence?: number }).confidence ?? 0)
      const rightConfidence = Number((right as { confidence?: number }).confidence ?? 0)
      if (leftConfidence !== rightConfidence) {
        return rightConfidence - leftConfidence
      }
      return String((left as { code?: string }).code || '').localeCompare(String((right as { code?: string }).code || ''))
    })

    if (rankedResults.length > 0) {
      return response.json({
        success: true,
        data: {
          ...lookupResult,
          fallbackUsed: lookupResult.results.length === 0,
          message: lookupResult.results.length > 0
            ? (isSeedFallbackMode()
              ? 'Showing authority-ranked results (official prioritized, local catalog used as supplemental ranking source).'
              : 'Showing authority-ranked official results (local fallback disabled by catalog mode).')
            : 'No official Tariff Commission Finder matches were parsed. Showing local catalog matches ranked by source authority.',
          results: rankedResults,
        },
      })
    }

    if (!isSeedFallbackMode()) {
      return response.json({
        success: true,
        data: {
          ...lookupResult,
          status: 'fallback',
          fallbackUsed: false,
          message: 'No official Tariff Commission Finder matches were parsed. Local seed fallback is disabled by catalog mode.',
          results: [],
        },
      })
    }
    return response.json({
      success: true,
      data: {
        ...lookupResult,
        status: 'fallback',
        fallbackUsed: true,
        message: 'No official Tariff Commission Finder matches were parsed. Showing local catalog results instead.',
        results: localResults,
      },
    })
  } catch (error) {
    try {
      if (!isSeedFallbackMode()) {
        return response.json({
          success: true,
          data: {
            query: normalizedQuery,
            sourceUrl: '',
            status: 'fallback',
            fetchedAt: new Date().toISOString(),
            cacheExpiresAt: new Date().toISOString(),
            fallbackUsed: false,
            message: `Official tariff lookup is unavailable and local seed fallback is disabled by catalog mode. ${error instanceof Error ? error.message : String(error)}`,
            results: [],
          },
        })
      }

      const fallbackResults = await tariffCalculator.searchHSCodes(normalizedQuery, { limit: 20 })
      return response.json({
        success: true,
        data: {
          query: normalizedQuery,
          sourceUrl: '',
          status: 'fallback',
          fetchedAt: new Date().toISOString(),
          cacheExpiresAt: new Date().toISOString(),
          fallbackUsed: true,
          message: `Official tariff lookup is unavailable. Showing local catalog fallback. ${error instanceof Error ? error.message : String(error)}`,
          results: fallbackResults.map((row) => ({
            ...row,
            confidence: FALLBACK_CONFIDENCE_SCORE,
            sourceType: 'local-catalog',
            sourceLabel: 'Approved local tariff catalog',
            sourceUrl: '',
            matchedBy: isCodeLikeQuery(normalizedQuery) ? 'code' : 'description',
          })),
        },
      })
    } catch (fallbackError) {
      return sendError(response, 502, fallbackError instanceof Error ? fallbackError : String(fallbackError))
    }
  }
})

app.get('/api/hs-codes/resolve', async (request, response) => {
  const { code } = request.query

  const normalizedCode = normalizeExactHsCodeFromRequest(code)
  if (!normalizedCode) {
    return sendError(response, 400, 'Query parameter "code" must be a valid 6, 8, or 10-digit HS code')
  }

  try {
    const result = await tariffCalculator.getHSCodeDetails(normalizedCode)
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

app.get('/api/tariff-catalog/history', async (request, response) => {
  const { query, category, limit, scheduleCode } = request.query
  const parsedLimit = typeof limit === 'string' ? Number(limit) : undefined

  try {
    const result = await tariffCalculator.getTariffHistory(
      typeof query === 'string' ? query : '',
      typeof category === 'string' ? category : 'All',
      normalizeScheduleCode(scheduleCode),
      Number.isFinite(parsedLimit) ? parsedLimit : 300
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

app.get('/api/review-rows/:rowId/provenance', async (request, response) => {
  const rowId = Number(request.params.rowId)
  if (!Number.isFinite(rowId)) {
    return sendError(response, 400, 'Route parameter "rowId" must be a valid number')
  }

  try {
    const result = await tariffDataIngestion.getReviewRowProvenance(rowId)
    return response.json({ success: true, data: result })
  } catch (error) {
    return sendError(response, 502, error)
  }
})

app.post('/api/import-jobs/:importJobId/review-rows/bulk', async (request, response) => {
  const importJobId = Number(request.params.importJobId)
  if (!Number.isFinite(importJobId)) {
    return sendError(response, 400, 'Route parameter "importJobId" must be a valid number')
  }

  const { action, rowIds, notes } = request.body || {}
  if (action !== 'approve' && action !== 'reject') {
    return sendError(response, 400, 'Request body field "action" must be "approve" or "reject"')
  }

  if (!Array.isArray(rowIds) || rowIds.length === 0 || rowIds.some((id) => !Number.isFinite(Number(id)))) {
    return sendError(response, 400, 'Request body field "rowIds" must be a non-empty numeric array')
  }

  if (rowIds.length > 500) {
    return sendError(response, 400, 'Request body field "rowIds" must contain 500 or fewer items per request')
  }

  try {
    let approved = 0
    let rejected = 0

    for (const rowId of rowIds as number[]) {
      if (action === 'approve') {
        await tariffDataIngestion.approveReviewRow(importJobId, Number(rowId), typeof notes === 'string' ? notes : undefined)
        approved += 1
      } else {
        await tariffDataIngestion.rejectReviewRow(importJobId, Number(rowId), typeof notes === 'string' ? notes : undefined)
        rejected += 1
      }
    }

    return response.json({
      success: true,
      data: {
        importJobId,
        action,
        processedRows: rowIds.length,
        approved,
        rejected,
      },
    })
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
