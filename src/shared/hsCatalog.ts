import snapshot from './data/ahtn2022.json'
import { getHsCodeMetadata } from './hsLookupQuery'

export const HS_CATALOG_SOURCE = {
  catalogVersion: snapshot.catalogVersion,
  sourceUrl: snapshot.sourceUrl,
  retrievedAt: snapshot.retrievedAt,
  codeCount: snapshot.codeCount,
} as const

/** Code metadata only. A catalog entry does not imply that a tariff rate is available. */
export const OFFICIAL_HS_CATALOG = snapshot.rows.map(([code, description]) => {
  const metadata = getHsCodeMetadata(code)!
  return {
    code, description, category: metadata.sectionName,
    catalogVersion: snapshot.catalogVersion,
    ...metadata, metadataSource: 'official-snapshot',
  }
})
