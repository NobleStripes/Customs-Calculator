import { app, dialog, ipcMain } from 'electron'
import { initializeDatabase } from '../backend/db/database'
import { TariffCalculator } from '../backend/services/tariffCalculator'
import { ComplianceChecker } from '../backend/services/complianceChecker'
import { CurrencyConverter } from '../backend/services/currencyConverter'
import { DocumentGenerator } from '../backend/services/documentGenerator'
import { TariffDataIngestionService } from '../backend/services/tariffDataIngestion'
import { WebsiteFetcherService } from '../backend/services/websiteFetcher'
import path from 'path'

export const registerIPCHandlers = () => {
  // Initialize database on app start
  ipcMain.handle('init-db', async () => {
    try {
      await initializeDatabase()
      return { success: true }
    } catch (error) {
      console.error('Database initialization failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Tariff calculation
  ipcMain.handle('calculate-duty', async (_event, payload) => {
    try {
      const calculator = new TariffCalculator()
      const result = await calculator.calculateDuty(
        payload.value,
        payload.hsCode,
        payload.originCountry
      )
      return { success: true, data: result }
    } catch (error) {
      console.error('Duty calculation failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // VAT calculation
  ipcMain.handle('calculate-vat', async (_event, payload) => {
    try {
      const calculator = new TariffCalculator()
      const result = await calculator.calculateVAT(payload.dutiableValue, payload.hsCode)
      return { success: true, data: result }
    } catch (error) {
      console.error('VAT calculation failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // HS Code search
  ipcMain.handle('search-hs-codes', async (_event, query) => {
    try {
      const calculator = new TariffCalculator()
      const results = await calculator.searchHSCodes(query)
      return { success: true, data: results }
    } catch (error) {
      console.error('HS code search failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Tariff browser catalog
  ipcMain.handle('get-tariff-catalog', async (_event, payload) => {
    try {
      const calculator = new TariffCalculator()
      const rows = await calculator.getTariffCatalog(
        payload?.query || '',
        payload?.category || 'All',
        payload?.limit || 200
      )
      return { success: true, data: rows }
    } catch (error) {
      console.error('Tariff catalog fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Tariff browser categories
  ipcMain.handle('get-tariff-categories', async () => {
    try {
      const calculator = new TariffCalculator()
      const categories = await calculator.getTariffCategories()
      return { success: true, data: categories }
    } catch (error) {
      console.error('Tariff category fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get compliance requirements
  ipcMain.handle('get-compliance-requirements', async (_event, payload) => {
    try {
      const checker = new ComplianceChecker()
      const requirements = await checker.getRequirements(
        payload.hsCode,
        payload.value,
        payload.destination
      )
      return { success: true, data: requirements }
    } catch (error) {
      console.error('Compliance check failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Currency conversion
  ipcMain.handle('convert-currency', async (_event, payload) => {
    try {
      const converter = new CurrencyConverter()
      const result = await converter.convert(
        payload.amount,
        payload.fromCurrency,
        payload.toCurrency
      )
      return { success: true, data: result }
    } catch (error) {
      console.error('Currency conversion failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Batch import calculation
  ipcMain.handle('batch-calculate', async (_event, shipments) => {
    try {
      const calculator = new TariffCalculator()
      const converter = new CurrencyConverter()
      const results = []

      for (const shipment of shipments) {
        const shipmentCurrency = (shipment.currency || 'USD').toUpperCase()
        let valueInPhp = shipment.value
        let fxRateToPhp = 1

        if (shipmentCurrency !== 'PHP') {
          const conversionResult = await converter.convert(
            shipment.value,
            shipmentCurrency,
            'PHP'
          )
          valueInPhp = conversionResult.convertedAmount
          fxRateToPhp = conversionResult.rate
        }

        const duty = await calculator.calculateDuty(
          valueInPhp,
          shipment.hsCode,
          shipment.originCountry
        )
        const dutiableValue = valueInPhp + duty.amount + duty.surcharge
        const vat = await calculator.calculateVAT(dutiableValue, shipment.hsCode)

        const convertFromPhp = (amount: number): number => {
          if (shipmentCurrency === 'PHP') {
            return amount
          }

          return amount / fxRateToPhp
        }

        results.push({
          ...shipment,
          duty: {
            ...duty,
            amount: convertFromPhp(duty.amount),
            surcharge: convertFromPhp(duty.surcharge),
          },
          vat: {
            ...vat,
            amount: convertFromPhp(vat.amount),
          },
          totalLandedCost: convertFromPhp(dutiableValue + vat.amount),
          calculationCurrency: 'PHP',
          fx: {
            applied: shipmentCurrency !== 'PHP',
            rateToPhp: fxRateToPhp,
            inputCurrency: shipmentCurrency,
            baseCurrency: 'PHP',
          },
        })
      }

      return { success: true, data: results }
    } catch (error) {
      console.error('Batch calculation failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Tariff data import preview
  ipcMain.handle('preview-tariff-import', async (_event, payload) => {
    try {
      const ingestion = new TariffDataIngestionService()

      const rows = Array.isArray(payload?.rows)
        ? payload.rows
        : ingestion.parseCsvText(payload?.csvText || '')

      const preview = ingestion.previewRows(rows)
      return { success: true, data: preview }
    } catch (error) {
      console.error('Tariff import preview failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Tariff data import execution
  ipcMain.handle('import-tariff-data', async (_event, payload) => {
    try {
      const ingestion = new TariffDataIngestionService()

      const rows = Array.isArray(payload?.rows)
        ? payload.rows
        : ingestion.parseCsvText(payload?.csvText || '')

      const summary = await ingestion.importRows({
        sourceName: payload?.sourceName || 'Manual import',
        sourceType: payload?.sourceType || 'manual',
        sourceReference: payload?.sourceReference,
        rows,
        autoApproveThreshold: payload?.autoApproveThreshold,
        forceApprove: Boolean(payload?.forceApprove),
      })

      return { success: true, data: summary }
    } catch (error) {
      console.error('Tariff data import failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Import jobs list
  ipcMain.handle('get-import-jobs', async (_event, payload) => {
    try {
      const ingestion = new TariffDataIngestionService()
      const jobs = await ingestion.getImportJobs(payload?.limit || 20)
      return { success: true, data: jobs }
    } catch (error) {
      console.error('Import job fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Pending review rows by import job
  ipcMain.handle('get-pending-review-rows', async (_event, payload) => {
    try {
      const ingestion = new TariffDataIngestionService()
      const rows = await ingestion.getPendingReviewRows(payload?.importJobId)
      return { success: true, data: rows }
    } catch (error) {
      console.error('Pending review row fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Website fetching for regulatory sources
  ipcMain.handle('fetch-website-content', async (_event, payload) => {
    try {
      const fetcher = new WebsiteFetcherService()
      const result = await fetcher.fetchWebsite({
        url: payload?.url,
        query: payload?.query,
        timeoutMs: payload?.timeoutMs,
        maxTextLength: payload?.maxTextLength,
        allowedHosts: payload?.allowedHosts,
        allowNonGovernmentHosts: Boolean(payload?.allowNonGovernmentHosts),
      })
      return { success: true, data: result }
    } catch (error) {
      console.error('Website fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fetch-regulatory-updates', async (_event, payload) => {
    try {
      const fetcher = new WebsiteFetcherService()
      const source = payload?.source === 'bir'
        ? 'bir'
        : payload?.source === 'tariff-commission'
          ? 'tariff-commission'
          : 'boc'
      const result = await fetcher.fetchRegulatoryUpdates(source, payload?.query)
      return { success: true, data: result }
    } catch (error) {
      console.error('Regulatory update fetch failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Document generation
  ipcMain.handle('generate-calculation-document', async (_event, payload) => {
    try {
      const defaultFileName = `customs-calculation-${new Date().toISOString().slice(0, 10)}.pdf`
      const saveResult = await dialog.showSaveDialog({
        title: 'Save Calculation Report',
        defaultPath: path.join(app.getPath('documents'), defaultFileName),
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'Document generation cancelled' }
      }

      const generator = new DocumentGenerator()
      const savedPath = await generator.generateCalculationReport(
        {
          formData: payload.formData,
          results: payload.results,
          generatedAt: new Date().toISOString(),
        },
        saveResult.filePath
      )

      return { success: true, data: { path: savedPath } }
    } catch (error) {
      console.error('Document generation failed:', error)
      return { success: false, error: String(error) }
    }
  })
}

