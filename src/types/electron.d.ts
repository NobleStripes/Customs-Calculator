import { IpcRenderer } from 'electron'

export interface ElectronAPI {
  initDB: () => Promise<{ success: boolean; error?: string }>
  calculateDuty: (payload: {
    value: number
    hsCode: string
    originCountry: string
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  calculateVAT: (payload: { dutiableValue: number; hsCode: string }) => Promise<{
    success: boolean
    data?: any
    error?: string
  }>
  searchHSCodes: (query: string) => Promise<{ success: boolean; data?: any; error?: string }>
  getTariffCatalog: (payload: {
    query?: string
    category?: string
    limit?: number
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  getTariffCategories: () => Promise<{ success: boolean; data?: any; error?: string }>
  getComplianceRequirements: (payload: {
    hsCode: string
    value: number
    destination: string
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  convertCurrency: (payload: {
    amount: number
    fromCurrency: string
    toCurrency: string
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  batchCalculate: (shipments: any[]) => Promise<{ success: boolean; data?: any; error?: string }>
  generateCalculationDocument: (payload: {
    formData: any
    results: any
  }) => Promise<{ success: boolean; data?: { path: string }; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
