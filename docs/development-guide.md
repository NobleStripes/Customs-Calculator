# Development Guide

This document covers common contributor workflows for extending and maintaining Customs-Calculator.

## Maintaining HS Code Coverage

The server and browser fallback share `src/shared/data/ahtn2022.json`, a snapshot of
the [Tariff Commission Finder's public catalog](https://finder.tariffcommission.gov.ph/item_search).
The snapshot contains 13,391 distinct base codes across chapters 01–97, excluding
reserved chapter 77. It includes selectable 6, 8, and 10-digit codes. Heading
descriptions provide context for entries such as "Other"; headings themselves
are not selectable codes. FTA-specific "ex" concessions and duplicate records
are excluded. Legacy seed entries are retained for existing calculations.

Refresh the snapshot with:

```bash
npm run catalog:update
```

The updater downloads every page, verifies record counts and chapter coverage,
and writes source metadata, retrieval time, and a SHA-256 digest with the snapshot.
Review the resulting diff and run `npm test -- --run` before committing it.
Rebuild the browser and restart the API to apply the updated snapshot. API startup
adds missing rows and refreshes seed descriptions; manually imported descriptions,
categories, restrictions, units, and existing tariff rates are preserved.

**Code coverage and rate coverage are separate.** The snapshot contains code
metadata only. The bundled calculation fallback still has the existing 15 MFN
rate rows. Add rates through the existing tariff ingestion and approval workflow;
do not copy a six-digit parent rate onto new AHTN subcodes or assume zero duty.
Calculation rejects codes without an approved rate for the selected schedule.

The snapshot is labelled AHTN-2022. Use the existing catalog-version migration
workflow for a new nomenclature edition instead of changing the label on old data.

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

## Release Workflow

Use this checklist before cutting a release tag.

```bash
# 1) Validate release metadata consistency
npm run release:check

# 2) Run pre-release quality gates
npm run release:prepare
```

`release:check` verifies version alignment between `package.json`, `package-lock.json`, `CHANGELOG.md` package note, `README.md` current release heading, and the current release entry in `CHANGELOG.md`.

If you are releasing a new version:

1. Update `package.json` version.
2. Ensure `package-lock.json` top-level versions match.
3. Add `docs/changelog/vX.Y.Z.md`.
4. Mark that version as current in `CHANGELOG.md`.
5. Update `README.md` current release heading and release links.
6. Re-run `npm run release:check`.

## Contributor Notes

- Prefer updating the dedicated docs when calculation or architecture behavior changes.
- Keep computed duties, taxes, and landed-cost outputs in PHP when modifying calculation code.
- When changing import, seed, or tariff-catalog behavior, verify duplicate HS/tariff entries are not reintroduced.
