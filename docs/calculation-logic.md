# Calculation Logic

This document describes the current landed-cost and tax computation flow used by the API calculator.

## Scope and Principles

- All computed amounts are normalized to PHP.
- HS code and schedule resolution are always performed before any tariff math.
- The server-side `/api/calculate/batch` path is the authoritative implementation.
- Section 800 user-status exemptions, port handling estimates, and valuation-reference risk checks are part of the current model.
- Trade remedy duties and surcharge/penalty estimates are part of the current model.
- Outputs are estimates and must be validated against the latest BOC/BIR/PPA issuances before filing.

## HS Catalog Strategy (PH 2026)

For a professional Philippine calculator, the catalog should prioritize precision over a flat "show everything" list.

- Base nomenclature: `AHTN 2022`.
- Calculation-grade code requirement: use `8-digit` (or more granular) HS/AHTN codes for duty/tax computation.
- 6-digit codes are useful for discovery and narrowing, but are not sufficient for final-rate certainty.

Recommended product strategy:

- `Core catalog` (top-heavy): maintain a curated high-usage set for consumer and e-commerce flows.
- `Long-tail` lookup: route niche/industrial queries to official lookup (Tariff Commission Finder) on demand.
- `Search noise control`: avoid over-prioritizing Chapter 99 and highly technical headings in default ranking.

Required search behavior:

- Synonym mapping (example: "drone" -> `8806.21.xx` candidates).
- Common-name matching against legal tariff descriptions.
- Clear escalation path when unresolved classification needs a formal ruling (BOC VCD reference).

Compliance-first UX expectation:

- Regulated headings should surface permit advisories early (example: NTC advisory for telecom/radio equipment headings) before checkout-style tax decisions.

Versioning and migration guardrails:

- Keep tariff catalogs versioned by nomenclature edition (current: `AHTN 2022`).
- Prepare mapping tables/workflows for future migrations (AHTN 2028 consultations are underway).
- Treat one-time full dumps as temporary; treat update pipelines and mapping quality as long-term system assets.

## Input Model

Core shipment inputs:

- FOB value
- Freight
- Insurance
- HS code
- Tariff schedule code (defaults to `MFN`)
- Origin country
- Destination port
- Input currency
- Declaration type: `consumption`, `warehousing`, `transit`
- Container size: `none`, `20ft`, `40ft`
- Arrastre / Wharfage (optional manual override)
- Dox Stamp & Others

New status and logistics inputs:

- Date of arrival
- Storage delay days
- Item condition: `new` or `used`
- Importer status: `standard`, `balikbayan`, `returning_resident`, `ofw`
- Returning resident months abroad
- Balikbayan boxes this year
- Commercial quantity flag
- OFW home appliance privilege flags

Excise-related inputs (when applicable):

- Excise category (or auto-detected from HS)
- Excise quantity and unit
- NRP/dutiable basis value
- Sweetened beverage sugar type
- Petroleum product type

## High-Level Sequence

For each shipment:

1. Normalize and resolve HS code and schedule code.
2. Convert FOB to PHP (for exemption and valuation checks).
3. Evaluate Section 800 exemption and compute exempt amount.
4. Derive adjusted FOB: `max(0, FOB PHP - exempt amount)`.
5. Compute valuation-reference risk indicator (warning-only; no direct tax adjustment).
6. Evaluate de minimis from adjusted FOB and HS chapter rules.
7. If de minimis-exempt, return zero tax amounts with logistics/context outputs.
8. Otherwise convert freight/insurance to PHP, apply insurance benchmark when insurance is zero.
9. Build dutiable value, entry type, duty/surcharge, and excise.
10. Apply trade remedy duties (anti-dumping, countervailing, safeguard) when provided.
11. Compute brokerage and global fees (IPF, CSF, transit, CDS, DST/IRS, LRF).
12. Estimate port handling (arrastre, wharfage, storage) by arrival date tranche; use as fallback when manual arrastre/wharfage is zero.
13. Build landed-cost subtotal (VAT base), compute VAT, and total landed cost.
14. Estimate surcharge/penalty components (undervaluation, misclassification, late payment interest) and total payable.
15. Attach import-classification data, compliance data, FX trace data, and notices (including EO 114 advisory for petroleum scenarios).

## FX Rules

The converter follows this precedence for PHP conversions:

1. BSP reference rate
2. BOC weekly customs exchange rate
3. Live market API rate
4. Cached market rate
5. Hardcoded fallback rates

Official-rate lookups are cached (BSP: daily TTL; BOC: weekly TTL).

## Section 800 Exemption Logic

### Balikbayan

- Eligible when all are true:
  - boxes this year `<= 3`
  - total FOB value `<= 150,000 PHP`
  - not commercial quantity
- Exempt amount: `min(FOB PHP, 150,000)`

### Returning Resident

- Requires used personal effects and sufficient months abroad.
- Exemption cap by stay duration:
  - `>= 6` months: `150,000 PHP`
  - `>= 60` months: `250,000 PHP`
  - `>= 120` months: `350,000 PHP`
- Exempt amount: `min(FOB PHP, cap)`

### OFW

- Eligible when home-appliance privilege is claimed and not already availed in the year.
- Estimate-mode exempt amount: `min(FOB PHP, 150,000)`

When no Section 800 path is eligible, exempt amount is zero.

## De Minimis and Entry Type

### De Minimis

- Threshold: `10,000 PHP` FOB equivalent.
- Checked against adjusted FOB (after Section 800 exemption).
- Exemption does not apply to chapter 22 and 24 goods (alcohol/tobacco excise-always-taxed chapters).

### Entry Type

- `de_minimis` when dutiable value `<= 10,000 PHP`
- `informal` when dutiable value `10,001` to `50,000 PHP`
- `formal` when dutiable value `> 50,000 PHP`

## Core Tax and Fee Formulas

### Dutiable Value

```text
Dutiable Value PHP = Adjusted FOB PHP + Insurance PHP + Freight PHP
```

Insurance benchmark rule:

- If declared insurance is `0`:
  - general goods: `2%` of FOB PHP
  - dangerous goods chapters 28/36/38: `4%` of FOB PHP

### Duty, Surcharge, Excise

```text
Duty Amount PHP = Dutiable Value PHP x Duty Rate
Surcharge PHP = Dutiable Value PHP x Surcharge Rate
Excise PHP = category-specific (ad valorem + specific components)
Trade Remedy PHP = Anti-Dumping + Countervailing + Safeguard
```

### Brokerage Fee

Tiered brokerage schedule based on dutiable value (PHP):

```text
<= 50,000       => 1,000
<= 75,000       => 1,500
<= 100,000      => 2,000
<= 150,000      => 2,500
<= 200,000      => 3,000
<= 250,000      => 3,500
<= 300,000      => 4,000
<= 400,000      => 4,500
<= 500,000      => 5,000
<= 750,000      => 5,500
<= 1,000,000    => 6,000
<= 1,500,000    => 7,000
<= 2,000,000    => 8,000
<= 5,000,000    => 9,000
>  5,000,000    => 10,000
```

### Import Processing Fee (IPF)

For non-transit declarations:

```text
<= 25,000       => 250
<= 50,000       => 500
<= 250,000      => 750
<= 500,000      => 1,000
<= 750,000      => 1,500
<= 1,000,000    => 2,000
<= 2,000,000    => 2,500
<= 5,000,000    => 3,000
>  5,000,000    => 4,000
```

Transit declaration override:

```text
Transit Charge PHP = 1,000
IPC PHP = 250
```

### CSF and Documentary Charges

```text
CSF USD = 0 (none), 5 (20ft), 10 (40ft)
CSF PHP = converted CSF USD
CDS PHP = 100
IRS/DST PHP = 30
LRF PHP = 10
```

### Port and Handling Fee Estimate (2026)

Tranche selection by arrival date:

- `2026-h1`: 2026-01-01 to 2026-06-30
- `2026-h2`: 2026-07-01 onward

Estimator behavior:

- Arrastre base for 20ft:
  - `2026-h1`: `1,612 PHP`
  - `2026-h2`: `1,758 PHP`
- 40ft uses 2x multiplier.
- Wharfage is estimated by dutiable-value percentage with a floor.
- Storage starts after 5 free days: `max(0, floor(delayDays) - 5)`.

If user-entered `arrastreWharfage > 0`, that manual value is used. Otherwise, the calculated port-handling total is used.

### Global Fees Total

```text
Total Global Fees PHP = Transit Charge + IPC + CSF + CDS + IRS + LRF
```

### VAT Base and VAT

```text
Landed Cost Subtotal PHP (VAT Base) =
  Dutiable Value
  + Duty Amount
  + Surcharge
  + Trade Remedy Duties
  + Excise
  + Brokerage
  + IPC
  + CDS
  + IRS
  + LRF
  + Transit Charge
  + CSF
  + Arrastre/Wharfage
  + Dox Stamp & Others

VAT PHP = Landed Cost Subtotal PHP x VAT Rate
```

For most rows VAT rate is `12%`; exemptions are represented through classification flags and tariff data behavior.

### Final Totals

```text
Total Item Tax PHP = Duty + Surcharge + Excise + VAT
Total Tax and Fees PHP = Total Item Tax + Total Global Fees
Total Landed Cost PHP = Landed Cost Subtotal + VAT
```

## Surcharges and Penalties (Estimate Mode)

Penalty computation is additive and applied after landed-cost computation.

```text
Undervaluation Deficiency Value = max(0, Assessed Customs Value - Declared Dutiable Value)
Undervaluation Surcharge = (Deficiency Duty/Tax Estimate) x 250%
  where Deficiency Duty/Tax Estimate uses duty + surcharge + trade remedy + VAT rate components
  and applies only when Assessed Customs Value > 110% of Declared Dutiable Value

Misclassification Surcharge = Base Duty/Tax Estimate x 250%
  where Base Duty/Tax Estimate = Duty + Surcharge + Trade Remedies + Excise + VAT
  and applies only when misclassificationDetected is true and clericalError is false

Late Payment Interest = Base Duty/Tax Estimate x 20% x (latePaymentDays / 365)

Total Penalties PHP = Undervaluation Surcharge + Misclassification Surcharge + Late Payment Interest
Total Payable PHP = Total Landed Cost PHP + Total Penalties PHP
```

## Valuation Reference Risk Indicator

This does not directly change taxes in the current engine. It emits warnings when declared value appears materially below heading-level indicative references.

Risk levels:

- `high`: declared value below 50% of indicative reference
- `medium`: declared value below 100% of indicative reference
- `low`: no trigger or within range

## EO 114 Advisory Hook

When excise category is petroleum and arrival date is on/after `2026-03-01`, the response includes an advisory notice that temporary energy-emergency relief may affect effective excise treatment.

The advisory is informational and does not automatically override excise rates.

## Output Model

Each result row returns:

- Duty, surcharge, VAT, excise breakdown
- Cost base and fee breakdowns (including LRF)
- De minimis state and entry type
- Insurance benchmark flag
- Import classification panel data
- Section 800 exemption result
- Port handling fee estimate result
- Valuation-reference risk result
- Optional EO 114 advisory notice
- FX metadata (`applied`, `rateToPhp`, source, timestamp)
- Trade remedy breakdown (anti-dumping, countervailing, safeguard, total)
- Penalty breakdown (undervaluation, misclassification, late interest, total)
- Total payable (`totalPayable`) in addition to landed cost

## Validation and Error Rules

- HS code is required and resolved before computation.
- FOB must be a valid number > 0.
- Freight and insurance must be numeric.
- Unknown HS/tariff rows return handled errors.
- Missing approved tariff rows for HS + schedule return handled errors.
- Destination port is normalized to supported port aliases.

## Compliance and Classification Sidecar Data

The calculation response includes compliance requirement output and import-classification output (import type, agency clearances, strategic trade flag, VAT-exempt flag, and CoO requirement), which are displayed in the results UI but are not arithmetic operands in the core landed-cost formulas.
