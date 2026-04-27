# Calculation Logic

This document describes the current landed-cost and tax calculation flow implemented by the app.

## Principles

- Shipment inputs such as FOB, freight, and insurance can be entered in non-PHP currencies.
- The calculator converts the taxable shipment value to PHP before tariff math runs.
- Computed duties, taxes, fees, VAT base, and landed-cost totals are kept and displayed in PHP.
- Single-shipment and batch calculations follow the same formula model.

## Input Model

The current shipment calculation accepts these major inputs:

- FOB value
- Freight
- Insurance
- HS code
- Tariff schedule, currently seeded with `MFN`
- Origin country
- Destination port
- Input currency
- Declaration type: `consumption`, `warehousing`, or `transit`
- Container size: `none`, `20ft`, or `40ft`
- Arrastre / Wharfage
- Dox Stamp & Others

## Calculation Sequence

For each shipment, the app performs these steps:

1. Resolve the selected or typed HS code to the canonical tariff code.
2. Resolve the tariff schedule, defaulting to `MFN` when no schedule is specified.
3. Compute the taxable shipment input amount as FOB + Freight + Insurance.
4. Convert that taxable amount to PHP when the input currency is not already PHP.
5. Resolve the latest active approved tariff row for the HS code and tariff schedule.
6. Compute duty and surcharge from the PHP taxable amount.
7. Compute brokerage, declaration-specific fees, and fixed documentary charges.
8. Build the VAT base in PHP.
9. Compute VAT from that PHP VAT base.
10. Return the duty, VAT, fee breakdown, and total landed cost in PHP.

## Formulas

### Taxable Value in PHP

```text
Taxable Value PHP = (FOB + Freight + Insurance) × FX Rate to PHP
```

If the input currency is already PHP, the FX rate step is skipped.

### Duty and Surcharge

```text
Duty Amount = Taxable Value PHP × Duty Rate
Surcharge Amount = Taxable Value PHP × Surcharge Rate
```

### Brokerage Fee

The current implementation uses a tiered brokerage schedule based on taxable value in PHP:

```text
<= 50,000 PHP      => 1,000
<= 75,000 PHP      => 1,500
<= 100,000 PHP     => 2,000
<= 150,000 PHP     => 2,500
<= 200,000 PHP     => 3,000
<= 250,000 PHP     => 3,500
<= 300,000 PHP     => 4,000
<= 400,000 PHP     => 4,500
<= 500,000 PHP     => 5,000
<= 750,000 PHP     => 5,500
<= 1,000,000 PHP   => 6,000
<= 1,500,000 PHP   => 7,000
<= 2,000,000 PHP   => 8,000
<= 5,000,000 PHP   => 9,000
>  5,000,000 PHP   => 10,000
```

## Global Fees

### Container Security Fee

```text
CSF USD = 0 for no container
CSF USD = 5 for 20ft
CSF USD = 10 for 40ft
CSF PHP = CSF USD converted to PHP
```

### Import Processing Charge

For non-transit declarations:

```text
<= 25000 PHP   => 250
<= 50000 PHP   => 500
<= 250000 PHP  => 750
<= 500000 PHP  => 1000
<= 750000 PHP  => 1500
>  750000 PHP  => 2000
```

For transit declarations:

```text
IPC PHP = 250
```

### Transit Charge

```text
Transit Charge PHP = 1000 when declaration type is transit
Transit Charge PHP = 0 otherwise
```

### Fixed Documentary Charges

```text
CDS PHP = 100
IRS PHP = 30
```

### Total Global Fees

```text
Total Global Fees PHP = Transit Charge + IPC + CSF + CDS + IRS
```

## VAT Base and VAT

```text
VAT Base PHP =
  Taxable Value PHP
  + Duty Amount
  + Surcharge Amount
  + Brokerage Fee PHP
  + Arrastre / Wharfage PHP
  + Dox Stamp & Others PHP
  + Total Global Fees PHP

VAT Amount PHP = VAT Base PHP × 12%
```

## Totals

```text
Total Item Tax PHP = Duty Amount + VAT Amount
Total Tax and Fees PHP = Duty Amount + VAT Amount + Total Global Fees PHP
Total Landed Cost PHP = VAT Base PHP + VAT Amount PHP
```

## Worked Example

This example uses the current implemented flow, not the older simplified duty-plus-VAT-only model.

### Inputs

- FOB: 1,000 USD
- Freight: 100 USD
- Insurance: 25 USD
- FX rate: 56 PHP per USD
- Duty rate: 5%
- Surcharge rate: 0%
- Declaration type: consumption
- Container size: 20ft
- Arrastre / Wharfage: 4,500 PHP
- Dox Stamp & Others: 265 PHP

### Computation

```text
Taxable Value PHP = (1000 + 100 + 25) × 56 = 63000.00
Duty Amount PHP = 63000.00 × 0.05 = 3150.00
Surcharge Amount PHP = 0.00
Brokerage Fee PHP = 5000.00
CSF PHP = 5 USD × 56 = 280.00
IPC PHP = 750.00
CDS PHP = 100.00
IRS PHP = 30.00
Total Global Fees PHP = 0 + 750 + 280 + 100 + 30 = 1160.00
VAT Base PHP = 63000 + 3150 + 0 + 5000 + 4500 + 265 + 1160 = 77075.00
VAT Amount PHP = 77075.00 × 0.12 = 9249.00
Total Landed Cost PHP = 77075.00 + 9249.00 = 86324.00
```

## Validation Rules

- HS code is required before calculation can run.
- Typed HS codes are validated against known tariff rows.
- Declared FOB value must be greater than 0.
- Freight and insurance must be numeric when supplied.
- Destination port is required for compliance checks and is normalized to supported Philippine port codes.
- Unknown tariff codes return handled errors instead of partial silent results.
- Missing approved tariff rows for the selected HS code and tariff schedule return handled errors instead of defaulting to zero.

## Output Rules

- Input values remain associated with the shipment input currency.
- FX metadata is retained for traceability.
- Duties, VAT, brokerage, global fees, VAT base, total tax and fees, and total landed cost are output in PHP.
- Batch calculations follow the same rule: computed amounts are returned in PHP even when the row input currency is not PHP.
- Outputs are estimate-only and should be validated against current BOC/BIR requirements before filing.
