import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COHERE_API_URL = 'https://api.cohere.ai/v1/chat';

interface ParsedFaceSheet {
  patient: {
    name: string | null;
    dob: string | null;
    mrn: string | null;
    gender: string | null;
    phone: string | null;
    address: string | null;
    emergencyContact: string | null;
  };
  insurance: {
    provider: string | null;
    policyNumber: string | null;
    groupNumber: string | null;
    subscriberName: string | null;
    subscriberDob: string | null;
    relationship: string | null;
    authorizationNumber: string | null;
  };
  medical: {
    allergies: string[];
    medications: string[];
    pastMedicalHistory: string[];
    chiefComplaint: string | null;
    primaryDiagnosis: string | null;
    roomNumber: string | null;
    attendingPhysician: string | null;
    admissionDate: string | null;
  };
  confidence: {
    overall: number;
    patient: number;
    insurance: number;
    medical: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const COHERE_API_KEY = Deno.env.get('COHERE_API_KEY');
    if (!COHERE_API_KEY) throw new Error('COHERE_API_KEY not configured');

    const { text, imageBase64 } = await req.json();

    // If image is provided, we would process it here
    // For now, we expect OCR'd text or manually entered text
    let inputText = text;

    if (!inputText && imageBase64) {
      // In a full implementation, we'd send to a vision API
      // For now, return an error asking for text
      return new Response(JSON.stringify({
        success: false,
        error: 'Image processing not yet implemented. Please use OCR or paste the text.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!inputText || inputText.length < 20) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Text too short. Please provide face sheet content.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are an expert medical document parser specializing in hospital face sheets and patient intake forms.

Your task is to extract structured data from the provided face sheet text. Be thorough and extract all available information.

IMPORTANT RULES:
1. Extract data exactly as written - don't infer or guess missing information
2. For dates, standardize to YYYY-MM-DD format when possible
3. For phone numbers, use format: (XXX) XXX-XXXX
4. If a field is not found or unclear, use null
5. Allergies and medications should be arrays even if only one item
6. Assign confidence scores (0.0 to 1.0) based on how clearly the data was extracted

OUTPUT FORMAT (respond with valid JSON only):
{
  "patient": {
    "name": "Full Name or null",
    "dob": "YYYY-MM-DD or null",
    "mrn": "MRN number or null",
    "gender": "M/F/Other or null",
    "phone": "(XXX) XXX-XXXX or null",
    "address": "Full address or null",
    "emergencyContact": "Name and phone or null"
  },
  "insurance": {
    "provider": "Insurance company name or null",
    "policyNumber": "Policy/Member ID or null",
    "groupNumber": "Group number or null",
    "subscriberName": "Subscriber name or null",
    "subscriberDob": "YYYY-MM-DD or null",
    "relationship": "Self/Spouse/Child/Other or null",
    "authorizationNumber": "Prior auth number or null"
  },
  "medical": {
    "allergies": ["allergy1", "allergy2"],
    "medications": ["medication1 dosage", "medication2 dosage"],
    "pastMedicalHistory": ["condition1", "condition2"],
    "chiefComplaint": "Main reason for visit or null",
    "primaryDiagnosis": "Diagnosis or null",
    "roomNumber": "Room/Bed number or null",
    "attendingPhysician": "Doctor name or null",
    "admissionDate": "YYYY-MM-DD or null"
  },
  "confidence": {
    "overall": 0.85,
    "patient": 0.9,
    "insurance": 0.8,
    "medical": 0.85
  }
}`;

    const userPrompt = `Parse this hospital face sheet and extract all patient, insurance, and medical information:

${inputText}`;

    console.log('Calling Cohere API for face sheet parsing...');

    const response = await fetch(COHERE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'command-a-03-2025',
        message: userPrompt,
        preamble: systemPrompt,
        temperature: 0.2, // Low temperature for accurate extraction
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cohere API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', success: false }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.text || '';

    // Parse JSON response
    let parsed: ParsedFaceSheet;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse face sheet data');
    }

    // Ensure arrays are arrays
    parsed.medical.allergies = Array.isArray(parsed.medical.allergies) ? parsed.medical.allergies : [];
    parsed.medical.medications = Array.isArray(parsed.medical.medications) ? parsed.medical.medications : [];
    parsed.medical.pastMedicalHistory = Array.isArray(parsed.medical.pastMedicalHistory) ? parsed.medical.pastMedicalHistory : [];

    console.log('Face sheet parsed successfully');

    return new Response(JSON.stringify({
      success: true,
      data: parsed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in parse-face-sheet:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
