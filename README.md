# Philippines Customs Calculator

Customs-Calculator is a browser-based tool for Philippine import costing and compliance pre-checks, built with React and TypeScript. The current website release supports HS code search with ranked suggestions, duty/VAT/excise computation with surcharge-aware VAT base, Section 800 user-status exemptions, 2026 port-handling estimation (arrastre/wharfage/storage), valuation-reference risk indicators, multi-currency workflows with PHP as the computation base, batch shipment processing, tariff browsing, compliance checks, and browser-based report export. It is designed for SMEs, brokers, and operations teams that need consistent landed-cost estimates before final confirmation against official Bureau of Customs and BIR issuances.

## Quick Summary

- Production-ready operator workflows: single calculation, batch calculation, tariff browsing, compliance checks, and PDF export.
- Accurate cost logic: surcharge-aware VAT base and PHP-based tariff math for non-PHP inputs, with computed duties, excise, taxes, and landed-cost outputs shown in PHP. Server-side fee logic includes brokerage, IPF/IPC, CSF, transit charge, CDS, DST/IRS, and LRF; Section 800 exemptions, valuation-reference risk flags, and port/handling estimates are integrated in the same pipeline so single-item and batch calculations stay consistent.
- Advanced assessments: trade remedy duties (anti-dumping/countervailing/safeguard), surcharge and penalty estimates (undervaluation, misclassification, late payment interest), and a final `totalPayable` output on top of landed cost.
- New in 0.5.0: Full PHL 2026 compliance fee engine (CMTA administrative fees, excise tax for 5 categories, corrected VAT base, BOC weekly FX rate, all entry tiers), goods classification engine (import type per CMTA, agency clearances, strategic trade/STMO flag, VAT-exempt flag, FTA Certificate of Origin identification), and Import Classification panel in the calculator results UI.
- Search quality upgrades: ranked HS results, code normalization, and keyboard navigation.
- Official lookup assist: calculator HS search can query the Tariff Commission Finder (`finder.tariffcommission.gov.ph/search-by-code`) through the server, with cached live suggestions, in-flight request deduplication, and stale-cache fallback if the official site is temporarily unavailable.
- Data platform foundation in place: source import jobs, review queue, audit tables, and HS catalog CSV/XLS import endpoints are implemented.
- Automated regulatory fetcher: cron-scheduled job discovers and ingests data files from BOC, BIR, and Tariff Commission pages; all auto-fetched rows go to the human review queue before being applied.
- Robust ingestion fallback: when tabular links are unavailable or HTML structures drift, extraction now falls back to text-pattern recovery for HS/rate candidates.
- Calculator UX upgrades: chapter drill-down chips in HS lookup, fee-composition visualization in results, and improved mobile responsiveness for app shell/sidebar/results.
- Admin governance upgrades: audit views now include "updated by" attribution using source metadata (including AutoFetcher/system updates).
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

### Current Release: v0.5.0

- Added full PHL 2026 customs compliance fee and tax engine: CMTA administrative fees (IPF, CDS, DST, LRF, brokerage), excise tax for 5 RA 10963/11467 categories (spirits, beer/wines, tobacco, automobiles, sweetened beverages, petroleum), corrected VAT base per NIRC Sec. 107, official-rate FX precedence (BSP -> BOC -> live -> cache -> fallback), and all three entry tiers (de minimis / informal / formal).
- Added goods classification engine: CMTA import type (Free / Regulated / Restricted / Prohibited) for all 99 HS chapters + 30+ heading overrides, agency clearance requirements with full names, strategic trade / STMO flag (RA 10697), VAT-exempt goods flag (NIRC Sec. 109), and FTA Certificate of Origin form identification for 9 PHL FTA schedules.
- Import Classification panel added to calculation results: import-type badge, agency clearance list, CoO alert, strategic trade warning, and VAT-exempt note.
- CoO hint shown under schedule selector when a non-MFN FTA schedule is chosen.
- Additional hardening updates in this pass: official HS lookup in-flight dedup + stale-cache fallback, HTML ingestion text-pattern fallback, compliance rule refinements for de minimis/FDA/NTC messaging, chapter drill-down search UI, fee composition chart, mobile layout upgrades, and admin audit actor attribution.
- Total suite now 197/197 passing.

Full release details:

- [docs/changelog/v0.5.0.md](docs/changelog/v0.5.0.md)
- [docs/changelog/v0.4.1.md](docs/changelog/v0.4.1.md)
- [CHANGELOG.md](CHANGELOG.md)

## Calculation Model Snapshot (v0.5.0)

The calculator currently follows this server-side sequence:

1. Resolve HS code and schedule.
2. Convert FOB to PHP using customs-priority FX flow.
3. Apply Section 800 exemption rules (when eligible) and adjust FOB.
4. Run de minimis check and entry-type classification.
5. Compute dutiable value, duty/surcharge, and excise.
6. Apply trade remedy duties (anti-dumping, countervailing, safeguard) when provided.
7. Apply global/admin fees plus logistics costs.
8. Build landed-cost subtotal (VAT base), then compute VAT and final landed cost.
9. Compute surcharge/penalty estimates (undervaluation, misclassification, late interest) and final total payable.

Core formulas used in the current engine:

```text
Adjusted FOB PHP = max(0, FOB PHP - Section800 Exempt Amount)
Dutiable Value PHP = Adjusted FOB PHP + Insurance PHP + Freight PHP

Landed Cost Subtotal PHP (VAT Base) =
   Dutiable Value
   + Duty + Surcharge + Trade Remedies + Excise
   + Brokerage + IPF/IPC + CSF + Transit Charge
   + CDS + DST/IRS + LRF
   + Arrastre/Wharfage + Dox Stamp & Others

VAT PHP = Landed Cost Subtotal PHP x VAT Rate
Total Landed Cost PHP = Landed Cost Subtotal PHP + VAT PHP
Total Payable PHP = Total Landed Cost PHP + Total Penalties PHP
```

Port and handling behavior in v0.5.0:

- Arrival date selects 2026 tariff tranche for estimated arrastre/wharfage/storage.
- Storage charges begin after the free-storage period (default 5 days).
- Manual Arrastre/Wharfage input overrides estimated total when provided.

Additional output layers:

- Section 800 exemption result (eligible/not eligible, exempt amount, reason)
- Valuation-reference risk indicator (low/medium/high)
- EO 114 petroleum advisory notice (when conditions are met)
- Import classification panel (CMTA import type, agency clearances, CoO, strategic-trade and VAT-exempt flags)

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
- [x] HS code chapter drill-down chips for guided lookup by Chapter -> Heading -> Sub-heading
- [x] Remote-first official HS lookup suggestions via Tariff Commission Finder, with cached server responses and local fallback
- [x] Official lookup request deduplication and stale-cache fallback during temporary upstream outages
- [x] Compliance requirement checks by HS code/category/value
- [x] Calculator page with real-time results and FX context display
- [x] Batch Import page with CSV parse, preview, calculate, and export
- [x] Batch Import CSV alias mapping and template guidance for reordered headers
- [x] Tariff Browser page with search and category filtering
- [x] Browser report export for calculation output
- [x] HS catalog import pipeline for CSV/XLS sources into `hs_codes`
- [x] Tariff data ingestion workflow with Admin preview/import workspace, including CSV/XLS/XLSX upload support
- [x] Runtime settings operations panel (health state, latest source visibility, manual runtime refresh, and robust save/reset persistence)
- [x] PHL 2026 customs compliance fee engine: CMTA administrative fees (IPF/CDS/DST/LRF/brokerage), excise tax categories (spirits, beer/wines, tobacco, automobiles, sweetened beverages, petroleum), corrected VAT base, BOC weekly FX rate, de minimis / informal / formal entry tiers
- [x] Goods classification engine: CMTA import type (Free/Regulated/Restricted/Prohibited), agency clearance requirements, strategic trade / STMO flag (RA 10697), VAT-exempt goods flag (NIRC Sec. 109), FTA Certificate of Origin identification for 9 PHL FTA schedules
- [x] Import Classification panel in calculator results and CoO schedule hint in the calculator form
- [x] Fee-composition visual breakdown (chart + legend) in calculation results
- [x] Trade remedy duties, surcharge/penalty estimates, and total payable computation in batch and calculator outputs
- [x] Admin audit "updated by" attribution surfaced in UI and exports
- [x] Responsive layout refinements for app shell/sidebar/results on mobile

### In Progress
- [x] Data management/admin UI for tariff source imports and review queue (single-row and bulk review actions, confidence filtering, and governance summaries)
- [x] Server-side Customs/BIR/Tariff Commission website fetch proxy
- [x] Automated cron-scheduled regulatory fetcher (BOC and Tariff Commission; fetched rows queued for human review)
- [x] Customs/BIR/Tariff Commission source adapters (HTML table extraction, linked CSV/XLS/XLSX autodetection, and PDF extraction path)
- [x] Tariff source governance views (import status, confidence, and rate change audit)

### Planned
- [ ] Automated historical tariff tracking and comparison dashboards
- [ ] Data import/export tooling improvements (broader export coverage and richer conflict-resolution UX beyond the current Admin preview/source CSV exports)
- [ ] Offline mode enhancements

## Setup Instructions

Use this quick-start when running locally for website development.

### Prerequisites
- Node.js 20.19+ (https://nodejs.org/)
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

### Admin API Key (Recommended for Deployed Environments)

Set `ADMIN_API_KEY` in your environment to protect admin/runtime/import/review routes.

- Protected routes include:
   - `PUT /api/runtime-settings`
   - `/api/import/*`
   - `/api/import-jobs/*`
   - `/api/review-rows/*`

Provide the key using either header:

- `x-admin-api-key: <your-secret>`
- `Authorization: Bearer <your-secret>`

Browser admin UI note:

- The frontend automatically sends `x-admin-api-key` for protected routes when either is set:
   - `VITE_ADMIN_API_KEY` (build-time env), or
   - `localStorage['customs-admin-api-key']`

When `ADMIN_API_KEY` is unset, these routes keep legacy open behavior for local development.

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

1. **Exchange Rates:** For PHP valuation pairs, the calculator prioritizes BSP reference rates, then BOC weekly rates, then live market API rates, then cached market rates, then hardcoded fallback rates. Official source page format changes can affect automated parsing until adapters are updated.
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
- 0.5.0 release notes: [docs/changelog/v0.5.0.md](docs/changelog/v0.5.0.md)
- 0.4.1 release notes: [docs/changelog/v0.4.1.md](docs/changelog/v0.4.1.md)
- 0.4.0 release notes: [docs/changelog/v0.4.0.md](docs/changelog/v0.4.0.md)
- 0.3.0 release notes: [docs/changelog/v0.3.0.md](docs/changelog/v0.3.0.md)
- 0.2.0 release notes: [docs/changelog/v0.2.0.md](docs/changelog/v0.2.0.md)
- 0.1.0 release notes: [docs/changelog/v0.1.0.md](docs/changelog/v0.1.0.md)

---

**Last Updated:** May 2, 2026
