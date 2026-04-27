export const LOCAL_CATALOG_CONFIDENCE_SCORE = 82
export const FALLBACK_CONFIDENCE_SCORE = 78

export const isCodeLikeQuery = (value: string): boolean => {
  const trimmedValue = value.trim()
  return trimmedValue.length > 0 && /^[\d.]*\d[\d.]*$/.test(trimmedValue)
}
