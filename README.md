# Philippines Customs Calculator

Customs-Calculator is a browser-based tool for Philippine import costing and compliance pre-checks, built with React and TypeScript. The current website release supports HS code search with ranked suggestions, duty and VAT computation including surcharge-aware taxable base, multi-currency workflows with PHP as the computation base, batch shipment processing, tariff browsing, compliance checks, and browser-based report export. It is designed for SMEs, brokers, and operations teams that need consistent landed-cost estimates before final confirmation against official Bureau of Customs and BIR issuances.

## Quick Summary

- Production-ready operator workflows: single calculation, batch calculation, tariff browsing, compliance checks, and PDF export.
- Accurate cost logic: surcharge-aware VAT base and PHP-based tariff math for non-PHP inputs, with computed duties, taxes, and landed-cost outputs shown in PHP. All fee logic (brokerage, IPC, CSF, transit charge) runs server-side so single-item and batch calculations are always consistent, and missing tariff rows now fail explicitly instead of silently defaulting to zero.
- New in 0.4.0: conflict-resolution review UX, provenance drill-downs, authority-ranked live lookup merge behavior, tariff history browsing mode, and full-sync idempotency/cutover hardening.
- Search quality upgrades: ranked HS results, code normalization, and keyboard navigation.
- Official lookup assist: calculator HS search can query the Tariff Commission Finder (`finder.tariffcommission.gov.ph/search-by-code`) through the server, with cached live suggestions and local fallback results.
- Data platform foundation in place: source import jobs, review queue, audit tables, and HS catalog CSV/XLS import endpoints are implemented.
- Automated regulatory fetcher: cron-scheduled job discovers and ingests data files from BOC, BIR, and Tariff Commission pages; all auto-fetched rows go to the human review queue before being applied.
- Batch shipment import now supports reordered CSV headers and common alias mapping, not just the template column order.
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
- Runtime, storage, API, and service boundaries are documented in [docs/architecture.md](docs/architecture.md).
- Calculation formulas, fee rules, VAT-base logic, and PHP output rules are documented in [docs/calculation-logic.md](docs/calculation-logic.md).

## Release Notes

### Current Release: v0.4.0

- Added conflict-aware review workflow with side-by-side decisioning and provenance drill-down support.
- Added authority-ranked live HS search merge behavior with deterministic source prioritization.
- Added explicit tariff history browsing mode and history API support.
- Added full-sync idempotency guard and staged cutover controls for safer rollout.
- Fixed tariff version uniqueness collisions to avoid hard failures on duplicate version keys.

Full release details:

- [docs/changelog/v0.4.0.md](docs/changelog/v0.4.0.md)
- [CHANGELOG.md](CHANGELOG.md)

## Features

### Completed
- [x] React + TypeScript website scaffold
- [x] Browser-side seeded data model for HS codes, tariff rates, compliance rules, and fallback FX rates
- [x] Duty and VAT computation engine (effective-date aware tariff lookup)
- [x] Backend-first duty, VAT, and compliance calculation against the SQLite tariff catalog
- [x] VAT taxable base calculation includes surcharge
- [x] Multi-currency calculator flow (converts shipment values to PHP for computation while computed outputs stay in PHP)
- [x] Currency conversion flow with live, cached, and fallback FX behavior in website mode
- [x] HS code catalog auto-search by code and description (adaptive code/text query thresholds)
- [x] HS code search ranking and normalization (supports code searches with/without dots)
- [x] HS code keyboard navigation (Arrow Up/Down, Enter, Escape)
- [x] Remote-first official HS lookup suggestions via Tariff Commission Finder, with cached server responses and local fallback
- [x] Compliance requirement checks by HS code/category/value
- [x] Calculator page with real-time results and FX context display
- [x] Batch Import page with CSV parse, preview, calculate, and export
- [x] Batch Import CSV alias mapping and template guidance for reordered headers
- [x] Tariff Browser page with search and category filtering
- [x] Browser report export for calculation output
- [x] HS catalog import pipeline for CSV/XLS sources into `hs_codes`
- [x] Tariff data ingestion workflow stubbed in the website UI for future admin wiring
- [x] Runtime settings operations panel (health state, latest source visibility, manual runtime refresh, and robust save/reset persistence)

### In Progress
- [x] Data management/admin UI for tariff source imports and review queue (single-row and bulk review actions, confidence filtering, and governance summaries)
- [x] Server-side Customs/BIR/Tariff Commission website fetch proxy
- [x] Automated cron-scheduled regulatory fetcher (BOC and Tariff Commission; fetched rows queued for human review)
- [x] Customs/BIR/Tariff Commission source adapters (HTML table extraction, linked CSV/XLS/XLSX autodetection, and PDF extraction path)
- [x] Tariff source governance views (import status, confidence, and rate change audit)

### Planned
- [ ] Automated historical tariff tracking and comparison dashboards
- [ ] Data import/export tooling improvements (tariff import templates, richer conflict-resolution UX, and additional export options)
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

### Full HS Catalog Import (Batch Mode)

For complete HS code catalog loads, use batch mode to avoid oversized single imports.

- Endpoint: `POST /api/import/hs-codes`
- Key payload fields:
   - `sourceName` (required)
   - One of `rows`, `csvText`, or `contentBase64` + `fileName`
   - `batchSize` (optional, recommended for large uploads)

Example payload:

```json
{
   "sourceName": "PH HS Catalog 2026",
   "sourceType": "hs-catalog",
   "sourceReference": "ph-hs-catalog-2026.xlsx",
   "contentBase64": "<base64-file-content>",
   "fileName": "ph-hs-catalog-2026.xlsx",
   "batchSize": 1000
}
```

Batch mode returns aggregate import metadata including `totalBatches`, `processedBatches`, and per-batch summaries.

## Documentation

- Architecture: [docs/architecture.md](docs/architecture.md)
- Calculation logic: [docs/calculation-logic.md](docs/calculation-logic.md)
- Development guide: [docs/development-guide.md](docs/development-guide.md)
- Changelog index: [CHANGELOG.md](CHANGELOG.md)

## Detailed Technical Notes

The detailed architecture and calculation references have been moved into dedicated docs:

- Architecture, project structure, schema, services, and API surface: [docs/architecture.md](docs/architecture.md)
- Current landed-cost formulas, fee rules, validation, and PHP output behavior: [docs/calculation-logic.md](docs/calculation-logic.md)

## Development Guide

Contributor workflows, extension patterns, testing commands, and maintenance notes are documented in [docs/development-guide.md](docs/development-guide.md).

## Known Issues & Limitations

1. **Exchange Rates:** Live rates are fetched from `exchangerate-api.com` (free tier, ~1,500 req/month) and cached for 24 hours in SQLite. Fallback hardcoded rates are used when the API is unavailable.
2. **Structured Extraction:** The regulatory fetcher discovers and downloads linked tabular files (`.csv`/`.xls`/`.xlsx`) from approved government sources, extracts structured HTML tariff tables, and includes a PDF extraction path. Deeply formatted/scanned PDF memo parsing may still need source-specific refinements.
3. **Seeded Data Scope:** The built-in dataset is intentionally small and suitable for demo/operator workflow validation, not full production tariff coverage. Import your own tariff schedules via the CSV/XLS import pipeline.
4. **Admin Tooling:** Import/review workflow UI and broader source governance are still in progress, though tariff source visibility is now surfaced in the admin page.
5. **Official Lookup Scope:** Live Tariff Commission Finder matches improve HS code suggestion quality, but calculations still rely on approved local tariff rows unless operators import/review newer tariff data.
6. **Estimate-Only Output:** The calculator is intended for planning/reference workflows. Verify the final tariff treatment, fees, and documentary requirements with current BOC/BIR issuances before filing.

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

## Changelog

The full changelog has moved out of this README into dedicated release-note files:

- Changelog index: [CHANGELOG.md](CHANGELOG.md)
- 0.4.0 release notes: [docs/changelog/v0.4.0.md](docs/changelog/v0.4.0.md)
- 0.3.0 release notes: [docs/changelog/v0.3.0.md](docs/changelog/v0.3.0.md)
- 0.2.0 release notes: [docs/changelog/v0.2.0.md](docs/changelog/v0.2.0.md)
- 0.1.0 release notes: [docs/changelog/v0.1.0.md](docs/changelog/v0.1.0.md)

---

**Last Updated:** April 28, 2026
