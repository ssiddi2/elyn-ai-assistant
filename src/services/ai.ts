import { supabase } from '@/integrations/supabase/client';
import type { PatientContext, PatientData, BillingCodes, ClinicalNote, RadiologyContext } from '@/types/medical';
import type { NotePreferences } from '@/hooks/useNotePreferences';

/**
 * AI service for generating clinical notes, radiology reports, billing codes, and handoffs.
 * Uses consolidated edge functions for optimal API efficiency.
 */
const AI = {
  /**
   * Generate a clinical note AND extract billing codes in a single API call.
   * This replaces separate generateNote + extractCodes calls.
   */
  async generateNoteWithBilling(
    transcript: string,
    noteType: string,
    patientContext: PatientContext | null,
    radiologyContext?: RadiologyContext | null,
    notePreferences?: NotePreferences | null
  ): Promise<{ note: string; billing: BillingCodes; structured_category?: string | null }> {
    const noteTypeMap: Record<string, string> = {
      'H&P': 'hp',
      'Consult': 'consult',
      'Progress': 'progress',
      // Radiology types are already lowercase
      'xray': 'xray',
      'ct': 'ct',
      'mri': 'mri',
      'ultrasound': 'ultrasound',
      'mammography': 'mammography',
      'fluoroscopy': 'fluoroscopy',
    };

    const { data, error } = await supabase.functions.invoke('generate-note-with-billing', {
      body: {
        transcript,
        noteType: noteTypeMap[noteType] || noteType,
        patientInfo: patientContext,
        radiologyContext: radiologyContext || null,
        notePreferences: notePreferences || null,
      },
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error || 'Failed to generate note');

    return {
      note: data.note,
      billing: {
        icd10: data.billing.icd10 || [],
        cpt: data.billing.cpt || [],
        mdm: data.billing.mdmComplexity || data.billing.modifiers?.[0] || 'N/A',
        em: data.billing.emLevel || (data.isRadiology ? 'N/A' : '99214'),
        rvu: data.billing.rvu || (data.isRadiology ? 0.75 : 1.92),
        modifiers: data.billing.modifiers || [],
      },
      structured_category: data.structured_category || null,
    };
  },

  /**
   * Generate a handoff summary from clinical notes and patient data.
   */
  async generateHandoff(
    notes: ClinicalNote[],
    patients: PatientData[]
  ): Promise<string> {
    const { data, error } = await supabase.functions.invoke('generate-handoff', {
      body: { notes, patients },
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error);

    return data.handoff;
  },

  /**
   * @deprecated Use generateNoteWithBilling instead for combined note + billing generation
   */
  async generateNote(
    transcript: string,
    noteType: string,
    patientContext: PatientContext | null
  ): Promise<string> {
    const result = await this.generateNoteWithBilling(transcript, noteType, patientContext);
    return result.note;
  },

  /**
   * @deprecated Use generateNoteWithBilling instead - billing is extracted alongside note generation
   */
  async extractCodes(note: string): Promise<BillingCodes> {
    // Return defaults - billing is now extracted during note generation
    console.warn('extractCodes is deprecated. Use generateNoteWithBilling for combined generation.');
    return {
      icd10: [],
      cpt: [],
      mdm: 'Moderate',
      em: '99214',
      rvu: 1.92,
    };
  },
};

export default AI;
