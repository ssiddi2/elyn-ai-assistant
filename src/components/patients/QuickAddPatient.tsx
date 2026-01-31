import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Loader2, Sparkles, AlertTriangle, Building2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFacility } from '@/contexts/FacilityContext';
import { formatClaimsName, validateClaimsData, formatMRN } from '@/lib/claimsFormatting';
import { ClaimsValidationBadge } from '@/components/billing/ClaimsValidationBadge';
import AI from '@/services/ai';
import { z } from 'zod';

interface QuickAddPatientProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientAdded: () => void;
  onBillCreated?: (bill: any) => void;
}

const patientSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  mrn: z.string().trim().max(50).optional(),
  room: z.string().trim().max(20).optional(),
  diagnosis: z.string().trim().max(500).optional(),
  chiefComplaint: z.string().trim().max(1000).optional(),
});

const acuityOptions = [
  { id: 'critical', label: 'Critical', color: 'bg-destructive' },
  { id: 'high', label: 'High', color: 'bg-warning' },
  { id: 'moderate', label: 'Moderate', color: 'bg-primary' },
  { id: 'low', label: 'Low', color: 'bg-success' },
];

export default function QuickAddPatient({ 
  isOpen, 
  onClose, 
  onPatientAdded,
  onBillCreated 
}: QuickAddPatientProps) {
  const { user } = useAuth();
  const { facilities, selectedFacilityId } = useFacility();
  const [formData, setFormData] = useState({
    name: '',
    mrn: '',
    dob: '',
    room: '',
    diagnosis: '',
    chiefComplaint: '',
    acuity: 'moderate',
    facilityId: selectedFacilityId === 'all' ? '' : selectedFacilityId,
    insuranceId: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingBilling, setIsGeneratingBilling] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedBilling, setGeneratedBilling] = useState<{
    icd10: Array<{ code: string; description?: string }>;
    cpt: Array<{ code: string; description?: string }>;
    em: string;
    rvu: number;
  } | null>(null);

  // Claims validation
  const claimsValidation = useMemo(() => {
    return validateClaimsData({
      name: formData.name,
      dob: formData.dob,
      mrn: formData.mrn,
      insuranceId: formData.insuranceId,
    });
  }, [formData.name, formData.dob, formData.mrn, formData.insuranceId]);

  const validateForm = () => {
    try {
      patientSchema.parse(formData);
      setErrors({});
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        e.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleGenerateBilling = async () => {
    if (!formData.diagnosis && !formData.chiefComplaint) {
      setErrors({ diagnosis: 'Add diagnosis or chief complaint for billing' });
      return;
    }

    setIsGeneratingBilling(true);
    try {
      const noteContent = `
        Chief Complaint: ${formData.chiefComplaint || 'Not specified'}
        Diagnosis: ${formData.diagnosis || 'Not specified'}
        Patient: ${formData.name}
      `;
      
      const codes = await AI.extractCodes(noteContent);
      setGeneratedBilling(codes);
    } catch (e) {
      console.error('Failed to generate billing:', e);
    }
    setIsGeneratingBilling(false);
  };

  const handleSubmit = async () => {
    if (!validateForm() || !user) return;

    // Require facility selection
    if (!formData.facilityId) {
      setErrors({ facilityId: 'Please select a facility for this patient' });
      return;
    }

    // Check claims validation - warn but don't block
    if (!claimsValidation.isValid) {
      // Allow save but show warning
      console.warn('Claims validation warnings:', claimsValidation.errors);
    }

    setIsSubmitting(true);
    try {
      // Format name and MRN for claims compliance
      const claimsName = formatClaimsName(formData.name);
      const formattedMrn = formatMRN(formData.mrn);

      // Create patient with required facility and hospital
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          user_id: user.id,
          name: claimsName.trim(),
          mrn: formattedMrn || null,
          dob: formData.dob || null,
          room: formData.room.trim() || null,
          diagnosis: formData.diagnosis.trim() || null,
          facility_id: formData.facilityId,
        })
        .select()
        .single();

      if (patientError) throw patientError;

      // Get facility name for bill
      const selectedFacility = facilities.find(f => f.id === formData.facilityId);

      // Create bill if billing was generated
      if (generatedBilling && patient) {
        const { data: bill, error: billError } = await supabase
          .from('bills')
          .insert({
            user_id: user.id,
            patient_name: claimsName.trim(),
            patient_mrn: formattedMrn || null,
            patient_dob: formData.dob || null,
            date_of_service: new Date().toISOString().split('T')[0],
            cpt_code: generatedBilling.em || generatedBilling.cpt[0]?.code || '99213',
            cpt_description: generatedBilling.cpt[0]?.description || 'Office visit',
            rvu: generatedBilling.rvu || 1.3,
            diagnosis: formData.diagnosis.trim() || null,
            facility: selectedFacility?.nickname || selectedFacility?.name || null,
            status: 'pending',
          })
          .select()
          .single();

        if (!billError && bill && onBillCreated) {
          onBillCreated(bill);
        }
      }

      // Reset and close
      setFormData({
        name: '',
        mrn: '',
        dob: '',
        room: '',
        diagnosis: '',
        chiefComplaint: '',
        acuity: 'moderate',
        facilityId: selectedFacilityId === 'all' ? '' : selectedFacilityId,
        insuranceId: '',
      });
      setGeneratedBilling(null);
      onPatientAdded();
      onClose();
    } catch (e) {
      console.error('Failed to add patient:', e);
      setErrors({ name: 'Failed to add patient. Please try again.' });
    }
    setIsSubmitting(false);
  };

  const updateBillingCode = (type: 'em' | 'cpt', value: string) => {
    if (!generatedBilling) return;
    
    if (type === 'em') {
      setGeneratedBilling({ ...generatedBilling, em: value });
    } else {
      setGeneratedBilling({
        ...generatedBilling,
        cpt: [{ code: value, description: generatedBilling.cpt[0]?.description }],
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Container */}
          <div className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/50"
            />

            {/* Modal - Bottom sheet on mobile, centered on desktop */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed md:relative bottom-20 left-4 right-4 md:bottom-auto md:left-auto md:right-auto z-50 glass-card rounded-2xl max-h-[75vh] md:max-h-[80vh] overflow-y-auto md:max-w-lg md:w-full"
            >
              {/* Handle - mobile only */}
              <div className="flex justify-center pt-3 pb-2 md:hidden">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Quick Add Patient</h2>
                    <p className="text-xs text-muted-foreground">Add patient with auto-billing</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Form */}
              <div className="p-4 space-y-4">
                {/* Claims formatting info */}
                <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground flex-1">
                    <p>Names saved as <span className="font-medium text-foreground">LAST, FIRST</span> for claims compliance.</p>
                  </div>
                  <ClaimsValidationBadge validation={claimsValidation} />
                </div>

                {/* Name with preview */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Patient Name * {formData.name && (
                      <span className="text-xs font-normal text-muted-foreground">
                        → {formatClaimsName(formData.name)}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Smith or Smith, John"
                    className={cn(
                      "w-full px-3 py-2.5 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                      errors.name ? "border-destructive" : "border-border focus:border-primary"
                    )}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive mt-1">{errors.name}</p>
                  )}
                </div>

                {/* MRN, DOB & Room */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      MRN *
                    </label>
                    <input
                      type="text"
                      value={formData.mrn}
                      onChange={(e) => setFormData({ ...formData, mrn: e.target.value })}
                      placeholder="12345"
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      DOB *
                    </label>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Room
                    </label>
                    <input
                      type="text"
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="ICU-4"
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Insurance ID */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Insurance/Member ID *
                  </label>
                  <input
                    type="text"
                    value={formData.insuranceId}
                    onChange={(e) => setFormData({ ...formData, insuranceId: e.target.value })}
                    placeholder="Policy or member ID"
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Facility Selection - Required */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Facility *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                      value={formData.facilityId}
                      onChange={(e) => setFormData({ ...formData, facilityId: e.target.value })}
                      className={cn(
                        "w-full pl-10 pr-3 py-2.5 rounded-xl bg-card border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none",
                        errors.facilityId ? "border-destructive" : "border-border focus:border-primary"
                      )}
                    >
                      <option value="">Select a facility</option>
                      {facilities.map((facility) => (
                        <option key={facility.id} value={facility.id}>
                          {facility.nickname || facility.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.facilityId && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {errors.facilityId}
                    </p>
                  )}
                  {facilities.length === 0 && (
                    <p className="text-xs text-warning mt-1">
                      No facilities found. Please add a facility first.
                    </p>
                  )}
                </div>

                {/* Acuity */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Acuity
                  </label>
                  <div className="flex gap-2">
                    {acuityOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, acuity: option.id })}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-sm font-medium transition-all",
                          formData.acuity === option.id
                            ? `${option.color} text-white`
                            : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chief Complaint */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Chief Complaint
                  </label>
                  <input
                    type="text"
                    value={formData.chiefComplaint}
                    onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                    placeholder="Chest pain, shortness of breath"
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Diagnosis */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Diagnosis
                  </label>
                  <input
                    type="text"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="Acute myocardial infarction"
                    className={cn(
                      "w-full px-3 py-2.5 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                      errors.diagnosis ? "border-destructive" : "border-border focus:border-primary"
                    )}
                  />
                  {errors.diagnosis && (
                    <p className="text-xs text-destructive mt-1">{errors.diagnosis}</p>
                  )}
                </div>

                {/* Generate Billing Button */}
                <Button
                  type="button"
                  onClick={handleGenerateBilling}
                  disabled={isGeneratingBilling || (!formData.diagnosis && !formData.chiefComplaint)}
                  variant="outline"
                  className="w-full h-11 rounded-xl"
                >
                  {isGeneratingBilling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Codes...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Auto-Generate Billing Codes
                    </>
                  )}
                </Button>

                {/* Generated Billing - Editable */}
                {generatedBilling && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-primary/5 rounded-xl p-4 border border-primary/20"
                  >
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Generated Billing (Editable)
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                          E/M Code
                        </label>
                        <input
                          type="text"
                          value={generatedBilling.em}
                          onChange={(e) => updateBillingCode('em', e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg bg-card border border-border text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                          RVU
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={generatedBilling.rvu}
                          onChange={(e) => setGeneratedBilling({ 
                            ...generatedBilling, 
                            rvu: parseFloat(e.target.value) || 0 
                          })}
                          className="w-full px-2.5 py-2 rounded-lg bg-card border border-border text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {generatedBilling.icd10.length > 0 && (
                      <div className="mt-3">
                        <label className="block text-xs text-muted-foreground mb-1">
                          ICD-10 Codes
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {generatedBilling.icd10.map((code, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 rounded-md bg-card border border-border text-xs font-mono text-foreground"
                            >
                              {code.code}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border flex gap-3">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.name.trim()}
                  className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Patient
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
