# Philippines Customs Calculator

Customs-Calculator is a browser-based tool for Philippine import costing and compliance pre-checks, built with React and TypeScript. The current website release supports HS code search with ranked suggestions, duty and VAT computation including surcharge-aware taxable base, multi-currency workflows with PHP as the computation base, batch shipment processing, tariff browsing, compliance checks, and browser-based report export. It is designed for SMEs, brokers, and operations teams that need consistent landed-cost estimates before final confirmation against official Bureau of Customs and BIR issuances.

## Quick Summary

- Production-ready operator workflows: single calculation, batch calculation, tariff browsing, compliance checks, and PDF export.
- Accurate cost logic: surcharge-aware VAT base and PHP-based tariff math for non-PHP inputs, with computed duties, taxes, and landed-cost outputs shown in PHP.
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
