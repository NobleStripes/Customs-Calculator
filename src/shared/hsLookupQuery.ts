export const isCodeLikeQuery = (value: string): boolean => /^[\d.\s]+$/.test(value.trim())
