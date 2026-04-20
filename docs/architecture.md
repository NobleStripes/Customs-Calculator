# Architecture

This document covers the runtime structure, service boundaries, storage model, and API surface for Customs-Calculator.

## Runtime Overview

Customs-Calculator runs as a browser-first application with a small Express backend.

- `src/renderer/` contains the React single-page app used by operators for calculator, batch, and tariff-browser workflows.
- `src/renderer/lib/appApi.ts` is the browser-facing application API. It handles search, calculations, export, import previews, and remote-first calls to the Express backend.
- `src/server/` contains the Express server that serves health endpoints, calculation/import endpoints, approved website fetch proxy routes, and the built frontend in production.
- `src/backend/` contains shared Node-side services for tariff lookup, compliance checks, currency conversion, document generation, ingestion, and SQLite access.

## Project Structure

```text
customs-calculator/
├── src/
│   ├── renderer/                  # React frontend
│   │   ├── App.tsx                # Main app component
│   │   ├── index.tsx              # React entry point
│   │   ├── index.css              # Global styles
│   │   ├── App.css                # App layout styles
│   │   ├── lib/
│   │   │   └── appApi.ts          # Browser-native app API and local fallbacks
│   │   ├── pages/
│   │   │   ├── Calculator.tsx
│   │   │   ├── BatchImport.tsx
│   │   │   └── TariffBrowser.tsx
│   │   └── components/
│   │       ├── Sidebar.tsx
│   │       ├── HSCodeSearch.tsx
│   │       └── CalculationResults.tsx
│   ├── backend/
│   │   ├── db/
│   │   │   └── database.ts        # SQLite setup, migrations, seed sync, duplicate cleanup
│   │   └── services/
│   │       ├── tariffCalculator.ts
│   │       ├── complianceChecker.ts
│   │       ├── currencyConverter.ts
│   │       ├── documentGenerator.ts
│   │       └── tariffDataIngestion.ts
│   ├── server/
│   │   └── index.ts               # Express API and static hosting
│   └── types/
├── docs/
│   ├── architecture.md
│   └── calculation-logic.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
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

#### `tariff_rates`

```sql
CREATE TABLE tariff_rates (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   hs_code TEXT NOT NULL,
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

- `calculateDuty(value, hsCode, originCountry)` computes duty and surcharge from the latest active approved tariff row.
- `calculateVAT(dutiableValue, hsCode)` computes VAT from the current tariff row.
- `searchHSCodes(query)` performs ranked code and description search with dotted/undotted normalization.
- `getHSCodeDetails(code)` resolves exact codes.
- `getTariffCatalog(query, category, limit)` returns one latest active approved rate row per HS code.

### `ComplianceChecker`

- `getRequirements(hsCode, value, destination)` returns required documents, restrictions, and warnings.
- `validateShipment(...)` validates shipment-level compliance conditions.
- `getDocumentationSummary(...)` summarizes required document handling.

### `CurrencyConverter`

- `convert(amount, fromCurrency, toCurrency)` converts currencies and tracks whether the source was identity, cache, live, or fallback.
- Cached rates are persisted in SQLite when available.
- Fallback rates remain available when live conversion is unavailable.

### `TariffDataIngestionService`

- `parseCsvText(input)` parses source rows.
- `parseHSCatalogRows(payload)` extracts catalog rows from CSV/XLS/XLSX payloads.
- `previewRows(rows)` and `previewHSCatalogRows(rows)` validate rows before insert.
- `importRows(request)` imports tariff rows and writes review/audit metadata.
- `importHSCatalog(request)` imports HS catalog rows into `hs_codes`.

### `DocumentGenerator`

- Generates PDF reports for single calculations.
- Uses the same PHP-denominated breakdown values shown in the UI.

## Browser App API

The website uses `src/renderer/lib/appApi.ts` as the browser-facing API layer.

### Core Methods

- `initDB`
- `calculateDuty`
- `calculateVAT`
- `searchHSCodes`
- `resolveHSCode`
- `getTariffCatalog`
- `getTariffCategories`
- `getComplianceRequirements`
- `convertCurrency`
- `batchCalculate`
- `previewTariffImport`
- `importTariffData`
- `getImportJobs`
- `getPendingReviewRows`
- `generateCalculationDocument`

### Behavior Notes

- The app API is remote-first for backend-backed workflows.
- It falls back locally for supported calculation/search flows when backend endpoints are unavailable.
- Computed duties, taxes, fees, and landed-cost totals are kept in PHP.

## Express API

The Express server in `src/server/index.ts` exposes a same-origin API for the browser app.

### Main Endpoints

- `GET /api/health`
- `POST /api/calculate/duty`
- `POST /api/calculate/vat`
- `POST /api/calculate/batch`
- `POST /api/compliance/requirements`
- `GET /api/hs-codes/search`
- `GET /api/hs-codes/resolve`
- `GET /api/tariff-catalog`
- `GET /api/tariff-categories`
- `GET /api/currency/convert?amount=...&from=USD&to=PHP`
- `GET /api/currency/rate?from=USD&to=PHP`
- `POST /api/import/hs-codes/preview`
- `POST /api/import/hs-codes`
- `GET /api/import-jobs`
- `GET /api/import-jobs/:id/pending-review`
- `GET /api/fetch-website-content?url=...&query=...`
- `GET /api/fetch-regulatory-updates?source=boc|bir|tariff-commission&query=...`

## Deployment and Local Runtime

- Development UI runs at `http://127.0.0.1:5173`.
- Development API runs at `http://127.0.0.1:8787`.
- In development, Vite proxies `/api/*` to Express.
- In production-style local runs, Express serves both the API and the built frontend from `http://127.0.0.1:8787`.