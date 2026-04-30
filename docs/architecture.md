# Architecture

This document covers the runtime structure, service boundaries, storage model, and API surface for Customs-Calculator.

## Runtime Overview

Customs-Calculator runs as a browser-first application with a small Express backend.

- `src/renderer/` contains the React single-page app used by operators for calculator, batch, tariff-browser, admin, and settings workflows.
- `src/renderer/lib/appApi.ts` is the browser-facing application API. It handles search, calculations, export, import previews, and remote-first calls to the Express backend.
- `src/server/` contains the Express server that serves health endpoints, calculation/import endpoints, approved website fetch proxy routes, and the built frontend in production.
- `src/backend/` contains Node-side services for tariff lookup, compliance checks, currency conversion, document generation, import classification, excise/customs rules, ingestion, and SQLite access.
- `src/shared/` contains shared query normalization and helper logic used across runtime boundaries.

## Project Structure

```text
customs-calculator/
├── .eslintrc
├── .prettierrc
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── README.md
├── docs/
│   ├── architecture.md
│   ├── calculation-logic.md
│   ├── development-guide.md
│   └── changelog/
│       ├── v0.1.0.md
│       ├── v0.2.0.md
│       ├── v0.3.0.md
│       ├── v0.4.0.md
│       ├── v0.4.1.md
│       └── v0.5.0.md
├── index.html
├── package-lock.json
├── package.json
├── src/
│   ├── backend/
│   │   ├── db/
│   │   │   └── database.ts
│   │   ├── services/
│   │   │   ├── autoFetcher.ts
│   │   │   ├── complianceChecker.ts
│   │   │   ├── complianceChecker.test.ts
│   │   │   ├── currencyConverter.ts
│   │   │   ├── currencyConverter.test.ts
│   │   │   ├── customsRules.ts
│   │   │   ├── customsRules.test.ts
│   │   │   ├── documentGenerator.ts
│   │   │   ├── exciseTax.ts
│   │   │   ├── exciseTax.test.ts
│   │   │   ├── importClassification.ts
│   │   │   ├── importClassification.test.ts
│   │   │   ├── officialHsLookup.ts
│   │   │   ├── officialHsLookup.test.ts
│   │   │   ├── reviewWorkflow.test.ts
│   │   │   ├── runtimeSettings.ts
│   │   │   ├── runtimeSettings.test.ts
│   │   │   ├── sourceAdapters.ts
│   │   │   ├── tariffCalculator.ts
│   │   │   ├── tariffCalculator.test.ts
│   │   │   ├── tariffDataIngestion.ts
│   │   │   ├── tariffDataIngestion.test.ts
│   │   │   ├── tariffHtmlParser.ts
│   │   │   ├── tariffHtmlParser.test.ts
│   │   │   ├── websiteFetcher.ts
│   │   │   ├── websiteFetcher.test.ts
│   │   │   └── fixtures/
│   │   │       ├── boc-memoranda.fixture.html
│   │   │       └── tariff-commission-search.fixture.html
│   │   └── types/
│   │       └── pdfkit.d.ts
│   ├── main/                       # Currently empty (reserved runtime folder)
│   ├── renderer/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── index.tsx
│   │   ├── vite-env.d.ts
│   │   ├── components/
│   │   │   ├── CalculationResults.css
│   │   │   ├── CalculationResults.tsx
│   │   │   ├── HSCodeSearch.css
│   │   │   ├── HSCodeSearch.tsx
│   │   │   ├── Sidebar.css
│   │   │   └── Sidebar.tsx
│   │   ├── lib/
│   │   │   ├── appApi.ts
│   │   │   ├── appApi.test.ts
│   │   │   ├── batchImportCsv.ts
│   │   │   ├── batchImportCsv.test.ts
│   │   │   ├── settingsStore.ts
│   │   │   └── settingsStore.test.ts
│   │   └── pages/
│   │       ├── Admin.css
│   │       ├── Admin.tsx
│   │       ├── BatchImport.css
│   │       ├── BatchImport.tsx
│   │       ├── Calculator.css
│   │       ├── Calculator.tsx
│   │       ├── Settings.css
│   │       ├── Settings.tsx
│   │       ├── TariffBrowser.css
│   │       └── TariffBrowser.tsx
│   ├── server/
│   │   └── index.ts
│   ├── shared/
│   │   ├── hsLookupQuery.ts
│   │   └── hsLookupQuery.test.ts
│   └── types/                      # Currently empty
├── tmp-memo-pages/
├── tmp-mistg-memo.pdf
├── tmp-mistg-memo.txt
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.node.tsbuildinfo
├── vite.config.ts
└── (Generated/ignored folders omitted: .git, .venv, .vscode, node_modules, dist)
```

## Data Model

The app uses SQLite for tariff/catalog data, ingestion metadata, audit history, and cached exchange rates.

### Core Tables

#### `hs_codes`

```sql
CREATE TABLE hs_codes (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   code TEXT UNIQUE NOT NULL,
   description TEXT NOT NULL,
   category TEXT NOT NULL,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Recommended 2026+ extension for nomenclature versioning:

```sql
CREATE TABLE hs_catalog_versions (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   version_code TEXT UNIQUE NOT NULL, -- e.g. 'AHTN-2022'
   effective_date DATE,
   retired_date DATE,
   status TEXT NOT NULL DEFAULT 'active',
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hs_code_mappings (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   from_version TEXT NOT NULL,
   to_version TEXT NOT NULL,
   from_code TEXT NOT NULL,
   to_code TEXT NOT NULL,
   mapping_type TEXT NOT NULL, -- one-to-one, split, merge, retired
   notes TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

This preserves backward compatibility during edition changes (e.g. AHTN 2022 -> AHTN 2028) and supports deterministic migration/audit workflows.

#### `tariff_rates`

```sql
CREATE TABLE tariff_rates (
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
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `compliance_rules`

```sql
CREATE TABLE compliance_rules (
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
);
```

#### `exchange_rates`

```sql
CREATE TABLE exchange_rates (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   currency_pair TEXT UNIQUE NOT NULL,
   rate REAL NOT NULL,
   last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `calculation_history`

```sql
CREATE TABLE calculation_history (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   hs_code TEXT NOT NULL,
   value REAL NOT NULL,
   currency TEXT NOT NULL,
   duty_amount REAL NOT NULL,
   vat_amount REAL NOT NULL,
   total_landed_cost REAL NOT NULL,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Ingestion and Audit Tables

```sql
CREATE TABLE tariff_schedules (
   code TEXT PRIMARY KEY,
   display_name TEXT NOT NULL,
   is_active INTEGER NOT NULL DEFAULT 1,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tariff_sources (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   source_name TEXT NOT NULL,
   source_type TEXT NOT NULL,
   source_reference TEXT,
   status TEXT NOT NULL DEFAULT 'active',
   fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   imported_at DATETIME,
   notes TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE import_jobs (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   source_id INTEGER NOT NULL,
   status TEXT NOT NULL DEFAULT 'running',
   total_rows INTEGER NOT NULL DEFAULT 0,
   imported_rows INTEGER NOT NULL DEFAULT 0,
   pending_review_rows INTEGER NOT NULL DEFAULT 0,
   error_rows INTEGER NOT NULL DEFAULT 0,
   error_message TEXT,
   started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   completed_at DATETIME
);

CREATE TABLE extracted_rows_review (
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
   reviewed_at DATETIME
);

CREATE TABLE rate_change_audit (
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
   changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Key Services

### `TariffCalculator`

- `calculateDuty(value, hsCode, originCountry, scheduleCode?)` computes duty and surcharge from the latest active approved tariff row for the given schedule.
- `calculateVAT(dutiableValue, hsCode, scheduleCode?)` computes VAT from the current tariff row.
- `searchHSCodes(query)` performs ranked code and description search with dotted/undotted normalization.
- `getHSCodeDetails(code)` resolves exact codes.
- `getTariffCatalog(query, category, scheduleCode, limit)` returns one latest active approved rate row per HS code for the given schedule.

### `OfficialHsLookupService`

- Targets `https://finder.tariffcommission.gov.ph/search-by-code` as the official lookup page.
- Uses `ahtn` for code-like searches and `keyword` for text searches.
- Parses live Tariff Commission Finder HTML into the app HS lookup shape with source metadata and optional official duty/VAT values when present in the page.
- Caches repeated keystroke lookups server-side for 5 minutes to reduce load on the official website.
- Search-only in the current rollout: it does not silently persist or apply official-site tariff data to approved tariff tables.

### `ComplianceChecker`

- `getRequirements(hsCode, value, destination)` returns required documents, restrictions, and warnings.
- `validateShipment(...)` validates shipment-level compliance conditions.
- `getDocumentationSummary(...)` summarizes required document handling.

### `CurrencyConverter`

- `convert(amount, fromCurrency, toCurrency)` converts currencies and tracks whether the source was identity, cache, live, or fallback.
- Prefers BOC weekly customs rates for PHP conversion paths when `fxPreferBocRate` is enabled.
- Falls back to live market API, then cached market rates, then hardcoded fallback rates.
- Cached rates are persisted in SQLite when available.

### `TariffDataIngestionService`

- `parseCsvText(input)` parses source rows.
- `parseHSCatalogRows(payload)` extracts catalog rows from CSV/XLS/XLSX payloads.
- `previewRows(rows)` and `previewHSCatalogRows(rows)` validate rows before insert.
- `importRows(request)` imports tariff rows and writes review/audit metadata. Rows below `autoApproveThreshold` are staged in `extracted_rows_review` as pending.
- `importHSCatalog(request)` imports HS catalog rows into `hs_codes`.
- `approveReviewRow(importJobId, rowId, notes?)` promotes a pending review row into `tariff_rates` with an `approved` status and writes a `rate_change_audit` entry.
- `rejectReviewRow(importJobId, rowId, notes?)` marks a review row as rejected without promoting it.
- `getPendingReviewRows(importJobId)` returns rows awaiting review for a given import job.
- `getImportJobs(limit)` returns recent import job summaries.
- `getRateChangeAudit(hsCode?, limit, offset)` returns paginated rate change audit entries.
- `getTariffSources(limit)` returns recent tariff source records.
- `getCalculationHistory(limit)` returns recent calculation history entries.
- `parseHtmlTables(htmlContent, sourceUrl)` attempts to extract HS code/rate tables from raw HTML (used by the auto-fetcher as a fallback when no data file links are found) via the shared `tariffHtmlParser`.

### `DocumentGenerator`

- Generates PDF reports for single calculations.
- Uses the same PHP-denominated breakdown values shown in the UI.

### `WebsiteFetcherService`

- `fetchWebsiteContent(url, query?)` fetches and summarizes content from an approved host.
- `fetchRegulatoryUpdates(source)` crawls seed URLs for the given regulatory source (`boc`, `bir`, `tariff-commission`) and returns page content and discovered links.
- Requests are restricted to an allowlist of Philippine regulatory domains (BOC, BIR, Tariff Commission).

### `AutoFetcher`

- Runs on a daily cron schedule (default: `0 2 * * *`).
- For each regulatory source, calls `WebsiteFetcherService` to discover updates.
- Downloads CSV/XLSX/XLS data file links found on the pages and passes them to `TariffDataIngestionService.importRows`.
- Falls back to `parseHtmlTables` on pages where no data files are found.
- Controlled by the `autoFetcherEnabled` setting in `settingsStore`.

### `TariffHtmlParser`

Stub module (`tariffHtmlParser.ts`) for extracting `TariffImportRow` arrays from raw BOC and Tariff Commission HTML. Currently returns an empty array; intended for future production implementation.

## Settings Store

`src/renderer/lib/settingsStore.ts` is a Zustand store that persists user preferences to `localStorage` under the key `customs-calculator-settings`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `defaultScheduleCode` | `string` | `'MFN'` | Default tariff schedule used in calculations |
| `defaultOriginCountry` | `string` | `''` | Pre-populated origin country in the calculator |
| `autoFetcherEnabled` | `boolean` | `true` | Whether the server-side auto-fetcher cron is active |
| `fxCacheTtlHours` | `number` | `24` | How long cached exchange rates are considered fresh |
| `fxPreferBocRate` | `boolean` | `true` | Prefer BOC weekly customs exchange rate when available |

## Browser App API

The website uses `src/renderer/lib/appApi.ts` as the browser-facing API layer.

### Core Methods

- `initDB`
- `calculateDuty`
- `calculateVAT`
- `searchHSCodes`
- `resolveHSCode`
- `searchLiveHSCodes`
- `getTariffCatalog`
- `getTariffCategories`
- `getTariffSchedules`
- `getComplianceRequirements`
- `convertCurrency`
- `batchCalculate`
- `previewTariffImport`
- `importTariffData`
- `getImportJobs`
- `getPendingReviewRows`
- `updateReviewRow`
- `fetchWebsiteContent`
- `fetchRegulatoryUpdates`
- `generateCalculationDocument`
- `getCalculationHistory`
- `getTariffSources`
- `getRateChangeAudit`

### Behavior Notes

- The app API is remote-first for backend-backed workflows.
- It falls back locally for supported calculation/search flows when backend endpoints are unavailable.
- Computed duties, taxes, fees, and landed-cost totals are kept in PHP.

## Express API

The Express server in `src/server/index.ts` exposes a same-origin API for the browser app.

### Main Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/runtime-settings` | Get runtime operational settings |
| PUT | `/api/runtime-settings` | Update runtime operational settings |
| GET | `/api/runtime-status` | Get runtime status and operational telemetry |
| GET | `/api/hs-codes/search` | Search HS codes by query string |
| GET | `/api/hs-codes/live-search` | Remote-first HS lookup through Tariff Commission Finder with local fallback |
| GET | `/api/hs-codes/resolve` | Resolve a single HS code |
| GET | `/api/tariff-catalog` | Paginated tariff catalog with schedule filter |
| GET | `/api/tariff-categories` | Distinct HS code categories |
| GET | `/api/tariff-schedules` | Available tariff schedules from `tariff_schedules` table |
| GET | `/api/currency/convert` | Currency conversion (live + fallback) |
| GET | `/api/currency/rate` | Get exchange rate |
| POST | `/api/calculate/duty` | Calculate customs duty |
| POST | `/api/calculate/vat` | Calculate VAT |
| POST | `/api/calculate/batch` | Batch calculation across multiple shipments |
| POST | `/api/compliance/requirements` | Compliance requirements for a shipment |
| POST | `/api/import/hs-codes/preview` | Preview HS code import without committing |
| POST | `/api/import/hs-codes` | Import HS code rows |
| POST | `/api/import/tariff-rates/preview` | Preview tariff rate import without committing |
| POST | `/api/import/tariff-rates` | Import tariff rates from CSV/rows |
| GET | `/api/import-jobs` | List import job records |
| GET | `/api/import-jobs/:importJobId/pending-review` | List pending review rows for a job |
| PATCH | `/api/import-jobs/:importJobId/review-rows/:rowId` | Approve or reject a pending review row |
| GET | `/api/rate-change-audit` | Paginated rate change audit log (optional `hs_code` filter) |
| GET | `/api/tariff-sources` | List tariff source records |
| GET | `/api/calculation-history` | List calculation history records |
| GET | `/api/fetch-website-content` | Fetch content from an allowlisted regulatory URL |
| GET | `/api/fetch-regulatory-updates` | Crawl updates from BOC, BIR, or Tariff Commission |
| POST | `/api/export/calculation-document/pdf` | Generate and stream a PDF calculation report |

## Pages

### Calculator (`Calculator.tsx`)

Single-item duty, VAT, and excise calculator with legal-status and logistics overlays.

Inputs include:

- HS code and tariff schedule
- FOB value, freight, insurance, and input currency
- Origin country and destination port
- Declaration type and container size
- Date of arrival and storage delay days
- Item condition and importer status (`standard`, `balikbayan`, `returning_resident`, `ofw`)
- Status-specific fields (months abroad, balikbayan boxes, OFW appliance privilege flags)
- Arrastre/Wharfage manual input (optional override) and Dox Stamp & Others
- Excise category/quantity/basis details when applicable

Outputs include:

- Duty, surcharge, VAT, and excise breakdown
- Full fee stack (brokerage, IPC/IPF, CSF, CDS, IRS/DST, LRF)
- Port and handling estimate (arrastre, wharfage, storage)
- Section 800 exemption result
- Valuation reference risk indicator
- Import classification panel and EO 114 advisory notice when conditions are met
- Final landed cost in PHP with FX source metadata

The calculator’s HS code field now uses remote-first live suggestions from Tariff Commission Finder through the backend, surfaces whether results are live, cached, or local fallback, and still validates final calculation against approved local tariff data.

### Batch Import (`BatchImport.tsx`)

CSV/XLSX import for bulk calculations. Rows are processed via `batchCalculate`. Results can be downloaded.

### Tariff Browser (`TariffBrowser.tsx`)

Browse and filter the tariff catalog by schedule, category, or HS code. Backed by `getTariffCatalog` and `getTariffSchedules`.

### Admin (`Admin.tsx`)

Four-tab admin page for post-import review, source governance, and audit:

1. **Review Queue** — shows pending review rows grouped by import job; operators can approve or reject rows with optional notes via `updateReviewRow`.
2. **Import Jobs** — paginated list of all import jobs showing status, row counts, and timestamps.
3. **Rate Change Audit** — paginated audit log of all approved rate changes with optional HS code filter.
4. **Tariff Sources** — source-governance view plus an Admin tariff import workspace for CSV template download, preview, and import execution.

### Settings (`Settings.tsx`)

Operator preferences page backed by `settingsStore`. Controls:

- Default tariff schedule (MFN or one of 14 FTA codes)
- Default origin country
- Auto-fetcher enabled/disabled toggle
- FX cache TTL (1 / 6 / 12 / 24 / 48 hours)
- Displays the last auto-fetcher run timestamp

## Auto-Fetch Pipeline

The auto-fetcher (`autoFetcher.ts`) runs a daily cron job at `0 2 * * *`:

1. For each regulatory source (`boc`, `bir`, `tariff-commission`), calls `WebsiteFetcherService.fetchRegulatoryUpdates`.
2. Scans discovered links for CSV/XLS/XLSX file URLs.
3. If data files are found: downloads each file and calls `TariffDataIngestionService.importRows` with `autoApproveThreshold: 100`.
4. If no data files are found: calls `TariffDataIngestionService.parseHtmlTables` on the raw HTML as a fallback extraction method.

The pipeline is gated by the `autoFetcherEnabled` setting from `settingsStore`.

## Batch Calculation Contract

`POST /api/calculate/batch` is the authoritative landed-cost endpoint and returns one result row per shipment.

### Request fields (major)

- Core: `hsCode`, `scheduleCode`, `value`, `freight`, `insurance`, `originCountry`, `destinationPort`, `currency`
- Logistics: `declarationType`, `containerSize`, `arrivalDate`, `storageDelayDays`, `arrastreWharfage`, `doxStampOthers`
- Status/exemption: `itemCondition`, `importerStatus`, `monthsAbroad`, `balikbayanBoxesThisYear`, `isCommercialQuantity`, `ofwHomeApplianceClaim`, `ofwHomeApplianceAlreadyAvailedThisYear`
- Excise: `exciseCategory`, `exciseQuantity`, `exciseUnit`, `exciseNrp`, `sweetenedBeverageSugarType`, `petroleumProductType`

### Response fields (major)

- Core totals: `duty`, `exciseTax`, `vat`, `landedCostSubtotal`, `totalLandedCost`, `breakdown`
- Entry state: `deMinimisExempt`, `deMinimisReason`, `entryType`, `insuranceBenchmarkApplied`
- Classification/compliance: `importClassification`, `compliance`
- New overlays: `section800Exemption`, `valuationReferenceRisk`, `portHandlingFees`, `energyEmergencyNotice`
- FX trace: `fx` (`applied`, `rateToPhp`, `inputCurrency`, `source`, `timestamp`)

## Deployment and Local Runtime

- Development UI runs at `http://127.0.0.1:5173`.
- Development API runs at `http://127.0.0.1:8787`.
- In development, Vite proxies `/api/*` to Express.
- In production-style local runs, Express serves both the API and the built frontend from `http://127.0.0.1:8787`.
