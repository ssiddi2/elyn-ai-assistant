import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cohere API configuration
const COHERE_API_URL = 'https://api.cohere.ai/v1/chat';

// Minimal PHI patterns - focused on what's actually needed
const PHI_PATTERNS = [
  { type: 'NAME', pattern: /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g },
  { type: 'MRN', pattern: /\b(?:MRN|Medical Record|Patient ID)[:\s#]*([A-Z0-9-]+)/gi },
  { type: 'DOB', pattern: /\b(?:DOB|Date of Birth|Born)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi },
  { type: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'PHONE', pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { type: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { type: 'ROOM', pattern: /\b(?:Room|Rm|Bed)[:\s#]*([A-Z0-9-]+)/gi },
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

function sanitizeInput(input: string | undefined | null, maxLength = 50000): string {
  if (!input) return '';
  return String(input).trim().slice(0, maxLength);
}

// Clinical note templates - SOAP Format
const CLINICAL_TEMPLATES: Record<string, string> = {
  hp: `H&P Note in SOAP Format`,
  consult: `Consultation Note in SOAP Format`,
  progress: `Progress Note in SOAP Format`,
};

// Section templates for dynamic building
const SECTION_TEMPLATES: Record<string, string> = {
  subjective: `## SUBJECTIVE
- Chief Complaint (CC)
- History of Present Illness (HPI)
- Review of Systems (ROS)
- Past Medical History (PMH)
- Medications
- Allergies
- Social/Family History (if relevant)`,
  objective: `## OBJECTIVE
- Vital Signs
- Physical Examination findings
- Laboratory/Imaging results (if available)`,
  assessment: `## ASSESSMENT
- Primary diagnosis with ICD-10 codes
- Differential diagnoses
- Problem list`,
  plan: `## PLAN
- Treatment plan
- Medications (with dosage)
- Follow-up instructions
- Patient education
- Referrals (if any)`,
  patientEducation: `## PATIENT EDUCATION
- Instructions given to patient
- Warning signs to watch for
- Lifestyle modifications`,
  followUp: `## FOLLOW-UP
- Next appointment
- When to return for evaluation
- Pending tests/results`,
};

// Default SOAP section order
const DEFAULT_SECTION_ORDER = ['subjective', 'objective', 'assessment', 'plan'];

// Build SOAP structure dynamically based on preferences
interface NotePreferencesInput {
  noteFormat?: string;
  sections?: Record<string, boolean>;
  sectionOrder?: string[];
}

function buildDynamicSOAPStructure(prefs: NotePreferencesInput | null): string {
  // If no preferences or all sections enabled, return full SOAP
  if (!prefs || !prefs.sections || !prefs.sectionOrder) {
    return `
Generate the note in SOAP format with these exact section headers:

${SECTION_TEMPLATES.subjective}

${SECTION_TEMPLATES.objective}

${SECTION_TEMPLATES.assessment}

${SECTION_TEMPLATES.plan}

Use "##" for section headers exactly as shown above.`;
  }

  // Build sections in the specified order, only including enabled ones
  const enabledSections: string[] = [];
  for (const sectionKey of prefs.sectionOrder) {
    if (prefs.sections[sectionKey] && SECTION_TEMPLATES[sectionKey]) {
      enabledSections.push(SECTION_TEMPLATES[sectionKey]);
    }
  }

  if (enabledSections.length === 0) {
    // Fallback to assessment + plan if nothing selected
    enabledSections.push(SECTION_TEMPLATES.assessment, SECTION_TEMPLATES.plan);
  }

  return `
Generate the note with these exact section headers (in this order):

${enabledSections.join('\n\n')}

Use "##" for section headers exactly as shown above.`;
}

// Radiology report templates
const RADIOLOGY_TEMPLATES: Record<string, string> = {
  xray: `X-Ray Report with: Clinical Indication, Comparison, Technique, Findings, Impression`,
  ct: `CT Report with: Clinical Indication, Comparison, Technique, Findings by Region/Organ System, Impression`,
  mri: `MRI Report with: Clinical Indication, Comparison, Technique/Sequences, Findings by Region, Impression`,
  ultrasound: `Ultrasound Report with: Clinical Indication, Comparison, Technique, Findings, Impression`,
  mammography: `Mammography Report with: Clinical Indication, Comparison, Breast Composition, Findings, BI-RADS Category, Management Recommendation`,
  fluoroscopy: `Fluoroscopy Report with: Clinical Indication, Comparison, Technique, Findings, Impression`,
};

// Radiology-specific CPT code ranges by modality
const RADIOLOGY_CPT_GUIDANCE: Record<string, string> = {
  xray: 'Use CPT codes 71045-71048 for chest, 73000-73140 for upper extremity, 73500-73660 for lower extremity, 72020-72120 for spine',
  ct: 'Use CPT codes 70450-70498 for head, 71250-71275 for chest, 72125-72133 for spine, 74150-74178 for abdomen/pelvis. Add +26 modifier for professional component',
  mri: 'Use CPT codes 70551-70559 for brain, 70540-70543 for orbit/face/neck, 72141-72158 for spine, 73218-73223 for extremities. Add +26 modifier for professional component',
  ultrasound: 'Use CPT codes 76700-76705 for abdomen, 76770-76775 for retroperitoneum, 76801-76828 for OB, 76830-76857 for pelvic',
  mammography: 'Use CPT codes 77065-77067 for mammography. Include BI-RADS category (0-6) in structured_category field',
  fluoroscopy: 'Use CPT codes 76000-76001 for fluoroscopy guidance, 74230 for swallowing function, 74240-74250 for upper GI',
};

const RADIOLOGY_MODALITIES = ['xray', 'ct', 'mri', 'ultrasound', 'mammography', 'fluoroscopy'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const COHERE_API_KEY = Deno.env.get('COHERE_API_KEY');
    if (!COHERE_API_KEY) throw new Error('COHERE_API_KEY not configured');

    const body = await req.json();
    const transcript = sanitizeInput(body.transcript);
    const noteType = body.noteType || 'progress';
    const patientInfo = body.patientInfo || {};
    const radiologyContext = body.radiologyContext || null;
    const notePreferences: NotePreferencesInput | null = body.notePreferences || null;

    if (!transcript || transcript.length < 20) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Transcript too short' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isRadiology = RADIOLOGY_MODALITIES.includes(noteType);

    // De-identify PHI
    const { cleanedText: cleanedTranscript, tokens: transcriptTokens } = deidentifyPhi(transcript);
    
    const allTokens = [...transcriptTokens];
    let contextStr = '';

    if (isRadiology && radiologyContext) {
      // Radiology context
      const radCtx = [];
      if (radiologyContext.bodyPart) radCtx.push(`Body Part: ${radiologyContext.bodyPart}`);
      if (radiologyContext.indication) radCtx.push(`Clinical Indication: ${radiologyContext.indication}`);
      if (radiologyContext.comparison) radCtx.push(`Comparison: ${radiologyContext.comparison}`);
      if (radiologyContext.technique) radCtx.push(`Technique: ${radiologyContext.technique}`);
      if (radiologyContext.contrast !== undefined) radCtx.push(`Contrast: ${radiologyContext.contrast ? 'Yes' : 'No'}`);
      contextStr = radCtx.length ? `\nStudy Context:\n${radCtx.join('\n')}` : '';
    } else if (patientInfo) {
      // Clinical patient context - tokenize PHI for re-identification
      const patientContext = [];
      if (patientInfo.name) {
        const placeholder = `[PATIENT_NAME]`;
        patientContext.push(`Patient: ${placeholder}`);
        allTokens.push({ placeholder, original: patientInfo.name, type: 'NAME' });
      }
      if (patientInfo.mrn) {
        const placeholder = `[PATIENT_MRN]`;
        patientContext.push(`MRN: ${placeholder}`);
        allTokens.push({ placeholder, original: patientInfo.mrn, type: 'MRN' });
      }
      if (patientInfo.dob) {
        const placeholder = `[PATIENT_DOB]`;
        patientContext.push(`DOB: ${placeholder}`);
        allTokens.push({ placeholder, original: patientInfo.dob, type: 'DOB' });
      }
      if (patientInfo.room) {
        const placeholder = `[PATIENT_ROOM]`;
        patientContext.push(`Room: ${placeholder}`);
        allTokens.push({ placeholder, original: patientInfo.room, type: 'ROOM' });
      }
      if (patientInfo.diagnosis) patientContext.push(`Diagnosis: ${patientInfo.diagnosis}`);
      if (patientInfo.allergies?.length) patientContext.push(`Allergies: ${patientInfo.allergies.join(', ')}`);
      contextStr = patientContext.length ? `\nPatient Context:\n${patientContext.join('\n')}` : '';
    }

    const template = isRadiology 
      ? RADIOLOGY_TEMPLATES[noteType] || RADIOLOGY_TEMPLATES.xray
      : CLINICAL_TEMPLATES[noteType] || CLINICAL_TEMPLATES.progress;

    const cptGuidance = isRadiology ? `\n\nCPT Code Guidance: ${RADIOLOGY_CPT_GUIDANCE[noteType] || ''}` : '';
    
    // Build dynamic SOAP structure based on preferences (clinical only)
    const soapStructure = isRadiology ? '' : buildDynamicSOAPStructure(notePreferences);

    const systemPrompt = isRadiology
      ? `You are an expert radiologist generating a structured radiology report AND extracting billing codes from the dictation.

CRITICAL RULES:
1. Preserve all placeholder tokens exactly as written (e.g., [NAME_0], [MRN_0])
2. Use standard radiology terminology and structured reporting format
3. Extract accurate CPT codes for the imaging study
4. Include ICD-10 codes based on findings and clinical indication
5. For mammography, ALWAYS include BI-RADS category (0-6) in the structured_category field
6. For other modalities, include relevant structured categories if applicable (LI-RADS for liver, TI-RADS for thyroid, etc.)
${cptGuidance}

OUTPUT FORMAT (respond with valid JSON only):
{
  "note": "The complete radiology report text",
  "billing": {
    "icd10": [{"code": "X00.0", "description": "Finding"}],
    "cpt": [{"code": "71046", "description": "Chest X-ray 2 views"}],
    "modifiers": ["-26"],
    "rvu": 0.75
  },
  "structured_category": "BI-RADS 2" // if applicable
}`
      : `You are an expert medical documentation specialist. Generate a clinical note AND extract billing codes from the transcript.

CRITICAL RULES:
1. Preserve all placeholder tokens exactly as written (e.g., [PATIENT_NAME], [PATIENT_MRN])
2. Use standard medical terminology and proper documentation format
3. Extract accurate ICD-10 and CPT codes based on documented conditions/procedures
4. Determine MDM complexity and E/M level based on documentation
5. Follow the section structure provided below
${soapStructure}

OUTPUT FORMAT (respond with valid JSON only):
{
  "note": "## SECTION_NAME\\n...\\n\\n## NEXT_SECTION\\n...",
  "billing": {
    "icd10": [{"code": "X00.0", "description": "Condition"}],
    "cpt": [{"code": "99214", "description": "Office visit"}],
    "mdmComplexity": "Low|Moderate|High",
    "emLevel": "99211|99212|99213|99214|99215",
    "rvu": 1.92
  }
}`;

    const userPrompt = `Generate a ${template} from this ${isRadiology ? 'dictation' : 'transcript'}.${contextStr}

${isRadiology ? 'Dictation' : 'Transcript'}:
${cleanedTranscript}`;

    console.log(`Calling Cohere API for ${isRadiology ? 'radiology report' : 'clinical note'} generation...`);

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
        temperature: 0.3,
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
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: 'Invalid API key', success: false }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.text || '';
    
    // Parse JSON response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI response');
    }

    // Re-identify PHI in the note
    const finalNote = reidentifyPhi(parsed.note || '', allTokens);
    
    // Ensure billing has proper structure
    const billing = isRadiology ? {
      icd10: Array.isArray(parsed.billing?.icd10) ? parsed.billing.icd10 : [],
      cpt: Array.isArray(parsed.billing?.cpt) ? parsed.billing.cpt : [],
      modifiers: Array.isArray(parsed.billing?.modifiers) ? parsed.billing.modifiers : ['-26'],
      rvu: typeof parsed.billing?.rvu === 'number' ? parsed.billing.rvu : 0.75,
    } : {
      icd10: Array.isArray(parsed.billing?.icd10) ? parsed.billing.icd10 : [],
      cpt: Array.isArray(parsed.billing?.cpt) ? parsed.billing.cpt : [],
      mdmComplexity: parsed.billing?.mdmComplexity || 'Moderate',
      emLevel: parsed.billing?.emLevel || '99214',
      rvu: typeof parsed.billing?.rvu === 'number' ? parsed.billing.rvu : 1.92,
    };

    console.log(`Successfully generated ${isRadiology ? 'radiology report' : 'clinical note'} with billing via Cohere`);

    return new Response(JSON.stringify({
      success: true,
      note: finalNote.trim(),
      billing,
      structured_category: parsed.structured_category || null,
      isRadiology,
      phiProtected: true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in generate-note-with-billing:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});