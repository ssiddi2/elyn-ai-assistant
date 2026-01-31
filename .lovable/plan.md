
# Plan: Modify `transcribe-audio` Edge Function for External Supabase

## Overview

The `transcribe-audio` function currently uses the Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with `LOVABLE_API_KEY`. Since this key is not available in external Supabase projects, we need to modify it to call the **Google Gemini API directly** using a `GOOGLE_API_KEY`.

## Current vs. New Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         CURRENT (Lovable Cloud)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Client → transcribe-audio → Lovable Gateway → Gemini               │
│                                (LOVABLE_API_KEY)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         NEW (External Supabase)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Client → transcribe-audio → Google Gemini API (Direct)             │
│                                (GOOGLE_API_KEY)                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Changes

### 1. API Endpoint Change
- **Current**: `https://ai.gateway.lovable.dev/v1/chat/completions` (OpenAI-compatible format)
- **New**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` (Google native format)

### 2. API Key
- **Current**: `LOVABLE_API_KEY` (auto-provisioned, not exportable)
- **New**: `GOOGLE_API_KEY` (obtain from [Google AI Studio](https://aistudio.google.com/app/apikey))

### 3. Request Format Change
The Lovable Gateway uses OpenAI-compatible format, but the direct Google API uses a different structure:

**Current (OpenAI format)**:
```json
{
  "model": "google/gemini-2.5-flash",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Transcribe..." },
      { "type": "image_url", "image_url": { "url": "data:audio/webm;base64,..." }}
    ]
  }]
}
```

**New (Google native format)**:
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "inline_data": { "mime_type": "audio/webm", "data": "..." }},
      { "text": "Transcribe this audio accurately..." }
    ]
  }],
  "generationConfig": { "maxOutputTokens": 4096 }
}
```

### 4. Response Parsing Change
- **Current**: `result.choices[0].message.content`
- **New**: `result.candidates[0].content.parts[0].text`

---

## Technical Details

### Modified `supabase/functions/transcribe-audio/index.ts`

**Changes Summary:**
1. Replace `LOVABLE_API_KEY` with `GOOGLE_API_KEY`
2. Change endpoint from Lovable Gateway to Google `generativelanguage.googleapis.com`
3. Transform request body to Google's `contents/parts` format with `inline_data`
4. Update response parsing for Google's `candidates` structure
5. Update error handling for Google-specific status codes

**New Code Structure:**
```text
Lines 36-40: Get GOOGLE_API_KEY instead of LOVABLE_API_KEY
Lines 69-90: Build Google-native request format with inline_data
Lines 77: Use Google endpoint with API key as query parameter
Lines 100-145: Parse Google's response format (candidates[0].content.parts[0].text)
```

---

## Setup Required in External Supabase

### Step 1: Get Google API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the generated key

### Step 2: Add Secret to External Supabase
1. Go to your Supabase Dashboard → Settings → Secrets
2. Add: `GOOGLE_API_KEY` = `your-google-api-key`

### Step 3: Deploy Edge Function
After pushing the code changes to your new Lovable project (connected to external Supabase), the edge function will auto-deploy.

---

## Other Edge Functions (No Changes Needed)

These functions already use direct API keys and will work as-is:

| Function | API Used | Secret Required |
|----------|----------|-----------------|
| `generate-note-with-billing` | Cohere API | `COHERE_API_KEY` |
| `correct-medical-terms` | Cohere API | `COHERE_API_KEY` |
| `elevenlabs-scribe-token` | ElevenLabs | `ELEVENLABS_API_KEY` |
| `generate-handoff` | Cohere API | `COHERE_API_KEY` |

---

## Complete Modified Code

The new `transcribe-audio/index.ts` will:
- Use `GOOGLE_API_KEY` from environment
- Call `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Send audio as `inline_data` with base64 and mime_type
- Parse response from `candidates[0].content.parts[0].text`
- Maintain all existing error handling, size validation, and security features

---

## Migration Checklist

1. Create new Lovable project connected to external Supabase (`gkpyqqpgpgqtmglqjkvj`)
2. Push this codebase to the new project via GitHub
3. Add required secrets in external Supabase Dashboard:
   - `GOOGLE_API_KEY` (new - from Google AI Studio)
   - `COHERE_API_KEY` (if not already configured)
   - `ELEVENLABS_API_KEY` (if using real-time transcription)
4. Edge functions will auto-deploy with the new code
5. Test the transcription flow end-to-end
