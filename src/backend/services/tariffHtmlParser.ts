import { load } from 'cheerio'
import type { TariffImportRow } from './tariffDataIngestion'

type TariffHtmlSource = 'boc' | 'tariff-commission'

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim()

const normalizeHsCode = (value: string): string => {
  const digitsOnly = value.replace(/[^0-9]/g, '')
  if (digitsOnly.length === 6) {
    return `${digitsOnly.slice(0, 4)}.${digitsOnly.slice(4)}`
  }

  if (digitsOnly.length === 8) {
    return `${digitsOnly.slice(0, 4)}.${digitsOnly.slice(4, 6)}.${digitsOnly.slice(6)}`
  }

  if (digitsOnly.length === 10) {
    return `${digitsOnly.slice(0, 4)}.${digitsOnly.slice(4, 6)}.${digitsOnly.slice(6, 8)}.${digitsOnly.slice(8)}`
  }

  return value.trim()
}

const looksLikeHsCode = (value: string): boolean => {
  const digitsOnly = value.replace(/[^0-9]/g, '')
  return digitsOnly.length >= 4 && digitsOnly.length <= 12
}

const looksLikeRate = (value: string): boolean => /\d/.test(value) && /%|free|zero/i.test(value)

const getSourceLabel = (source: TariffHtmlSource): string =>
  source === 'tariff-commission' ? 'Tariff Commission' : 'BOC'

const findHeaderIndex = (headers: string[], aliases: string[]): number =>
  headers.findIndex((header) => aliases.some((alias) => header.includes(alias)))

const findNearestHeading = ($: ReturnType<typeof load>, tableEl: Parameters<ReturnType<typeof load>['root']>[0]): string => {
  const table = $(tableEl)
  const caption = normalizeText(table.find('caption').first().text())
  if (caption) {
    return caption
  }

  const previousHeading = table.prevAll('h1, h2, h3, h4, h5, h6, strong').first().text()
  return normalizeText(previousHeading)
}

const buildDedupeKey = (row: TariffImportRow): string => [
  row.hsCode,
  row.scheduleCode || 'MFN',
  row.dutyRate,
  row.vatRate || '',
  row.surchargeRate || '',
  row.effectiveDate || '',
  row.endDate || '',
].join('|')

const extractContextDescription = (value: string): { hsCode?: string; description?: string } => {
  const normalized = normalizeText(value)
  const hsMatch = normalized.match(/(\d{4}(?:\.\d{2}){1,3}|\d{6,10})/)
  if (!hsMatch) {
    return {}
  }

  const hsCode = normalizeHsCode(hsMatch[1])
  const description = normalizeText(normalized.replace(hsMatch[1], '').replace(/^[-:|\s]+/, ''))
  return {
    hsCode,
    description: description || undefined,
  }
}

const parseTariffCommissionMatrix = ($: ReturnType<typeof load>): TariffImportRow[] => {
  const rows: TariffImportRow[] = []

  $('table.tariffSchedule, table[id^="tblyearInput"], table[class*="tariffSchedule"]').each((_index, tableEl) => {
    const titleText = normalizeText(
      $(tableEl).find('tr#tariffTitle, tr[id*="tariffTitle"]').first().text() ||
      findNearestHeading($, tableEl)
    )
    const context = extractContextDescription(titleText)
    if (!context.hsCode) {
      return
    }

    const agreementCells = $(tableEl).find('tr#agreement, tr[id*="agreement"]').first().find('th, td').toArray()
      .map((cell) => normalizeText($(cell).text()))
    const rateCells = $(tableEl).find('tr#rate, tr[id*="rate"]').first().find('th, td').toArray()
      .map((cell) => normalizeText($(cell).text()))
    const remarksCells = $(tableEl).find('tr#remarks, tr[id*="remarks"]').first().find('th, td').toArray()
      .map((cell) => normalizeText($(cell).text()))
    const psrCells = $(tableEl).find('tr#psr, tr[id*="psr"]').first().find('th, td').toArray()
      .map((cell) => normalizeText($(cell).text()))

    if (agreementCells.length < 2 || rateCells.length < 2) {
      return
    }

    for (let cellIndex = 1; cellIndex < Math.min(agreementCells.length, rateCells.length); cellIndex += 1) {
      const scheduleCode = agreementCells[cellIndex]
      const dutyRate = rateCells[cellIndex]

      if (!scheduleCode || !looksLikeRate(dutyRate)) {
        continue
      }

      const notesParts = ['Extracted from Tariff Commission HTML table']
      if (context.description) {
        notesParts.push(`Description: ${context.description}`)
      }
      if (psrCells[cellIndex]) {
        notesParts.push(`PSR: ${psrCells[cellIndex]}`)
      }
      if (remarksCells[cellIndex]) {
        notesParts.push(`Remarks: ${remarksCells[cellIndex]}`)
      }

      rows.push({
        hsCode: context.hsCode,
        scheduleCode,
        description: context.description,
        dutyRate,
        notes: notesParts.join(' | '),
      })
    }
  })

  return rows
}

const parseGenericTableRows = (source: TariffHtmlSource, $: ReturnType<typeof load>): TariffImportRow[] => {
  const extractedRows: TariffImportRow[] = []
  const sourceLabel = getSourceLabel(source)

  $('table').each((_tableIndex, tableEl) => {
    const headers: string[] = []

    $(tableEl).find('thead tr').first().find('th, td').each((_headerIndex, headerCell) => {
      headers.push(normalizeHeader($(headerCell).text()))
    })

    if (headers.length === 0) {
      $(tableEl).find('tr').first().find('th, td').each((_headerIndex, headerCell) => {
        headers.push(normalizeHeader($(headerCell).text()))
      })
    }

    if (headers.length === 0) {
      return
    }

    const hsCodeIndex = findHeaderIndex(headers, ['hscode', 'tariffcode', 'commoditycode', 'code'])
    const descriptionIndex = findHeaderIndex(headers, ['description', 'goodsdescription', 'productdescription', 'commoditydescription'])
    const dutyIndex = findHeaderIndex(headers, ['dutyrate', 'duty'])
    const vatIndex = findHeaderIndex(headers, ['vatrate', 'vat'])
    const surchargeIndex = findHeaderIndex(headers, ['surcharge'])
    const scheduleIndex = findHeaderIndex(headers, ['schedulecode', 'schedule', 'agreement'])
    const effectiveDateIndex = findHeaderIndex(headers, ['effectivedate', 'effective', 'startdate'])
    const endDateIndex = findHeaderIndex(headers, ['enddate', 'expirydate', 'expirationdate'])

    if (hsCodeIndex < 0 || dutyIndex < 0) {
      return
    }

    const heading = findNearestHeading($, tableEl)

    $(tableEl).find('tbody tr, tr').each((rowIndex, rowEl) => {
      const cells = $(rowEl).find('td')
      if (cells.length === 0) {
        return
      }

      const hsCode = normalizeText($(cells[hsCodeIndex]).text())
      if (!looksLikeHsCode(hsCode)) {
        return
      }

      const dutyRate = normalizeText($(cells[dutyIndex]).text())
      if (!dutyRate) {
        return
      }

      const description = descriptionIndex >= 0 ? normalizeText($(cells[descriptionIndex]).text()) : ''
      const vatRate = vatIndex >= 0 ? normalizeText($(cells[vatIndex]).text()) : ''
      const surchargeRate = surchargeIndex >= 0 ? normalizeText($(cells[surchargeIndex]).text()) : ''
      const scheduleCode = scheduleIndex >= 0 ? normalizeText($(cells[scheduleIndex]).text()) : ''
      const effectiveDate = effectiveDateIndex >= 0 ? normalizeText($(cells[effectiveDateIndex]).text()) : ''
      const endDate = endDateIndex >= 0 ? normalizeText($(cells[endDateIndex]).text()) : ''

      const notesParts = [`Extracted from ${sourceLabel} HTML table`]
      if (heading) {
        notesParts.push(`Section: ${heading}`)
      }
      notesParts.push(`Row ${rowIndex + 1}`)

      extractedRows.push({
        hsCode,
        scheduleCode: scheduleCode || undefined,
        description: description || undefined,
        dutyRate,
        vatRate: vatRate || undefined,
        surchargeRate: surchargeRate || undefined,
        effectiveDate: effectiveDate || undefined,
        endDate: endDate || undefined,
        notes: notesParts.join(' | '),
      })
    })
  })

  return extractedRows
}

export function parseTariffHtml(source: TariffHtmlSource, html: string): TariffImportRow[] {
  const $ = load(html)
  const seenRows = new Set<string>()
  const candidateRows = source === 'tariff-commission'
    ? [...parseTariffCommissionMatrix($), ...parseGenericTableRows(source, $)]
    : parseGenericTableRows(source, $)

  return candidateRows.filter((row) => {
    const dedupeKey = buildDedupeKey(row)
    if (seenRows.has(dedupeKey)) {
      return false
    }

    seenRows.add(dedupeKey)
    return true
  })
}
