# Calculation Logic

This document describes the current landed-cost and tax computation flow used by the API calculator.

## Scope and Principles

- All computed amounts are normalized to PHP.
- HS code and schedule resolution are always performed before any tariff math.
- The server-side `/api/calculate/batch` path is the authoritative implementation.
- Section 800 user-status exemptions, port handling estimates, and valuation-reference risk checks are part of the current model.
- Outputs are estimates and must be validated against the latest BOC/BIR/PPA issuances before filing.

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
10. Compute brokerage and global fees (IPF, CSF, transit, CDS, DST/IRS, LRF).
11. Estimate port handling (arrastre, wharfage, storage) by arrival date tranche; use as fallback when manual arrastre/wharfage is zero.
12. Build landed-cost subtotal (VAT base), compute VAT, and total landed cost.
13. Attach import-classification data, compliance data, FX trace data, and notices (including EO 114 advisory for petroleum scenarios).

## FX Rules

The converter follows this precedence for PHP conversions:

1. BOC weekly customs exchange rate (when runtime setting `fxPreferBocRate = true`)
2. Live market API rate
3. Cached market rate
4. Hardcoded fallback rates

BOC rates are cached with a 7-day TTL.

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

## Validation and Error Rules

- HS code is required and resolved before computation.
- FOB must be a valid number > 0.
- Freight and insurance must be numeric.
- Unknown HS/tariff rows return handled errors.
- Missing approved tariff rows for HS + schedule return handled errors.
- Destination port is normalized to supported port aliases.

## Compliance and Classification Sidecar Data

The calculation response includes compliance requirement output and import-classification output (import type, agency clearances, strategic trade flag, VAT-exempt flag, and CoO requirement), which are displayed in the results UI but are not arithmetic operands in the core landed-cost formulas.
