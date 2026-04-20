import { contextBridge, ipcRenderer } from 'electron'

export const electronAPI = {
  // Database
  initDB: () => ipcRenderer.invoke('init-db'),

  // Calculations
  calculateDuty: (payload: {
    value: number
    hsCode: string
    originCountry: string
  }) => ipcRenderer.invoke('calculate-duty', payload),

  calculateVAT: (payload: { dutiableValue: number; hsCode: string }) =>
    ipcRenderer.invoke('calculate-vat', payload),

  // HS Code
  searchHSCodes: (query: string) =>
    ipcRenderer.invoke('search-hs-codes', query),

  // Tariff Browser
  getTariffCatalog: (payload: {
    query?: string
    category?: string
    limit?: number
  }) => ipcRenderer.invoke('get-tariff-catalog', payload),

  getTariffCategories: () =>
    ipcRenderer.invoke('get-tariff-categories'),

  // Compliance
  getComplianceRequirements: (payload: {
    hsCode: string
    value: number
    destination: string
  }) => ipcRenderer.invoke('get-compliance-requirements', payload),

  // Currency
  convertCurrency: (payload: {
    amount: number
    fromCurrency: string
    toCurrency: string
  }) => ipcRenderer.invoke('convert-currency', payload),

  // Batch
  batchCalculate: (shipments: any[]) =>
    ipcRenderer.invoke('batch-calculate', shipments),

  // Documents
  generateCalculationDocument: (payload: {
    formData: any
    results: any
  }) => ipcRenderer.invoke('generate-calculation-document', payload),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
