# Philippines Customs Calculator

Customs-Calculator is a browser-based tool for Philippine import costing and compliance pre-checks, built with React and TypeScript. The current website release supports HS code search with ranked suggestions, duty and VAT computation including surcharge-aware taxable base, multi-currency workflows with PHP as the computation base, batch shipment processing, tariff browsing, compliance checks, and browser-based report export. It is designed for SMEs, brokers, and operations teams that need consistent landed-cost estimates before final confirmation against official Bureau of Customs and BIR issuances.

## Quick Summary

- Production-ready operator workflows: single calculation, batch calculation, tariff browsing, compliance checks, and PDF export.
- Accurate cost logic: surcharge-aware VAT base and PHP-based tariff math for non-PHP inputs, with computed duties, taxes, and landed-cost outputs shown in PHP. All fee logic (brokerage, IPC, CSF, transit charge) runs server-side so single-item and batch calculations are always consistent, and missing tariff rows now fail explicitly instead of silently defaulting to zero.
- Search quality upgrades: ranked HS results, code normalization, and keyboard navigation.
- Data platform foundation in place: source import jobs, review queue, audit tables, and HS catalog CSV/XLS import endpoints are implemented.
- Automated regulatory fetcher: cron-scheduled job discovers and ingests data files from BOC, BIR, and Tariff Commission pages; all auto-fetched rows go to the human review queue before being applied.
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

## Features

### Completed
- [x] React + TypeScript website scaffold
- [x] Browser-side seeded data model for HS codes, tariff rates, compliance rules, and fallback FX rates
- [x] Duty and VAT computation engine (effective-date aware tariff lookup)
- [x] Backend-first duty, VAT, and compliance calculation against the SQLite tariff catalog
- [x] VAT taxable base calculation includes surcharge
- [x] Multi-currency calculator flow (converts shipment values to PHP for computation while computed outputs stay in PHP)
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
- [x] Automated cron-scheduled regulatory fetcher (BOC and Tariff Commission; fetched rows queued for human review)
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

## Documentation

- Architecture: [docs/architecture.md](docs/architecture.md)
- Calculation logic: [docs/calculation-logic.md](docs/calculation-logic.md)
- Development guide: [docs/development-guide.md](docs/development-guide.md)

## Detailed Technical Notes

The detailed architecture and calculation references have been moved into dedicated docs:

- Architecture, project structure, schema, services, and API surface: [docs/architecture.md](docs/architecture.md)
- Current landed-cost formulas, fee rules, validation, and PHP output behavior: [docs/calculation-logic.md](docs/calculation-logic.md)

## Development Guide

Contributor workflows, extension patterns, testing commands, and maintenance notes are documented in [docs/development-guide.md](docs/development-guide.md).

## Known Issues & Limitations

1. **Exchange Rates:** Live rates are fetched from `exchangerate-api.com` (free tier, ~1,500 req/month) and cached for 24 hours in SQLite. Fallback hardcoded rates are used when the API is unavailable.
2. **Structured Extraction:** The regulatory fetcher discovers and downloads `.csv`/`.xlsx` links from approved government sources and can extract simple HTML tariff tables, but deeper memo/PDF parsing is still incomplete.
3. **Seeded Data Scope:** The built-in dataset is intentionally small and suitable for demo/operator workflow validation, not full production tariff coverage. Import your own tariff schedules via the CSV/XLS import pipeline.
4. **Admin Tooling:** Import/review workflow UI and broader source governance are still in progress, though tariff source visibility is now surfaced in the admin page.
5. **Estimate-Only Output:** The calculator is intended for planning/reference workflows. Verify the final tariff treatment, fees, and documentary requirements with current BOC/BIR issuances before filing.

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

### v0.2.0 (Current)
- Added first-class tariff schedule support across the calculator, tariff browser, tariff import pipeline, batch shipment workflows, and exported calculation documents.
- Added seeded tariff schedule metadata for MFN plus named FTA agreement options such as AANZFTA, ACFTA, AJCEPA, ATIGA, PJEPA, PH-KR FTA, PH-EFTA FTA variants, and RCEP.
- Upgraded HS code search reliability with better normalization, ranking, input validation, and stale-result handling.
- Added server-backed tariff-rate preview/import endpoints and schedule-aware tariff row storage using `schedule_code` on `tariff_rates`.
- Improved tariff import normalization so percentage-style inputs like `1%` are stored correctly as decimal rates.
- Added PDF/report output schedule metadata and surfaced schedule context in calculator and batch-import UX.
- Replaced the vulnerable spreadsheet dependency path with an audit-clean XLSX reader flow for HS catalog imports.
- Cleaned up backend TypeScript typing so lint, targeted tests, and build now pass cleanly.
- Fixed silent `calculation_history` data-loss bug (wrong column names in INSERT).
- Completed automated regulatory fetcher: daily cron job discovers `.csv`/`.xlsx` data files from BOC and Tariff Commission pages and imports them into the review queue.
- Added rate limiting (10 req/min) to outbound website-fetch endpoints.
- Unified single-item and batch fee calculations so all brokerage, IPC, CSF, and VAT-base logic runs exclusively server-side.
- Compliance checker now surfaces a warning when the destination port is not a recognized Philippine port.

### v0.1.0
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

**Last Updated:** April 27, 2026
