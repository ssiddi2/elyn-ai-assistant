import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Sparkles, Copy, Check, ChevronUp, ChevronDown, Radio, Zap, Stethoscope, Scan, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Waveform } from '@/components/elyn/index';
import { cn } from '@/lib/utils';
import useRealtimeTranscription from '@/hooks/useRealtimeTranscription';
import { supabase } from '@/integrations/supabase/client';
import { ModalitySelector } from '@/components/elyn/RadiologyContext';
import { PriorNotesPanel, PatientSummaryCard } from '@/components/patients/PatientContext';
import { Patient } from '@/components/patients/PatientCard';
import type { DocumentMode, RadiologyModality, RadiologyContext } from '@/types/medical';

interface RecordingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  transcript: string;
  onTranscriptChange: (text: string) => void;
  interimText?: string;
  noteType: string;
  onNoteTypeChange: (type: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  patientName?: string;
  patientId?: string | null;
  patients?: Patient[];
  onPatientSelect?: (patient: Patient | null) => void;
  isSupported: boolean;
  documentMode: DocumentMode;
  onDocumentModeChange: (mode: DocumentMode) => void;
  radiologyModality: RadiologyModality;
  onRadiologyModalityChange: (modality: RadiologyModality) => void;
  radiologyContext: RadiologyContext;
  onRadiologyContextChange: (context: RadiologyContext) => void;
}

const noteTypes = [
  { id: 'H&P', label: 'H&P', icon: '🏥' },
  { id: 'Consult', label: 'Consult', icon: '🩺' },
  { id: 'Progress', label: 'Progress', icon: '📋' },
];

type RecordingMode = 'quick' | 'ambient';

export default function RecordingSheet({
  isOpen,
  onClose,
  isRecording,
  onToggleRecording,
  transcript,
  onTranscriptChange,
  interimText,
  noteType,
  onNoteTypeChange,
  onGenerate,
  isGenerating,
  patientName,
  patientId,
  patients = [],
  onPatientSelect,
  isSupported,
  documentMode,
  onDocumentModeChange,
  radiologyModality,
  onRadiologyModalityChange,
  radiologyContext,
  onRadiologyContextChange,
}: RecordingSheetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('quick');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [showPatientSelector, setShowPatientSelector] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  
  const realtime = useRealtimeTranscription();
  const [ambientDuration, setAmbientDuration] = useState(0);
  const durationTimerRef = useRef<number | null>(null);

  // Filter patients based on search
  const filteredPatientList = patients.filter(p =>
    p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    (p.mrn && p.mrn.toLowerCase().includes(patientSearch.toLowerCase()))
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper function to correct medical terms
  const correctMedicalTerms = async (text: string): Promise<string> => {
    if (!text.trim()) return text;
    try {
      const { data, error } = await supabase.functions.invoke('correct-medical-terms', {
        body: { transcript: text },
      });
      if (error) {
        console.error('Medical term correction error:', error);
        return text;
      }
      return data?.correctedTranscript || text;
    } catch (e) {
      console.error('Failed to correct medical terms:', e);
      return text;
    }
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Duration timer for ambient mode
  useEffect(() => {
    if (realtime.isRecording) {
      setAmbientDuration(0);
      durationTimerRef.current = window.setInterval(() => {
        setAmbientDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [realtime.isRecording]);

  // Auto-correct when quick recording stops
  useEffect(() => {
    if (!isRecording && transcript && recordingMode === 'quick') {
      setIsCorrecting(true);
      correctMedicalTerms(transcript).then(corrected => {
        if (corrected !== transcript) {
          onTranscriptChange(corrected);
        }
        setIsCorrecting(false);
      }).catch(() => setIsCorrecting(false));
    }
  }, [isRecording]);

  const handleAmbientToggle = async () => {
    if (realtime.isRecording) {
      // Save live transcript BEFORE stopping
      const savedLiveTranscript = realtime.liveTranscript;
      console.log('[Recording] Stopping realtime, saved live transcript length:', savedLiveTranscript?.length || 0);
      
      realtime.disconnect();
      
      // Apply medical term correction to the transcript
      if (savedLiveTranscript) {
        setIsCorrecting(true);
        const corrected = await correctMedicalTerms(savedLiveTranscript);
        onTranscriptChange(corrected);
        setIsCorrecting(false);
      } else {
        console.warn('[Recording] No live transcript available after stop');
      }
    } else {
      await realtime.connect();
    }
  };

  const handleToggleRecording = async () => {
    if (recordingMode === 'ambient') {
      handleAmbientToggle();
    } else {
      onToggleRecording();
    }
  };

  const isCurrentlyRecording = recordingMode === 'ambient' ? realtime.isRecording : isRecording;

  const getModalityLabel = (modality: RadiologyModality): string => {
    const labels: Record<RadiologyModality, string> = {
      xray: 'X-Ray',
      ct: 'CT',
      mri: 'MRI',
      ultrasound: 'Ultrasound',
      mammography: 'Mammography',
      fluoroscopy: 'Fluoroscopy',
    };
    return labels[modality];
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Desktop: Fullscreen centered container, Mobile: just backdrop */}
          <div className="fixed inset-0 z-40 md:flex md:items-center md:justify-center md:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/50"
            />

            {/* Sheet - Bottom sheet on mobile, centered modal on desktop */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed md:relative bottom-20 left-4 right-4 md:bottom-auto md:left-auto md:right-auto z-50 glass-card rounded-2xl max-h-[75vh] md:max-h-[85vh] flex flex-col overflow-hidden md:max-w-xl md:w-full"
            >
            {/* Handle - mobile only */}
            <div className="flex justify-center pt-3 pb-2 md:hidden">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  isCurrentlyRecording ? 'bg-destructive recording-pulse' : 'bg-muted-foreground/30'
                )} />
                <div>
                  <h3 className="font-semibold text-foreground">
                    {isCurrentlyRecording 
                      ? (recordingMode === 'ambient' ? `Recording ${formatDuration(ambientDuration)}` : 'Recording...') 
                      : 'Ready to Record'}
                  </h3>
                  {patientName && (
                    <p className="text-xs text-muted-foreground">{patientName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {/* Document Mode Toggle (Clinical/Radiology) */}
                    <div className="px-4 pt-4 pb-2">
                      <div className="flex gap-2 p-1 bg-muted rounded-xl">
                        <button
                          onClick={() => onDocumentModeChange('clinical')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                            documentMode === 'clinical'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Stethoscope className="w-4 h-4" />
                          Clinical
                        </button>
                        <button
                          onClick={() => onDocumentModeChange('radiology')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                            documentMode === 'radiology'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Scan className="w-4 h-4" />
                          Radiology
                        </button>
                      </div>
                    </div>

                    {/* Patient Selector - Always shown for all note types */}
                    {!patientId && patients.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className={cn(
                          "rounded-xl p-3 border",
                          documentMode === 'radiology'
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-muted/50 border-border"
                        )}>
                          <div className="flex items-center gap-2 mb-2">
                            <User className={cn(
                              "w-4 h-4",
                              documentMode === 'radiology' ? "text-amber-500" : "text-primary"
                            )} />
                            <span className={cn(
                              "text-sm font-medium",
                              documentMode === 'radiology'
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                            )}>
                              {documentMode === 'radiology' ? 'Patient Required' : 'Select Patient'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">
                            {documentMode === 'radiology'
                              ? 'Radiology reports must be linked to a patient.'
                              : 'Link this note to a patient for better tracking.'}
                          </p>

                          {!showPatientSelector ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowPatientSelector(true)}
                              className="w-full"
                            >
                              <User className="w-4 h-4 mr-2" />
                              Select Patient
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={patientSearch}
                                onChange={(e) => setPatientSearch(e.target.value)}
                                placeholder="Search by name or MRN..."
                                className="w-full p-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                                autoFocus
                              />
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {filteredPatientList.slice(0, 5).map((patient) => (
                                  <button
                                    key={patient.id}
                                    onClick={() => {
                                      onPatientSelect?.(patient);
                                      setShowPatientSelector(false);
                                      setPatientSearch('');
                                    }}
                                    className="w-full text-left p-2 rounded-lg hover:bg-muted transition-colors text-sm"
                                  >
                                    <div className="font-medium text-foreground">{patient.name}</div>
                                    {patient.mrn && (
                                      <div className="text-xs text-muted-foreground">MRN: {patient.mrn}</div>
                                    )}
                                  </button>
                                ))}
                                {filteredPatientList.length === 0 && (
                                  <p className="text-xs text-muted-foreground text-center py-2">
                                    No patients found
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setShowPatientSelector(false);
                                  setPatientSearch('');
                                }}
                                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected Patient Display */}
                    {patientId && patientName && !showPatientSelector && (
                      <div className="px-4 pb-2">
                        <div className="flex items-center justify-between p-2.5 bg-primary/5 border border-primary/20 rounded-xl">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">{patientName}</span>
                          </div>
                          {onPatientSelect && (
                            <button
                              onClick={() => {
                                onPatientSelect(null);
                                setShowPatientSelector(true);
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Change
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recording Mode Toggle */}
                    <div className="px-4 pt-2 pb-2">
                      <div className="flex gap-2 p-1 bg-muted/50 rounded-xl">
                        <button
                          onClick={() => setRecordingMode('quick')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                            recordingMode === 'quick'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Zap className="w-4 h-4" />
                          Quick
                        </button>
                        <button
                          onClick={() => setRecordingMode('ambient')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                            recordingMode === 'ambient'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Radio className="w-4 h-4" />
                          Ambient
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        {recordingMode === 'quick' 
                          ? 'Short dictations with live transcription'
                          : 'Long recordings for full patient encounters'}
                      </p>
                    </div>

                    {/* Waveform */}
                    <div className="p-4 pt-2">
                      <div className={cn(
                        "rounded-xl p-4 transition-colors",
                        isCurrentlyRecording ? "bg-destructive/5 border border-destructive/20" : "bg-muted/50"
                      )}>
                        <Waveform active={isCurrentlyRecording} />
                        {recordingMode === 'ambient' && realtime.isRecording && (
                          <div className="flex items-center justify-center gap-2 mt-3">
                            <span className="text-lg font-mono font-semibold text-foreground">
                              {formatDuration(ambientDuration)}
                            </span>
                            {realtime.isConnecting && (
                              <span className="text-xs text-muted-foreground">Connecting...</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Live Transcript (Ambient mode only) */}
                    {recordingMode === 'ambient' && realtime.isRecording && realtime.liveTranscript && (
                      <div className="px-4 pb-3">
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                              <span className="text-xs font-medium text-primary">Live Transcript</span>
                            </div>
                            {/* Medical correction indicators */}
                            <div className="flex items-center gap-2">
                              {realtime.hasRecentCorrections && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                  ✓ Terms corrected
                                </span>
                              )}
                              {realtime.isCorrectingAI && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary animate-pulse">
                                  AI refining...
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-foreground/80 leading-relaxed max-h-[80px] overflow-y-auto">
                            {realtime.liveTranscript}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Partial Transcript Indicator */}
                    {recordingMode === 'ambient' && realtime.isRecording && realtime.partialTranscript && !realtime.liveTranscript && (
                      <div className="px-4 pb-3">
                        <div className="bg-muted/50 border border-border rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                            <span className="text-xs text-muted-foreground">Listening...</span>
                          </div>
                          <p className="text-sm text-muted-foreground italic">
                            {realtime.partialTranscript}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error Display */}
                    {realtime.error && !realtime.isRecording && (
                      <div className="px-4 pb-3">
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 block mb-1">
                                Transcription Notice
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {realtime.error}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Radiology Mode: Modality Selector & Context */}
                    {documentMode === 'radiology' && (
                      <div className="px-4 pb-3 space-y-4">
                        <div>
                          <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">
                            Modality
                          </label>
                          <ModalitySelector
                            modality={radiologyModality}
                            onModalityChange={onRadiologyModalityChange}
                          />
                        </div>
                        
                        {/* Radiology Context Inputs */}
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Body Part / Region
                            </label>
                            <input
                              value={radiologyContext.bodyPart || ''}
                              onChange={(e) => onRadiologyContextChange({ ...radiologyContext, bodyPart: e.target.value })}
                              placeholder="e.g., Chest, Abdomen, Left Knee"
                              className="w-full p-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Clinical Indication *
                            </label>
                            <input
                              value={radiologyContext.indication || ''}
                              onChange={(e) => onRadiologyContextChange({ ...radiologyContext, indication: e.target.value })}
                              placeholder="Reason for exam"
                              className="w-full p-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Comparison Studies
                            </label>
                            <input
                              value={radiologyContext.comparison || ''}
                              onChange={(e) => onRadiologyContextChange({ ...radiologyContext, comparison: e.target.value })}
                              placeholder="Prior exams for comparison"
                              className="w-full p-2.5 rounded-xl bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                            />
                          </div>

                          {/* Contrast Toggle for CT/MRI */}
                          {(radiologyModality === 'ct' || radiologyModality === 'mri') && (
                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                              <span className="text-sm text-foreground">Contrast Used</span>
                              <button
                                onClick={() => onRadiologyContextChange({ ...radiologyContext, contrast: !radiologyContext.contrast })}
                                className={cn(
                                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                                  radiologyContext.contrast ? 'bg-primary' : 'bg-muted-foreground/30'
                                )}
                              >
                                <span
                                  className={cn(
                                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                    radiologyContext.contrast ? 'translate-x-6' : 'translate-x-1'
                                  )}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Clinical Mode: Note Type Pills */}
                    {documentMode === 'clinical' && (
                      <div className="px-4 pb-3">
                        <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wider">
                          Note Type
                        </label>
                        <div className="flex gap-2">
                          {noteTypes.map((type) => (
                            <button
                              key={type.id}
                              onClick={() => onNoteTypeChange(type.id)}
                              className={cn(
                                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                                noteType === type.id
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'
                              )}
                            >
                              <span>{type.icon}</span>
                              <span>{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Patient Context Panel */}
                    {patientId && (
                      <div className="px-4 pb-3 space-y-3">
                        <PatientSummaryCard patientId={patientId} patientName={patientName} />
                        <PriorNotesPanel patientId={patientId} maxNotes={3} />
                      </div>
                    )}
                    
                    {/* Transcript */}
                    <div className="px-4 pb-3">
                      <div className="relative">
                        <textarea
                          value={transcript}
                          onChange={(e) => onTranscriptChange(e.target.value)}
                          placeholder={documentMode === 'radiology' 
                            ? "Dictate your radiology findings..." 
                            : "Speak or type your clinical notes..."}
                          className="w-full min-h-[100px] max-h-[200px] p-3 pr-10 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        {transcript && (
                          <button
                            onClick={handleCopy}
                            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted transition-colors"
                          >
                            {copied ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        )}
                      </div>
                      {interimText && (
                        <p className="mt-2 text-sm text-muted-foreground italic">
                          "{interimText}"
                        </p>
                      )}
                      {isCorrecting && (
                        <p className="mt-2 text-xs text-primary flex items-center gap-1">
                          <span className="animate-spin">⏳</span>
                          Correcting medical terms...
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Actions */}
            <div className="p-0 pt-2 flex gap-2 border-t border-border safe-area-inset" style={{padding: "16px 16px"}}>
              <Button
                onClick={handleToggleRecording}
                disabled={!isSupported}
                className={cn(
                  'flex-1 h-12 rounded-xl font-semibold transition-all',
                  isCurrentlyRecording
                    ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                    : 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
                )}
              >
                {isCurrentlyRecording ? (
                  <>
                    <MicOff className="w-5 h-5 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5 mr-2" />
                    Record
                  </>
                )}
              </Button>
              
              <Button
                onClick={onGenerate}
                disabled={isGenerating || !transcript.trim() || isCorrecting}
                className="flex-1 h-12 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    {documentMode === 'radiology' ? `Generate ${getModalityLabel(radiologyModality)} Report` : 'Generate'}
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
