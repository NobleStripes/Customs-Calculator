import axios from 'axios'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseOfficialCatalog, type OfficialCatalogItem } from '../src/backend/services/officialCatalogParser'

const SOURCE_URL = 'https://finder.tariffcommission.gov.ph/item_search'
type CatalogPage = {
  data: OfficialCatalogItem[]
  current_page: number
  last_page: number
  total: number
}

const fetchPage = async (page: number): Promise<CatalogPage> => {
  const response = await axios.get<CatalogPage>(SOURCE_URL, {
    params: { search: '', page }, timeout: 30_000,
  })
  const data = response.data
  if (!Array.isArray(data.data) || data.current_page !== page || !Number.isInteger(data.last_page)) {
    throw new Error(`Invalid official catalog response on page ${page}`)
  }
  return data
}

const downloadCatalog = async (): Promise<OfficialCatalogItem[]> => {
  const first = await fetchPage(1)
  const pages = new Map<number, OfficialCatalogItem[]>([[1, first.data]])
  let nextPage = 2
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (nextPage <= first.last_page) {
      const page = nextPage++
      const result = await fetchPage(page)
      if (result.total !== first.total || result.last_page !== first.last_page) {
        throw new Error('Official catalog changed during download; run again for a consistent snapshot')
      }
      pages.set(page, result.data)
      if (pages.size % 10 === 0) console.log(`Downloaded ${pages.size}/${first.last_page} catalog pages`)
    }
  }))
  const items = Array.from({ length: first.last_page }, (_, index) => pages.get(index + 1)!).flat()
  if (items.length !== first.total) throw new Error('Incomplete official catalog download')
  return items
}

const inputPath = process.argv[2] === '--input' ? process.argv[3] : undefined
const items: OfficialCatalogItem[] = inputPath
  ? JSON.parse(await readFile(inputPath, 'utf8'))
  : await downloadCatalog()
const rows = parseOfficialCatalog(items)
const chapters = new Set(rows.map(([code]) => code.slice(0, 2)))
if (rows.length < 10_000 || chapters.size !== 96 || chapters.has('77')) {
  throw new Error(`Incomplete catalog: ${rows.length} codes across ${chapters.size} chapters`)
}
const output = fileURLToPath(new URL('../src/shared/data/ahtn2022.json', import.meta.url))
await mkdir(fileURLToPath(new URL('../src/shared/data/', import.meta.url)), { recursive: true })
await writeFile(output, JSON.stringify({
  catalogVersion: 'AHTN-2022', sourceUrl: SOURCE_URL,
  retrievedAt: new Date().toISOString(), sourceRecordCount: items.length,
  sourceSha256: createHash('sha256').update(JSON.stringify(items)).digest('hex'),
  codeCount: rows.length, rows,
}, null, 2) + '\n')
console.log(`Saved ${rows.length} verified HS codes across ${chapters.size} chapters to ${output}`)
