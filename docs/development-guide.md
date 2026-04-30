# Development Guide

This document covers common contributor workflows for extending and maintaining Customs-Calculator.

## Adding New HS Codes

1. Edit `src/backend/db/database.ts` in the `seedInitialData()` function.
2. Add a new entry to `hsCodesData`:

```typescript
{ code: '1234.56', description: 'Product', category: 'Category' }
```

3. Add the matching tariff rate to `tariffData`:

```typescript
{ hs_code: '1234.56', duty_rate: 0.10, vat_rate: 0.12 }
```

4. Refresh the browser app or restart the local server so the updated seed data is applied.

### 2026 Catalog Curation Guidance

When extending HS coverage, prefer a weighted-catalog model over a blind full-list import:

1. Keep a curated high-usage core (consumer/e-commerce heavy headings).
2. Rely on official lookup for long-tail industrial headings.
3. Prefer adding 8-digit AHTN rows for computation paths; keep 6-digit entries as search helpers only.
4. Prioritize permit-sensitive headings (NTC/FDA/FPA/etc.) so compliance warnings trigger early.

For future nomenclature transitions, avoid hardcoding a single static edition. Keep import/migration pipelines ready for AHTN version rollover.

## Adding New Compliance Rules

Edit `src/backend/db/database.ts` in the `seedInitialData()` function and add a rule like this:

```typescript
{
  hs_code_range: '1234.56',
  category: 'NewCategory',
  required_documents: 'Doc1, Doc2',
  restrictions: 'Restriction1',
  special_conditions: 'Condition1',
}
```

## Building Components

Example workflow for adding a new page:

1. Create a component in `src/renderer/pages/MyPage.tsx`.
2. Add it to navigation in `App.tsx`:

```typescript
{currentPage === 'my-page' && <MyPage />}
```

3. Add a button to `Sidebar.tsx`:

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

## Linting and Formatting

```bash
# Check code style
npm run lint

# Auto-fix and format
npm run format
```

## Contributor Notes

- Prefer updating the dedicated docs when calculation or architecture behavior changes.
- Keep computed duties, taxes, and landed-cost outputs in PHP when modifying calculation code.
- When changing import, seed, or tariff-catalog behavior, verify duplicate HS/tariff entries are not reintroduced.