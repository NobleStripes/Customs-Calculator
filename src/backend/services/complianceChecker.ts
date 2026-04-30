import { getDatabase } from '../db/database'
import { PHILIPPINE_PORT_CODES, normalizeDestinationPort } from './customsRules'

type ComplianceRuleRow = {
  required_documents?: string | null
  restrictions?: string | null
  special_conditions?: string | null
}

type CategoryRow = {
  category?: string | null
}

type CountRow = {
  count?: number | null
}

type RestrictedProductRow = {
  hs_code_range: string
}

export interface ComplianceRequirement {
  requiredDocuments: string[]
  restrictions: string[]
  warnings: string[]
}

export class ComplianceChecker {
  private db = getDatabase()

  async getRequirements(
    hsCode: string,
    value: number,
    destination: string
  ): Promise<ComplianceRequirement> {
    return new Promise((resolve) => {
      const requiredDocuments: string[] = []
      const restrictions: string[] = []
      const warnings: string[] = []

      const normalizedDest = normalizeDestinationPort(destination)
      if (normalizedDest && !PHILIPPINE_PORT_CODES.has(normalizedDest)) {
        warnings.push('Compliance rules are calibrated for Philippine import — verify requirements for other destinations')
      }

      // Get compliance rules for this HS code
      this.db.get(
        'SELECT required_documents, restrictions, special_conditions FROM compliance_rules WHERE hs_code_range = ?',
        [hsCode],
        async (_err: Error | null, row: ComplianceRuleRow | undefined) => {
          if (row) {
            if (row.required_documents) {
              requiredDocuments.push(...row.required_documents.split(',').map((d: string) => d.trim()))
            }
            if (row.restrictions) {
              restrictions.push(...row.restrictions.split(',').map((r: string) => r.trim()))
            }
            if (row.special_conditions) {
              warnings.push(...row.special_conditions.split(',').map((w: string) => w.trim()))
            }
          }

          // Add default required documents
          if (!requiredDocuments.includes('Commercial Invoice')) {
            requiredDocuments.push('Commercial Invoice')
          }
          if (!requiredDocuments.includes('Bill of Lading/Airway Bill')) {
            requiredDocuments.push('Bill of Lading/Airway Bill')
          }

          // Value-based checks
          // De minimis threshold: Section 423, CMTA (RA 10863) — imports at or below ₱10,000 are
          // exempt from duties and taxes. Above ₱10,000 requires a Packing List.
          if (value > 0 && value <= 10000) {
            warnings.push(
              'De Minimis Entry: Shipments with a declared value at or below ₱10,000 are exempt ' +
              'from customs duties and taxes under Section 423 of the CMTA (RA 10863). ' +
              'Present proof of value to the BOC releasing officer.'
            )
          }

          if (value > 10000) {
            requiredDocuments.push('Packing List')
            warnings.push('High value shipment - expect detailed inspection')
          }

          // Get category for additional rules
          this.db.get('SELECT category FROM hs_codes WHERE code = ? LIMIT 1', [hsCode], (_categoryErr: Error | null, hsRow: CategoryRow | undefined) => {
            const hsCategory = hsRow?.category || 'General'

            if (hsCategory === 'Electronics') {
              requiredDocuments.push("Manufacturer's Specification Sheet")
              // Radio / telecommunications equipment (Chapters 84-85) requires NTC type acceptance
              const hsChapter = hsCode.replace(/[^0-9]/g, '').slice(0, 2)
              if (hsChapter === '84' || hsChapter === '85') {
                requiredDocuments.push('NTC Type Acceptance Certificate')
                restrictions.push(
                  'Radio and telecommunications equipment must carry a valid NTC Type Acceptance Certificate ' +
                  'issued by the National Telecommunications Commission (NTC) per RA 7925.'
                )
              }
            }

            if (hsCategory === 'Food') {
              requiredDocuments.push('Health Certificate')
              requiredDocuments.push('Certificate of Free Sale')
              requiredDocuments.push('FDA Import Clearance / SFD-NRD Certificate of Product Registration')
              restrictions.push('Subject to Bureau of Animal Industry (BAI) clearance')
              restrictions.push(
                'Processed food products require FDA Import Clearance from the Philippine Food and Drug Administration (FDA) ' +
                'under the Food Safety Act of 2013 (RA 10611).'
              )
            }

            if (hsCategory === 'Pharmaceutical' || hsCategory === 'Medical' || hsCategory === 'Cosmetics') {
              requiredDocuments.push('FDA Certificate of Product Registration (CPR)')
              requiredDocuments.push('FDA Import Permit / LTO (License to Operate as Importer)')
              restrictions.push(
                'Pharmaceutical products, medical devices, and cosmetics require FDA clearance (Certificate of Product ' +
                'Registration and Import Permit) issued by the Food and Drug Administration per RA 9711 (FDA Act of 2009).'
              )
            }

            if (hsCategory === 'Textiles') {
              restrictions.push('Subject to Rules of Origin compliance')
              warnings.push('Tariff rate may vary based on country of origin')
            }

            resolve({
              requiredDocuments: [...new Set(requiredDocuments)],
              restrictions: [...new Set(restrictions)],
              warnings: [...new Set(warnings)],
            })
          })
        }
      )
    })
  }

  /**
   * Check if a product is restricted for import
   */
  isRestricted(hsCode: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM compliance_rules WHERE hs_code_range = ? AND restrictions LIKE '%prohibited%'`,
        [hsCode],
        (_err: Error | null, row: CountRow | undefined) => {
          resolve((row?.count || 0) > 0)
        }
      )
    })
  }

  /**
   * Get all restricted product categories
   */
  getRestrictedProducts(): Promise<string[]> {
    return new Promise((resolve) => {
      this.db.all(
        `SELECT DISTINCT hs_code_range FROM compliance_rules WHERE restrictions LIKE '%prohibited%' OR restrictions LIKE '%banned%'`,
        (_err: Error | null, rows: RestrictedProductRow[] | undefined) => {
          resolve(rows?.map((row) => row.hs_code_range) || [])
        }
      )
    })
  }

  /**
   * Validate shipment compliance
   */
  async validateShipment(data: {
    hsCode: string
    value: number
    origin: string
    destination: string
  }): Promise<{
    isCompliant: boolean
    issues: string[]
    warnings: string[]
  }> {
    const issues: string[] = []
    const warnings: string[] = []

    // Check if restricted
    const isRestricted = await this.isRestricted(data.hsCode)
    if (isRestricted) {
      issues.push(`Product with HS code ${data.hsCode} is restricted for import into the Philippines`)
    }

    // Check value threshold
    if (data.value <= 0) {
      issues.push('Product value must be greater than zero')
    }

    // Check origin
    if (!data.origin || data.origin.length !== 3) {
      warnings.push('Invalid origin country code format (expected 3 characters)')
    }

    // Get compliance requirements
    const requirements = await this.getRequirements(data.hsCode, data.value, data.destination)

    if (requirements.restrictions.some((r) => r.toLowerCase().includes('prohibited'))) {
      issues.push('This product is prohibited for import')
    }

    // Check for high-value shipment
    if (data.value > 100000) {
      warnings.push('Very high value shipment - may trigger detailed customs examination')
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
    }
  }

  /**
   * Get required documentation summary
   */
  async getDocumentationSummary(
    hsCode: string,
    value: number
  ): Promise<{
    documents: string[]
    estimatedProcessingTime: string
    notes: string[]
  }> {
    const requirements = await this.getRequirements(hsCode, value, 'MNL')

    let estimatedProcessingTime = '3-5 business days'
    const notes: string[] = []

    if (value > 50000) {
      estimatedProcessingTime = '5-7 business days'
      notes.push('High value shipment may require extended processing')
    }

    return new Promise((resolve) => {
      this.db.get('SELECT category FROM hs_codes WHERE code = ? LIMIT 1', [hsCode], (_err: Error | null, row: CategoryRow | undefined) => {
        const category = row?.category || 'General'

        if (category === 'Food') {
          estimatedProcessingTime = '7-10 business days'
          notes.push('Food items require health certificate verification')
        }

        if (category === 'Electronics') {
          notes.push('Ensure product complies with Philippine radio equipment regulations')
        }

        resolve({
          documents: requirements.requiredDocuments,
          estimatedProcessingTime,
          notes,
        })
      })
    })
  }
}
