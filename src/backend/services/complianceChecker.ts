import { getDatabase } from '../db/database'

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

  /**
   * Get compliance requirements for a product
   */
  async getRequirements(
    hsCode: string,
    value: number,
    _destination: string
  ): Promise<ComplianceRequirement> {
    return new Promise((resolve) => {
      const requiredDocuments: string[] = []
      const restrictions: string[] = []
      const warnings: string[] = []

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
          if (value > 10000) {
            requiredDocuments.push('Packing List')
            warnings.push('High value shipment - expect detailed inspection')
          }

          // Get category for additional rules
          this.db.get('SELECT category FROM hs_codes WHERE code = ? LIMIT 1', [hsCode], (_categoryErr: Error | null, hsRow: CategoryRow | undefined) => {
            const hsCategory = hsRow?.category || 'General'

            if (hsCategory === 'Electronics') {
              requiredDocuments.push("Manufacturer's Specification Sheet")
            }

            if (hsCategory === 'Food') {
              requiredDocuments.push('Health Certificate')
              requiredDocuments.push('Certificate of Free Sale')
              restrictions.push('Subject to Bureau of Animal Industry (BAI) clearance')
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

