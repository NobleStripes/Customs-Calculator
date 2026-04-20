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
  previewTariffImport: (payload: {
    csvText?: string
    rows?: any[]
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  importTariffData: (payload: {
    sourceName?: string
    sourceType?: string
    sourceReference?: string
    csvText?: string
    rows?: any[]
    autoApproveThreshold?: number
    forceApprove?: boolean
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  getImportJobs: (payload?: {
    limit?: number
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  getPendingReviewRows: (payload: {
    importJobId: number
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  fetchWebsiteContent: (payload: {
    url: string
    query?: string
    timeoutMs?: number
    maxTextLength?: number
    allowedHosts?: string[]
    allowNonGovernmentHosts?: boolean
  }) => Promise<{ success: boolean; data?: any; error?: string }>
  fetchRegulatoryUpdates: (payload: {
    source: 'boc' | 'bir' | 'tariff-commission'
    query?: string
  }) => Promise<{ success: boolean; data?: any; error?: string }>
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
