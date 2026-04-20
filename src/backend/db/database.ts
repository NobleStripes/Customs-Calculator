import sqlite3 from 'sqlite3'
import path from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'

let db: sqlite3.Database | null = null

export const getDbPath = (): string => {
  const dbDir = path.join(app.getPath('userData'), 'customs-calculator')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'customs.db')
}

export const getDatabase = (): sqlite3.Database => {
  if (!db) {
    const dbPath = getDbPath()
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error('Database connection error:', err)
      else console.log('Connected to SQLite database')
    })
  }
  return db
}

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
    duty_rate REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0.12,
    surcharge_rate REAL NOT NULL DEFAULT 0,
    effective_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hs_code) REFERENCES hs_codes(code)
  )`,

  `CREATE TABLE IF NOT EXISTS compliance_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hs_code_range TEXT NOT NULL,
    category TEXT NOT NULL,
    required_documents TEXT,
    restrictions TEXT,
    special_conditions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  `CREATE INDEX IF NOT EXISTS idx_compliance_rules_hs_code ON compliance_rules(hs_code_range)`,
  `CREATE INDEX IF NOT EXISTS idx_calculation_history_hs_code ON calculation_history(hs_code)`,
]

export const initializeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const database = getDatabase()
    let completed = 0

    const executeNextStatement = () => {
      if (completed >= schema.length) {
        seedInitialData().then(resolve).catch(reject)
        return
      }

      database.run(schema[completed], (err) => {
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
      { hs_code: '8471.30', duty_rate: 0.05, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8517.62', duty_rate: 0.03, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '6204.62', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '6203.42', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8704.21', duty_rate: 0.1, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '0207.14', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '0406.10', duty_rate: 0.2, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '8544.30', duty_rate: 0.08, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '7326.90', duty_rate: 0.12, vat_rate: 0.12, surcharge_rate: 0 },
      { hs_code: '4418.90', duty_rate: 0.15, vat_rate: 0.12, surcharge_rate: 0 },
    ]

    const todayDate = new Date().toISOString().split('T')[0]
    let count = 0
    const total = tariffData.length

    tariffData.forEach((item) => {
      database.run(
        'INSERT OR IGNORE INTO tariff_rates (hs_code, duty_rate, vat_rate, surcharge_rate, effective_date) VALUES (?, ?, ?, ?, ?)',
        [item.hs_code, item.duty_rate, item.vat_rate, item.surcharge_rate, todayDate],
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
        'INSERT OR IGNORE INTO compliance_rules (hs_code_range, category, required_documents, restrictions, special_conditions) VALUES (?, ?, ?, ?, ?)',
        [item.hs_code_range, item.category, item.required_documents, item.restrictions, item.special_conditions],
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

  // Check if data already exists
  return new Promise((resolve, reject) => {
    database.get('SELECT COUNT(*) as count FROM hs_codes', async (err, row: any) => {
      if (err) {
        console.error('Error checking database:', err)
        reject(err)
        return
      }

      if (row?.count > 0) {
        console.log('Database already seeded')
        resolve()
        return
      }

      try {
        const hsCodesData = [
          { code: '8471.30', description: 'Automatic data processing machines, portable', category: 'Electronics' },
          { code: '8517.62', description: 'Cellular telephones for mobile networks', category: 'Electronics' },
          { code: '6204.62', description: "Women's suits of synthetic fibers", category: 'Textiles' },
          { code: '6203.42', description: "Men's suits of synthetic fibers", category: 'Textiles' },
          { code: '8704.21', description: 'Trucks, gross vehicle weight not exceeding 5 tonnes', category: 'Vehicles' },
          { code: '0207.14', description: 'Chicken meat, frozen', category: 'Food' },
          { code: '0406.10', description: 'Fresh cheese (unripened)', category: 'Food' },
          { code: '8544.30', description: 'Insulated electric conductors', category: 'Electronics' },
          { code: '7326.90', description: 'Steel articles, miscellaneous', category: 'Steel' },
          { code: '4418.90', description: 'Wood articles, miscellaneous', category: 'Wood' },
        ]

        await insertHSCodes(database, hsCodesData)
        await insertTariffRates(database)
        await insertComplianceRules(database)

        console.log('Initial data seeded successfully')
        resolve()
      } catch (error) {
        console.error('Data seeding error:', error)
        reject(error)
      }
    })
  })
}
