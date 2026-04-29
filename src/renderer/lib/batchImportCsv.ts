export type ShipmentRow = {
  hsCode: string
  scheduleCode: string
  value: number
  freight: number
  insurance: number
  originCountry: string
  destinationPort: string
  currency: string
  declarationType: 'consumption' | 'warehousing' | 'transit'
  containerSize: 'none' | '20ft' | '40ft'
  arrastreWharfage: number
  doxStampOthers: number
}

export const RESULT_CURRENCY = 'PHP'
export const DEFAULT_CURRENCY = 'USD'

export const CSV_TEMPLATE_HEADER =
  'hsCode,value,freight,insurance,scheduleCode,originCountry,destinationPort,currency,declarationType,containerSize,arrastreWharfage,doxStampOthers'
export const CSV_TEMPLATE_EXAMPLE =
  '8471.30,1000,100,25,MFN,CHN,MNL,USD,consumption,20ft,4500,265\n8517.62,2500,200,30,MFN,USA,CEB,USD,transit,40ft,6000,300'

export const EXPECTED_COLUMNS = [
  'hsCode',
  'value',
  'freight',
  'insurance',
  'scheduleCode',
  'originCountry',
  'destinationPort',
  'currency',
  'declarationType',
  'containerSize',
  'arrastreWharfage',
  'doxStampOthers',
] as const

type ExpectedColumn = typeof EXPECTED_COLUMNS[number]

export const COLUMN_ALIASES: Record<ExpectedColumn, string[]> = {
  hsCode: ['hscode', 'hs_code', 'code'],
  value: ['value', 'fobvalue', 'fob'],
  freight: ['freight'],
  insurance: ['insurance'],
  scheduleCode: ['schedulecode', 'schedule_code', 'schedule'],
  originCountry: ['origincountry', 'origin_country', 'origin', 'country'],
  destinationPort: ['destinationport', 'destination_port', 'port', 'destination'],
  currency: ['currency', 'curr'],
  declarationType: ['declarationtype', 'declaration_type', 'declaration'],
  containerSize: ['containersize', 'container_size', 'container'],
  arrastreWharfage: ['arrastrewharfage', 'arrastre', 'wharfage'],
  doxStampOthers: ['doxstampothers', 'dox_stamp', 'dox'],
}

type ParsedBatchCsv = {
  rows: ShipmentRow[]
  columnWarnings: string[]
}

const REQUIRED_COLUMNS: ExpectedColumn[] = ['hsCode', 'value', 'originCountry']

export const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const normalizeAliases = (aliases: string[]): string[] => aliases.map(normalizeHeader)

const parseCsvLines = (input: string): string[][] => {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let insideQuotes = false

  const pushValue = (): void => {
    currentRow.push(currentValue)
    currentValue = ''
  }

  const pushRow = (): void => {
    pushValue()
    if (currentRow.some((value) => value.trim() !== '')) {
      rows.push(currentRow)
    }
    currentRow = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    const nextCharacter = input[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (!insideQuotes && character === ',') {
      pushValue()
      continue
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      pushRow()
      continue
    }

    currentValue += character
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    pushRow()
  }

  return rows
}

const isHeaderRow = (row: string[]): boolean => {
  const normalized = row.map(normalizeHeader)
  return normalized.some((header) =>
    Object.values(COLUMN_ALIASES).some((aliases) => normalizeAliases(aliases).includes(header))
  )
}

const detectMissingColumns = (headerRow: string[]): string[] => {
  const normalized = headerRow.map(normalizeHeader)
  const warnings: string[] = []

  for (const column of REQUIRED_COLUMNS) {
    const aliases = COLUMN_ALIASES[column]
    const normalizedAliases = normalizeAliases(aliases)
    const found = normalized.some((header) => normalizedAliases.includes(header))
    if (!found) {
      warnings.push(`Column "${column}" not found — expected one of: ${aliases.join(', ')}`)
    }
  }

  return warnings
}

const buildHeaderIndex = (headerRow: string[]): Record<ExpectedColumn, number> => {
  const normalized = headerRow.map(normalizeHeader)

  return EXPECTED_COLUMNS.reduce((acc, column) => {
    const normalizedAliases = normalizeAliases(COLUMN_ALIASES[column])
    acc[column] = normalized.findIndex((header) => normalizedAliases.includes(header))
    return acc
  }, {} as Record<ExpectedColumn, number>)
}

const getCell = (row: string[], index: number, fallback = ''): string => {
  if (index < 0 || index >= row.length) {
    return fallback
  }

  return row[index]?.trim() || fallback
}

const createShipmentRow = (values: {
  hsCode: string
  value: string
  freight?: string
  insurance?: string
  scheduleCode?: string
  originCountry: string
  destinationPort?: string
  currency?: string
  declarationType?: string
  containerSize?: string
  arrastreWharfage?: string
  doxStampOthers?: string
}): ShipmentRow | null => {
  const value = Number(values.value)
  const freight = Number(values.freight || 0)
  const insurance = Number(values.insurance || 0)
  const arrastreWharfage = Number(values.arrastreWharfage || 0)
  const doxStampOthers = Number(values.doxStampOthers || 0)

  if (
    !values.hsCode ||
    Number.isNaN(value) ||
    value <= 0 ||
    Number.isNaN(freight) ||
    Number.isNaN(insurance) ||
    !values.originCountry ||
    Number.isNaN(arrastreWharfage) ||
    Number.isNaN(doxStampOthers)
  ) {
    return null
  }

  const declarationType = (values.declarationType || 'consumption').toLowerCase()
  const containerSize = (values.containerSize || '20ft').toLowerCase()

  return {
    hsCode: values.hsCode.trim(),
    scheduleCode: (values.scheduleCode || 'MFN').trim().toUpperCase(),
    value,
    freight,
    insurance,
    originCountry: values.originCountry.trim().toUpperCase(),
    destinationPort: (values.destinationPort || 'MNL').trim().toUpperCase(),
    currency: (values.currency || DEFAULT_CURRENCY).trim().toUpperCase(),
    declarationType:
      declarationType === 'consumption' || declarationType === 'warehousing' || declarationType === 'transit'
        ? declarationType
        : 'consumption',
    containerSize:
      containerSize === '40ft' || containerSize === '20ft' || containerSize === 'none'
        ? containerSize
        : '20ft',
    arrastreWharfage,
    doxStampOthers,
  }
}

const parseHeaderMappedRows = (headerRow: string[], dataRows: string[][]): ShipmentRow[] => {
  const headerIndex = buildHeaderIndex(headerRow)

  return dataRows
    .map((row) =>
      createShipmentRow({
        hsCode: getCell(row, headerIndex.hsCode),
        value: getCell(row, headerIndex.value),
        freight: getCell(row, headerIndex.freight),
        insurance: getCell(row, headerIndex.insurance),
        scheduleCode: getCell(row, headerIndex.scheduleCode),
        originCountry: getCell(row, headerIndex.originCountry),
        destinationPort: getCell(row, headerIndex.destinationPort),
        currency: getCell(row, headerIndex.currency),
        declarationType: getCell(row, headerIndex.declarationType),
        containerSize: getCell(row, headerIndex.containerSize),
        arrastreWharfage: getCell(row, headerIndex.arrastreWharfage),
        doxStampOthers: getCell(row, headerIndex.doxStampOthers),
      })
    )
    .filter((row): row is ShipmentRow => row !== null)
}

const parsePositionalRows = (dataRows: string[][]): ShipmentRow[] =>
  dataRows
    .map((row) =>
      createShipmentRow({
        hsCode: getCell(row, 0),
        value: getCell(row, 1),
        freight: getCell(row, 2),
        insurance: getCell(row, 3),
        scheduleCode: getCell(row, 4),
        originCountry: getCell(row, 5),
        destinationPort: getCell(row, 6),
        currency: getCell(row, 7),
        declarationType: getCell(row, 8),
        containerSize: getCell(row, 9),
        arrastreWharfage: getCell(row, 10),
        doxStampOthers: getCell(row, 11),
      })
    )
    .filter((row): row is ShipmentRow => row !== null)

export const getColumnAliasHelp = (): Array<{ column: ExpectedColumn; aliases: string[] }> =>
  EXPECTED_COLUMNS.map((column) => ({ column, aliases: COLUMN_ALIASES[column] }))

export const parseBatchImportCsv = (input: string): ParsedBatchCsv => {
  const rows = parseCsvLines(input)
  if (rows.length === 0) {
    return { rows: [], columnWarnings: [] }
  }

  const [firstRow, ...remainingRows] = rows
  if (isHeaderRow(firstRow)) {
    return {
      rows: parseHeaderMappedRows(firstRow, remainingRows),
      columnWarnings: detectMissingColumns(firstRow),
    }
  }

  return {
    rows: parsePositionalRows(rows),
    columnWarnings: [],
  }
}