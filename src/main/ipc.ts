import { app, dialog, ipcMain } from 'electron'
import { initializeDatabase } from '../backend/db/database'
import { TariffCalculator } from '../backend/services/tariffCalculator'
import { ComplianceChecker } from '../backend/services/complianceChecker'
import { CurrencyConverter } from '../backend/services/currencyConverter'
import { DocumentGenerator } from '../backend/services/documentGenerator'
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
      const results = []

      for (const shipment of shipments) {
        const duty = await calculator.calculateDuty(
          shipment.value,
          shipment.hsCode,
          shipment.originCountry
        )
        const vat = await calculator.calculateVAT(shipment.value + duty.amount, shipment.hsCode)

        results.push({
          ...shipment,
          duty,
          vat,
        })
      }

      return { success: true, data: results }
    } catch (error) {
      console.error('Batch calculation failed:', error)
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

