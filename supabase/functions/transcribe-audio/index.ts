import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constants for validation
const MAX_AUDIO_SIZE_MB = 20; // Gemini limit for inline audio
const MAX_AUDIO_SIZE_BYTES = MAX_AUDIO_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

// Sanitize error messages - don't expose internal details
function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Known safe errors to pass through
    if (error.message.includes('Audio file is too large')) return error.message;
    if (error.message.includes('No audio data provided')) return error.message;
    if (error.message.includes('Invalid audio format')) return error.message;
    if (error.message.includes('API key')) return 'Service configuration error. Please contact support.';
    
    // Log the actual error for debugging
    console.error('Transcription error:', error.message);
  }
  return 'Failed to transcribe audio. Please try again.';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use GOOGLE_API_KEY for direct Gemini API access (external Supabase compatible)
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY is not configured');
      throw new Error('Service configuration error');
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      throw new Error('Invalid request body');
    }

    const { audio, mimeType } = body;

    // Validate required fields
    if (!audio || typeof audio !== 'string') {
      throw new Error('No audio data provided');
    }

    // Validate mime type
    const normalizedMimeType = mimeType || 'audio/webm';
    if (!ALLOWED_MIME_TYPES.some(type => normalizedMimeType.includes(type.split('/')[1]))) {
      console.warn('Received audio with mime type:', normalizedMimeType);
    }

    // Estimate size (base64 is ~4/3 larger than binary)
    const estimatedSize = Math.ceil(audio.length * 0.75);
    if (estimatedSize > MAX_AUDIO_SIZE_BYTES) {
      throw new Error(`Audio file is too large. Maximum size is ${MAX_AUDIO_SIZE_MB}MB.`);
    }

    console.log('Transcribing audio with Google Gemini API, mimeType:', normalizedMimeType, 'size:', Math.round(estimatedSize / 1024), 'KB');

    // Build Google Gemini native request format
    const geminiRequestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: normalizedMimeType,
              data: audio
            }
          },
          {
            text: 'Transcribe this audio recording accurately. Return ONLY the transcription text, no timestamps, no speaker labels, no formatting, no commentary. Just the exact words spoken.'
          }
        ]
      }],
      generationConfig: {
        maxOutputTokens: 4096
      }
    };
    
    console.log('Sending audio to Google Gemini API...');
    
    // Call Google Gemini API directly with API key as query parameter
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Gemini API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Transcription service is temporarily unavailable due to high usage. Your recording was saved - please try generating the note again in a few minutes.', 
            errorCode: 'QUOTA_EXCEEDED',
            success: false 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: 'API access denied. Please check your Google API key configuration.', 
            errorCode: 'AUTH_ERROR',
            success: false 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 400) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid request to transcription service. Please try again with a different recording.', 
            errorCode: 'BAD_REQUEST',
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Transcription service error');
    }

    const result = await response.json();
    
    // Parse Google Gemini response format: candidates[0].content.parts[0].text
    const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!transcription) {
      console.warn('Empty transcription received from Gemini API');
      // Check if there's a block reason
      if (result.candidates?.[0]?.finishReason === 'SAFETY') {
        return new Response(
          JSON.stringify({ 
            error: 'Audio content was blocked by safety filters. Please try with different content.', 
            errorCode: 'CONTENT_FILTERED',
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    console.log('Transcription successful, length:', transcription.length);

    return new Response(
      JSON.stringify({ 
        text: transcription.trim(),
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const safeError = sanitizeError(error);
    return new Response(
      JSON.stringify({ 
        error: safeError,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
