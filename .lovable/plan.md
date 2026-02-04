
# Customizable Note Templates and Raw Transcription Mode

## Overview

Based on physician feedback, this plan adds two major capabilities to ELYN:

1. **"Raw Transcription" Mode** - A simple dictation mode that outputs verbatim transcript without AI structuring, so physicians can directly copy/paste into individual EHR fields
2. **Note Template Customization** - Ability to customize which sections appear in generated notes and in what order

## The Problem Being Solved

Many EHRs require physicians to enter note sections into separate fields (History, Exam, Assessment, Plan). When ELYN generates a fully-formed SOAP note, the physician must manually cut and paste each section into the correct EHR field. In these cases, having the raw transcript is faster and easier.

Additionally, different physicians have different documentation preferences - some may want a full SOAP note, others may prefer a streamlined format without certain sections.

---

## Feature 1: Raw Transcription Mode

### What You'll Get

A new "Raw" option alongside Quick/Ambient recording modes that:
- Transcribes speech without any AI processing
- Applies only medical term correction (metaprole to metoprolol, etc.)
- Outputs clean, verbatim text ready to paste into any EHR field
- Skips note generation and billing extraction entirely
- Shows a "Copy" button prominently for easy clipboard access

### User Flow

```text
Recording Sheet
+------------------------------------------+
|  [Clinical]  [Radiology]                 |
+------------------------------------------+
|  Recording Mode:                         |
|  [Quick] [Ambient] [Raw]   <-- NEW       |
|                                          |
|  "Plain dictation without AI formatting" |
+------------------------------------------+
|  [Transcript Area]                       |
|                                          |
|  Patient is a 65-year-old male with      |
|  chest pain radiating to left arm...     |
|                                          |
+------------------------------------------+
|  [Record]  [Copy to Clipboard]           |
|                    ^ (replaces Generate) |
+------------------------------------------+
```

### Implementation

1. **Update RecordingSheet.tsx**
   - Add `'raw'` to `RecordingMode` type: `type RecordingMode = 'quick' | 'ambient' | 'raw'`
   - Add a third button in the Recording Mode toggle
   - When in raw mode, change "Generate" button to "Copy to Clipboard"
   - Skip the `onGenerate` callback entirely when raw mode is active
   - Apply medical term correction but skip AI processing

2. **Files to modify:**
   - `src/components/recording/RecordingSheet.tsx`

---

## Feature 2: Note Template Customization

### What You'll Get

A new "Note Preferences" section in Profile Settings where physicians can:
- Choose a default note format (SOAP, APSO, or custom)
- Toggle specific sections on/off (Subjective, Objective, Assessment, Plan, etc.)
- Reorder sections via drag-and-drop or up/down buttons
- Save preferences that persist across sessions

### Available Templates

| Template | Section Order | Use Case |
|----------|---------------|----------|
| SOAP (default) | Subjective, Objective, Assessment, Plan | Standard documentation |
| APSO | Assessment, Plan, Subjective, Objective | Problem-focused notes |
| Brief | Assessment, Plan only | Quick follow-ups |
| Custom | User-defined | EHR-specific workflows |

### User Flow

```text
Profile Settings
+------------------------------------------+
|  Note Preferences                        |
+------------------------------------------+
|  Default Format: [SOAP ▼]                |
|                                          |
|  Sections to Include:                    |
|  ☑ Subjective (HPI, ROS, PMH, Meds)     |
|  ☑ Objective (Vitals, Exam, Labs)       |
|  ☑ Assessment                           |
|  ☑ Plan                                 |
|  ☐ Patient Education   <-- optional     |
|  ☐ Follow-up                            |
|                                          |
|  [Save Preferences]                      |
+------------------------------------------+
```

### Implementation

1. **Database: Use existing `preferences` JSONB column in `profiles` table**
   - No migration needed - the column already exists
   - Store preferences as: `{ noteFormat: 'soap', sections: { subjective: true, ... }, sectionOrder: [...] }`

2. **Create preferences hook: `src/hooks/useNotePreferences.ts`**
   - Fetch and cache preferences from profiles table
   - Provide update function to save changes
   - Export default preferences for new users

3. **Update ProfileSettings.tsx**
   - Add "Note Preferences" card below "Appearance"
   - Template dropdown (SOAP, APSO, Brief, Custom)
   - Section checkboxes with labels
   - Save button that persists to profiles.preferences

4. **Update edge function: `supabase/functions/generate-note-with-billing/index.ts`**
   - Accept `notePreferences` parameter
   - Dynamically build SOAP structure based on enabled sections
   - Respect section order in output

5. **Update AI service: `src/services/ai.ts`**
   - Pass note preferences to edge function

6. **Files to modify:**
   - `src/hooks/useNotePreferences.ts` (new file)
   - `src/pages/ProfileSettings.tsx`
   - `src/services/ai.ts`
   - `src/components/layout/CommandCenter.tsx`
   - `supabase/functions/generate-note-with-billing/index.ts`

---

## Technical Details

### Raw Mode Recording Changes

```typescript
// RecordingSheet.tsx - Recording Mode type update
type RecordingMode = 'quick' | 'ambient' | 'raw';

// New button in Recording Mode toggle
<button
  onClick={() => setRecordingMode('raw')}
  className={cn(...)}
>
  <FileText className="w-4 h-4" />
  Raw
</button>

// Conditional action button
{recordingMode === 'raw' ? (
  <Button onClick={handleCopyToClipboard}>
    <Copy className="w-5 h-5 mr-2" />
    Copy to Clipboard
  </Button>
) : (
  <Button onClick={onGenerate}>
    <Sparkles className="w-5 h-5 mr-2" />
    Generate
  </Button>
)}
```

### Note Preferences Interface

```typescript
// src/hooks/useNotePreferences.ts
interface NotePreferences {
  noteFormat: 'soap' | 'apso' | 'brief' | 'custom';
  sections: {
    subjective: boolean;  // HPI, ROS, PMH, Medications, Allergies
    objective: boolean;   // Vitals, Physical Exam, Labs
    assessment: boolean;  // Diagnosis, Problem List
    plan: boolean;        // Treatment, Follow-up
    patientEducation: boolean;
    followUp: boolean;
  };
  sectionOrder: string[];  // ['subjective', 'objective', 'assessment', 'plan']
}

const DEFAULT_PREFERENCES: NotePreferences = {
  noteFormat: 'soap',
  sections: {
    subjective: true,
    objective: true,
    assessment: true,
    plan: true,
    patientEducation: false,
    followUp: false,
  },
  sectionOrder: ['subjective', 'objective', 'assessment', 'plan'],
};
```

### Edge Function Update

The edge function will receive preferences and build the prompt dynamically:

```typescript
// In generate-note-with-billing/index.ts
const notePreferences = body.notePreferences || null;

// Build SOAP structure dynamically based on preferences
function buildSOAPPrompt(prefs: NotePreferences | null): string {
  if (!prefs) return SOAP_STRUCTURE; // Default full SOAP
  
  const sections = [];
  for (const sectionKey of prefs.sectionOrder) {
    if (prefs.sections[sectionKey]) {
      sections.push(SECTION_TEMPLATES[sectionKey]);
    }
  }
  return sections.join('\n\n');
}
```

---

## Implementation Order

1. **Phase 1: Raw Transcription Mode** (simpler, immediate value)
   - Update RecordingSheet with raw mode option
   - Add copy-to-clipboard functionality
   - Skip generate flow for raw mode

2. **Phase 2: Note Preferences** (more complex, stored per-user)
   - Create useNotePreferences hook
   - Add UI to ProfileSettings
   - Update edge function to accept preferences
   - Wire preferences through CommandCenter to AI service

---

## Benefits

1. **Raw Mode**: Physicians can quickly dictate and paste directly into EHR fields without reformatting
2. **Template Customization**: Notes match physician's preferred documentation style
3. **EHR Compatibility**: Easier to work with EHRs that have rigid section requirements
4. **Time Savings**: Less copy-paste manipulation after note generation
