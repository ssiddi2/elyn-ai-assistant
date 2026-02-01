
# Claims-Ready Print Report for Multi-Hospital Billing Submission

## Overview

This plan creates a new **ClaimsReadyPrintReport** component that transforms billing data into a print-optimized, claims-compliant format. It supports physicians rounding at multiple hospitals by grouping bills by facility, with all required insurance and patient data properly formatted.

## What You'll Get

### Print Report Features
- **Claims-formatted patient names** - "LASTNAME, FIRSTNAME" uppercase format (no special characters)
- **Complete patient identifiers** - DOB (MM/DD/YYYY), MRN, Insurance Member ID
- **Full insurance details** - Payer name, Group number, Plan type, Subscriber info
- **Facility grouping** - Bills organized by hospital with subtotals per facility
- **Provider information** - Rendering provider name and NPI number
- **Professional layout** - Clean, print-optimized design with ELYN branding

### Report Structure

```text
+--------------------------------------------------+
|  ELYN CLAIMS BILLING REPORT                      |
|  Generated: Jan 31, 2026 | Period: Jan 1-31      |
|  Provider: Dr. Smith | NPI: 1234567890           |
+--------------------------------------------------+
|                                                  |
|  FACILITY: LiveMed General Hospital              |
+--------------------------------------------------+
| Patient (LAST, FIRST) | DOB | MRN | Insurance    |
| DOS | CPT | Mod | Dx | RVU | Status              |
+--------------------------------------------------+
| SMITH, JOHN           | 01/15/1960 | 12345      |
| Blue Cross | BC123456 | Grp: 999                 |
| 01/28/26 | 99223 | 25 | I50.9 | 3.86 | Pending   |
+--------------------------------------------------+
| Facility Subtotal: 5 bills | 12.50 RVU           |
+--------------------------------------------------+
|                                                  |
|  FACILITY: Memorial Regional                     |
|  [same structure repeated]                       |
+--------------------------------------------------+
|                                                  |
|  GRAND TOTAL: 12 bills | 28.75 RVU | $1,150.00  |
+--------------------------------------------------+
```

## Implementation Steps

### Step 1: Extend Billing Data to Include Patient Insurance Info

The `useBilling` hook currently fetches patient name, MRN, and DOB. I'll extend the query to also retrieve:
- `insurance_id`
- `insurance_name`
- `insurance_group`
- `insurance_plan_type`
- `subscriber_name`
- `subscriber_relationship`

This requires updating the `UnifiedBill` interface and the data fetching logic in `useBilling.ts`.

### Step 2: Create ClaimsReadyPrintReport Component

A new component at `src/components/billing/ClaimsReadyPrintReport.tsx` that:

1. **Groups bills by facility** - Uses `_.groupBy` or similar logic to organize data
2. **Applies claims formatting** - Uses existing `formatClaimsName()` and `formatClaimsDOB()` utilities
3. **Shows insurance details** - Displays payer, member ID, group number for each patient
4. **Includes provider header** - Shows rendering provider name and NPI from profiles table
5. **Calculates subtotals** - Per-facility RVU/bill counts and grand totals
6. **Print-optimized CSS** - Uses `@media print` rules for clean output

### Step 3: Add Claims Validation Indicator

Each row will show a small validation indicator:
- Green checkmark: All required claims fields present
- Yellow warning: Missing optional but recommended fields
- Red alert: Missing required fields (DOB, MRN, Insurance ID)

### Step 4: Update Export Modal with Claims Report Option

Add a "Print Claims Report" button to `RecordsExportModal.tsx` that:
- Opens the new ClaimsReadyPrintReport in a print-friendly view
- Allows filtering by facility before printing
- Respects existing date range and status filters

### Step 5: Add Print Styles

Create print-specific CSS in the component that:
- Removes screen-only UI elements
- Ensures proper page breaks between facilities
- Uses black/white color scheme for clean printing
- Sets appropriate margins and font sizes

---

## Technical Details

### File Changes

| File | Change |
|------|--------|
| `src/hooks/useBilling.ts` | Add insurance fields to UnifiedBill interface and fetch query |
| `src/components/billing/ClaimsReadyPrintReport.tsx` | **NEW** - Main claims report component |
| `src/components/billing/RecordsExportModal.tsx` | Add "Print Claims Report" button |
| `src/components/billing/BillsExportModal.tsx` | Add "Print Claims Report" button for manual bills |
| `src/lib/claimsFormatting.ts` | Add helper for formatting insurance display |

### UnifiedBill Interface Updates

New fields to add:
```typescript
// Insurance info (from patients table)
insurance_id: string | null;
insurance_name: string | null;
insurance_group: string | null;
insurance_plan_type: string | null;
subscriber_name: string | null;
subscriber_relationship: string | null;
```

### Claims Report Props

```typescript
interface ClaimsReadyPrintReportProps {
  bills: UnifiedBill[];
  startDate?: Date;
  endDate?: Date;
  providerName: string;
  providerNPI?: string;
  onClose: () => void;
}
```

### Facility Grouping Logic

Bills will be grouped using:
```typescript
const billsByFacility = bills.reduce((acc, bill) => {
  const facility = bill.facility || 'Unassigned';
  if (!acc[facility]) acc[facility] = [];
  acc[facility].push(bill);
  return acc;
}, {} as Record<string, UnifiedBill[]>);
```

## Benefits for Multi-Hospital Workflow

1. **One report, all hospitals** - View all facilities or filter to specific ones
2. **Print per facility** - Use facility filter to generate hospital-specific reports
3. **Claims-ready format** - All data formatted per CMS 1500/UB-04 standards
4. **Quick validation** - See at a glance which patients have complete data
5. **Professional output** - Clean layout suitable for submission documentation

