import axios from 'axios'
import { TariffDataIngestionService, type TariffImportRow, type HSCatalogImportRow } from './tariffDataIngestion'

export type SourceAdapterInput = {
  href: string
  fileName: string
  contentBase64: string
  source: 'boc' | 'bir' | 'tariff-commission'
  mode: 'incremental' | 'full-sync'
}

export type SourceAdapterOutput = {
  adapterId: string
  sourceType: string
  rows: TariffImportRow[] | HSCatalogImportRow[]
  kind: 'tariff-rates' | 'hs-catalog'
}

export interface SourceAdapter {
  id: string
  canHandle: (input: SourceAdapterInput) => boolean
  parse: (input: SourceAdapterInput, ingestion: TariffDataIngestionService) => Promise<SourceAdapterOutput | null>
}

const getExtension = (fileNameOrUrl: string): string => {
  const clean = fileNameOrUrl.split('?')[0].split('#')[0]
  const part = clean.split('/').pop() || ''
  const idx = part.lastIndexOf('.')
  return idx >= 0 ? part.slice(idx + 1).toLowerCase() : ''
}

const createSourceType = (
  kind: 'tariff-rates' | 'hs-catalog',
  source: 'boc' | 'bir' | 'tariff-commission',
  mode: 'incremental' | 'full-sync',
  method: 'tabular' | 'pdf'
): string => `auto-fetch-${kind}-${source}-${method}${mode === 'full-sync' ? '-full-sync' : ''}`

const tabularTariffAdapter: SourceAdapter = {
  id: 'tabular-tariff',
  canHandle: (input) => {
    const ext = getExtension(input.fileName || input.href)
    return ext === 'csv' || ext === 'xlsx' || ext === 'xls'
  },
  parse: async (input, ingestion) => {
    const tariffRows = await ingestion.parseTariffRows({
      contentBase64: input.contentBase64,
      fileName: input.fileName,
    })
    const preview = ingestion.previewRows(tariffRows)
    if (preview.validRows <= 0) {
      return null
    }

    return {
      adapterId: 'tabular-tariff',
      sourceType: createSourceType('tariff-rates', input.source, input.mode, 'tabular'),
      rows: tariffRows,
      kind: 'tariff-rates',
    }
  },
}

const tabularCatalogAdapter: SourceAdapter = {
  id: 'tabular-hs-catalog',
  canHandle: (input) => {
    const ext = getExtension(input.fileName || input.href)
    return ext === 'csv' || ext === 'xlsx' || ext === 'xls'
  },
  parse: async (input, ingestion) => {
    const catalogRows = await ingestion.parseHSCatalogRows({
      contentBase64: input.contentBase64,
      fileName: input.fileName,
    })

    if (catalogRows.length <= 0) {
      return null
    }

    return {
      adapterId: 'tabular-hs-catalog',
      sourceType: createSourceType('hs-catalog', input.source, input.mode, 'tabular'),
      rows: catalogRows,
      kind: 'hs-catalog',
    }
  },
}

const pdfTariffAdapter: SourceAdapter = {
  id: 'pdf-tariff',
  canHandle: (input) => getExtension(input.fileName || input.href) === 'pdf',
  parse: async (input, ingestion) => {
    const rows = await ingestion.parsePdfTariffRows({
      contentBase64: input.contentBase64,
      sourceUrl: input.href,
    })

    if (rows.length <= 0) {
      return null
    }

    return {
      adapterId: 'pdf-tariff',
      sourceType: createSourceType('tariff-rates', input.source, input.mode, 'pdf'),
      rows,
      kind: 'tariff-rates',
    }
  },
}

export const sourceAdapters: SourceAdapter[] = [
  tabularTariffAdapter,
  tabularCatalogAdapter,
  pdfTariffAdapter,
]

export const downloadSourceFileBase64 = async (href: string): Promise<string> => {
  const response = await axios.get<ArrayBuffer>(href, {
    responseType: 'arraybuffer',
    timeout: 15000,
  })

  return Buffer.from(response.data).toString('base64')
}
