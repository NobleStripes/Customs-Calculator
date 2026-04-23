import sqlite3 from 'sqlite3'
import os from 'os'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'

let db: sqlite3.Database | null = null

export const getDbPath = (): string => {
  const baseDataDir = process.env.APPDATA || path.join(os.homedir(), '.customs-calculator')
  const dbDir = path.join(baseDataDir, 'customs-calculator')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'customs.db')
}

export const getDatabase = (): sqlite3.Database => {
  if (!db) {
    const dbPath = getDbPath()
    db = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) console.error('Database connection error:', err)
      else console.log('Connected to SQLite database')
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
  { code: 'ACFTA', displayName: 'ASEAN-China Free Trade Agreement' },
  { code: 'AHKFTA', displayName: 'ASEAN-Hong Kong, China Free Trade Agreement' },
  { code: 'AIFTA', displayName: 'ASEAN-India Free Trade Agreement' },
  { code: 'AJCEPA', displayName: 'ASEAN-Japan Comprehensive Economic Partnership Agreement' },
  { code: 'AKFTA', displayName: 'ASEAN-Korea Free Trade Agreement' },
  { code: 'ATIGA', displayName: 'ASEAN Trade in Goods Agreement' },
  { code: 'PH-EFTA FTA (CHE/LIE)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Switzerland/Liechtenstein)' },
  { code: 'PH-EFTA FTA (ISL)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Iceland)' },
  { code: 'PH-EFTA FTA (NOR)', displayName: 'Philippines-European Free Trade Association Free Trade Agreement (Norway)' },
  { code: 'PH-KR FTA', displayName: 'Philippines-Korea Free Trade Agreement' },
  { code: 'PJEPA', displayName: 'Philippines-Japan Economic Partnership Agreement' },
  { code: 'RCEP', displayName: 'Regional Comprehensive Economic Partnership Agreement' },
] as const

const schema = [
  `CREATE TABLE IF NOT EXISTS hs_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
]

export const initializeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const database = getDatabase()
    let completed = 0

    const executeNextStatement = () => {
      if (completed >= schema.length) {
        ensureTariffRatesSchemaCompatibility(database)
          .then(() => seedInitialData())
          .then(resolve)
          .catch(reject)
        return
      }

      database.run(schema[completed], (err: Error | null) => {
        if (err) {
          console.error('Database initialization error:', err)
          reject(err)
          return
        }
        completed++
        executeNextStatement()
      })
    }

    executeNextStatement()
  })
}

const ensureTariffRatesSchemaCompatibility = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info('tariff_rates')", (err: Error | null, rows: any[]) => {
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

      if (migrationStatements.length === 0) {
        runStatement(database, "UPDATE tariff_rates SET schedule_code = 'MFN' WHERE schedule_code IS NULL OR TRIM(schedule_code) = ''")
          .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_tariff_rates_schedule_code ON tariff_rates(schedule_code)'))
          .then(() => ensureComplianceRulesSchemaCompatibility(database))
          .then(() => cleanupDuplicateSeedRows(database))
          .then(resolve)
          .catch(reject)
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
            runStatement(database, "UPDATE tariff_rates SET schedule_code = 'MFN' WHERE schedule_code IS NULL OR TRIM(schedule_code) = ''")
              .then(() => runStatement(database, 'CREATE INDEX IF NOT EXISTS idx_tariff_rates_schedule_code ON tariff_rates(schedule_code)'))
              .then(() => ensureComplianceRulesSchemaCompatibility(database))
              .then(() => cleanupDuplicateSeedRows(database))
              .then(resolve)
              .catch(reject)
          }
        })
      })
    })
  })
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

const ensureComplianceRulesSchemaCompatibility = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    database.all("PRAGMA table_info('compliance_rules')", (err: Error | null, rows: any[]) => {
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

const insertHSCodes = (database: sqlite3.Database, hsCodesData: any[]): Promise<void> => {
  return new Promise((resolve, _reject) => {
    let count = 0
    const total = hsCodesData.length

    if (total === 0) {
      resolve()
      return
    }

    hsCodesData.forEach((item) => {
      database.run(
        'INSERT OR IGNORE INTO hs_codes (code, description, category) VALUES (?, ?, ?)',
        [item.code, item.description, item.category],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting HS code ${item.code}:`, err)
          }
          count++
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertTariffRates = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, _reject) => {
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
              AND duty_rate = ?
              AND vat_rate = ?
              AND surcharge_rate = ?
              AND effective_date = ?
              AND end_date IS NULL
              AND source_id IS NULL
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
          item.duty_rate,
          item.vat_rate,
          item.surcharge_rate,
          todayDate,
        ],
        (err: Error | null) => {
          if (err) {
            console.error(`Error inserting tariff for ${item.hs_code}:`, err)
          }
          count++
          if (count === total) {
            resolve()
          }
        }
      )
    })
  })
}

const insertTariffSchedules = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, _reject) => {
    let count = 0
    const total = seededTariffSchedules.length

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

const insertComplianceRules = (database: sqlite3.Database): Promise<void> => {
  return new Promise((resolve, _reject) => {
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
          count++
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

  try {
    const hsCodesData = [
      { code: '8471.30', description: 'Automatic data processing machines, portable', category: 'Electronics' },
      { code: '8517.62', description: 'Cellular telephones for mobile networks', category: 'Electronics' },
      { code: '6204.62', description: "Women's suits of synthetic fibers", category: 'Textiles' },
      { code: '6203.42', description: "Men's suits of synthetic fibers", category: 'Textiles' },
      { code: '8704.21', description: 'Trucks, gross vehicle weight not exceeding 5 tonnes', category: 'Vehicles' },
      { code: '8421.23', description: 'Oil or petrol-filters for internal combustion engines', category: 'Vehicles' },
      { code: '8511.10', description: 'Spark plugs for spark-ignition or compression-ignition engines', category: 'Vehicles' },
      { code: '8708.30', description: 'Brakes and servo-brakes; parts thereof, for motor vehicles', category: 'Vehicles' },
      { code: '8708.80', description: 'Suspension shock absorbers for motor vehicles', category: 'Vehicles' },
      { code: '8708.99', description: 'Other parts and accessories of motor vehicles', category: 'Vehicles' },
      { code: '0207.14', description: 'Chicken meat, frozen', category: 'Food' },
      { code: '0406.10', description: 'Fresh cheese (unripened)', category: 'Food' },
      { code: '8544.30', description: 'Insulated electric conductors', category: 'Electronics' },
      { code: '7326.90', description: 'Steel articles, miscellaneous', category: 'Steel' },
      { code: '4418.90', description: 'Wood articles, miscellaneous', category: 'Wood' },
    ]

    await insertHSCodes(database, hsCodesData)
    await insertTariffSchedules(database)
    await insertTariffRates(database)
    await insertComplianceRules(database)

    console.log('Seed data synchronization completed')
  } catch (error) {
    console.error('Data seeding error:', error)
    throw error
  }
}
