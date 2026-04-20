# Philippines Customs Calculator

A standalone desktop application for calculating Philippine customs duties, VAT, and import compliance requirements.

## Project Overview

**Tech Stack:**
- **Frontend:** React 18 with TypeScript
- **Desktop:** Electron 28
- **Backend:** Node.js with Express (embedded in Electron)
- **Database:** SQLite3 (better-sqlite3)
- **Build Tools:** Vite, esbuild
- **Styling:** CSS3 with modern features

**Architecture:**
- **`src/main/`** - Electron main process and IPC handlers
- **`src/renderer/`** - React frontend (SPA)
- **`src/backend/`** - Node.js backend services
- **`src/db/`** - Database schema and initialization

## Features

### Phase 1-2 (Completed)
✅ Project scaffolding with Electron + React + TypeScript
✅ SQLite database with tariff and HS code data
✅ Core calculator services:
  - Tariff duty calculation
  - VAT calculation
  - Currency conversion
  - HS code search
  - Compliance rule engine
✅ Frontend components:
  - Calculator page with real-time results
  - HS code autocomplete search
  - Calculation results display
  - Sidebar navigation
✅ IPC communication layer for secure main ↔ renderer communication

### Phase 3-4 (In Progress)
- Batch import processor
- Document generation (PDF)
- Tariff browser/database viewer
- Historical rate tracking

### Phase 5+ (Future)
- Export to CSV
- Report generation
- Data import/export
- Settings management
- Offline mode improvements

## Setup Instructions

### Prerequisites
- Node.js 18+ (https://nodejs.org/)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Development mode (with hot reload):**
   ```bash
   npm run dev
   ```
   This starts both the Electron main process and React dev server.

4. **Start production build:**
   ```bash
   npm start
   ```

5. **Package as standalone executable:**
   ```bash
   npm run dist
   ```
   Output will be in the `release/` directory.

## Project Structure

```
customs-calculator/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry point
│   │   ├── ipc.ts                 # IPC handlers (main ↔ renderer)
│   │   ├── preload.ts             # Preload script for secure context
│   │   └── utils.ts               # Utility functions
│   │
│   ├── renderer/                  # React frontend
│   │   ├── App.tsx                # Main app component
│   │   ├── index.tsx              # React entry point
│   │   ├── index.css              # Global styles
│   │   ├── App.css                # App layout styles
│   │   ├── pages/                 # Page components
│   │   │   └── Calculator.tsx     # Main calculator page
│   │   └── components/            # Reusable components
│   │       ├── Sidebar.tsx
│   │       ├── HSCodeSearch.tsx
│   │       └── CalculationResults.tsx
│   │
│   ├── backend/                   # Backend services
│   │   ├── db/
│   │   │   └── database.ts        # Database setup and seeding
│   │   └── services/
│   │       ├── tariffCalculator.ts    # Duty & VAT calculations
│   │       ├── complianceChecker.ts   # Compliance rules
│   │       └── currencyConverter.ts   # Currency conversion
│   │
│   └── types/                     # TypeScript type definitions
│
├── index.html                     # HTML entry point
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite configuration
├── electron-builder.json5         # Electron packaging config
└── README.md                      # This file
```

## Database Schema

### hs_codes
```sql
CREATE TABLE hs_codes (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,              -- e.g., '8471.30'
  description TEXT,              -- Product description
  category TEXT,                 -- Electronics, Food, Textiles, etc.
  created_at DATETIME
);
```

### tariff_rates
```sql
CREATE TABLE tariff_rates (
  id INTEGER PRIMARY KEY,
  hs_code TEXT,                  -- Foreign key to hs_codes
  duty_rate REAL,                -- Import duty rate (e.g., 0.10 for 10%)
  vat_rate REAL,                 -- Value-added tax rate (default 0.12)
  surcharge_rate REAL,           -- Additional surcharges
  effective_date DATE,           -- When rate becomes effective
  end_date DATE,                 -- Optional end date for rate
  created_at DATETIME
);
```

### compliance_rules
```sql
CREATE TABLE compliance_rules (
  id INTEGER PRIMARY KEY,
  hs_code_range TEXT,            -- HS code this rule applies to
  category TEXT,                 -- Product category
  required_documents TEXT,       -- Comma-separated list
  restrictions TEXT,             -- Comma-separated restrictions
  special_conditions TEXT,       -- Additional conditions
  created_at DATETIME
);
```

### exchange_rates
```sql
CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY,
  currency_pair TEXT UNIQUE,     -- e.g., 'USD_PHP'
  rate REAL,                     -- Exchange rate
  last_updated DATETIME
);
```

### calculation_history
```sql
CREATE TABLE calculation_history (
  id INTEGER PRIMARY KEY,
  hs_code TEXT,
  product_value REAL,
  currency TEXT,
  origin_country TEXT,
  duty_amount REAL,
  vat_amount REAL,
  total_landed_cost REAL,
  created_at DATETIME
);
```

## Key Services

### TariffCalculator
Handles all tariff and VAT calculations:
- `calculateDuty(value, hsCode, originCountry)` - Returns duty amount and rate
- `calculateVAT(dutiableValue, hsCode)` - Returns VAT amount
- `searchHSCodes(query)` - Searches HS codes by code or description
- `getHSCodeDetails(code)` - Gets detailed HS code info
- `calculateTotalLandedCost(...)` - Full cost calculation

### ComplianceChecker
Manages import compliance requirements:
- `getRequirements(hsCode, value, destination)` - Returns required documents, restrictions, warnings
- `isRestricted(hsCode)` - Checks if product is restricted
- `validateShipment(...)` - Validates entire shipment for compliance
- `getDocumentationSummary(...)` - Returns required documents and estimated processing time

### CurrencyConverter
Handles multi-currency conversion:
- `convert(amount, fromCurrency, toCurrency)` - Converts between currencies
- `convertToPhilippinePeso(amount, currency)` - Quick conversion to PHP
- `getConversionMatrix(baseCurrency)` - Gets all rates for a base currency
- Uses external API with offline fallback rates

## IPC Communication (Electron)

The app uses Electron's IPC for secure communication between main and renderer processes:

### Available IPC Handlers

**Database & Initialization:**
- `init-db` - Initialize and seed database

**Calculations:**
- `calculate-duty` - Calculate import duty
- `calculate-vat` - Calculate VAT
- `search-hs-codes` - Search for HS codes
- `get-compliance-requirements` - Get compliance info
- `convert-currency` - Currency conversion
- `batch-calculate` - Bulk calculations

**Usage from React:**
```typescript
const result = await (window as any).electronAPI.calculateDuty({
  value: 1000,
  hsCode: '8471.30',
  originCountry: 'CHN',
})
```

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
4. Rebuild and restart app

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

## Packaging

### Windows (.exe, .msi)
```bash
npm run dist
```
Creates installer in `release/` directory.

### macOS (.dmg, .zip)
Building on macOS:
```bash
npm run dist
```

### Linux (.AppImage, .deb)
Building on Linux:
```bash
npm run dist
```

## Known Issues & Limitations

1. **Exchange Rates:** Currency conversion requires internet connection. Falls back to static rates if API unavailable.
2. **Database Size:** Current SQLite setup supports ~100,000 HS codes. For larger datasets, consider migration to PostgreSQL.
3. **Performance:** Search across large HS code tables may slow down with >500,000 entries. Indexing is implemented but may need optimization.

## Future Enhancements

- [ ] Multi-user support with local profiles
- [ ] Cloud sync for calculation history
- [ ] Government API integration for real-time tariff updates
- [ ] Mobile app version
- [ ] Batch import from CSV/Excel
- [ ] PDF report generation
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
- Initial project scaffold
- Database schema and seeding
- Core calculator services
- Basic React frontend
- IPC communication layer
- Sidebar navigation
- HS code search
- Calculation results display

---

**Last Updated:** April 20, 2026
