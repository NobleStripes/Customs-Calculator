import sqlite3 from 'sqlite3'
import os from 'os'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getHsCodeMetadata } from '../../shared/hsLookupQuery'
import { getCoreCatalogWithMetadata } from './hsCatalogSeed'

let db: sqlite3.Database | null = null

type TableInfoRow = {
  name: string
}

type HSCodeSeedRow = {
  code: string
  description: string
  category: string
  catalogVersion?: string
  chapterCode?: string
  sectionCode?: string
  sectionName?: string
  metadataSource?: string
  unit?: string
  isRestricted?: boolean
}

export const getDbPath = (): string => {
  // DATA_DIR lets containers (Railway, Render, Fly.io) point SQLite at a persistent volume.
  // Falls back to the existing Windows APPDATA path or ~/.customs-calculator on other OSes.
  const dbDir = process.env.DATA_DIR
    ? process.env.DATA_DIR
    : path.join(process.env.APPDATA || path.join(os.homedir(), '.customs-calculator'), 'customs-calculator')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'customs.db')
}

export const getDatabase = (): sqlite3.Database => {
  if (!db) {
    const dbPath = getDbPath()
    db = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) {
        console.error('Database connection error:', err)
      }
    })
  }
  return db
}

const runStatement = (database: sqlite3.Database, sql: string, params: Array<string | number | null> = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (err: Error | null) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

const seededTariffSchedules = [
  { code: 'MFN', displayName: 'Most-Favored-Nation' },
  { code: 'AANZFTA', displayName: 'ASEAN-Australia-New Zealand Free Trade Agreement' },
  {
    code: 'PH-EFTA FTA (CHE/LIE)',
    displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Switzerland/Liechtenstein)',
  },
  { code: 'ACFTA', displayName: 'ASEAN-China Free Trade Agreement' },
  { code: 'AJCEPA', displayName: 'ASEAN-Japan Comprehensive Economic Partnership Agreement' },
  { code: 'AKFTA', displayName: 'ASEAN-Korea Free Trade Agreement' },
  { code: 'ATIGA', displayName: 'ASEAN Trade in Goods Agreement' },
  { code: 'PJEPA', displayName: 'Philippines-Japan Economic Partnership Agreement' },
  { code: 'RCEP', displayName: 'Regional Comprehensive Economic Partnership Agreement' },
]

const schema = [
  `CREATE TABLE IF NOT EXISTS hs_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    catalog_version TEXT NOT NULL DEFAULT 'AHTN-2022',
    chapter_code TEXT,
    section_code TEXT,
    section_name TEXT,
    metadata_source TEXT NOT NULL DEFAULT 'seed',
    unit TEXT,
    is_restricted INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hs_catalog_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_code TEXT UNIQUE NOT NULL,
    effective_date DATE,
    retired_date DATE,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hs_code_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version TEXT NOT NULL,
    to_version TEXT NOT NULL,
    from_code TEXT NOT NULL,
    to_code TEXT NOT NULL,
    mapping_type TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tax_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    legal_basis TEXT,
    is_schedule_based INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tax_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code TEXT NOT NULL,
    tax_type_id INTEGER NOT NULL,
    schedule_code TEXT,
    origin_country TEXT,
    declaration_type TEXT,
    min_value REAL,
    max_value REAL,
    notes TEXT,
    effective_date DATE NOT NULL,
    end_date DATE,
    import_status TEXT NOT NULL DEFAULT 'approved',
    source_id INTEGER,
    confidence_score INTEGER NOT NULL DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hs_code) REFERENCES hs_codes(code),
    FOREIGN KEY (tax_type_id) REFERENCES tax_types(id),
    FOREIGN KEY (source_id) REFERENCES tariff_sources(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tax_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_rule_id INTEGER NOT NULL,
    rate REAL NOT NULL,
    rate_type TEXT NOT NULL DEFAULT 'percentage',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_rule_id) REFERENCES tax_rules(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tariff_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code TEXT NOT NULL,
    schedule_code TEXT NOT NULL DEFAULT 'MFN',
    duty_rate REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0.12,
    surcharge_rate REAL NOT NULL DEFAULT 0,
    effective_date DATE NOT NULL,
    end_date DATE,
    notes TEXT,
    source_id INTEGER,
    confidence_score INTEGER NOT NULL DEFAULT 100,
    import_status TEXT NOT NULL DEFAULT 'approved',
    last_modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hs_code) REFERENCES hs_codes(code),
    FOREIGN KEY (source_id) REFERENCES tariff_sources(id)
  )`,
  `CREATE TABLE IF NOT EXISTS compliance_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code_range TEXT NOT NULL,
    category TEXT NOT NULL,
    required_documents TEXT,
    restrictions TEXT,
    special_conditions TEXT,
    source_id INTEGER,
    effective_date DATE,
    end_date DATE,
    confidence_score INTEGER NOT NULL DEFAULT 100,
    import_status TEXT NOT NULL DEFAULT 'approved',
    last_modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tariff_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_reference TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    imported_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tariff_schedules (
    code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS import_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    pending_review_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (source_id) REFERENCES tariff_sources(id)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_change_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code TEXT NOT NULL,
    old_duty_rate REAL,
    new_duty_rate REAL,
    old_vat_rate REAL,
    new_vat_rate REAL,
    old_surcharge_rate REAL,
    new_surcharge_rate REAL,
    reason TEXT,
    source_id INTEGER,
    import_job_id INTEGER,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES tariff_sources(id),
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS extracted_rows_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    import_job_id INTEGER NOT NULL,
    row_number INTEGER,
    raw_payload TEXT NOT NULL,
    normalized_payload TEXT,
    confidence_score INTEGER NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    review_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY (source_id) REFERENCES tariff_sources(id),
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS calculation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code TEXT NOT NULL,
    value REAL NOT NULL,
    currency TEXT NOT NULL,
    duty_amount REAL NOT NULL,
    vat_amount REAL NOT NULL,
    total_landed_cost REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    currency_pair TEXT UNIQUE NOT NULL,
    rate REAL NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hs_codes_category ON hs_codes(category)`,
  `CREATE INDEX IF NOT EXISTS idx_tariff_rates_hs_code ON tariff_rates(hs_code)`,
  `CREATE INDEX IF NOT EXISTS idx_tariff_rates_effective_date ON tariff_rates(effective_date)`,
  `CREATE INDEX IF NOT EXISTS idx_tariff_rates_import_status ON tariff_rates(import_status)`,
  `CREATE INDEX IF NOT EXISTS idx_tariff_rates_source_id ON tariff_rates(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_compliance_rules_hs_code ON compliance_rules(hs_code_range)`,
  `CREATE INDEX IF NOT EXISTS idx_calculation_history_hs_code ON calculation_history(hs_code)`,
  `CREATE INDEX IF NOT EXISTS idx_tariff_sources_type ON tariff_sources(source_type)`,
  `CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_import_jobs_started_at ON import_jobs(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_review_queue_status ON extracted_rows_review(review_status)`,
  `CREATE INDEX IF NOT EXISTS idx_review_queue_job_id ON extracted_rows_review(import_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_change_audit_hs_code ON rate_change_audit(hs_code)`,
  `CREATE INDEX IF NOT EXISTS idx_hs_code_mappings_from_version ON hs_code_mappings(from_version)`,
  `CREATE INDEX IF NOT EXISTS idx_hs_code_mappings_to_version ON hs_code_mappings(to_version)`,
]

const backfillHsMetadata = async (database: sqlite3.Database): Promise<void> => {
  const rows = await new Promise<Array<{ code: string }>>((resolve, reject) => {
    database.all(
      'SELECT code FROM hs_codes WHERE chapter_code IS NULL OR section_code IS NULL OR section_name IS NULL',
      (err: Error | null, queryRows: Array<{ code: string }>) => {
      if (err) {
        reject(err)
        return
      }
      resolve(queryRows || [])
    })
  })

  for (const row of rows) {
    const metadata = getHsCodeMetadata(row.code)
    if (!metadata) {
      continue
    }

    await runStatement(
      database,
      `
        UPDATE hs_codes
        SET chapter_code = ?, section_code = ?, section_name = ?
        WHERE code = ?
      `,
      [metadata.chapterCode, metadata.sectionCode, metadata.sectionName, row.code]
    )
  }
}

const ensureHsCodesSchemaCompatibility = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info('hs_codes')", (err: Error | null, rows: TableInfoRow[]) => {
      if (err) {
        reject(err)
        return
      }

      const existingColumns = new Set((rows || []).map((row) => row.name))
      const migrationStatements: string[] = []

      if (!existingColumns.has('chapter_code')) {
        migrationStatements.push('ALTER TABLE hs_codes ADD COLUMN chapter_code TEXT')
      }
      if (!existingColumns.has('catalog_version')) {
        migrationStatements.push("ALTER TABLE hs_codes ADD COLUMN catalog_version TEXT NOT NULL DEFAULT 'AHTN-2022'")
      }
      if (!existingColumns.has('section_code')) {
        migrationStatements.push('ALTER TABLE hs_codes ADD COLUMN section_code TEXT')
      }
      if (!existingColumns.has('section_name')) {
        migrationStatements.push('ALTER TABLE hs_codes ADD COLUMN section_name TEXT')
      }
      if (!existingColumns.has('metadata_source')) {
        migrationStatements.push("ALTER TABLE hs_codes ADD COLUMN metadata_source TEXT NOT NULL DEFAULT 'seed'")
      }
      if (!existingColumns.has('unit')) {
        migrationStatements.push('ALTER TABLE hs_codes ADD COLUMN unit TEXT')
      }
      if (!existingColumns.has('is_restricted')) {
        migrationStatements.push('ALTER TABLE hs_codes ADD COLUMN is_restricted INTEGER NOT NULL DEFAULT 0')
      }

      const applyBackfillAndIndexes = () => {
        backfillHsMetadata(database)
          .then(() => runStatement(database, "UPDATE hs_codes SET catalog_version = 'AHTN-2022' WHERE catalog_version IS NULL OR TRIM(catalog_version) = ''"))
          .then(() => runStatement(database, "UPDATE hs_codes SET metadata_source = 'seed' WHERE metadata_source IS NULL OR TRIM(metadata_source) = ''"))
          .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_hs_codes_chapter_code ON hs_codes(chapter_code)'))
          .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_hs_codes_section_code ON hs_codes(section_code)'))
          .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_hs_codes_catalog_version ON hs_codes(catalog_version)'))
          .then(resolve)
          .catch(reject)
      }

      if (migrationStatements.length === 0) {
        applyBackfillAndIndexes()
        return
      }

      let completed = 0
      migrationStatements.forEach((statement) => {
        database.run(statement, (migrationErr: Error | null) => {
          if (migrationErr) {
            reject(migrationErr)
            return
          }
          completed += 1
          if (completed === migrationStatements.length) {
            applyBackfillAndIndexes()
          }
        })
      })
    })
  })
}

const ensureComplianceRulesSchemaCompatibility = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info('compliance_rules')", (err: Error | null, rows: TableInfoRow[]) => {
      if (err) {
        reject(err)
        return
      }

      const existingColumns = new Set((rows || []).map((row) => row.name))
      const migrationStatements: string[] = []

      if (!existingColumns.has('source_id')) {
        migrationStatements.push('ALTER TABLE compliance_rules ADD COLUMN source_id INTEGER')
      }
      if (!existingColumns.has('effective_date')) {
        migrationStatements.push('ALTER TABLE compliance_rules ADD COLUMN effective_date DATE')
      }
      if (!existingColumns.has('end_date')) {
        migrationStatements.push('ALTER TABLE compliance_rules ADD COLUMN end_date DATE')
      }
      if (!existingColumns.has('confidence_score')) {
        migrationStatements.push('ALTER TABLE compliance_rules ADD COLUMN confidence_score INTEGER NOT NULL DEFAULT 100')
      }
      if (!existingColumns.has('import_status')) {
        migrationStatements.push("ALTER TABLE compliance_rules ADD COLUMN import_status TEXT NOT NULL DEFAULT 'approved'")
      }
      if (!existingColumns.has('last_modified_at')) {
        migrationStatements.push('ALTER TABLE compliance_rules ADD COLUMN last_modified_at DATETIME')
      }

      if (migrationStatements.length === 0) {
        resolve()
        return
      }

      let completed = 0
      migrationStatements.forEach((statement) => {
        database.run(statement, (migrationErr: Error | null) => {
          if (migrationErr) {
            reject(migrationErr)
            return
          }
          completed += 1
          if (completed === migrationStatements.length) {
            resolve()
          }
        })
      })
    })
  })
}

const cleanupTariffVersionCollisions = async (database: sqlite3.Database): Promise<void> => {
  await runStatement(
    database,
    `
      DELETE FROM tariff_rates
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM tariff_rates
        GROUP BY hs_code, COALESCE(schedule_code, 'MFN'), effective_date, COALESCE(import_status, 'approved')
      )
    `
  )
}

const cleanupDuplicateSeedRows = async (database: sqlite3.Database): Promise<void> => {
  await runStatement(
    database,
    `
      DELETE FROM tariff_rates
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM tariff_rates
        GROUP BY
          hs_code,
          IFNULL(schedule_code, 'MFN'),
          duty_rate,
          vat_rate,
          surcharge_rate,
          effective_date,
          IFNULL(end_date, ''),
          IFNULL(notes, ''),
          IFNULL(source_id, -1),
          confidence_score,
          IFNULL(import_status, '')
      )
    `
  )

  await runStatement(
    database,
    `
      DELETE FROM compliance_rules
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM compliance_rules
        GROUP BY
          hs_code_range,
          category,
          IFNULL(required_documents, ''),
          IFNULL(restrictions, ''),
          IFNULL(special_conditions, ''),
          IFNULL(source_id, -1),
          IFNULL(effective_date, ''),
          IFNULL(end_date, ''),
          confidence_score,
          IFNULL(import_status, '')
      )
    `
  )
}

const applyHardeningIndexes = async (database: sqlite3.Database): Promise<void> => {
  await runStatement(
    database,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tariff_rates_version
      ON tariff_rates (
        hs_code,
        COALESCE(schedule_code, 'MFN'),
        effective_date,
        COALESCE(import_status, 'approved')
      )
    `
  )
}

export const ensureTariffRatesSchemaCompatibility = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info('tariff_rates')", (err: Error | null, rows: TableInfoRow[]) => {
      if (err) {
        reject(err)
        return
      }

      const existingColumns = new Set((rows || []).map((row) => row.name))
      const migrationStatements: string[] = []

      if (!existingColumns.has('schedule_code')) {
        migrationStatements.push("ALTER TABLE tariff_rates ADD COLUMN schedule_code TEXT NOT NULL DEFAULT 'MFN'")
      }
      if (!existingColumns.has('end_date')) {
        migrationStatements.push('ALTER TABLE tariff_rates ADD COLUMN end_date DATE')
      }
      if (!existingColumns.has('notes')) {
        migrationStatements.push('ALTER TABLE tariff_rates ADD COLUMN notes TEXT')
      }
      if (!existingColumns.has('source_id')) {
        migrationStatements.push('ALTER TABLE tariff_rates ADD COLUMN source_id INTEGER')
      }
      if (!existingColumns.has('confidence_score')) {
        migrationStatements.push('ALTER TABLE tariff_rates ADD COLUMN confidence_score INTEGER NOT NULL DEFAULT 100')
      }
      if (!existingColumns.has('import_status')) {
        migrationStatements.push("ALTER TABLE tariff_rates ADD COLUMN import_status TEXT NOT NULL DEFAULT 'approved'")
      }
      if (!existingColumns.has('last_modified_at')) {
        migrationStatements.push('ALTER TABLE tariff_rates ADD COLUMN last_modified_at DATETIME')
      }

      const afterMigrations = () => {
        runStatement(database, "UPDATE tariff_rates SET schedule_code = 'MFN' WHERE schedule_code IS NULL OR TRIM(schedule_code) = ''")
          .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_tariff_rates_schedule_code ON tariff_rates(schedule_code)'))
          .then(() => ensureComplianceRulesSchemaCompatibility(database))
          .then(() => cleanupDuplicateSeedRows(database))
          .then(() => cleanupTariffVersionCollisions(database))
          .then(() => applyHardeningIndexes(database))
          .then(resolve)
          .catch(reject)
      }

      if (migrationStatements.length === 0) {
        afterMigrations()
        return
      }

      let completed = 0
      migrationStatements.forEach((statement) => {
        database.run(statement, (migrationErr: Error | null) => {
          if (migrationErr) {
            reject(migrationErr)
            return
          }
          completed += 1
          if (completed === migrationStatements.length) {
            afterMigrations()
          }
        })
      })
    })
  })
}

const insertHSCodes = (database: sqlite3.Database, hsCodesData: HSCodeSeedRow[]): Promise<void> => {
  return new Promise((resolve) => {
    let count = 0
    const total = hsCodesData.length
    if (total === 0) {
      resolve()
      return
    }

    hsCodesData.forEach((item) => {
      database.run(
        `
          INSERT OR IGNORE INTO hs_codes
          (code, description, category, catalog_version, chapter_code, section_code, section_name, metadata_source, unit, is_restricted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.code,
          item.description,
          item.category,
          item.catalogVersion || 'AHTN-2022',
          item.chapterCode || null,
          item.sectionCode || null,
          item.sectionName || null,
          item.metadataSource || 'seed',
          item.unit || null,
          item.isRestricted ? 1 : 0,
        ],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting HS code ${item.code}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertCatalogVersions = (database: sqlite3.Database): Promise<void> => {
  const versions = [
    {
      versionCode: 'AHTN-2022',
      effectiveDate: '2022-01-01',
      status: 'active',
      notes: 'ASEAN Harmonized Tariff Nomenclature 2022 baseline',
    },
  ]

  return new Promise((resolve) => {
    let count = 0
    const total = versions.length
    if (total === 0) {
      resolve()
      return
    }

    versions.forEach((version) => {
      database.run(
        `
          INSERT INTO hs_catalog_versions (version_code, effective_date, status, notes)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(version_code) DO UPDATE SET
            effective_date = excluded.effective_date,
            status = excluded.status,
            notes = excluded.notes
        `,
        [version.versionCode, version.effectiveDate, version.status, version.notes],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting catalog version ${version.versionCode}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertTariffSchedules = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve) => {
    let count = 0
    const total = seededTariffSchedules.length
    if (total === 0) {
      resolve()
      return
    }

    seededTariffSchedules.forEach((item) => {
      database.run(
        `
          INSERT INTO tariff_schedules (code, display_name, is_active)
          VALUES (?, ?, 1)
          ON CONFLICT(code) DO UPDATE SET
            display_name = excluded.display_name,
            is_active = 1
        `,
        [item.code, item.displayName],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting tariff schedule ${item.code}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertTaxTypes = (database: sqlite3.Database): Promise<void> => {
  const taxTypes = [
    { code: 'DUTY', display_name: 'Customs Duty', description: 'Standard import duty', legal_basis: 'Tariff Schedules', is_schedule_based: 1 },
    { code: 'VAT', display_name: 'Value-Added Tax', description: 'VAT on imports', legal_basis: 'NIRC/BIR', is_schedule_based: 1 },
    { code: 'EXCISE', display_name: 'Excise Tax', description: 'Excise on specific goods', legal_basis: 'NIRC/BIR', is_schedule_based: 0 },
    { code: 'SAFEGUARD', display_name: 'Safeguard Duty', description: 'Safeguard measures', legal_basis: 'Safeguard Measures Act', is_schedule_based: 0 },
    { code: 'ANTI_DUMPING', display_name: 'Anti-Dumping Duty', description: 'Anti-dumping measures', legal_basis: 'Anti-Dumping Act', is_schedule_based: 0 },
  ]

  return new Promise((resolve) => {
    let count = 0
    const total = taxTypes.length

    taxTypes.forEach((item) => {
      database.run(
        `INSERT INTO tax_types (code, display_name, description, legal_basis, is_schedule_based) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           display_name = excluded.display_name,
           description = excluded.description,
           legal_basis = excluded.legal_basis,
           is_schedule_based = excluded.is_schedule_based`,
        [item.code, item.display_name, item.description, item.legal_basis, item.is_schedule_based],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting tax type ${item.code}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertTariffRates = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve) => {
    const tariffData = [
      { hs_code: '8471.30', schedule_code: 'MFN', duty_rate: 0.05, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8517.62', schedule_code: 'MFN', duty_rate: 0.03, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '6204.62', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '6203.42', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8704.21', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8421.23', schedule_code: 'MFN', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8511.10', schedule_code: 'MFN', duty_rate: 0.07, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8708.30', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8708.80', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8708.99', schedule_code: 'MFN', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '0207.14', schedule_code: 'MFN', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '0406.10', schedule_code: 'MFN', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8544.30', schedule_code: 'MFN', duty_rate: 0.08, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '7326.90', schedule_code: 'MFN', duty_rate: 0.12, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '4418.90', schedule_code: 'MFN', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0 },
    ]

    const todayDate = new Date().toISOString().split('T')[0]
    let count = 0
    const total = tariffData.length

    tariffData.forEach((item) => {
      database.run(
        `
          INSERT INTO tariff_rates (hs_code, schedule_code, duty_rate, vat_rate, surcharge_rate, effective_date)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM tariff_rates
            WHERE hs_code = ?
              AND COALESCE(schedule_code, 'MFN') = ?
              AND effective_date = ?
              AND (import_status = 'approved' OR import_status IS NULL)
          )
        `,
        [
          item.hs_code,
          item.schedule_code,
          item.duty_rate,
          item.vat_rate,
          item.surcharge_rate,
          todayDate,
          item.hs_code,
          item.schedule_code,
          todayDate,
        ],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting tariff for ${item.hs_code}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertComplianceRules = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve) => {
    const complianceData = [
      {
        hs_code_range: '8471.30',
        category: 'Electronics',
        required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
        restrictions: 'None',
        special_conditions: 'None',
      },
      {
        hs_code_range: '8517.62',
        category: 'Electronics',
        required_documents: 'Commercial Invoice, Bill of Lading, NTC Certification',
        restrictions: 'Must comply with Philippine radio regulations',
        special_conditions: 'NTC Type Approval Certificate Required',
      },
      {
        hs_code_range: '6204.62',
        category: 'Textiles',
        required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
        restrictions: 'Subject to Rules of Origin - must meet COO requirements',
        special_conditions: 'Possible safeguard duties may apply',
      },
      {
        hs_code_range: '8421.23',
        category: 'Vehicles',
        required_documents: 'Commercial Invoice, Bill of Lading, Certificate of Origin',
        restrictions: 'None',
        special_conditions: 'Verify compatibility with declared vehicle model when applicable',
      },
      {
        hs_code_range: '0207.14',
        category: 'Food',
        required_documents: 'Commercial Invoice, Bill of Lading, Health Certificate, BOC Permit',
        restrictions: 'Requires Bureau of Animal Industry (BAI) clearance',
        special_conditions: 'Cold storage monitoring required during transit',
      },
    ]

    let count = 0
    const total = complianceData.length

    complianceData.forEach((item) => {
      database.run(
        `
          INSERT INTO compliance_rules (hs_code_range, category, required_documents, restrictions, special_conditions)
          SELECT ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM compliance_rules
            WHERE hs_code_range = ?
              AND category = ?
              AND IFNULL(required_documents, '') = ?
              AND IFNULL(restrictions, '') = ?
              AND IFNULL(special_conditions, '') = ?
              AND source_id IS NULL
              AND effective_date IS NULL
              AND end_date IS NULL
              AND (import_status = 'approved' OR import_status IS NULL)
          )
        `,
        [
          item.hs_code_range,
          item.category,
          item.required_documents,
          item.restrictions,
          item.special_conditions,
          item.hs_code_range,
          item.category,
          item.required_documents,
          item.restrictions,
          item.special_conditions,
        ],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting compliance rule for ${item.hs_code_range}:`, err)
          }
          count += 1
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

export const seedInitialData = async (): Promise<void> => {
  const database = getDatabase()

  const hsCodesData = getCoreCatalogWithMetadata()

  await insertCatalogVersions(database)
  await insertHSCodes(database, hsCodesData)
  await insertTariffSchedules(database)
  await insertTaxTypes(database)
  await insertTariffRates(database)
  await insertComplianceRules(database)
}

export const initializeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const database = getDatabase()
    let completed = 0

    const executeNextStatement = () => {
      if (completed >= schema.length) {
        ensureHsCodesSchemaCompatibility(database)
          .then(() => ensureTariffRatesSchemaCompatibility(database))
          .then(() => seedInitialData())
          .then(resolve)
          .catch(reject)
        return
      }

      database.run(schema[completed], (err: Error | null) => {
        if (err) {
          reject(err)
          return
        }
        completed += 1
        executeNextStatement()
      })
    }

    executeNextStatement()
  })
}
