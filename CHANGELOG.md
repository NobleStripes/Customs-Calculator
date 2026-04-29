# Changelog

All notable changes to this project are tracked in versioned release-note files.

## Unreleased

- Implemented the dedicated BOC and Tariff Commission HTML tariff parser used by the auto-fetch HTML fallback path.
- Added an Admin tariff import workspace with CSV template download, preview, and import execution from the Tariff Sources tab.
- Expanded HTML parser coverage with Tariff Commission matrix fixtures and BOC memorandum negative fixtures based on real source page shapes.
- Fixed Batch Import CSV parsing so reordered headers and common alias names are mapped correctly.
- Removed the misleading Batch Import conflict-resolution control that was not connected to shipment-calculation behavior.

## Releases

- [v0.4.0](docs/changelog/v0.4.0.md) - Current
- [v0.3.0](docs/changelog/v0.3.0.md)
- [v0.2.0](docs/changelog/v0.2.0.md)
- [v0.1.0](docs/changelog/v0.1.0.md)

## Notes

- Project package version is currently `0.4.0`.
- For architecture and formula details, see [docs/architecture.md](docs/architecture.md) and [docs/calculation-logic.md](docs/calculation-logic.md).
