import { getDatabase } from '../db/database'
import { normalizeExactHsCode } from '../../shared/hsLookupQuery'

export interface MetadataAuditResult {
  totalCodes: number
  codesWithMissingChapter: number
  codesWithMissingSection: number
  codesWithMissingSectionName: number
  discrepanciesFound: Array<{
    code: string
    expectedChapter?: string
    actualChapter?: string
    expectedSection?: string
    actualSection?: string
    description: string
  }>
}

/**
 * Audits HS code metadata in the database to ensure consistency.
 * Verifies that chapter/section derivation matches the normalized HS code.
 *
 * @returns Audit report with summary and discrepancies
 */
export async function auditHsMetadata(): Promise<MetadataAuditResult> {
  return new Promise((resolve, reject) => {
    const db = getDatabase()

    const result: MetadataAuditResult = {
      totalCodes: 0,
      codesWithMissingChapter: 0,
      codesWithMissingSection: 0,
      codesWithMissingSectionName: 0,
      discrepanciesFound: [],
    }

    // Query all HS codes
    db.all(
      `SELECT code, chapter_code, section_code, section_name, description FROM hs_codes ORDER BY code`,
      (err: Error | null, rows: any[] | undefined) => {
        if (err) {
          return reject(err)
        }

        if (!rows || rows.length === 0) {
          return resolve(result)
        }

        result.totalCodes = rows.length

        // Audit each row
        rows.forEach((row) => {
          const { code, chapter_code, section_code, section_name, description } = row

          // Check for missing metadata
          if (!chapter_code) {
            result.codesWithMissingChapter++
            result.discrepanciesFound.push({
              code,
              description: `Missing chapter_code for ${code} (${description})`,
            })
          }

          if (!section_code) {
            result.codesWithMissingSection++
            result.discrepanciesFound.push({
              code,
              description: `Missing section_code for ${code} (${description})`,
            })
          }

          if (!section_name) {
            result.codesWithMissingSectionName++
            result.discrepanciesFound.push({
              code,
              description: `Missing section_name for ${code} (${description})`,
            })
          }

          // Verify chapter derivation from normalized code
          try {
            const normalized = normalizeExactHsCode(code)
            if (normalized) {
              // Extract chapter from normalized code: first 2 digits (before any dot)
              const digitsOnly = normalized.replace(/\./g, '')
              const chapterNumber = Number(digitsOnly.slice(0, 2))
              const derivedChapter = String(chapterNumber).padStart(2, '0')

              if (chapter_code && chapter_code !== derivedChapter) {
                result.discrepanciesFound.push({
                  code,
                  expectedChapter: derivedChapter,
                  actualChapter: chapter_code,
                  description: `Chapter code mismatch for ${code}: expected ${derivedChapter}, got ${chapter_code}`,
                })
              }
            }
          } catch (e) {
            result.discrepanciesFound.push({
              code,
              description: `Failed to normalize code ${code}: ${e instanceof Error ? e.message : String(e)}`,
            })
          }
        })

        resolve(result)
      }
    )
  })
}

/**
 * Logs audit results to console
 */
export function logAuditResults(result: MetadataAuditResult): void {
  console.log(`\n╔══════════════════════════════════════════╗`)
  console.log(`║  HS Code Metadata Audit Report           ║`)
  console.log(`╚══════════════════════════════════════════╝`)
  console.log(`Total HS codes: ${result.totalCodes}`)
  console.log(`Missing chapter_code: ${result.codesWithMissingChapter}`)
  console.log(`Missing section_code: ${result.codesWithMissingSection}`)
  console.log(`Missing section_name: ${result.codesWithMissingSectionName}`)
  console.log(`Discrepancies found: ${result.discrepanciesFound.length}`)

  if (result.discrepanciesFound.length > 0) {
    console.log(`\n⚠️  Discrepancies:`)
    result.discrepanciesFound.forEach((d) => {
      console.log(`  • ${d.description}`)
      if (d.expectedChapter && d.actualChapter) {
        console.log(`    Expected chapter: ${d.expectedChapter}, Got: ${d.actualChapter}`)
      }
    })
  } else {
    console.log(`✅ All metadata is consistent!`)
  }
  console.log()
}
