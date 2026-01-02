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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
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

    console.log('Transcribing audio with Gemini, mimeType:', normalizedMimeType, 'size:', Math.round(estimatedSize / 1024), 'KB');

    // Use Lovable AI Gateway with Gemini for audio transcription
    // Gemini accepts audio via data URL format in image_url field
    const audioDataUrl = `data:${normalizedMimeType};base64,${audio}`;
    
    console.log('Sending audio to Lovable AI Gateway...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe this audio recording accurately. Return ONLY the transcription text, no timestamps, no speaker labels, no formatting, no commentary. Just the exact words spoken.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: audioDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI Gateway error:', response.status, errorText);
      
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

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: 'AI credits exhausted. Please add credits to continue using transcription.', 
            errorCode: 'PAYMENT_REQUIRED',
            success: false 
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ 
            error: 'Transcription service is not configured. Please contact support.', 
            errorCode: 'AUTH_ERROR',
            success: false 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Transcription service error');
    }

    const result = await response.json();
    const transcription = result.choices?.[0]?.message?.content || '';
    
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
