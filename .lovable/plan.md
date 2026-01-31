

# Plan: Add Camera/Photo Capture for Face Sheet Intake

## Overview

Since physicians may not have direct EMR text access at the bedside, adding a **camera capture feature** allows them to photograph printed face sheets. The AI will use vision capabilities to read the document and extract patient information automatically.

## Current State

The Face Sheet Parser already exists (`src/components/facesheet/FaceSheetParser.tsx`) with:
- Text paste functionality (works well for EMR copy/paste)
- AI parsing via `parse-face-sheet` edge function
- Editable extracted fields with confidence scores

However, the edge function currently returns an error for images:
```
"Image processing not yet implemented. Please use OCR or paste the text."
```

## Proposed Solution

Add camera/photo capture to the Face Sheet Parser that:
1. Uses the device camera (mobile) or file upload (desktop)
2. Sends the image to the edge function
3. Uses AI vision (Gemini) to read the document
4. Extracts patient information just like the text flow

---

## Part 1: Update Face Sheet Parser UI

**File: `src/components/facesheet/FaceSheetParser.tsx`**

### New Features:
- Add "Take Photo" button for mobile (uses `navigator.mediaDevices.getUserMedia`)
- Add "Upload Image" button for desktop/mobile (file input)
- Show image preview before processing
- Tab interface: "Paste Text" | "Capture Photo"

### UI Changes:
```text
┌─────────────────────────────────────────┐
│ Face Sheet Input                        │
├─────────────────────────────────────────┤
│  [Paste Text]  [📷 Capture Photo]       │  ← Tab selector
├─────────────────────────────────────────┤
│                                         │
│  (If Paste Text tab)                    │
│  ┌─────────────────────────────────┐    │
│  │ Paste face sheet content...     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  (If Capture Photo tab)                 │
│  ┌─────────────────────────────────┐    │
│  │  📷 Take Photo  📁 Upload File  │    │
│  │                                 │    │
│  │  [Image Preview Area]           │    │
│  └─────────────────────────────────┘    │
│                                         │
│            [Parse with AI]              │
└─────────────────────────────────────────┘
```

---

## Part 2: Update Edge Function for Vision

**File: `supabase/functions/parse-face-sheet/index.ts`**

### Changes:
- Switch from Cohere to Lovable AI (Gemini) which supports vision
- Accept `imageBase64` parameter
- Use Gemini's multimodal capabilities to read the image
- Extract text from the image and parse patient information

### New Flow:
```text
Image (base64) → Gemini Vision API → Extracted Text → Structured JSON
```

### Technical Implementation:
- Use `google/gemini-2.5-flash` model via Lovable AI gateway
- Send image as `image_url` with base64 data
- Prompt asks AI to read the face sheet and extract all fields
- Returns same structured JSON format as text parsing

---

## Part 3: Camera Capture Implementation

### Mobile Camera Access:
```typescript
// Request camera access
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment' } // Back camera
});

// Capture frame to canvas
const canvas = document.createElement('canvas');
canvas.getContext('2d').drawImage(video, 0, 0);
const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
```

### File Upload (Desktop/Mobile):
```typescript
<input 
  type="file" 
  accept="image/*" 
  capture="environment"  // Opens camera on mobile
  onChange={handleFileSelect}
/>
```

---

## Files to Modify

1. **`src/components/facesheet/FaceSheetParser.tsx`**
   - Add tab interface for Text vs Photo input
   - Add camera capture functionality
   - Add file upload functionality
   - Add image preview component
   - Update parse function to send image when applicable

2. **`supabase/functions/parse-face-sheet/index.ts`**
   - Switch from Cohere API to Lovable AI (Gemini with vision)
   - Handle `imageBase64` input
   - Use multimodal prompt for image parsing

---

## Technical Details

### Updated Edge Function Structure:

```typescript
// Use Lovable AI instead of Cohere for vision support
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const { text, imageBase64 } = await req.json();

let content: any[];
if (imageBase64) {
  // Vision mode - send image
  content = [
    { type: 'text', text: 'Parse this face sheet image...' },
    { type: 'image_url', image_url: { url: imageBase64 }}
  ];
} else {
  // Text mode - send text
  content = [{ type: 'text', text: `Parse this face sheet:\n\n${text}` }];
}

const response = await fetch(LOVABLE_AI_URL, {
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content }]
  })
});
```

### Camera Component Flow:

1. User taps "Take Photo" button
2. Camera view opens in modal/sheet
3. User frames the face sheet and taps capture
4. Image preview shown with "Retake" or "Use Photo" options
5. On confirm, image sent to edge function
6. AI extracts data and populates fields

---

## User Workflow After Implementation

### Mobile (at bedside):
1. Open ELYN → Face Sheet Parser
2. Tap "Capture Photo" tab
3. Tap "Take Photo" → Camera opens
4. Point at printed face sheet → Capture
5. Review image → Confirm
6. AI reads document and extracts all data
7. Review/edit → Save patient

### Desktop (with scanned document):
1. Open Face Sheet Parser
2. Tap "Capture Photo" tab
3. Click "Upload File"
4. Select scanned face sheet image
5. AI processes and extracts data
6. Review/edit → Save patient

---

## Alternative: Simple File Input (Faster to Implement)

If full camera capture is too complex, a simpler approach uses HTML file input with `capture` attribute:

```html
<input type="file" accept="image/*" capture="environment" />
```

This automatically opens the camera on mobile devices and file picker on desktop. Same end result with less code.

---

## Considerations

- **Image Size**: Compress images before sending (max ~4MB for base64)
- **Lighting**: Add tip for users to ensure good lighting
- **Orientation**: Handle portrait/landscape automatically
- **Privacy**: Images processed by AI but not stored permanently

