

# Plan: Add Echo/EKG Billing + Improve Patient Intake

## Overview

This plan addresses three needs:
1. Faster patient intake using EMR face sheets (already partially built - needs enhancement)
2. Add Echo and EKG billing codes to the system
3. CSV export is already working - no changes needed

---

## Part 1: Enhance Face Sheet Parser for Faster Patient Intake

The Face Sheet Parser already exists and works well. To make it even faster for physicians who have EMR access:

### Current Workflow (Already Available)
1. Copy face sheet text from EMR
2. Paste into ELYN Face Sheet Parser
3. AI extracts all patient info automatically
4. Review and save

### Enhancement: Add "Quick Paste" Button to Patient List

**File: `src/components/patients/PatientList.tsx`**
- Add a prominent "Paste Face Sheet" button alongside "Quick Add"
- Opens Face Sheet Parser directly
- One-click workflow: Copy from EMR → Click button → Paste → Save

### Enhancement: Image/Photo Capture for Face Sheets

**File: `src/components/facesheet/FaceSheetParser.tsx`**
- Add camera/photo upload option for mobile
- Use AI vision to read printed face sheets
- Useful for facilities with paper printouts

---

## Part 2: Add Echo and EKG Billing Codes

### New CPT Codes to Add

**File: `src/data/billingCodes.ts`**

#### Echocardiogram CPT Codes:
| Code | Description | RVU |
|------|-------------|-----|
| 93306 | TTE Complete with Doppler | 1.50 |
| 93307 | TTE Complete w/o Doppler | 1.30 |
| 93308 | TTE Limited/Follow-up | 0.92 |
| 93320 | Doppler Echo Complete | 0.40 |
| 93321 | Doppler Echo Follow-up | 0.25 |
| 93325 | Doppler Color Flow Add-on | 0.18 |
| 93350 | Stress Echo | 1.75 |
| 93351 | Stress Echo with Contrast | 1.90 |

#### EKG/ECG CPT Codes:
| Code | Description | RVU |
|------|-------------|-----|
| 93000 | EKG 12-Lead Complete | 0.17 |
| 93005 | EKG 12-Lead Tracing Only | 0.00 |
| 93010 | EKG 12-Lead Interpretation | 0.17 |
| 93015 | Stress Test Complete | 1.18 |
| 93016 | Stress Test Supervision | 0.45 |
| 93017 | Stress Test Tracing | 0.00 |
| 93018 | Stress Test Interpretation | 0.70 |
| 93040 | Rhythm EKG 1-3 Leads | 0.15 |
| 93042 | Rhythm EKG Interpretation | 0.15 |

---

## Part 3: Create Organized CPT Code Categories

Instead of a flat list, organize codes into categories for faster selection:

```text
CPT Categories:
├── E/M Codes (existing)
│   ├── Initial Hospital Care
│   ├── Subsequent Hospital Care
│   ├── Discharge Day
│   ├── Critical Care
│   └── Consults
├── Cardiac Procedures (NEW)
│   ├── Echocardiogram
│   └── EKG/ECG
└── (Future: Pulmonary, GI, etc.)
```

### UI Changes

**File: `src/components/billing/CreateBillModal.tsx`**
- Add tabs/accordion for code categories
- "E/M Codes" | "Echo" | "EKG" tabs
- Quick search/filter within each category

**File: `src/components/patients/QuickAddPatient.tsx`**
- Update billing code generation to recognize cardiac procedures
- If diagnosis mentions "echo", "echocardiogram", "cardiac", auto-suggest Echo codes
- If diagnosis mentions "EKG", "ECG", "arrhythmia", auto-suggest EKG codes

---

## Implementation Files

### Files to Modify:

1. **`src/data/billingCodes.ts`**
   - Add `ECHO_CPT_CODES` and `EKG_CPT_CODES` objects
   - Create `CPT_CATEGORIES` for organized display
   - Keep `CPT_CODES` for backwards compatibility

2. **`src/components/billing/CreateBillModal.tsx`**
   - Add tabbed interface for code categories
   - Include Echo and EKG sections

3. **`src/components/patients/QuickAddPatient.tsx`**  
   - Update AI code suggestions to include cardiac procedures

4. **`src/components/billing/BillsExportModal.tsx`**
   - No changes needed - already handles any CPT code

5. **`src/pages/Index.tsx`** (optional)
   - Add "Paste Face Sheet" shortcut to main patient area

### New Files (optional enhancement):

- `src/components/billing/CptCodeSelector.tsx` - Reusable code picker with categories

---

## Technical Details

### Updated billingCodes.ts Structure:

```typescript
// E/M Codes (existing)
export const CPT_CODES = { ... };

// Echocardiogram Codes (NEW)
export const ECHO_CPT_CODES = {
  '93306': { code: '93306', desc: 'TTE Complete with Doppler', rvu: 1.50 },
  '93307': { code: '93307', desc: 'TTE Complete w/o Doppler', rvu: 1.30 },
  // ... etc
};

// EKG Codes (NEW)
export const EKG_CPT_CODES = {
  '93000': { code: '93000', desc: 'EKG 12-Lead Complete', rvu: 0.17 },
  '93010': { code: '93010', desc: 'EKG Interpretation Only', rvu: 0.17 },
  // ... etc
};

// Combined for lookups
export const ALL_CPT_CODES = {
  ...CPT_CODES,
  ...ECHO_CPT_CODES,
  ...EKG_CPT_CODES,
};

// Categories for UI display
export const CPT_CATEGORIES = {
  'E/M': CPT_CODES,
  'Echo': ECHO_CPT_CODES,
  'EKG': EKG_CPT_CODES,
};
```

### Edge Function Update

**File: `supabase/functions/generate-note-with-billing/index.ts`**
- Update AI prompt to recognize cardiac procedures
- When transcript mentions Echo/EKG, suggest appropriate CPT codes
- No structural changes needed - just prompt refinement

---

## CSV Export

Already working. Current export includes:
- Patient Name, MRN, DOB
- Date of Service, Facility
- CPT Code, Description, Modifiers
- Diagnosis (ICD-10)
- RVU, Estimated Value
- Status, Provider

This will automatically include new Echo/EKG codes without modification.

---

## Workflow After Implementation

### Fastest Patient Intake (with EMR access):
1. Open patient in EMR
2. Copy face sheet text
3. Click "Paste Face Sheet" in ELYN
4. Paste → AI extracts everything
5. Review → Save (10 seconds total)

### Creating Echo/EKG Bill:
1. Open Create Bill
2. Select "Echo" or "EKG" tab
3. Pick specific code (93306, 93000, etc.)
4. Add patient info
5. Save

### CSV Export for Billing Software:
1. Go to Billing page
2. Click "Export"
3. Filter by date/facility if needed
4. Download CSV
5. Upload to billing software

