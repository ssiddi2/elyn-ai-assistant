import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  FileText,
  Copy,
  Download,
  Check,
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Send,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Patient, PatientStatus } from '@/components/patients/PatientCard';
import AI from '@/services/ai';

interface HandoffNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onToast: (message: string) => void;
}

interface PatientNote {
  id: string;
  patient_id: string;
  note_type: string;
  chief_complaint: string | null;
  assessment: string | null;
  plan: string | null;
  generated_note: string | null;
  created_at: string;
}

const statusConfig: Record<PatientStatus, { label: string; color: string; priority: number }> = {
  not_seen: { label: 'Not Seen', color: 'text-muted-foreground', priority: 1 },
  in_progress: { label: 'In Progress', color: 'text-warning', priority: 0 },
  seen: { label: 'Seen', color: 'text-success', priority: 2 },
  signed: { label: 'Signed', color: 'text-primary', priority: 3 },
  discharged: { label: 'Discharged', color: 'text-gray-500', priority: 4 },
};

export default function HandoffNotesModal({
  isOpen,
  onClose,
  patients,
  onToast,
}: HandoffNotesModalProps) {
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
  const [patientNotes, setPatientNotes] = useState<Record<string, PatientNote[]>>({});
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [handoffContent, setHandoffContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPatientList, setShowPatientList] = useState(true);

  // Filter active patients (not discharged)
  const activePatients = useMemo(() => {
    return patients
      .filter(p => p.status !== 'discharged')
      .sort((a, b) => {
        const statusA = statusConfig[a.status || 'not_seen'];
        const statusB = statusConfig[b.status || 'not_seen'];
        return statusA.priority - statusB.priority;
      });
  }, [patients]);

  // Load notes for selected patients
  useEffect(() => {
    if (isOpen && selectedPatientIds.size > 0) {
      loadPatientNotes();
    }
  }, [isOpen, selectedPatientIds]);

  // Auto-select in-progress patients on open
  useEffect(() => {
    if (isOpen) {
      const inProgressIds = activePatients
        .filter(p => p.status === 'in_progress' || p.status === 'seen')
        .map(p => p.id);
      setSelectedPatientIds(new Set(inProgressIds));
      setHandoffContent(null);
    }
  }, [isOpen, activePatients]);

  const loadPatientNotes = async () => {
    if (selectedPatientIds.size === 0) return;

    setIsLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from('clinical_notes')
        .select('id, patient_id, note_type, chief_complaint, assessment, plan, generated_note, created_at')
        .in('patient_id', Array.from(selectedPatientIds))
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group notes by patient
      const notesByPatient: Record<string, PatientNote[]> = {};
      (data || []).forEach(note => {
        if (!notesByPatient[note.patient_id]) {
          notesByPatient[note.patient_id] = [];
        }
        notesByPatient[note.patient_id].push(note);
      });

      setPatientNotes(notesByPatient);
    } catch (e) {
      console.error('Error loading patient notes:', e);
    }
    setIsLoadingNotes(false);
  };

  const togglePatient = (patientId: string) => {
    setSelectedPatientIds(prev => {
      const next = new Set(prev);
      if (next.has(patientId)) {
        next.delete(patientId);
      } else {
        next.add(patientId);
      }
      return next;
    });
    setHandoffContent(null);
  };

  const selectAll = () => {
    setSelectedPatientIds(new Set(activePatients.map(p => p.id)));
    setHandoffContent(null);
  };

  const selectNone = () => {
    setSelectedPatientIds(new Set());
    setHandoffContent(null);
  };

  const generateHandoff = async () => {
    if (selectedPatientIds.size === 0) {
      onToast('Please select at least one patient');
      return;
    }

    setIsGenerating(true);
    try {
      // Prepare notes data
      const selectedNotes: any[] = [];
      const selectedPatientsData: any[] = [];

      activePatients
        .filter(p => selectedPatientIds.has(p.id))
        .forEach(patient => {
          selectedPatientsData.push({
            id: patient.id,
            name: patient.name,
            mrn: patient.mrn,
            room: patient.room,
            diagnosis: patient.diagnosis,
            allergies: patient.allergies,
          });

          const notes = patientNotes[patient.id] || [];
          if (notes.length > 0) {
            // Use the most recent note
            const latestNote = notes[0];
            selectedNotes.push({
              patient_id: patient.id,
              note_type: latestNote.note_type,
              chief_complaint: latestNote.chief_complaint || '',
              assessment: latestNote.assessment || latestNote.generated_note?.substring(0, 500) || '',
              plan: latestNote.plan || '',
            });
          } else {
            // Create a placeholder note
            selectedNotes.push({
              patient_id: patient.id,
              note_type: 'progress',
              chief_complaint: patient.diagnosis || 'No chief complaint documented',
              assessment: 'See chart for details',
              plan: 'Continue current management',
            });
          }
        });

      const handoff = await AI.generateHandoff(selectedNotes, selectedPatientsData);
      setHandoffContent(handoff);
      setShowPatientList(false);
      onToast('Handoff generated successfully');
    } catch (e) {
      console.error('Error generating handoff:', e);
      onToast('Error generating handoff');
    }
    setIsGenerating(false);
  };

  const copyToClipboard = async () => {
    if (!handoffContent) return;
    try {
      await navigator.clipboard.writeText(handoffContent);
      setCopied(true);
      onToast('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      onToast('Failed to copy');
    }
  };

  const exportAsText = () => {
    if (!handoffContent) return;
    const blob = new Blob([handoffContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `handoff-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Exported as TXT');
  };

  const handleClose = () => {
    setHandoffContent(null);
    setShowPatientList(true);
    onClose();
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
              onClick={handleClose}
              className="absolute inset-0 bg-black/50"
            />

            {/* Modal - Bottom sheet on mobile, centered on desktop */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed md:relative bottom-20 left-4 right-4 md:bottom-auto md:left-auto md:right-auto z-50 bg-card border border-border rounded-2xl shadow-xl overflow-hidden max-h-[75vh] md:max-h-[85vh] flex flex-col md:max-w-2xl md:w-full"
            >
              {/* Handle - mobile only */}
              <div className="flex justify-center pt-3 pb-2 md:hidden">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              {/* Header */}
              <div className="p-4 border-b border-border bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clipboard className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Shift Handoff</h2>
                      <p className="text-sm text-muted-foreground">
                        {handoffContent ? 'Review and share' : 'Select patients to include'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Patient Selection */}
                {showPatientList && !handoffContent && (
                  <div className="p-4">
                    {/* Selection Controls */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          {selectedPatientIds.size} of {activePatients.length} patients selected
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={selectAll}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                        >
                          Select All
                        </Button>
                        <Button
                          onClick={selectNone}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {/* Patient List */}
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                      {activePatients.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No active patients</p>
                        </div>
                      ) : (
                        activePatients.map(patient => {
                          const isSelected = selectedPatientIds.has(patient.id);
                          const status = patient.status || 'not_seen';
                          const statusInfo = statusConfig[status];
                          const hasNotes = (patientNotes[patient.id]?.length || 0) > 0;

                          return (
                            <button
                              key={patient.id}
                              onClick={() => togglePatient(patient.id)}
                              className={cn(
                                'w-full p-3 rounded-xl border text-left transition-all',
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/30 hover:bg-muted/50'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                                  isSelected
                                    ? 'bg-primary border-primary'
                                    : 'border-muted-foreground'
                                )}>
                                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground truncate">
                                      {patient.name}
                                    </span>
                                    <span className={cn('text-xs', statusInfo.color)}>
                                      {statusInfo.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                    {patient.room && <span>Room {patient.room}</span>}
                                    {patient.diagnosis && (
                                      <span className="truncate">{patient.diagnosis}</span>
                                    )}
                                  </div>
                                  {hasNotes && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                                      <FileText className="w-3 h-3" />
                                      {patientNotes[patient.id].length} note(s)
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Info */}
                    <div className="mt-4 p-3 bg-muted/50 rounded-xl">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          Handoff will include patient summaries based on their latest clinical notes.
                          Patients without notes will show basic information only.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generated Handoff */}
                {handoffContent && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Button
                        onClick={() => {
                          setShowPatientList(true);
                          setHandoffContent(null);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                      >
                        ← Back to selection
                      </Button>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Generated just now
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-xl p-4 max-h-[50vh] overflow-y-auto">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                          {handoffContent}
                        </pre>
                      </div>
                    </div>

                    {/* Success indicator */}
                    <div className="mt-4 p-3 bg-success/10 rounded-xl">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <span className="text-sm text-success font-medium">
                          Handoff ready for {selectedPatientIds.size} patient(s)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {isGenerating && (
                  <div className="p-8 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">Generating handoff summary...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This may take a few seconds
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border">
                {!handoffContent ? (
                  <Button
                    onClick={generateHandoff}
                    disabled={selectedPatientIds.size === 0 || isGenerating}
                    className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Generate Handoff ({selectedPatientIds.size} patients)
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setHandoffContent(null);
                        setShowPatientList(true);
                      }}
                      variant="outline"
                      className="flex-1 h-11 rounded-xl"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate
                    </Button>
                    <Button
                      onClick={copyToClipboard}
                      variant="outline"
                      className="flex-1 h-11 rounded-xl"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 mr-2 text-success" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      Copy
                    </Button>
                    <Button
                      onClick={exportAsText}
                      className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
