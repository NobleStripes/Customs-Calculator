# Philippines Customs Calculator

Customs-Calculator is a browser-based tool for Philippine import costing and compliance pre-checks, built with React and TypeScript. The current website release supports HS code search with ranked suggestions, duty and VAT computation including surcharge-aware taxable base, multi-currency workflows with PHP as the computation base, batch shipment processing, tariff browsing, compliance checks, and browser-based report export. It is designed for SMEs, brokers, and operations teams that need consistent landed-cost estimates before final confirmation against official Bureau of Customs and BIR issuances.

## Quick Summary

- Production-ready operator workflows: single calculation, batch calculation, tariff browsing, compliance checks, and PDF export.
- Accurate cost logic: surcharge-aware VAT base and PHP-based tariff math for non-PHP inputs, with backend SQLite-backed tariff resolution.
- Search quality upgrades: ranked HS results, code normalization, and keyboard navigation.
- Data platform foundation in place: source import jobs, review queue, audit tables, and HS catalog CSV/XLS import endpoints are implemented.
- Current focus: admin data-management UI and automated Customs/BIR source adapters.

## Project Overview

The project is in an active build-out phase: core calculation and operator workflows are complete, while automated Customs/BIR data ingestion and admin governance tooling are being implemented next.

**Tech Stack:**
- **Frontend:** React 18 with TypeScript
- **Runtime:** Browser SPA with a small Express API
- **Data Layer:** In-browser app API plus server-side website fetch proxy for approved government sources
- **Build Tools:** Vite, esbuild
- **Styling:** CSS3 with modern features

**Architecture:**
- **`src/renderer/`** - React single-page interface used by operators for calculator, browser, and batch workflows.
- **`src/renderer/lib/appApi.ts`** - Browser-facing application API that powers calculations, search, server-backed currency conversion, export, and calls the Express proxy for website fetching.
- **`src/server/`** - Express server for health checks, regulated website fetch proxy routes, and production static hosting.
- **`src/backend/`** - Shared Node-side services used by the Express API, including regulatory website fetch/discovery logic, tariff calculation, compliance checks, and HS catalog ingestion.

## Features

### Completed
- [x] React + TypeScript website scaffold
- [x] Browser-side seeded data model for HS codes, tariff rates, compliance rules, and fallback FX rates
- [x] Duty and VAT computation engine (effective-date aware tariff lookup)
- [x] Backend-first duty, VAT, and compliance calculation against the SQLite tariff catalog
- [x] VAT taxable base calculation includes surcharge
- [x] Multi-currency calculator flow (converts to PHP for computation, then back to display currency)
- [x] Currency conversion flow with live, cached, and fallback FX behavior in website mode
- [x] HS code autocomplete search by code and description
- [x] HS code search ranking and normalization (supports code searches with/without dots)
- [x] HS code keyboard navigation (Arrow Up/Down, Enter, Escape)
- [x] Compliance requirement checks by HS code/category/value
- [x] Calculator page with real-time results and FX context display
- [x] Batch Import page with CSV parse, preview, calculate, and export
- [x] Tariff Browser page with search and category filtering
- [x] Browser report export for calculation output
- [x] HS catalog import pipeline for CSV/XLS sources into `hs_codes`
- [x] Tariff data ingestion workflow stubbed in the website UI for future admin wiring

### In Progress
- [ ] Data management/admin UI for tariff source imports and review queue
- [x] Server-side Customs/BIR/Tariff Commission website fetch proxy
- [ ] Customs/BIR/Tariff Commission source adapters (HTML/CSV/PDF ingestion and structured extraction)
- [ ] Tariff source governance views (import status, confidence, and rate change audit)

### Planned
- [ ] Automated historical tariff tracking and comparison dashboards
- [ ] Data import/export tooling improvements (templates, mapping, conflict resolution UX)
- [ ] Settings management
- [ ] Offline mode enhancements

## Setup Instructions

Use this quick-start when running locally for website development.

### Prerequisites
- Node.js 18+ (https://nodejs.org/)
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build the project**
   ```bash
   npm run build
   ```

3. **Run development mode**
   ```bash
   npm run dev
   ```
   Starts both the Express API server and the Vite dev server.

   Web access during development:
   - Open `http://127.0.0.1:5173` in your browser for the app UI.
   - Vite will proxy browser `/api/*` requests to the Express server at `http://127.0.0.1:8787`.
   - You can check the backend directly at `http://127.0.0.1:8787/api/health`.
   - Currency conversion is available through `http://127.0.0.1:8787/api/currency/convert?amount=1&from=USD&to=PHP`.

4. **Run the built app**
   ```bash
   npm start
   ```
   Builds should be created first with `npm run build`; `npm start` then runs the Express server and serves both the API and the static frontend.

   Web access after build:
   - Open `http://127.0.0.1:8787` in your browser for the production-style app.
   - The API is served from the same origin, for example `http://127.0.0.1:8787/api/health`.
   - Currency conversion is served from the same origin, for example `http://127.0.0.1:8787/api/currency/convert?amount=1&from=USD&to=PHP`.

## Detailed Technical Notes

The sections below are intended for contributors and maintainers.

## Project Structure

```
customs-calculator/
├── src/
│   ├── renderer/                  # React frontend
│   │   ├── App.tsx                # Main app component
│   │   ├── index.tsx              # React entry point
│   │   ├── index.css              # Global styles
│   │   ├── App.css                # App layout styles
│   │   ├── lib/
│   │   │   └── appApi.ts          # Browser-native app API and seeded data
│   │   ├── pages/                 # Page components
│   │   │   ├── Calculator.tsx
│   │   │   ├── BatchImport.tsx
│   │   │   └── TariffBrowser.tsx
│   │   └── components/            # Reusable components
│   │       ├── Sidebar.tsx
│   │       ├── HSCodeSearch.tsx
│   │       └── CalculationResults.tsx
│   │
│   ├── backend/                   # Legacy server-side services retained for future web backend work
│   │   ├── db/
│   │   │   └── database.ts        # Database setup and seeding
│   │   └── services/
│   │       ├── tariffCalculator.ts    # Duty & VAT calculations
│   │       ├── complianceChecker.ts   # Compliance rules
│   │       ├── currencyConverter.ts   # Currency conversion
│   │       └── documentGenerator.ts   # PDF report generation
│   │
│   └── types/                     # TypeScript type definitions
│
├── index.html                     # HTML entry point
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite configuration
└── README.md                      # This file
```

## Database Schema

The app uses SQLite with both core calculator tables and ingestion/audit tables.

### hs_codes
```sql
CREATE TABLE hs_codes (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   code TEXT UNIQUE NOT NULL,      -- e.g., '8471.30'
   description TEXT NOT NULL,
   category TEXT NOT NULL,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### tariff_rates
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

### compliance_rules
```sql
CREATE TABLE compliance_rules (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   hs_code_range TEXT NOT NULL,
   category TEXT NOT NULL,
  required_documents TEXT,       -- Comma-separated list
  restrictions TEXT,             -- Comma-separated restrictions
  special_conditions TEXT,       -- Additional conditions
   source_id INTEGER,
   effective_date DATE,
   end_date DATE,
   confidence_score INTEGER NOT NULL DEFAULT 100,
   import_status TEXT NOT NULL DEFAULT 'approved',
   last_modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### exchange_rates
```sql
CREATE TABLE exchange_rates (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   currency_pair TEXT UNIQUE NOT NULL,
   rate REAL NOT NULL,
   last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### calculation_history
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

### TariffCalculator
Handles all tariff and VAT calculations:
- `calculateDuty(value, hsCode, originCountry)` - Computes duty and surcharge for active tariff rows
- `calculateVAT(dutiableValue, hsCode)` - Computes VAT from the active tariff row
- `searchHSCodes(query)` - Searches HS codes by code/description with ranked results
- `getHSCodeDetails(code)` - Gets detailed HS code info
- `calculateTotalLandedCost(...)` - Full landed-cost helper (value + duty + surcharge + VAT)

### ComplianceChecker
Manages import compliance requirements:
- `getRequirements(hsCode, value, destination)` - Returns required documents, restrictions, warnings
- `isRestricted(hsCode)` - Checks if product is restricted
- `validateShipment(...)` - Validates entire shipment for compliance
- `getDocumentationSummary(...)` - Returns required documents and estimated processing time

### CurrencyConverter
Handles multi-currency conversion:
- `convert(amount, fromCurrency, toCurrency)` - Converts currencies and returns rate source (identity/cache/live/fallback)
- `convertToPhilippinePeso(amount, currency)` - Quick conversion to PHP
- `getConversionMatrix(baseCurrency)` - Gets all rates for a base currency
- Uses exchange-rate API with SQLite caching and static fallback rates

### TariffDataIngestionService
Handles source import preview and ingestion workflows:
- `parseCsvText(input)` - Parses source rows from CSV text
- `previewRows(rows)` - Validates and normalizes rows before import
- `importRows(request)` - Imports rows with confidence-based review queue routing
- `getImportJobs(limit)` - Lists recent import runs
- `getPendingReviewRows(importJobId)` - Lists rows awaiting manual review

## Tariff Duty Calculation Logic

The calculator uses this sequence for each shipment:

1. Find the applicable tariff row for the selected HS code.
2. Compute import duty from declared value.
3. Add surcharge if configured for that HS code.
4. Compute VAT on the dutiable base.
5. Return total landed cost.

Formulas used:

- Duty Amount = Declared Value * Duty Rate
- Surcharge Amount = Declared Value * Surcharge Rate
- Dutiable Base = Declared Value + Duty Amount + Surcharge Amount
- VAT Amount = Dutiable Base * VAT Rate
- Total Landed Cost = Dutiable Base + VAT Amount

Worked example:

- Declared Value: 1,000.00 USD
- Duty Rate: 5%
- Surcharge Rate: 0%
- VAT Rate: 12%

Results:

- Duty Amount = 1,000.00 * 0.05 = 50.00
- Surcharge Amount = 1,000.00 * 0.00 = 0.00
- Dutiable Base = 1,000.00 + 50.00 + 0.00 = 1,050.00
- VAT Amount = 1,050.00 * 0.12 = 126.00
- Total Landed Cost = 1,050.00 + 126.00 = 1,176.00

Notes:

- If no tariff row is found, duty defaults to 0 and VAT defaults to 12%.
- For non-PHP input, the app converts values to PHP before duty/VAT computation, then converts results back to display currency.

### Validation Rules

- HS code is required before calculation can run.
- Declared value must be greater than 0.
- Origin country is accepted as optional for now (currently not used to vary rates in the seeded dataset).
- Destination port is required for compliance checks and reporting context.
- If tariff lookup fails at runtime, the service returns a handled error instead of silently producing a partial result.

## Browser App API

The active website uses `src/renderer/lib/appApi.ts` as the browser-facing API layer. Most calculator features run locally in the browser, while approved website fetching is delegated to the Express proxy.

### Available App Methods

**Initialization:**
- `initDB` - Initialize seeded browser data

**Calculations and Reference Data:**
- `calculateDuty` - Calculate import duty
- `calculateVAT` - Calculate VAT
- `searchHSCodes` - Search for HS codes
- `getTariffCatalog` - Get tariff rows for browser view
- `getTariffCategories` - Get available tariff categories
- `getComplianceRequirements` - Get compliance info
- `convertCurrency` - Currency conversion
- `batchCalculate` - Bulk calculations
- `previewTariffImport` - Validate and preview source rows
- `importTariffData` - Placeholder import execution response for current web mode
- `getImportJobs` - Get recent import job placeholders
- `getPendingReviewRows` - Get pending review placeholders
- `generateCalculationDocument` - Generate browser download report
- `convertCurrency` now uses the Express backend first and falls back locally only when the server path is unavailable

**Website Fetching:**
- `fetchWebsiteContent` - Calls the Express proxy to fetch and sanitize approved website content
- `fetchRegulatoryUpdates` - Calls the Express proxy to discover and fetch approved BOC, BIR, or Tariff Commission pages

## Express API

The Express server in `src/server/index.ts` exposes a small same-origin API for the browser app:

- `GET /api/health` - Health check
- `GET /api/currency/convert?amount=...&from=USD&to=PHP` - Converts one amount and returns rate source metadata
- `GET /api/currency/rate?from=USD&to=PHP` - Returns the current rate and source metadata without converting an amount
- `GET /api/fetch-website-content?url=...&query=...` - Fetches a single approved page and returns sanitized content
- `GET /api/fetch-regulatory-updates?source=boc|bir|tariff-commission&query=...` - Discovers and fetches recent regulatory pages

In development, Vite proxies `/api/*` requests to `http://127.0.0.1:8787`. In production, the Express server serves both the API and the built frontend.

Browser access summary:
- Development UI: `http://127.0.0.1:5173`
- Development API target: `http://127.0.0.1:8787`
- Production-style local app: `http://127.0.0.1:8787`

## Development Guide

### Adding New HS Codes

1. Edit `src/backend/db/database.ts` in the `seedInitialData()` function
2. Add to `hsCodesData` array:
   ```typescript
   { code: '1234.56', description: 'Product', category: 'Category' }
   ```
3. Add tariff rate to `tariffData`:
   ```typescript
   { hs_code: '1234.56', duty_rate: 0.10, vat_rate: 0.12 }
   ```
4. Refresh the browser app

### Adding New Compliance Rules

Edit `src/backend/db/database.ts` in the `seedInitialData()` function:
```typescript
{
  hs_code_range: '1234.56',
  category: 'NewCategory',
  required_documents: 'Doc1, Doc2',
  restrictions: 'Restriction1',
  special_conditions: 'Condition1',
}
```

### Building Components

Example of adding a new page:

1. Create new component in `src/renderer/pages/MyPage.tsx`
2. Add to navigation in `App.tsx`:
   ```typescript
   {currentPage === 'my-page' && <MyPage />}
   ```
3. Add button to Sidebar:
   ```typescript
   <button onClick={() => onPageChange('my-page')}>My Page</button>
   ```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui
```

## Linting & Formatting

```bash
# Check code style
npm run lint

# Auto-fix and format
npm run format
```

## Known Issues & Limitations

1. **Exchange Rates:** Current website mode uses fallback FX data; live-rate refresh is part of the future server-side phase.
2. **Structured Extraction:** The current proxy returns sanitized page content and discovery results, but not issuer-specific structured parsing yet.
3. **Seeded Data Scope:** The current browser dataset is intentionally small and suitable for demo/operator workflow validation, not full production tariff coverage.
4. **Admin Tooling:** Import/review workflow UI and broader source governance are still in progress.

## Future Enhancements

- [ ] Multi-user support with local profiles
- [ ] Cloud sync for calculation history
- [ ] Government API integration for real-time tariff updates
- [ ] Mobile app version
- [ ] Barcode/QR code scanning
- [ ] API export for integration with logistics software

## Support & Contribution

For issues, feature requests, or contributions:
1. Document the issue with steps to reproduce
2. Include relevant HS codes and product details
3. Test with multiple product categories

## License

MIT

## Changelog

### v0.1.0 (Current)
- Website-first React + TypeScript runtime
- Seeded browser app API for calculation workflows
- Express API for same-origin Customs/BIR/Tariff Commission website fetching
- Duty and VAT engine with surcharge-aware taxable base
- Currency conversion with fallback behavior in web mode
- Ranked HS code search with keyboard navigation support
- Calculator, Batch Import, and Tariff Browser pages
- Compliance checks and browser report export
- Legacy backend ingestion foundation retained for future server-side integration

---

**Last Updated:** April 20, 2026
