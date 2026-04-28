export const LOCAL_CATALOG_CONFIDENCE_SCORE = 82
export const FALLBACK_CONFIDENCE_SCORE = 78

const DEFAULT_EXACT_HS_LENGTHS = [6, 8, 10] as const

const removeSeparators = (value: string): string => value.replace(/[^0-9]/g, '')

const formatCanonicalHsCode = (digitsOnlyCode: string): string => {
  if (digitsOnlyCode.length === 6) {
    return `${digitsOnlyCode.slice(0, 4)}.${digitsOnlyCode.slice(4, 6)}`
  }

  if (digitsOnlyCode.length === 8) {
    return `${digitsOnlyCode.slice(0, 4)}.${digitsOnlyCode.slice(4, 6)}.${digitsOnlyCode.slice(6, 8)}`
  }

  if (digitsOnlyCode.length === 10) {
    return `${digitsOnlyCode.slice(0, 4)}.${digitsOnlyCode.slice(4, 6)}.${digitsOnlyCode.slice(6, 8)}.${digitsOnlyCode.slice(8, 10)}`
  }

  return digitsOnlyCode
}

export const normalizeExactHsCode = (
  value: string,
  options?: { allowedDigitLengths?: number[] }
): string | null => {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return null
  }

  const digitsOnlyCode = removeSeparators(trimmed)
  const allowedDigitLengths = options?.allowedDigitLengths || Array.from(DEFAULT_EXACT_HS_LENGTHS)
  if (!allowedDigitLengths.includes(digitsOnlyCode.length)) {
    return null
  }

  return formatCanonicalHsCode(digitsOnlyCode)
}

export const isValidExactHsCode = (
  value: string,
  options?: { allowedDigitLengths?: number[] }
): boolean => Boolean(normalizeExactHsCode(value, options))

type SectionRange = {
  code: string
  name: string
  startChapter: number
  endChapter: number
}

const HS_SECTION_RANGES: SectionRange[] = [
  { code: 'I', name: 'Live Animals; Animal Products', startChapter: 1, endChapter: 5 },
  { code: 'II', name: 'Vegetable Products', startChapter: 6, endChapter: 14 },
  { code: 'III', name: 'Animal or Vegetable Fats and Oils', startChapter: 15, endChapter: 15 },
  { code: 'IV', name: 'Prepared Foodstuffs; Beverages; Tobacco', startChapter: 16, endChapter: 24 },
  { code: 'V', name: 'Mineral Products', startChapter: 25, endChapter: 27 },
  { code: 'VI', name: 'Products of Chemical or Allied Industries', startChapter: 28, endChapter: 38 },
  { code: 'VII', name: 'Plastics, Rubber and Articles Thereof', startChapter: 39, endChapter: 40 },
  { code: 'VIII', name: 'Raw Hides, Leather, and Travel Goods', startChapter: 41, endChapter: 43 },
  { code: 'IX', name: 'Wood and Articles of Wood; Cork', startChapter: 44, endChapter: 46 },
  { code: 'X', name: 'Pulp, Paper and Printed Matter', startChapter: 47, endChapter: 49 },
  { code: 'XI', name: 'Textiles and Textile Articles', startChapter: 50, endChapter: 63 },
  { code: 'XII', name: 'Footwear, Headgear and Umbrellas', startChapter: 64, endChapter: 67 },
  { code: 'XIII', name: 'Articles of Stone, Plaster, Cement, Glass', startChapter: 68, endChapter: 70 },
  { code: 'XIV', name: 'Natural or Cultured Pearls and Precious Stones', startChapter: 71, endChapter: 71 },
  { code: 'XV', name: 'Base Metals and Articles of Base Metal', startChapter: 72, endChapter: 83 },
  { code: 'XVI', name: 'Machinery and Electrical Equipment', startChapter: 84, endChapter: 85 },
  { code: 'XVII', name: 'Vehicles, Aircraft, Vessels', startChapter: 86, endChapter: 89 },
  { code: 'XVIII', name: 'Optical, Medical and Precision Instruments', startChapter: 90, endChapter: 92 },
  { code: 'XIX', name: 'Arms and Ammunition', startChapter: 93, endChapter: 93 },
  { code: 'XX', name: 'Miscellaneous Manufactured Articles', startChapter: 94, endChapter: 96 },
  { code: 'XXI', name: 'Works of Art, Collectors Pieces and Antiques', startChapter: 97, endChapter: 97 },
]

export type HsCodeMetadata = {
  chapterCode: string
  sectionCode: string
  sectionName: string
}

export const getHsCodeMetadata = (value: string): HsCodeMetadata | null => {
  const normalized = normalizeExactHsCode(value)
  if (!normalized) {
    return null
  }

  const digitsOnlyCode = removeSeparators(normalized)
  if (digitsOnlyCode.length < 2) {
    return null
  }

  const chapterNumber = Number(digitsOnlyCode.slice(0, 2))
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1 || chapterNumber > 97) {
    return null
  }

  const section = HS_SECTION_RANGES.find(
    (range) => chapterNumber >= range.startChapter && chapterNumber <= range.endChapter
  )

  if (!section) {
    return null
  }

  return {
    chapterCode: String(chapterNumber).padStart(2, '0'),
    sectionCode: section.code,
    sectionName: section.name,
  }
}

export const isCodeLikeQuery = (value: string): boolean => {
  const trimmedValue = value.trim()
  return trimmedValue.length > 0 && /^[\d.]*\d[\d.]*$/.test(trimmedValue)
}
