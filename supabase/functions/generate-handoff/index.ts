import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COHERE_API_URL = 'https://api.cohere.ai/v1/chat';

// PHI patterns for de-identification
const PHI_PATTERNS = [
  { type: 'NAME', pattern: /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g },
  { type: 'MRN', pattern: /\b(?:MRN|Medical Record|Patient ID)[:\s#]*([A-Z0-9-]+)/gi },
  { type: 'DOB', pattern: /\b(?:DOB|Date of Birth|Born)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi },
  { type: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'PHONE', pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
];

interface PhiToken { placeholder: string; original: string; type: string; }

function deidentifyPhi(text: string): { cleanedText: string; tokens: PhiToken[] } {
  const tokens: PhiToken[] = [];
  let cleanedText = text;
  let counter: Record<string, number> = {};

  for (const { type, pattern } of PHI_PATTERNS) {
    cleanedText = cleanedText.replace(pattern, (match) => {
      counter[type] = (counter[type] || 0);
      const placeholder = `[${type}_${counter[type]++}]`;
      tokens.push({ placeholder, original: match, type });
      return placeholder;
    });
  }
  return { cleanedText, tokens };
}

function reidentifyPhi(text: string, tokens: PhiToken[]): string {
  let result = text;
  for (const { placeholder, original } of tokens) {
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
  }
  return result;
}

// Calculate age from DOB
function calculateAge(dob: string | null): string {
  if (!dob) return 'Unknown age';
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age}-year-old`;
  } catch {
    return 'Unknown age';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const COHERE_API_KEY = Deno.env.get('COHERE_API_KEY');
    if (!COHERE_API_KEY) throw new Error('COHERE_API_KEY not configured');

    const { notes, patients } = await req.json();

    if (!notes || notes.length === 0) {
      throw new Error('Notes are required');
    }

    // Collect all PHI tokens for re-identification
    const allTokens: PhiToken[] = [];

    // Build detailed patient summaries
    const patientSummaries = notes.map((note: any, index: number) => {
      const patient = patients?.find((p: any) => p.id === note.patient_id);

      // Patient identification
      const patientName = patient?.name || `Patient ${index + 1}`;
      const room = patient?.room || 'Unknown';
      const mrn = patient?.mrn || 'N/A';
      const age = calculateAge(patient?.dob);

      // Diagnosis
      const diagnosis = patient?.diagnosis || note.chief_complaint || 'Not specified';

      // Medical context
      const allergies = patient?.allergies?.length > 0
        ? patient.allergies.join(', ')
        : 'NKDA (No Known Drug Allergies)';

      // De-identify note content
      const { cleanedText: cleanedComplaint, tokens: complaintTokens } =
        deidentifyPhi(note.chief_complaint || '');
      const { cleanedText: cleanedAssessment, tokens: assessmentTokens } =
        deidentifyPhi(note.assessment || note.generated_note?.substring(0, 500) || '');
      const { cleanedText: cleanedPlan, tokens: planTokens } =
        deidentifyPhi(note.plan || '');
      const { cleanedText: cleanedHpi, tokens: hpiTokens } =
        deidentifyPhi(note.hpi || '');

      allTokens.push(...complaintTokens, ...assessmentTokens, ...planTokens, ...hpiTokens);

      return `
═══════════════════════════════════════════════════════════
PATIENT ${index + 1}
═══════════════════════════════════════════════════════════

PATIENT IDENTIFICATION
• Name: ${patientName}
• Room: ${room}
• MRN: ${mrn}

DIAGNOSIS
• ${diagnosis}

PATIENT OVERVIEW
• Demographics: ${age} patient
• Chief Complaint: ${cleanedComplaint || diagnosis}
• History/Presentation: ${cleanedHpi || cleanedAssessment || 'See chart for full history'}
• Allergies: ${allergies}

CLINICAL ASSESSMENT
${cleanedAssessment || 'Assessment pending - see latest note'}

CURRENT PLAN
${cleanedPlan || 'Continue current management - see orders'}
`;
    }).join('\n');

    const systemPrompt = `You are an expert medical provider creating a structured SHIFT HANDOFF SUMMARY document.

Your handoff document serves critical functions:
1. Patient safety tool - ensures no critical information is lost
2. Communication bridge between shifts
3. Risk-alert system for incoming provider
4. Task management reference

Format your response as a professional medical handoff document with clear sections.
Be concise but thorough. Focus on actionable information.
Preserve all patient names and details exactly as provided.`;

    const userPrompt = `Generate a comprehensive SHIFT HANDOFF SUMMARY for the incoming provider.

PATIENT DATA:
${patientSummaries}

Create a handoff document with these EXACT sections for EACH patient:

1. **SHIFT HANDOFF SUMMARY** (Header)
   - Date/time of handoff
   - Number of patients being handed off

2. **For each patient, include:**

   **PATIENT IDENTIFICATION**
   - Patient Name
   - Room Number
   - MRN (if available)

   **DIAGNOSIS**
   - Primary diagnosis/chief complaint
   - Indicate if acute, chronic, or exacerbation

   **PATIENT OVERVIEW**
   - Age and relevant demographics
   - Presenting symptoms (be specific)
   - Relevant medical history
   - Current medications if known
   - Allergies

   **CRITICAL ISSUES / CONCERNS**
   - List specific clinical concerns that could worsen
   - Flag any red flags or warning signs
   - Note any unstable conditions

   **PENDING TASKS / FOLLOW-UPS**
   - Labs or studies pending
   - Consultations needed
   - Treatments to monitor
   - Documentation to complete

   **URGENT MATTERS REQUIRING IMMEDIATE ATTENTION**
   - Actions that cannot wait
   - Time-sensitive decisions
   - Critical monitoring needs

3. **SUMMARY** (at the end)
   - Total patients
   - Number requiring urgent attention
   - Key priorities for the incoming shift

Use bullet points for clarity. Be specific and actionable.`;

    console.log('Calling Cohere API for structured handoff generation...');

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
        temperature: 0.2, // Lower temperature for more consistent formatting
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
    const handoffContent = data.text || '';

    // Re-identify PHI in the handoff
    const finalHandoff = reidentifyPhi(handoffContent, allTokens);

    console.log('Structured handoff generated successfully');

    return new Response(
      JSON.stringify({
        handoff: finalHandoff.trim(),
        success: true,
        phiProtected: true,
        format: 'structured',
        sections: [
          'Patient Identification',
          'Diagnosis',
          'Patient Overview',
          'Critical Issues',
          'Pending Tasks',
          'Urgent Matters'
        ]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-handoff function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
