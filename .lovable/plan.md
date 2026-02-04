
# Customizable Note Templates and Raw Transcription Mode

## Status: ✅ IMPLEMENTED

Both features have been implemented as described below.

---

## Feature 1: Raw Transcription Mode ✅

### Implementation Complete

A new "Raw" option has been added alongside Quick/Ambient recording modes that:
- Transcribes speech without any AI processing
- Applies medical term correction (metaprole → metoprolol, etc.)
- Outputs clean, verbatim text ready to paste into any EHR field
- Shows a prominent "Copy to Clipboard" button instead of Generate
- Skips note generation and billing extraction entirely

### Files Modified
- `src/components/recording/RecordingSheet.tsx` - Added `'raw'` to RecordingMode type and conditional button rendering

---

## Feature 2: Note Template Customization ✅

### Implementation Complete

A new "Note Preferences" section in Profile Settings where physicians can:
- Choose a default note format (SOAP, APSO, Brief, or Custom)
- Toggle specific sections on/off (Subjective, Objective, Assessment, Plan, Patient Education, Follow-up)
- Reorder sections via up/down buttons
- Save preferences that persist across sessions in the profiles.preferences JSONB column

### Files Created/Modified
- `src/hooks/useNotePreferences.ts` - New hook for managing note preferences
- `src/pages/ProfileSettings.tsx` - Added Note Preferences card with template dropdown and section toggles
- `src/services/ai.ts` - Updated to accept and pass notePreferences to edge function
- `src/components/layout/CommandCenter.tsx` - Wired up note preferences to generateNote flow
- `supabase/functions/generate-note-with-billing/index.ts` - Added dynamic SOAP structure building based on preferences

### Available Templates

| Template | Section Order | Use Case |
|----------|---------------|----------|
| SOAP (default) | Subjective, Objective, Assessment, Plan | Standard documentation |
| APSO | Assessment, Plan, Subjective, Objective | Problem-focused notes |
| Brief | Assessment, Plan only | Quick follow-ups |
| Custom | User-defined | EHR-specific workflows |

---

## Technical Details

### Raw Mode Recording

```typescript
type RecordingMode = 'quick' | 'ambient' | 'raw';

// Conditional action button based on mode
{recordingMode === 'raw' ? (
  <Button onClick={handleRawCopyToClipboard}>
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
interface NotePreferences {
  noteFormat: 'soap' | 'apso' | 'brief' | 'custom';
  sections: {
    subjective: boolean;
    objective: boolean;
    assessment: boolean;
    plan: boolean;
    patientEducation: boolean;
    followUp: boolean;
  };
  sectionOrder: string[];
}
```

### Edge Function Dynamic Structure

The edge function builds SOAP sections dynamically based on user preferences:

```typescript
function buildDynamicSOAPStructure(prefs: NotePreferencesInput | null): string {
  if (!prefs || !prefs.sections || !prefs.sectionOrder) {
    return DEFAULT_SOAP_STRUCTURE;
  }
  
  const enabledSections: string[] = [];
  for (const sectionKey of prefs.sectionOrder) {
    if (prefs.sections[sectionKey] && SECTION_TEMPLATES[sectionKey]) {
      enabledSections.push(SECTION_TEMPLATES[sectionKey]);
    }
  }
  return enabledSections.join('\n\n');
}
```

---

## Benefits Achieved

1. **Raw Mode**: Physicians can quickly dictate and paste directly into EHR fields without reformatting
2. **Template Customization**: Notes match physician's preferred documentation style
3. **EHR Compatibility**: Easier to work with EHRs that have rigid section requirements
4. **Time Savings**: Less copy-paste manipulation after note generation
