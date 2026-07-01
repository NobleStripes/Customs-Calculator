import { getDatabase } from '../db/database'

/**
 * Represents an HS code mapping between two AHTN versions
 */
export interface HSCodeMapping {
  id?: number
  from_version: string
  to_version: string
  from_code: string
  to_code: string
  mapping_type: string
  notes?: string
  created_at?: string
}

/**
 * Migration result summary
 */
export interface MigrationResult {
  from_version: string
  to_version: string
  total_mappings_created: number
  total_codes_migrated: number
  failed: Array<{ from_code: string; error: string }>
}

/**
 * Creates a mapping between an old HS code and a new HS code during version migration.
 * This enables tracking and auditing of code changes across AHTN versions.
 *
 * @param fromVersion Source AHTN version (e.g., 'AHTN-2022')
 * @param toVersion Target AHTN version (e.g., 'AHTN-2025')
 * @param fromCode Old HS code in source version
 * @param toCode New HS code in target version
 * @param mappingType Type of mapping (e.g., 'split', 'consolidate', 'unchanged')
 * @param notes Optional notes about the mapping
 * @returns Promise<boolean> Success flag
 */
export async function createHsCodeMapping(
  fromVersion: string,
  toVersion: string,
  fromCode: string,
  toCode: string,
  mappingType: string = 'unchanged',
  notes?: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const db = getDatabase()

    db.run(
      `INSERT INTO hs_code_mappings (from_version, to_version, from_code, to_code, mapping_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fromVersion, toVersion, fromCode, toCode, mappingType, notes || null],
      (err: Error | null) => {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      }
    )
  })
}

/**
 * Retrieves all HS code mappings for a specific version transition.
 *
 * @param fromVersion Source AHTN version
 * @param toVersion Target AHTN version
 * @returns Promise<HSCodeMapping[]> Array of mappings
 */
export async function getHsCodeMappings(
  fromVersion: string,
  toVersion: string
): Promise<HSCodeMapping[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase()

    db.all(
      `SELECT id, from_version, to_version, from_code, to_code, mapping_type, notes, created_at
       FROM hs_code_mappings
       WHERE from_version = ? AND to_version = ?
       ORDER BY created_at DESC`,
      [fromVersion, toVersion],
      (err: Error | null, rows: HSCodeMapping[] | undefined) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows || [])
        }
      }
    )
  })
}

/**
 * Migrates HS codes from one AHTN version to another using predefined mappings.
 * This is the main function for version upgrades.
 *
 * @param fromVersion Source AHTN version (e.g., 'AHTN-2022')
 * @param toVersion Target AHTN version (e.g., 'AHTN-2025')
 * @param mappings Map of old code -> new code
 * @returns Promise<MigrationResult> Summary of migration
 */
export async function migrateHsCodesForward(
  fromVersion: string,
  toVersion: string,
  mappings: Map<string, string>
): Promise<MigrationResult> {
  const result: MigrationResult = {
    from_version: fromVersion,
    to_version: toVersion,
    total_mappings_created: 0,
    total_codes_migrated: 0,
    failed: [],
  }

  const db = getDatabase()

  return new Promise((resolve, reject) => {
    // Start transaction
    db.run('BEGIN TRANSACTION', async (err: Error | null) => {
      if (err) {
        return reject(err)
      }

      try {
        // 1. Create all mappings first
        for (const [oldCode, newCode] of mappings.entries()) {
          try {
            await createHsCodeMapping(fromVersion, toVersion, oldCode, newCode, 'version_upgrade', 'AHTN version upgrade')
            result.total_mappings_created++
          } catch (e) {
            result.failed.push({
              from_code: oldCode,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }

        // 2. Update tariff_rates to use new codes (if they exist)
        const updatePromises = Array.from(mappings.entries()).map(([oldCode, newCode]) => {
          return new Promise<void>((resolveUpdate, rejectUpdate) => {
            // First check if new code exists in hs_codes
            db.get(
              'SELECT id FROM hs_codes WHERE code = ?',
              [newCode],
              (err: Error | null, row: any) => {
                if (err) {
                  return rejectUpdate(err)
                }

                if (row) {
                  // New code exists, update references
                  db.run(
                    `UPDATE tariff_rates SET hs_code = ? WHERE hs_code = ?`,
                    [newCode, oldCode],
                    (updateErr: Error | null) => {
                      if (updateErr) {
                        result.failed.push({
                          from_code: oldCode,
                          error: `Failed to update tariff_rates: ${updateErr.message}`,
                        })
                        rejectUpdate(updateErr)
                      } else {
                        result.total_codes_migrated++
                        resolveUpdate()
                      }
                    }
                  )
                } else {
                  // New code doesn't exist, log warning but continue
                  result.failed.push({
                    from_code: oldCode,
                    error: `Target code ${newCode} does not exist in hs_codes; tariff_rates not updated`,
                  })
                  resolveUpdate()
                }
              }
            )
          })
        })

        await Promise.all(updatePromises)

        // Commit transaction
        db.run('COMMIT', (commitErr: Error | null) => {
          if (commitErr) {
            // Rollback on error
            db.run('ROLLBACK', (rollbackErr: Error | null) => {
              reject(rollbackErr || commitErr)
            })
          } else {
            resolve(result)
          }
        })
      } catch (e) {
        db.run('ROLLBACK', (rollbackErr: Error | null) => {
          reject(rollbackErr || e)
        })
      }
    })
  })
}

/**
 * Validates that all new codes exist in the target version's hs_codes table.
 *
 * @param newCodes Array of new HS codes to validate
 * @returns Promise<{ valid: string[]; missing: string[] }>
 */
export async function validateTargetCodes(newCodes: string[]): Promise<{
  valid: string[]
  missing: string[]
}> {
  return new Promise((resolve, reject) => {
    const db = getDatabase()
    const valid: string[] = []
    const missing: string[] = []

    let processed = 0

    if (newCodes.length === 0) {
      return resolve({ valid, missing })
    }

    newCodes.forEach((code) => {
      db.get('SELECT code FROM hs_codes WHERE code = ?', [code], (err: Error | null, row: any) => {
        if (err) {
          reject(err)
        } else if (row) {
          valid.push(code)
        } else {
          missing.push(code)
        }

        processed++
        if (processed === newCodes.length) {
          resolve({ valid, missing })
        }
      })
    })
  })
}
