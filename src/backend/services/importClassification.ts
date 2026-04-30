/**
 * Philippine Import Classification Engine
 *
 * Classifies goods under the Customs Modernization and Tariff Act (CMTA, RA 10863)
 * into Free, Regulated, Restricted, or Prohibited import categories, and derives
 * related compliance flags: strategic trade goods (STMO), VAT-exempt status, and
 * Certificate of Origin requirement for FTA schedules.
 *
 * References:
 *  - CMTA Sec. 116–118 (Free / Regulated / Restricted / Prohibited)
 *  - BOC CMO 11-2014 (Regulated importations matrix)
 *  - RA 10173 / NIRC Sec. 109 (VAT-exempt imports)
 *  - RA 10697 (Strategic Trade Management Act — STMO clearance)
 *  - PhilGEPS / BOC import permit matrix (2026 revision)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** CMTA import classification category */
export type ImportType = 'free' | 'regulated' | 'restricted' | 'prohibited'

/**
 * Full result of classifying an HS code for Philippine import purposes.
 */
export type ImportClassificationResult = {
  /** CMTA legal bucket */
  importType: ImportType
  /**
   * Acronyms of Philippine regulatory agencies whose prior permit/clearance
   * is required before BOC release.  E.g. ['FDA', 'BPI']
   */
  agencies: string[]
  /** Full names of agencies (parallel array to `agencies`) */
  agencyFullNames: string[]
  /** Human-readable explanation of the classification */
  notes: string
  /** Whether STMO (Strategic Trade Management Office) clearance is required */
  isStrategicTradeGood: boolean
  /** Short reason for STMO flag, if applicable */
  strategicTradeNotes?: string
  /** Whether the goods qualify for VAT exemption / zero-rating under Philippine law */
  isVatExempt: boolean
  /** Statutory basis for VAT exemption, if applicable */
  vatExemptBasis?: string
  /**
   * Whether a Certificate of Origin (CoO) is required to claim preferential duty rate.
   * True whenever the scheduleCode passed is not 'MFN'.
   */
  requiresCertificateOfOrigin: boolean
  /**
   * Form type required for CoO (e.g. 'Form D' for ATIGA, 'Form E' for ACFTA).
   * Only set when requiresCertificateOfOrigin is true.
   */
  certificateOfOriginForm?: string
  /** Advisory warnings that do not block import but require importer attention */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Internal lookup tables
// ---------------------------------------------------------------------------

const AGENCY_FULL_NAMES: Record<string, string> = {
  BAI: 'Bureau of Animal Industry',
  BFAR: 'Bureau of Fisheries and Aquatic Resources',
  BPI: 'Bureau of Plant Industry',
  FDA: 'Food and Drug Administration',
  FPA: 'Fertilizer and Pesticide Authority',
  NFA: 'National Food Authority',
  DOE: 'Department of Energy',
  DENR: 'Dept of Environment and Natural Resources',
  MGB: 'Mines and Geosciences Bureau',
  NTC: 'National Telecommunications Commission',
  LTO: 'Land Transportation Office',
  LTFRB: 'Land Transportation Franchising and Regulatory Board',
  CAAP: 'Civil Aviation Authority of the Philippines',
  MARINA: 'Maritime Industry Authority',
  PNP: 'Philippine National Police',
  AFP: 'Armed Forces of the Philippines',
  BSP: 'Bangko Sentral ng Pilipinas',
  STMO: 'Strategic Trade Management Office',
  PNRI: 'Philippine Nuclear Research Institute',
  DTI: 'Department of Trade and Industry',
  PDEA: 'Philippine Drug Enforcement Agency',
  DOH: 'Department of Health',
}

type ChapterEntry = {
  importType: ImportType
  agencies: string[]
  notes: string
}

/**
 * Chapter-level classification.  Headings override this where more precision
 * is needed (see HEADING_ENTRIES below).
 */
const CHAPTER_ENTRIES: Record<number, ChapterEntry> = {
  // ── Animals & animal products ──────────────────────────────────────────────
  1:  { importType: 'regulated', agencies: ['BAI'], notes: 'Live animals require BAI import permit and health/sanitary certificate' },
  2:  { importType: 'regulated', agencies: ['BAI'], notes: 'Meat and edible meat offal require BAI sanitary and phytosanitary certificate' },
  3:  { importType: 'regulated', agencies: ['BFAR'], notes: 'Fish and aquatic products require BFAR import clearance' },
  4:  { importType: 'regulated', agencies: ['BAI', 'FDA'], notes: 'Dairy and egg products require BAI permit; prepared products require FDA license' },
  5:  { importType: 'regulated', agencies: ['BAI'], notes: 'Animal by-products require BAI import permit' },
  // ── Plant products ─────────────────────────────────────────────────────────
  6:  { importType: 'regulated', agencies: ['BPI'], notes: 'Live plants and cuttings require BPI phytosanitary import permit' },
  7:  { importType: 'regulated', agencies: ['BPI', 'FDA'], notes: 'Fresh vegetables require BPI phytosanitary certificate; processed varieties require FDA registration' },
  8:  { importType: 'regulated', agencies: ['BPI', 'FDA'], notes: 'Fresh fruits require BPI phytosanitary certificate; juices/preserved require FDA LTO' },
  9:  { importType: 'regulated', agencies: ['FDA'], notes: 'Coffee, tea, spices require FDA registration' },
  10: { importType: 'regulated', agencies: ['NFA', 'BPI', 'FDA'], notes: 'Cereals (especially rice) require NFA import permit in addition to BPI and FDA clearances' },
  11: { importType: 'regulated', agencies: ['FDA'], notes: 'Milling products require FDA registration/LTO' },
  12: { importType: 'regulated', agencies: ['BPI', 'FPA'], notes: 'Oil seeds, industrial plants, and seeds for planting require BPI permit; agricultural inputs regulated by FPA' },
  13: { importType: 'regulated', agencies: ['BPI'], notes: 'Lac, gums, resins of plant origin require BPI clearance' },
  14: { importType: 'regulated', agencies: ['BPI', 'DENR'], notes: 'Vegetable plaiting materials require BPI and DENR clearances' },
  // ── Fats, food, beverages ──────────────────────────────────────────────────
  15: { importType: 'regulated', agencies: ['FDA'], notes: 'Animal/vegetable fats and oils require FDA license to operate (LTO) and product registration' },
  16: { importType: 'regulated', agencies: ['FDA'], notes: 'Preparations of meat/fish require FDA LTO and product registration' },
  17: { importType: 'regulated', agencies: ['FDA'], notes: 'Sugars and confectionery require FDA product registration' },
  18: { importType: 'regulated', agencies: ['FDA'], notes: 'Cocoa and cocoa preparations require FDA product registration' },
  19: { importType: 'regulated', agencies: ['FDA'], notes: 'Cereal/flour preparations require FDA LTO and product registration' },
  20: { importType: 'regulated', agencies: ['FDA'], notes: 'Preparations of vegetables/fruits require FDA LTO and product registration' },
  21: { importType: 'regulated', agencies: ['FDA'], notes: 'Miscellaneous food preparations require FDA LTO and product registration' },
  22: { importType: 'regulated', agencies: ['FDA'], notes: 'Beverages require FDA LTO; alcoholic beverages also require BOC accreditation' },
  23: { importType: 'regulated', agencies: ['FDA', 'BAI'], notes: 'Food industry residues; animal feeds require BAI accreditation' },
  24: { importType: 'regulated', agencies: ['FDA'], notes: 'Tobacco products require FDA product notification/registration; excise tax applies' },
  // ── Minerals & fuels ───────────────────────────────────────────────────────
  25: { importType: 'regulated', agencies: ['MGB'], notes: 'Salt, sulphur, earths, and stone require MGB clearance' },
  26: { importType: 'regulated', agencies: ['MGB', 'DENR'], notes: 'Ores, slag, and ash require DENR/MGB clearance' },
  27: { importType: 'regulated', agencies: ['DOE'], notes: 'Petroleum products require DOE import permit and accreditation' },
  // ── Chemicals ─────────────────────────────────────────────────────────────
  28: { importType: 'regulated', agencies: ['FDA', 'DENR'], notes: 'Inorganic chemicals may require FDA/DENR/PNRI clearance; precursor chemicals subject to PDEA reporting' },
  29: { importType: 'regulated', agencies: ['FDA', 'DENR', 'PDEA'], notes: 'Organic chemicals — precursor chemicals and regulated substances require PDEA import authority' },
  30: { importType: 'regulated', agencies: ['FDA'], notes: 'Pharmaceutical products require FDA Certificate of Product Registration (CPR) and License to Operate (LTO)' },
  31: { importType: 'regulated', agencies: ['FPA'], notes: 'Fertilizers require FPA import permit' },
  32: { importType: 'regulated', agencies: ['FDA', 'DENR'], notes: 'Paints and varnishes require FDA registration for consumer products' },
  33: { importType: 'regulated', agencies: ['FDA'], notes: 'Cosmetics and toiletries require FDA cosmetic product notification (CPN)' },
  34: { importType: 'regulated', agencies: ['FDA'], notes: 'Soap, waxes, and polishing preparations require FDA registration' },
  35: { importType: 'regulated', agencies: ['FDA'], notes: 'Protein substances and glues require FDA clearance for food/pharma use' },
  36: { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Explosives and pyrotechnic products are restricted; PNP or AFP import authority required; stringent conditions apply' },
  38: { importType: 'regulated', agencies: ['FDA', 'FPA', 'DENR'], notes: 'Chemical products: pesticides (3808) require FPA registration; hazardous substances require DENR clearance' },
  // ── Wood & paper ──────────────────────────────────────────────────────────
  44: { importType: 'regulated', agencies: ['DENR'], notes: 'Wood and articles of wood require DENR import permit (Forest Management Bureau)' },
  47: { importType: 'regulated', agencies: ['DENR'], notes: 'Pulp of wood requires DENR clearance' },
  // ── Machinery & electronics ───────────────────────────────────────────────
  85: { importType: 'regulated', agencies: ['NTC'], notes: 'Telecommunications and radio equipment require NTC type approval; consumer electronics may require DTI standards compliance' },
  // ── Vehicles & transport ──────────────────────────────────────────────────
  86: { importType: 'regulated', agencies: ['DOTr'], notes: 'Railway rolling stock requires DOTr accreditation' },
  87: { importType: 'regulated', agencies: ['LTO'], notes: 'Motor vehicles require LTO import accreditation; used vehicles subject to age restrictions per EO 156' },
  88: { importType: 'regulated', agencies: ['CAAP'], notes: 'Aircraft and aircraft parts require CAAP airworthiness certification' },
  89: { importType: 'regulated', agencies: ['MARINA'], notes: 'Ships and floating structures require MARINA import clearance' },
  // ── Precious metals ────────────────────────────────────────────────────────
  71: { importType: 'regulated', agencies: ['BSP', 'MGB'], notes: 'Gold, silver, and precious stones: monetary gold requires BSP clearance; non-monetary requires MGB/BOC declaration' },
  // ── Arms & ammunition ──────────────────────────────────────────────────────
  93: { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Firearms, ammunition, and weapons are restricted under RA 10591; PNP/AFP import authority required' },
  // ── Medical devices & optics ──────────────────────────────────────────────
  90: { importType: 'regulated', agencies: ['FDA'], notes: 'Medical devices, optical equipment, and measuring instruments require FDA License to Operate for medical devices' },
  // ── Pesticides heading within Chapter 38 handled at heading level below ───
}

/** Heading-level overrides (first 4 digits of HS code without punctuation). */
type HeadingEntry = ChapterEntry & { vatExempt?: boolean; vatExemptBasis?: string; strategic?: boolean; strategicNotes?: string }

const HEADING_ENTRIES: Record<string, HeadingEntry> = {
  // Radioactive isotopes — restricted + STMO + PNRI
  '2844': {
    importType: 'restricted',
    agencies: ['PNRI', 'STMO'],
    notes: 'Radioactive isotopes and nuclear fuels require PNRI license and STMO clearance; subject to IAEA safeguards',
    strategic: true,
    strategicNotes: 'Controlled under RA 10697 (Strategic Trade Management Act) — nuclear-related materials',
  },
  // Seeds for planting — regulated + VAT-exempt
  '1209': {
    importType: 'regulated',
    agencies: ['BPI', 'FPA'],
    notes: 'Seeds, fruit, and spores for sowing require BPI phytosanitary import permit',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(B) — seeds and seedlings for planting are VAT-exempt',
  },
  // Rice — heavily regulated (NFA monopoly relaxed but license required)
  '1006': {
    importType: 'regulated',
    agencies: ['SRA', 'NFA'],
    notes: 'Rice importation requires SRA/NFA import allocation; subject to tariff-rate quota (TRQ) under RA 11203',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(A) — agricultural food products in original state are VAT-exempt',
  },
  // Corn
  '1005': {
    importType: 'regulated',
    agencies: ['NFA'],
    notes: 'Corn (maize) importation regulated by NFA; subject to tariff-rate quota',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(A) — agricultural food products in original state are VAT-exempt',
  },
  // Sugar — SRA regulated
  '1701': {
    importType: 'regulated',
    agencies: ['SRA'],
    notes: 'Cane sugar importation requires Sugar Regulatory Administration (SRA) import allocation and permit',
  },
  '1702': {
    importType: 'regulated',
    agencies: ['SRA', 'FDA'],
    notes: 'Other sugars require FDA registration; raw sugar allocations require SRA permit',
  },
  // Fertilizers — VAT-exempt
  '3101': { importType: 'regulated', agencies: ['FPA'], notes: 'Animal/vegetable fertilizers require FPA import permit', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(B) — fertilizers are VAT-exempt' },
  '3102': { importType: 'regulated', agencies: ['FPA'], notes: 'Mineral/chemical nitrogenous fertilizers require FPA import permit', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(B) — fertilizers are VAT-exempt' },
  '3103': { importType: 'regulated', agencies: ['FPA'], notes: 'Phosphatic fertilizers require FPA import permit', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(B) — fertilizers are VAT-exempt' },
  '3104': { importType: 'regulated', agencies: ['FPA'], notes: 'Potassic fertilizers require FPA import permit', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(B) — fertilizers are VAT-exempt' },
  '3105': { importType: 'regulated', agencies: ['FPA'], notes: 'Mixed/compound fertilizers require FPA import permit', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(B) — fertilizers are VAT-exempt' },
  // Pesticides — FPA + VAT-exempt
  '3808': {
    importType: 'regulated',
    agencies: ['FPA'],
    notes: 'Insecticides, herbicides, fungicides, and other pesticides require FPA product registration and import permit',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(B) — pesticides are VAT-exempt',
  },
  // Pharmaceuticals / medicines — FDA + possible VAT-exempt
  '3003': {
    importType: 'regulated',
    agencies: ['FDA'],
    notes: 'Medicaments require FDA Certificate of Product Registration (CPR) before importation',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(K) — drugs and medicines prescribed for diabetes, high cholesterol, and hypertension are VAT-exempt; check specific product',
  },
  '3004': {
    importType: 'regulated',
    agencies: ['FDA'],
    notes: 'Medicaments in measured doses require FDA CPR; controlled substances also require PDEA import authority',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(K) — prescription drugs on the DOH essential medicines list are VAT-exempt',
  },
  // Vaccines / biological products
  '3002': {
    importType: 'regulated',
    agencies: ['FDA', 'BAI'],
    notes: 'Vaccines, blood, and immunological products require FDA CPR; veterinary biologicals require BAI permit',
  },
  // Explosives
  '3601': { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Propellent powders require PNP/AFP import authority', strategic: true, strategicNotes: 'Controlled under STMO dual-use chemicals list' },
  '3602': { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Prepared explosives require PNP/AFP import authority', strategic: true, strategicNotes: 'Controlled under STMO dual-use chemicals list' },
  '3603': { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Safety fuses and detonators require PNP/AFP import authority' },
  '3604': { importType: 'restricted', agencies: ['PNP', 'AFP'], notes: 'Fireworks and pyrotechnic articles require PNP import authority; commercial use requires additional permits' },
  // Nuclear detection / research equipment
  '9022': {
    importType: 'regulated',
    agencies: ['PNRI', 'STMO'],
    notes: 'X-ray and ionising-radiation apparatus require PNRI registration; specialized military versions require STMO clearance',
    strategic: true,
    strategicNotes: 'Controlled under RA 10697 — radiation-related equipment',
  },
  // Used vehicles (age restriction under EO 156)
  '8703': {
    importType: 'regulated',
    agencies: ['LTO'],
    notes: 'Passenger vehicles require LTO accreditation; second-hand/used cars are banned under EO 156 (2003) except CAMLDZ/FTZ; new vehicles only for general import',
  },
  // Motorcycles
  '8711': {
    importType: 'regulated',
    agencies: ['LTO'],
    notes: 'Motorcycles require LTO type approval; used motorcycles are subject to age restrictions',
  },
  // Telecommunications equipment (more specific than chapter 85)
  '8517': {
    importType: 'regulated',
    agencies: ['NTC'],
    notes: 'Telephone sets and data transmission apparatus require NTC type acceptance certificate (TAC) prior to importation',
  },
  '8525': {
    importType: 'regulated',
    agencies: ['NTC'],
    notes: 'Transmission apparatus for radio, TV, and telephony requires NTC type acceptance certificate',
  },
  '8526': {
    importType: 'regulated',
    agencies: ['NTC', 'STMO'],
    notes: 'Radar and radio navigation equipment — civilian use requires NTC TAC; military-grade requires STMO clearance',
    strategic: true,
    strategicNotes: 'Dual-use radar/navigation equipment controlled under RA 10697',
  },
  // Gambling apparatus — prohibited (CMTA Sec. 118(f))
  '9504': {
    importType: 'prohibited',
    agencies: [],
    notes: 'Slot machines and gambling apparatus are prohibited from importation under CMTA Sec. 118, unless authorized by PAGCOR for licensed casinos',
  },
  // Drug paraphernalia — prohibited
  '9021': {
    importType: 'prohibited',
    agencies: ['FDA', 'PDEA'],
    notes: 'Drug paraphernalia components are prohibited under RA 9165; legitimate medical devices (e.g. syringes) require FDA clearance',
  },
  // Live animals for agriculture — VAT exempt
  '0101': { importType: 'regulated', agencies: ['BAI'], notes: 'Live horses require BAI import permit and health certificate', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — livestock for agricultural/food production is VAT-exempt' },
  '0102': { importType: 'regulated', agencies: ['BAI'], notes: 'Live cattle require BAI import permit, health certificate, and SPS certificate', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — livestock is VAT-exempt' },
  '0103': { importType: 'regulated', agencies: ['BAI'], notes: 'Live swine require BAI import permit; subject to ASF import restrictions', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — livestock is VAT-exempt' },
  '0105': { importType: 'regulated', agencies: ['BAI'], notes: 'Live poultry require BAI import permit; subject to avian influenza restrictions', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — poultry is VAT-exempt' },
  // Raw fish — VAT exempt
  '0301': { importType: 'regulated', agencies: ['BFAR'], notes: 'Live fish require BFAR import clearance and health certificate', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — agricultural food products in original state are VAT-exempt' },
  '0302': { importType: 'regulated', agencies: ['BFAR', 'FDA'], notes: 'Fresh/chilled fish require BFAR clearance and FDA SPS certificate', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — marine food products in original state are VAT-exempt' },
  '0303': { importType: 'regulated', agencies: ['BFAR', 'FDA'], notes: 'Frozen fish require BFAR clearance', vatExempt: true, vatExemptBasis: 'NIRC Sec. 109(A) — marine food products in original state are VAT-exempt' },
  // Animal feeds
  '2309': {
    importType: 'regulated',
    agencies: ['BAI', 'FPA'],
    notes: 'Preparations used in animal feeding require BAI accreditation as feed manufacturer/importer',
    vatExempt: true,
    vatExemptBasis: 'NIRC Sec. 109(B) — animal feeds are VAT-exempt',
  },
}

/** FTA schedule codes that require a Certificate of Origin (CoO). */
const FTA_COO_FORMS: Record<string, string> = {
  AANZFTA:           'Form AANZFTA',
  ACFTA:             'Form E',
  AHKFTA:            'Form AHK',
  AIFTA:             'Form AI',
  AJCEPA:            'Form AJ / JPEPA Certificate',
  AKFTA:             'Form AK',
  ATIGA:             'Form D',
  'PH-EFTA FTA (CHE/LIE)': 'Certificate of Origin (Movement Certificate EUR.1)',
  'PH-EFTA FTA (ISL)':      'Certificate of Origin (Movement Certificate EUR.1)',
  'PH-EFTA FTA (NOR)':      'Certificate of Origin (Movement Certificate EUR.1)',
  'PH-KR FTA':       'Form PKR',
  PJEPA:             'Certificate of Origin (PJEPA Form)',
  RCEP:              'RCEP Certificate of Origin / Declaration of Origin',
}

// Headings that always carry a "strategic trade" advisory even if not in restricted list
const STRATEGIC_TRADE_HEADINGS = new Set(['2844', '3601', '3602', '3603', '3604', '8526', '9013', '9022'])

// Chapters where goods are generally VAT-exempt in original/unprocessed state
const VAT_EXEMPT_CHAPTERS_RAW = new Set([1, 2, 3, 6, 7, 8, 10, 12])

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const getChapter = (hsCode: string): number => {
  const digits = hsCode.replace(/[^0-9]/g, '')
  return digits.length >= 2 ? Number(digits.slice(0, 2)) : 0
}

const getHeading = (hsCode: string): string => {
  const digits = hsCode.replace(/[^0-9]/g, '')
  return digits.slice(0, 4)
}

const dedup = (arr: string[]): string[] => [...new Set(arr)]

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

/**
 * Classify an HS code for Philippine import compliance.
 *
 * @param hsCode     10-digit AHTN HS code (punctuation tolerated)
 * @param scheduleCode  Active tariff schedule code (e.g. 'MFN', 'ATIGA')
 */
export const classifyImport = (hsCode: string, scheduleCode = 'MFN'): ImportClassificationResult => {
  const chapter = getChapter(hsCode)
  const heading = getHeading(hsCode)

  // Prefer heading-level entry; fall back to chapter
  const headingEntry = HEADING_ENTRIES[heading]
  const chapterEntry = CHAPTER_ENTRIES[chapter]
  const entry = headingEntry ?? chapterEntry

  // Build base result
  const importType: ImportType = entry?.importType ?? 'free'
  const agencies: string[] = dedup(entry?.agencies ?? [])
  const agencyFullNames = agencies.map((a) => AGENCY_FULL_NAMES[a] ?? a)
  const notes = entry?.notes ?? 'Standard free importation — no prior permit required under CMTA'

  // Strategic trade
  const isStrategicTradeGood =
    headingEntry?.strategic === true || STRATEGIC_TRADE_HEADINGS.has(heading)
  const strategicTradeNotes = headingEntry?.strategicNotes

  // VAT exemption: heading override first, then chapter-level raw agricultural
  const isVatExempt =
    headingEntry?.vatExempt === true ||
    (chapterEntry == null && VAT_EXEMPT_CHAPTERS_RAW.has(chapter) && headingEntry == null)
  const vatExemptBasis = headingEntry?.vatExemptBasis ??
    (isVatExempt ? 'NIRC Sec. 109(A) — agricultural or marine food products in original state are VAT-exempt' : undefined)

  // FTA Certificate of Origin
  const normalizedSchedule = scheduleCode.trim().toUpperCase()
  const requiresCertificateOfOrigin = normalizedSchedule !== 'MFN' && FTA_COO_FORMS[scheduleCode] !== undefined
  const certificateOfOriginForm = requiresCertificateOfOrigin ? FTA_COO_FORMS[scheduleCode] : undefined

  // Advisory warnings
  const warnings: string[] = []

  if (importType === 'restricted') {
    warnings.push(
      'RESTRICTED: This product may only be imported under very specific legal conditions. ' +
      'Obtain all listed agency permits before arranging shipment.'
    )
  }

  if (importType === 'prohibited') {
    warnings.push(
      'PROHIBITED: Importation of this product is banned under CMTA Sec. 118. ' +
      'BOC will seize and destroy/confiscate prohibited goods. Consult a licensed Customs Broker.'
    )
  }

  if (isStrategicTradeGood) {
    warnings.push(
      'STRATEGIC TRADE: Requires STMO clearance under RA 10697. ' +
      'Apply for a Strategic Trade Authorization (STA) before shipment.'
    )
  }

  if (requiresCertificateOfOrigin) {
    warnings.push(
      `FTA ${scheduleCode}: Preferential duty rate requires a valid ${certificateOfOriginForm ?? 'Certificate of Origin'} ` +
      'issued by the exporting country\'s authorized body. Goods without a valid CoO will be assessed at MFN rate.'
    )
  }

  if (chapter === 87 && heading === '8703') {
    warnings.push(
      'Used/second-hand passenger vehicles are banned from importation under EO 156 (2003) for the general market. ' +
      'New vehicles only, or within CAMLDZ/FTZ exceptions.'
    )
  }

  if (chapter === 30 || chapter === 33) {
    warnings.push('Ensure FDA Certificate of Product Registration is obtained prior to arrival at port of discharge.')
  }

  return {
    importType,
    agencies,
    agencyFullNames,
    notes,
    isStrategicTradeGood,
    strategicTradeNotes: isStrategicTradeGood ? (strategicTradeNotes ?? 'Subject to STMO Strategic Trade Authorization requirements') : undefined,
    isVatExempt,
    vatExemptBasis: isVatExempt ? vatExemptBasis : undefined,
    requiresCertificateOfOrigin,
    certificateOfOriginForm,
    warnings,
  }
}

/**
 * Returns the Certificate of Origin form name for a given FTA schedule code.
 * Returns undefined if the schedule is MFN or unknown.
 */
export const getCertificateOfOriginForm = (scheduleCode: string): string | undefined =>
  FTA_COO_FORMS[scheduleCode]

/**
 * Returns all FTA schedule codes that require a Certificate of Origin.
 */
export const getFtaScheduleCodes = (): string[] => Object.keys(FTA_COO_FORMS)
