import { describe, it, expect } from 'vitest'
import {
  classifyImport,
  getCertificateOfOriginForm,
  getFtaScheduleCodes,
} from './importClassification'

// ─────────────────────────────────────────────────────────────────────────────
// Chapter-level defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — chapter-level classification', () => {
  it('classifies free goods (chapter with no entry)', () => {
    // Chapter 97 (works of art) has no entry — free
    const result = classifyImport('9701.10.00')
    expect(result.importType).toBe('free')
    expect(result.agencies).toHaveLength(0)
  })

  it('classifies Chapter 01 (live animals) as regulated / BAI', () => {
    const result = classifyImport('0104.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('BAI')
  })

  it('classifies Chapter 03 (fish) as regulated / BFAR', () => {
    const result = classifyImport('0305.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('BFAR')
  })

  it('classifies Chapter 10 (cereals) as regulated with NFA + BPI + FDA', () => {
    const result = classifyImport('1008.90.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('NFA')
    expect(result.agencies).toContain('BPI')
    expect(result.agencies).toContain('FDA')
  })

  it('classifies Chapter 27 (petroleum) as regulated / DOE', () => {
    const result = classifyImport('2710.12.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('DOE')
  })

  it('classifies Chapter 30 (pharmaceuticals) as regulated / FDA', () => {
    const result = classifyImport('3006.30.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('FDA')
  })

  it('classifies Chapter 36 (explosives) as restricted / PNP / AFP', () => {
    const result = classifyImport('3605.00.00')
    expect(result.importType).toBe('restricted')
    expect(result.agencies).toContain('PNP')
    expect(result.agencies).toContain('AFP')
  })

  it('classifies Chapter 44 (wood) as regulated / DENR', () => {
    const result = classifyImport('4407.11.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('DENR')
  })

  it('classifies Chapter 85 (electronics) as regulated / NTC', () => {
    const result = classifyImport('8544.42.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('NTC')
  })

  it('classifies Chapter 87 (vehicles) as regulated / LTO', () => {
    const result = classifyImport('8704.21.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('LTO')
  })

  it('classifies Chapter 88 (aircraft) as regulated / CAAP', () => {
    const result = classifyImport('8802.20.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('CAAP')
  })

  it('classifies Chapter 89 (ships) as regulated / MARINA', () => {
    const result = classifyImport('8901.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('MARINA')
  })

  it('classifies Chapter 93 (firearms) as restricted / PNP / AFP', () => {
    const result = classifyImport('9302.00.00')
    expect(result.importType).toBe('restricted')
    expect(result.agencies).toContain('PNP')
    expect(result.agencies).toContain('AFP')
  })

  it('classifies Chapter 71 (precious metals) as regulated / BSP / MGB', () => {
    const result = classifyImport('7108.12.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('BSP')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Heading-level overrides
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — heading-level overrides', () => {
  it('2844 (radioactive isotopes) is restricted and strategic', () => {
    const result = classifyImport('2844.10.00')
    expect(result.importType).toBe('restricted')
    expect(result.agencies).toContain('PNRI')
    expect(result.agencies).toContain('STMO')
    expect(result.isStrategicTradeGood).toBe(true)
    expect(result.strategicTradeNotes).toBeTruthy()
  })

  it('1209 (seeds for planting) is regulated + VAT-exempt', () => {
    const result = classifyImport('1209.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.isVatExempt).toBe(true)
    expect(result.vatExemptBasis).toContain('NIRC')
    expect(result.agencies).toContain('BPI')
    expect(result.agencies).toContain('FPA')
  })

  it('1006 (rice) is regulated with SRA + NFA and VAT-exempt', () => {
    const result = classifyImport('1006.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('SRA')
    expect(result.agencies).toContain('NFA')
    expect(result.isVatExempt).toBe(true)
  })

  it('3808 (pesticides) is regulated / FPA and VAT-exempt', () => {
    const result = classifyImport('3808.91.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('FPA')
    expect(result.isVatExempt).toBe(true)
    expect(result.vatExemptBasis).toContain('pesticides')
  })

  it('3101–3105 (fertilizers) are regulated / FPA and VAT-exempt', () => {
    for (const code of ['3101.00.00', '3102.10.00', '3103.10.00', '3104.10.00', '3105.10.00']) {
      const result = classifyImport(code)
      expect(result.importType).toBe('regulated')
      expect(result.agencies).toContain('FPA')
      expect(result.isVatExempt).toBe(true)
    }
  })

  it('3004 (medicaments) is regulated / FDA and VAT-exempt', () => {
    const result = classifyImport('3004.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('FDA')
    expect(result.isVatExempt).toBe(true)
  })

  it('3601 (propellant powders) is restricted, strategic, PNP/AFP', () => {
    const result = classifyImport('3601.00.00')
    expect(result.importType).toBe('restricted')
    expect(result.isStrategicTradeGood).toBe(true)
    expect(result.agencies).toContain('PNP')
  })

  it('3602–3604 (explosives/fireworks) are restricted', () => {
    for (const code of ['3602.00.00', '3603.10.00', '3604.10.00']) {
      const result = classifyImport(code)
      expect(result.importType).toBe('restricted')
      expect(result.agencies).toContain('PNP')
    }
  })

  it('8526 (radar equipment) is regulated + strategic with NTC + STMO', () => {
    const result = classifyImport('8526.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.isStrategicTradeGood).toBe(true)
    expect(result.agencies).toContain('NTC')
    expect(result.agencies).toContain('STMO')
  })

  it('8517 (telephone apparatus) is regulated / NTC', () => {
    const result = classifyImport('8517.12.00')
    expect(result.importType).toBe('regulated')
    expect(result.agencies).toContain('NTC')
  })

  it('8703 (passenger vehicles) has used-vehicle warning', () => {
    const result = classifyImport('8703.22.00')
    expect(result.importType).toBe('regulated')
    expect(result.warnings.some(w => w.includes('EO 156'))).toBe(true)
  })

  it('9504 (gambling apparatus) is prohibited', () => {
    const result = classifyImport('9504.30.00')
    expect(result.importType).toBe('prohibited')
    expect(result.warnings.some(w => w.includes('PROHIBITED'))).toBe(true)
  })

  it('0302 (fresh fish) is regulated + VAT-exempt', () => {
    const result = classifyImport('0302.11.00')
    expect(result.importType).toBe('regulated')
    expect(result.isVatExempt).toBe(true)
    expect(result.agencies).toContain('BFAR')
  })

  it('2309 (animal feeds) is regulated + VAT-exempt', () => {
    const result = classifyImport('2309.10.00')
    expect(result.importType).toBe('regulated')
    expect(result.isVatExempt).toBe(true)
    expect(result.agencies).toContain('BAI')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Strategic trade detection
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — strategic trade detection', () => {
  it('returns isStrategicTradeGood=false for ordinary goods', () => {
    const result = classifyImport('6204.61.00') // women's trousers
    expect(result.isStrategicTradeGood).toBe(false)
    expect(result.strategicTradeNotes).toBeUndefined()
  })

  it('9022 (ionising-radiation apparatus) is strategic', () => {
    const result = classifyImport('9022.12.00')
    expect(result.isStrategicTradeGood).toBe(true)
    expect(result.agencies).toContain('PNRI')
    expect(result.agencies).toContain('STMO')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Warnings
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — warnings', () => {
  it('restricted goods carry an advisory warning', () => {
    const result = classifyImport('9301.11.00') // arms
    expect(result.warnings.some(w => w.includes('RESTRICTED'))).toBe(true)
  })

  it('prohibited goods carry a PROHIBITED warning', () => {
    const result = classifyImport('9504.30.00')
    expect(result.warnings.some(w => w.includes('PROHIBITED'))).toBe(true)
  })

  it('strategic trade goods carry an STMO warning', () => {
    const result = classifyImport('2844.10.00')
    expect(result.warnings.some(w => w.includes('STRATEGIC TRADE'))).toBe(true)
  })

  it('FDA pharmaceutical imports carry a CPR reminder', () => {
    const result = classifyImport('3304.10.00') // beauty preparations (ch 33)
    expect(result.warnings.some(w => w.includes('FDA'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Certificate of Origin / FTA
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — Certificate of Origin', () => {
  it('MFN schedule does NOT require a CoO', () => {
    const result = classifyImport('8471.30.00', 'MFN')
    expect(result.requiresCertificateOfOrigin).toBe(false)
    expect(result.certificateOfOriginForm).toBeUndefined()
    expect(result.warnings.some(w => w.includes('CoO'))).toBe(false)
  })

  it('ATIGA schedule requires Form D', () => {
    const result = classifyImport('8471.30.00', 'ATIGA')
    expect(result.requiresCertificateOfOrigin).toBe(true)
    expect(result.certificateOfOriginForm).toBe('Form D')
    expect(result.warnings.some(w => w.includes('Form D'))).toBe(true)
  })

  it('ACFTA schedule requires Form E', () => {
    const result = classifyImport('6204.61.00', 'ACFTA')
    expect(result.requiresCertificateOfOrigin).toBe(true)
    expect(result.certificateOfOriginForm).toBe('Form E')
  })

  it('AJCEPA schedule requires JPEPA Certificate', () => {
    const result = classifyImport('8544.42.00', 'AJCEPA')
    expect(result.requiresCertificateOfOrigin).toBe(true)
    expect(result.certificateOfOriginForm).toContain('JPEPA')
  })

  it('RCEP schedule requires RCEP CoO / Declaration of Origin', () => {
    const result = classifyImport('1701.91.00', 'RCEP')
    expect(result.requiresCertificateOfOrigin).toBe(true)
    expect(result.certificateOfOriginForm).toContain('RCEP')
  })

  it('unknown schedule code does NOT require a CoO (treated as MFN)', () => {
    // An unrecognized/custom schedule should not trigger CoO
    const result = classifyImport('9403.10.00', 'CUSTOM_SCHEDULE')
    expect(result.requiresCertificateOfOrigin).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// agencyFullNames
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyImport — agencyFullNames', () => {
  it('parallel array has same length as agencies', () => {
    const result = classifyImport('0201.10.00') // beef — BAI
    expect(result.agencyFullNames).toHaveLength(result.agencies.length)
  })

  it('BAI maps to correct full name', () => {
    const result = classifyImport('0101.21.00')
    const idx = result.agencies.indexOf('BAI')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(result.agencyFullNames[idx]).toBe('Bureau of Animal Industry')
  })

  it('FDA maps to correct full name', () => {
    const result = classifyImport('1901.10.00') // infant cereal (FDA)
    const idx = result.agencies.indexOf('FDA')
    expect(result.agencyFullNames[idx]).toBe('Food and Drug Administration')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

describe('getCertificateOfOriginForm', () => {
  it('returns Form D for ATIGA', () => {
    expect(getCertificateOfOriginForm('ATIGA')).toBe('Form D')
  })

  it('returns Form E for ACFTA', () => {
    expect(getCertificateOfOriginForm('ACFTA')).toBe('Form E')
  })

  it('returns undefined for MFN', () => {
    expect(getCertificateOfOriginForm('MFN')).toBeUndefined()
  })

  it('returns undefined for unknown schedule', () => {
    expect(getCertificateOfOriginForm('UNKNOWN')).toBeUndefined()
  })
})

describe('getFtaScheduleCodes', () => {
  it('returns an array of non-empty strings', () => {
    const codes = getFtaScheduleCodes()
    expect(codes.length).toBeGreaterThan(0)
    codes.forEach(c => expect(typeof c).toBe('string'))
  })

  it('includes ATIGA and RCEP', () => {
    const codes = getFtaScheduleCodes()
    expect(codes).toContain('ATIGA')
    expect(codes).toContain('RCEP')
  })

  it('does not include MFN', () => {
    expect(getFtaScheduleCodes()).not.toContain('MFN')
  })
})
