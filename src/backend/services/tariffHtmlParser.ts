import { load } from 'cheerio'
import type { TariffImportRow } from './tariffDataIngestion'

type TariffHtmlSource = 'boc' | 'tariff-commission'

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim()

const looksLikeHsCode = (value: string): boolean => {
  const digitsOnly = value.replace(/[^0-9]/g, '')
  return digitsOnly.length >= 4 && digitsOnly.length <= 12
}

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

export function parseTariffHtml(source: TariffHtmlSource, html: string): TariffImportRow[] {
  const $ = load(html)
  const extractedRows: TariffImportRow[] = []
  const seenRows = new Set<string>()
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

      const dedupeKey = [hsCode, scheduleCode || 'MFN', dutyRate, vatRate, surchargeRate, effectiveDate, endDate].join('|')
      if (seenRows.has(dedupeKey)) {
        return
      }
      seenRows.add(dedupeKey)

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
