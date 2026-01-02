import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFacility } from '@/contexts/FacilityContext';
import useSpeech from '@/hooks/useSpeech';
import AI from '@/services/ai';
import AppLayout from '@/components/layout/AppLayout';
import AnalyticsDashboard from './AnalyticsDashboard';
import { Waveform, NoteSection, Modal, Toast, copyToClipboard, parseNoteSections } from './elyn/index';
import { RadiologyContextInput, ModalitySelector } from './elyn/RadiologyContext';
import elynLogo from '@/assets/elyn-logo.png';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, X, Mic, MicOff, AlertCircle, ChevronDown, ChevronUp, Building2, Stethoscope, Scan } from 'lucide-react';
import { useSync } from '@/contexts/SyncContext';
import SyncStatusIndicator from '@/components/sync/SyncStatusIndicator';

import type { BillingCodes, DocumentMode, RadiologyModality, RadiologyContext } from '@/types/medical';

interface ElynPatientData {
  id: string | null;
  name: string;
  mrn: string;
  dob: string;
  room: string;
  diagnosis: string;
  allergies: string;
  facility_id: string;
}

interface ElynSavedPatient {
  id: string;
  name: string;
  mrn: string | null;
  dob: string | null;
  room: string | null;
  diagnosis: string | null;
  allergies: string[] | null;
  facility_id: string;
}

interface TodayStats {
  notes: number;
  rvu: number;
  consults: number;
  avgTime: string;
}

export default function Elyn() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { facilities, selectedFacilityId, selectedFacility } = useFacility();
  const speech = useSpeech();
  const { status: syncStatus, lastSyncTime, connectedDevices, forceSync } = useSync();

  const [activeTab, setActiveTab] = useState('document');
  const [documentMode, setDocumentMode] = useState<DocumentMode>('clinical');
  const [noteType, setNoteType] = useState('H&P');
  const [radiologyModality, setRadiologyModality] = useState<RadiologyModality>('xray');
  const [radiologyContext, setRadiologyContext] = useState<RadiologyContext>({
    modality: 'xray',
    bodyPart: '',
    indication: '',
    comparison: '',
    technique: '',
    contrast: false,
  });
  const [generatedNote, setGeneratedNote] = useState('');
  const [codes, setCodes] = useState<BillingCodes | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState('');
  
  // Get default facility for new patients
  const defaultFacilityId = selectedFacilityId !== 'all' ? selectedFacilityId : (facilities.find(f => f.is_default)?.id || facilities[0]?.id || '');
  
  const [patient, setPatient] = useState<ElynPatientData>({
    id: null,
    name: '',
    mrn: '',
    dob: '',
    room: '',
    diagnosis: '',
    allergies: '',
    facility_id: defaultFacilityId,
  });
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [handoffSummary, setHandoffSummary] = useState('');
  const [showHandoff, setShowHandoff] = useState(false);
  const [todayStats, setTodayStats] = useState<TodayStats>({
    notes: 0,
    rvu: 0,
    consults: 0,
    avgTime: '0m',
  });
  const [savedPatients, setSavedPatients] = useState<ElynSavedPatient[]>([]);
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPatientList, setShowPatientList] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState('');
  
  // Mobile UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('recording');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (speech.transcript) setEditableTranscript(speech.transcript);
  }, [speech.transcript]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: patients } = await supabase
        .from('patients')
        .select('*')
        .order('updated_at', { ascending: false });
      setSavedPatients(patients || []);

      const today = new Date().toISOString().split('T')[0];
      const { data: notes } = await supabase
        .from('clinical_notes')
        .select('*, billing_records(*)')
        .gte('created_at', today);
      setSavedNotes(notes || []);

      if (notes?.length) {
        const totalRvu = notes.reduce(
          (sum: number, n: any) =>
            sum +
            (n.billing_records?.[0]?.rvu
              ? parseFloat(n.billing_records[0].rvu)
              : 0),
          0
        );
        const consultsCount = notes.filter((n) => n.note_type === 'consult').length;
        setTodayStats({
          notes: notes.length,
          rvu: totalRvu,
          consults: consultsCount,
          avgTime: '~3m',
        });
      }
    } catch (e) {
      console.error('Error loading data:', e);
    }
    setIsLoading(false);
  };

  const savePatient = async () => {
    if (!patient.name.trim()) {
      setToast('Patient name is required');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    if (!patient.facility_id) {
      setToast('Please select a facility');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    try {
      const patientData = {
        user_id: user?.id as string,
        name: patient.name.trim(),
        mrn: patient.mrn || null,
        dob: patient.dob || null,
        room: patient.room || null,
        diagnosis: patient.diagnosis || null,
        facility_id: patient.facility_id,
        allergies: patient.allergies
          ? patient.allergies.split(',').map((a) => a.trim())
          : null,
      };
      if (patient.id) {
        await supabase.from('patients').update(patientData).eq('id', patient.id);
        setToast('Patient updated');
      } else {
        const { data } = await supabase
          .from('patients')
          .insert(patientData)
          .select()
          .single();
        setPatient((prev) => ({ ...prev, id: data.id }));
        setToast('Patient saved');
      }
      await loadData();
      setShowPatientModal(false);
    } catch (e) {
      console.error('Error saving patient:', e);
      setToast('Error saving patient');
    }
    setTimeout(() => setToast(''), 2000);
  };

  const selectPatient = (p: ElynSavedPatient) => {
    setPatient({
      id: p.id,
      name: p.name,
      mrn: p.mrn || '',
      dob: p.dob || '',
      room: p.room || '',
      diagnosis: p.diagnosis || '',
      allergies: p.allergies ? p.allergies.join(', ') : '',
      facility_id: p.facility_id,
    });
    setShowPatientList(false);
    setGeneratedNote('');
    setCodes(null);
    setCurrentNoteId(null);
    setEditableTranscript('');
    speech.clear();
  };

  const clearPatient = () => {
    setPatient({
      id: null,
      name: '',
      mrn: '',
      dob: '',
      room: '',
      diagnosis: '',
      allergies: '',
      facility_id: defaultFacilityId,
    });
    setGeneratedNote('');
    setCodes(null);
    setCurrentNoteId(null);
    setEditableTranscript('');
    speech.clear();
  };

  const generateNote = async () => {
    if (!editableTranscript.trim()) return;
    setIsGenerating(true);
    const startTime = Date.now();
    try {
      const isRadiology = documentMode === 'radiology';
      
      const patientCtx = patient.name
        ? {
            name: patient.name,
            mrn: patient.mrn,
            dob: patient.dob,
            room: patient.room,
            diagnosis: patient.diagnosis,
            allergies: patient.allergies?.split(',').map((a) => a.trim()) || [],
          }
        : null;
      
      // Combined API call - generates note AND extracts billing in single request
      const currentNoteType = isRadiology ? radiologyModality : noteType;
      const radCtx = isRadiology ? radiologyContext : null;
      
      const { note, billing, structured_category } = await AI.generateNoteWithBilling(
        editableTranscript, 
        currentNoteType, 
        patientCtx,
        radCtx
      );
      setGeneratedNote(note);
      setCodes(billing);

      const noteTypeMap: Record<string, string> = {
        'H&P': 'hp',
        Consult: 'consult',
        Progress: 'progress',
        // Radiology types pass through
        xray: 'xray',
        ct: 'ct',
        mri: 'mri',
        ultrasound: 'ultrasound',
        mammography: 'mammography',
        fluoroscopy: 'fluoroscopy',
      };
      const elapsedMs = Date.now() - startTime;
      const noteTypeValue = noteTypeMap[currentNoteType] || 'progress';
      
      // Build insert payload with optional radiology fields
      const insertPayload: Record<string, unknown> = {
        user_id: user?.id as string,
        patient_id: patient.id || null,
        note_type: noteTypeValue,
        transcript: editableTranscript,
        generated_note: note,
      };
      
      // Add radiology-specific fields if applicable
      if (isRadiology) {
        insertPayload.modality = radiologyModality;
        insertPayload.body_part = radiologyContext.bodyPart || null;
        insertPayload.clinical_indication = radiologyContext.indication || null;
        insertPayload.comparison_studies = radiologyContext.comparison || null;
        insertPayload.technique = radiologyContext.technique || null;
        insertPayload.structured_category = structured_category || null;
      }
      
      const { data: savedNote } = await supabase
        .from('clinical_notes')
        .insert(insertPayload as any)
        .select()
        .single();
      setCurrentNoteId(savedNote?.id);

      await supabase.from('billing_records').insert({
        user_id: user?.id as string,
        note_id: savedNote?.id as string,
        icd10_codes: billing.icd10?.map((c) => c.code) || [],
        cpt_codes: billing.cpt?.map((c) => c.code) || [],
        em_level: billing.em || null,
        rvu: billing.rvu || null,
        mdm_complexity: billing.mdm || null,
      });

      const today = new Date().toISOString().split('T')[0];
      const { data: existingAnalytics } = await supabase
        .from('analytics')
        .select('*')
        .eq('user_id', user?.id as string)
        .eq('date', today)
        .maybeSingle();

      if (existingAnalytics) {
        await supabase
          .from('analytics')
          .update({
            notes_count: existingAnalytics.notes_count + 1,
            total_rvu:
              (existingAnalytics.total_rvu || 0) +
              (billing.rvu || 0),
            consults_count:
              currentNoteType === 'Consult'
                ? existingAnalytics.consults_count + 1
                : existingAnalytics.consults_count,
            avg_generation_time_ms: Math.round(
              (existingAnalytics.avg_generation_time_ms *
                existingAnalytics.notes_count +
                elapsedMs) /
                (existingAnalytics.notes_count + 1)
            ),
          })
          .eq('id', existingAnalytics.id);
      } else {
        await supabase.from('analytics').insert({
          user_id: user?.id,
          date: today,
          notes_count: 1,
          total_rvu: billing.rvu || 0,
          consults_count: currentNoteType === 'Consult' ? 1 : 0,
          avg_generation_time_ms: elapsedMs,
        });
      }

      setTodayStats((prev) => ({
        notes: prev.notes + 1,
        rvu: prev.rvu + (billing.rvu || 0),
        consults: currentNoteType === 'Consult' ? prev.consults + 1 : prev.consults,
        avgTime: `${Math.round(elapsedMs / 1000 / 60) || 1}m`,
      }));
      setToast(isRadiology ? 'Report saved' : 'Note saved');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setGeneratedNote('Error generating. Please try again.');
      setToast('Error generating');
      setTimeout(() => setToast(''), 2000);
    }
    setIsGenerating(false);
  };

  const generateHandoff = async () => {
    if (!generatedNote && !editableTranscript) return;
    setIsGenerating(true);
    try {
      const { data: recentNotes } = await supabase
        .from('clinical_notes')
        .select('*, patients(*)')
        .eq('user_id', user?.id)
        .gte('created_at', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false })
        .limit(10);
      const notes =
        recentNotes?.length
          ? recentNotes
          : [
              {
                chief_complaint: '',
                assessment: generatedNote || editableTranscript,
                plan: '',
                patient_id: null,
              },
            ];
      const patients =
        savedPatients.length > 0
          ? savedPatients.map((p) => ({
              id: p.id,
              name: p.name,
              mrn: p.mrn || undefined,
              dob: p.dob || undefined,
              room: p.room || undefined,
              diagnosis: p.diagnosis || undefined,
              allergies: p.allergies?.join(', ') || undefined,
            }))
          : patient.name
          ? [{ id: null, ...patient }]
          : [];
      const handoff = await AI.generateHandoff(notes, patients);
      setHandoffSummary(handoff);
      setShowHandoff(true);
    } catch (e) {
      setToast('Error generating handoff');
      setTimeout(() => setToast(''), 2000);
    }
    setIsGenerating(false);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Collapsible section component for mobile
  const CollapsibleSection = ({ 
    id, 
    title, 
    icon, 
    children,
    headerAction
  }: { 
    id: string; 
    title: string; 
    icon: string;
    children: React.ReactNode;
    headerAction?: React.ReactNode;
  }) => {
    const isExpanded = expandedSection === id;
    
    return (
      <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-semibold text-primary">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <AppLayout maxWidth="7xl" className="p-3 md:p-4 min-h-screen">
      {/* Header - Mobile Optimized */}
      <header className="bg-card/70 backdrop-blur-xl border border-border rounded-2xl p-3 md:p-5 mb-4 md:mb-6">
        <div className="flex justify-between items-center">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img
              src={elynLogo}
              alt="ELYN"
              className="w-10 h-10 md:w-12 md:h-12 object-contain"
            />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-primary">
                ELYN™
              </h1>
              <span className="hidden md:inline-block px-2 py-0.5 bg-primary/20 text-primary text-xs font-medium rounded-full">
                Rounds Simplified
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-1 bg-muted/50 p-1 rounded-xl">
            {[
              ['document', '📝', 'Document'],
              ['analytics', '📊', 'Analytics'],
              ['settings', '⚙️', 'Settings'],
            ].map(([key, icon, label]) => (
              <Button
                key={key}
                onClick={() => setActiveTab(key)}
                variant="ghost"
                size="sm"
                className={cn(
                  'px-4 py-2 rounded-lg transition-all',
                  activeTab === key
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <span className="mr-1.5">{icon}</span>
                {label}
              </Button>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            <SyncStatusIndicator
              status={syncStatus}
              lastSyncTime={lastSyncTime}
              connectedDevices={connectedDevices}
              onForceSync={forceSync}
            />
            <VoiceStatusBadge speech={speech} />
            <Button
              onClick={() => navigate('/practice-manager')}
              variant="outline"
              size="sm"
              className="text-sm"
            >
              Practice
            </Button>
            <Button
              onClick={() => navigate('/emr-access')}
              size="sm"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 text-sm"
            >
              EMR Access
            </Button>
            <Button
              variant="ghost"
              onClick={signOut}
              size="sm"
              className="text-muted-foreground"
            >
              Sign Out
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <SyncStatusIndicator
              status={syncStatus}
              lastSyncTime={lastSyncTime}
              compact
            />
            <VoiceStatusBadge speech={speech} compact />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden mt-4 pt-4 border-t border-border"
            >
              <nav className="flex flex-col gap-2 mb-4">
                {[
                  ['document', '📝', 'Document'],
                  ['analytics', '📊', 'Analytics'],
                  ['settings', '⚙️', 'Settings'],
                ].map(([key, icon, label]) => (
                  <Button
                    key={key}
                    onClick={() => {
                      setActiveTab(key);
                      setMobileMenuOpen(false);
                    }}
                    variant="ghost"
                    className={cn(
                      'justify-start px-4 py-3 rounded-xl',
                      activeTab === key
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    <span className="mr-2 text-lg">{icon}</span>
                    {label}
                  </Button>
                ))}
              </nav>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    navigate('/profile');
                    setMobileMenuOpen(false);
                  }}
                  variant="outline"
                  className="justify-start"
                >
                  👤 Profile Settings
                </Button>
                <Button
                  onClick={() => {
                    navigate('/practice-manager');
                    setMobileMenuOpen(false);
                  }}
                  variant="outline"
                  className="justify-start"
                >
                  Practice Manager
                </Button>
                <Button
                  onClick={() => {
                    navigate('/emr-access');
                    setMobileMenuOpen(false);
                  }}
                  className="bg-secondary text-secondary-foreground justify-start"
                >
                  EMR Access
                </Button>
                <Button
                  variant="ghost"
                  onClick={signOut}
                  className="justify-start text-destructive"
                >
                  Sign Out
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'document' && (
          <motion.div
            key="document"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {/* Stats Bar - 2x2 on mobile, 4 columns on desktop */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6">
              {[
                ['Notes Today', todayStats.notes, '📝'],
                ['Total wRVU', todayStats.rvu.toFixed(1), '💰'],
                ['Consults', todayStats.consults, '🩺'],
                ['Avg Time', todayStats.avgTime, '⏱️'],
              ].map(([label, value, icon]) => (
                <div
                  key={label as string}
                  className="bg-card/60 backdrop-blur-xl border border-border rounded-xl p-3 md:p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl md:text-2xl font-bold text-foreground">
                        {value}
                      </div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                    <div className="text-xl md:text-2xl opacity-60">{icon}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Layout - Collapsible Sections */}
            <div className="md:hidden space-y-3">
              {/* Voice Recording Section */}
              <CollapsibleSection
                id="recording"
                title="Voice Recording"
                icon="🎙️"
                headerAction={
                  speech.isRecording && (
                    <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                  )
                }
              >
                <VoiceRecorderSection speech={speech} />
              </CollapsibleSection>

              {/* Patient Section */}
              <CollapsibleSection
                id="patient"
                title={patient.name || 'Patient'}
                icon="👤"
                headerAction={
                  savedPatients.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {savedPatients.length} saved
                    </span>
                  )
                }
              >
                <PatientSection
                  patient={patient}
                  savedPatients={savedPatients}
                  showPatientList={showPatientList}
                  setShowPatientList={setShowPatientList}
                  setShowPatientModal={setShowPatientModal}
                  selectPatient={selectPatient}
                  clearPatient={clearPatient}
                />
              </CollapsibleSection>

              {/* Mode Toggle */}
              <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-3">
                <div className="flex gap-2">
                  <Button
                    onClick={() => setDocumentMode('clinical')}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'flex-1 h-10 rounded-xl',
                      documentMode === 'clinical'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Stethoscope className="w-4 h-4 mr-2" />
                    Clinical
                  </Button>
                  <Button
                    onClick={() => setDocumentMode('radiology')}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'flex-1 h-10 rounded-xl',
                      documentMode === 'radiology'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Scan className="w-4 h-4 mr-2" />
                    Radiology
                  </Button>
                </div>
              </div>

              {/* Note Type / Modality Section */}
              <CollapsibleSection 
                id="noteType" 
                title={documentMode === 'radiology' ? 'Modality' : 'Note Type'} 
                icon={documentMode === 'radiology' ? '🔬' : '📋'}
              >
                {documentMode === 'radiology' ? (
                  <ModalitySelector 
                    modality={radiologyModality} 
                    onModalityChange={(m) => {
                      setRadiologyModality(m);
                      setRadiologyContext(prev => ({ ...prev, modality: m }));
                    }} 
                  />
                ) : (
                  <NoteTypeSelector noteType={noteType} setNoteType={setNoteType} />
                )}
              </CollapsibleSection>

              {/* Radiology Context (when in radiology mode) */}
              {documentMode === 'radiology' && (
                <CollapsibleSection id="studyContext" title="Study Details" icon="📋">
                  <RadiologyContextInput
                    context={radiologyContext}
                    onChange={setRadiologyContext}
                    modality={radiologyModality}
                    onModalityChange={setRadiologyModality}
                  />
                </CollapsibleSection>
              )}

              {/* Transcript Section */}
              <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b border-border flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📝</span>
                    <span className="text-sm font-semibold text-primary">Transcript</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(editableTranscript, setToast)}
                      className="h-7 px-2 text-xs"
                    >
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        speech.clear();
                        setEditableTranscript('');
                      }}
                      className="h-7 px-2 text-xs text-destructive"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  <textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    placeholder="Start recording or type your clinical notes here..."
                    className="w-full min-h-[120px] p-3 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground resize-y text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  <Button
                    onClick={generateNote}
                    disabled={isGenerating || !editableTranscript.trim()}
                    className="w-full mt-3 h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-xl disabled:opacity-50"
                  >
                    {isGenerating
                      ? `⏳ Generating ${documentMode === 'radiology' ? 'Report' : 'Note'}...`
                      : `✨ Generate ${documentMode === 'radiology' ? radiologyModality.toUpperCase() + ' Report' : noteType + ' Note'}`}
                  </Button>
                </div>
              </div>

              {/* Generated Note Section */}
              {(generatedNote || isGenerating) && (
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-muted/30 border-b border-border flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <span className="text-sm font-semibold text-primary">Generated Note</span>
                      {currentNoteId && (
                        <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                    {generatedNote && (
                      <Button
                        size="sm"
                        onClick={() => copyToClipboard(generatedNote, setToast)}
                        className="h-7 px-3 text-xs bg-primary text-primary-foreground"
                      >
                        Copy All
                      </Button>
                    )}
                  </div>
                  <div className="p-4">
                    {generatedNote ? (
                      <div className="space-y-3 max-h-[400px] overflow-auto">
                        {parseNoteSections(generatedNote).map((section, i) => (
                          <NoteSection
                            key={i}
                            title={section.title}
                            content={section.content.trim()}
                            onCopy={(text) =>
                              copyToClipboard(`${section.title}:\n${text}`, setToast)
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-muted-foreground">
                        <span>Generating note...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Billing Section */}
              {codes && (
                <CollapsibleSection
                  id="billing"
                  title="Billing"
                  icon="💰"
                  headerAction={
                    <span className="text-sm font-bold text-primary">
                      {codes.rvu?.toFixed(2)} RVU
                    </span>
                  }
                >
                  <BillingSection codes={codes} setToast={setToast} />
                </CollapsibleSection>
              )}
            </div>

            {/* Desktop Layout - Grid */}
            <div className="hidden md:grid grid-cols-12 gap-5">
              {/* Left Panel - Patient & Controls */}
              <div className="col-span-3 space-y-5">
                {/* Patient Card */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-primary/10 px-5 py-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                        👤 Patient
                      </span>
                      {savedPatients.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPatientList(!showPatientList)}
                          className="h-7 px-2 text-xs rounded-lg hover:bg-muted"
                        >
                          {showPatientList ? '✕' : `📋 ${savedPatients.length}`}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    <PatientSection
                      patient={patient}
                      savedPatients={savedPatients}
                      showPatientList={showPatientList}
                      setShowPatientList={setShowPatientList}
                      setShowPatientModal={setShowPatientModal}
                      selectPatient={selectPatient}
                      clearPatient={clearPatient}
                    />
                  </div>
                </div>

                {/* Voice Recording */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-secondary/10 px-5 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-secondary uppercase tracking-wider">
                      🎙️ Voice Recording
                    </span>
                  </div>
                  <div className="p-5">
                    <VoiceRecorderSection speech={speech} />
                  </div>
                </div>

                {/* Mode Toggle - Clinical / Radiology */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-accent/10 px-5 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-accent-foreground uppercase tracking-wider">
                      📑 Mode
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setDocumentMode('clinical')}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'flex-1 h-10 rounded-xl',
                          documentMode === 'clinical'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Stethoscope className="w-4 h-4 mr-2" />
                        Clinical
                      </Button>
                      <Button
                        onClick={() => setDocumentMode('radiology')}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'flex-1 h-10 rounded-xl',
                          documentMode === 'radiology'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Scan className="w-4 h-4 mr-2" />
                        Radiology
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Note Type / Modality Selector */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-warning/10 px-5 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-warning uppercase tracking-wider">
                      {documentMode === 'radiology' ? '🔬 Modality' : '📋 Note Type'}
                    </span>
                  </div>
                  <div className="p-5">
                    {documentMode === 'radiology' ? (
                      <ModalitySelector
                        modality={radiologyModality}
                        onModalityChange={(m) => {
                          setRadiologyModality(m);
                          setRadiologyContext(prev => ({ ...prev, modality: m }));
                        }}
                      />
                    ) : (
                      <NoteTypeSelector noteType={noteType} setNoteType={setNoteType} />
                    )}
                  </div>
                </div>

                {/* Radiology Study Context (only in radiology mode) */}
                {documentMode === 'radiology' && (
                  <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                    <div className="bg-secondary/10 px-5 py-3 border-b border-border">
                      <span className="text-sm font-semibold text-secondary uppercase tracking-wider">
                        📋 Study Details
                      </span>
                    </div>
                    <div className="p-5">
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Body Part</label>
                          <input
                            value={radiologyContext.bodyPart || ''}
                            onChange={(e) => setRadiologyContext(prev => ({ ...prev, bodyPart: e.target.value }))}
                            placeholder="e.g., Chest, Abdomen, L Knee"
                            className="w-full p-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Clinical Indication *</label>
                          <input
                            value={radiologyContext.indication || ''}
                            onChange={(e) => setRadiologyContext(prev => ({ ...prev, indication: e.target.value }))}
                            placeholder="Reason for exam"
                            className="w-full p-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Comparison</label>
                          <input
                            value={radiologyContext.comparison || ''}
                            onChange={(e) => setRadiologyContext(prev => ({ ...prev, comparison: e.target.value }))}
                            placeholder="Prior studies"
                            className="w-full p-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                          />
                        </div>
                        {(radiologyModality === 'ct' || radiologyModality === 'mri') && (
                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                            <span className="text-sm text-foreground">Contrast Used</span>
                            <button
                              onClick={() => setRadiologyContext(prev => ({ ...prev, contrast: !prev.contrast }))}
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
                  </div>
                )}
              </div>

              {/* Middle Panel - Transcript & Note */}
              <div className="col-span-6 space-y-5">
                {/* Transcript Input */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-muted/50 px-5 py-3 border-b border-border flex justify-between items-center">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      📝 Transcript
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(editableTranscript, setToast)}
                        className="h-7 px-2 text-xs rounded-lg hover:bg-muted"
                      >
                        📋 Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          speech.clear();
                          setEditableTranscript('');
                        }}
                        className="h-7 px-2 text-xs rounded-lg hover:bg-destructive/20 text-destructive"
                      >
                        🗑️ Clear
                      </Button>
                    </div>
                  </div>
                  <div className="p-5">
                    <textarea
                      value={editableTranscript}
                      onChange={(e) => setEditableTranscript(e.target.value)}
                      placeholder="Start recording or type your clinical notes here..."
                      className="w-full min-h-[140px] p-4 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground resize-y font-mono text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <Button
                      onClick={generateNote}
                      disabled={isGenerating || !editableTranscript.trim()}
                      className="w-full mt-4 h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl disabled:opacity-50"
                    >
                      {isGenerating
                        ? `⏳ Generating ${documentMode === 'radiology' ? 'Report' : 'Note'}...`
                        : `✨ Generate ${documentMode === 'radiology' ? radiologyModality.toUpperCase() + ' Report' : noteType + ' Note'}`}
                    </Button>
                  </div>
                </div>

                {/* Generated Note */}
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-primary/10 px-5 py-3 border-b border-border flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                        📄 Generated Note
                      </span>
                      {currentNoteId && (
                        <span className="text-xs font-medium text-primary bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-full">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                    {generatedNote && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => copyToClipboard(generatedNote, setToast)}
                          className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
                        >
                          📋 Copy All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={generateHandoff}
                          className="h-7 px-3 text-xs text-muted-foreground hover:bg-muted rounded-lg"
                        >
                          🔄 Handoff
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="p-5 min-h-[350px]">
                    {generatedNote ? (
                      <div className="space-y-4 max-h-[400px] overflow-auto pr-2">
                        {parseNoteSections(generatedNote).map((section, i) => (
                          <NoteSection
                            key={i}
                            title={section.title}
                            content={section.content.trim()}
                            onCopy={(text) =>
                              copyToClipboard(`${section.title}:\n${text}`, setToast)
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                          <span className="text-4xl">📝</span>
                        </div>
                        <div className="text-base font-medium">
                          Your note will appear here
                        </div>
                        <div className="text-sm mt-1">
                          Record or type, then generate
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Panel - Billing */}
              <div className="col-span-3 space-y-5">
                <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
                  <div className="bg-warning/10 px-5 py-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-warning uppercase tracking-wider">
                        💰 Billing
                      </span>
                      {codes && (
                        <span className="text-lg font-bold text-primary">
                          {codes.rvu?.toFixed(2)} RVU
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    {codes ? (
                      <BillingSection codes={codes} setToast={setToast} />
                    ) : (
                      <div className="text-center py-10">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center mb-4">
                          <span className="text-3xl">💰</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Billing codes will appear
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          after note generation
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'analytics' && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <AnalyticsDashboard />
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-card/60 backdrop-blur-xl border border-primary/20 rounded-2xl p-6 max-w-xl mx-auto"
          >
            <h2 className="text-xl font-bold mb-6 text-primary">⚙️ Settings</h2>

            <div className="space-y-4">
              <Button
                onClick={() => navigate('/profile')}
                variant="outline"
                className="w-full justify-start h-14 px-4 border-primary/20 hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">👤</span>
                  <div className="text-left">
                    <div className="font-medium">Profile Settings</div>
                    <div className="text-xs text-muted-foreground">Update your name, specialty, and NPI</div>
                  </div>
                </div>
              </Button>

              <Button
                onClick={() => navigate('/billing-agent')}
                variant="outline"
                className="w-full justify-start h-14 px-4 border-primary/20 hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">💰</span>
                  <div className="text-left">
                    <div className="font-medium">Billing Agent</div>
                    <div className="text-xs text-muted-foreground">Manage billing records and CPT codes</div>
                  </div>
                </div>
              </Button>

              <Button
                onClick={() => navigate('/practice-manager')}
                variant="outline"
                className="w-full justify-start h-14 px-4 border-primary/20 hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏥</span>
                  <div className="text-left">
                    <div className="font-medium">Practice Manager</div>
                    <div className="text-xs text-muted-foreground">Patient census and multi-specialty view</div>
                  </div>
                </div>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Patient Modal */}
      <AnimatePresence>
        {showPatientModal && (
          <Modal onClose={() => setShowPatientModal(false)}>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4 text-primary">
                {patient.id ? 'Edit Patient' : 'Add Patient'}
              </h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Name *
                    </label>
                    <input
                      value={patient.name}
                      onChange={(e) =>
                        setPatient({ ...patient, name: e.target.value })
                      }
                      placeholder="Last, First"
                      className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      MRN
                    </label>
                    <input
                      value={patient.mrn}
                      onChange={(e) =>
                        setPatient({ ...patient, mrn: e.target.value })
                      }
                      placeholder="Medical Record #"
                      className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      DOB
                    </label>
                    <input
                      type="date"
                      value={patient.dob}
                      onChange={(e) =>
                        setPatient({ ...patient, dob: e.target.value })
                      }
                      className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Room
                    </label>
                    <input
                      value={patient.room}
                      onChange={(e) =>
                        setPatient({ ...patient, room: e.target.value })
                      }
                      placeholder="Room #"
                      className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Diagnosis
                  </label>
                  <input
                    value={patient.diagnosis}
                    onChange={(e) =>
                      setPatient({ ...patient, diagnosis: e.target.value })
                    }
                    placeholder="Primary diagnosis"
                    className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Allergies
                  </label>
                  <input
                    value={patient.allergies}
                    onChange={(e) =>
                      setPatient({ ...patient, allergies: e.target.value })
                    }
                    placeholder="Comma separated"
                    className="w-full p-2 rounded-lg bg-muted/50 border border-primary/20 text-foreground text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowPatientModal(false)}
                  className="flex-1 border-primary/30"
                >
                  Cancel
                </Button>
                <Button
                  onClick={savePatient}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {patient.id ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Handoff Modal */}
      <AnimatePresence>
        {showHandoff && (
          <Modal onClose={() => setShowHandoff(false)}>
            <div className="p-6 max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-primary">
                  🔄 Handoff Summary
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHandoff(false)}
                >
                  ✕
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {handoffSummary}
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowHandoff(false)}
                  className="flex-1 border-primary/30"
                >
                  Close
                </Button>
                <Button
                  onClick={() => copyToClipboard(handoffSummary, setToast)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  📋 Copy
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>{toast && <Toast message={toast} />}</AnimatePresence>
    </AppLayout>
  );
}

// Helper Components

function VoiceStatusBadge({ speech, compact = false }: { speech: ReturnType<typeof useSpeech>; compact?: boolean }) {
  if (speech.error) {
    return (
      <span className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
        'bg-destructive/15 border-destructive/40 text-destructive'
      )}>
        <AlertCircle className="w-3 h-3" />
        {!compact && 'Error'}
      </span>
    );
  }

  if (speech.isRecording) {
    return (
      <span className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border animate-pulse',
        'bg-destructive/15 border-destructive/40 text-destructive'
      )}>
        <span className="w-2 h-2 bg-destructive rounded-full" />
        {!compact && 'Recording'}
      </span>
    );
  }

  return (
    <span className={cn(
      'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
      speech.isSupported
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'bg-muted border-border text-muted-foreground'
    )}>
      {speech.isSupported ? (
        <>
          <Mic className="w-3 h-3" />
          {!compact && 'Voice Ready'}
        </>
      ) : (
        <>
          <MicOff className="w-3 h-3" />
          {!compact && 'No Voice'}
        </>
      )}
    </span>
  );
}

function VoiceRecorderSection({ speech }: { speech: ReturnType<typeof useSpeech> }) {
  return (
    <div className="space-y-4">
      {/* Error Message */}
      {speech.error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-destructive">{speech.error.message}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={speech.clearError}
              className="mt-2 h-7 text-xs text-destructive hover:bg-destructive/20"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Waveform */}
      <div className="bg-muted/50 rounded-xl p-4">
        <Waveform active={speech.isRecording} />
      </div>

      {/* Record Button */}
      <Button
        onClick={speech.isRecording ? speech.stop : speech.start}
        disabled={!speech.isSupported && !speech.error}
        className={cn(
          'w-full h-12 text-base font-semibold rounded-xl transition-all',
          speech.isRecording
            ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground recording-pulse'
            : 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
        )}
      >
        {speech.isRecording ? (
          <>
            <MicOff className="w-5 h-5 mr-2" />
            Stop Recording
          </>
        ) : (
          <>
            <Mic className="w-5 h-5 mr-2" />
            Start Recording
          </>
        )}
      </Button>

      {/* Interim Text */}
      {speech.interim && (
        <div className="text-sm text-muted-foreground italic bg-muted/50 rounded-lg p-3">
          "{speech.interim}"
        </div>
      )}

      {/* Permission hint */}
      {speech.permissionState === 'denied' && (
        <p className="text-xs text-muted-foreground text-center">
          Microphone access is blocked. Please enable it in your browser settings.
        </p>
      )}
    </div>
  );
}

function PatientSection({
  patient,
  savedPatients,
  showPatientList,
  setShowPatientList,
  setShowPatientModal,
  selectPatient,
  clearPatient,
}: {
  patient: ElynPatientData;
  savedPatients: ElynSavedPatient[];
  showPatientList: boolean;
  setShowPatientList: (v: boolean) => void;
  setShowPatientModal: (v: boolean) => void;
  selectPatient: (p: ElynSavedPatient) => void;
  clearPatient: () => void;
}) {
  return (
    <>
      <AnimatePresence>
        {showPatientList && savedPatients.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 max-h-48 overflow-auto rounded-xl border border-border bg-muted/50"
          >
            {savedPatients.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPatient(p)}
                className="p-3 cursor-pointer hover:bg-muted border-b border-border last:border-b-0 flex justify-between items-center transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.room && `Room ${p.room}`}
                  </div>
                </div>
                {patient.id === p.id && (
                  <span className="text-primary text-sm">✓</span>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {patient.name ? (
        <div>
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="font-bold text-lg text-foreground">
                {patient.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {patient.room && `Room ${patient.room}`}{' '}
                {patient.mrn && `• ${patient.mrn}`}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPatientModal(true)}
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
              >
                ✏️
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPatient}
                className="h-8 w-8 p-0 rounded-lg hover:bg-destructive/20 text-destructive"
              >
                ✕
              </Button>
            </div>
          </div>
          {patient.diagnosis && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mb-2">
              📋 {patient.diagnosis}
            </div>
          )}
          {patient.allergies && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              ⚠️ {patient.allergies}
            </div>
          )}
        </div>
      ) : (
        <Button
          onClick={() => setShowPatientModal(true)}
          variant="outline"
          className="w-full h-20 border-dashed border-2 border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 rounded-xl transition-all"
        >
          <div className="text-center">
            <div className="text-2xl mb-1">+</div>
            <div className="text-sm">Add Patient</div>
          </div>
        </Button>
      )}

      {/* Patient list toggle for mobile */}
      {savedPatients.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPatientList(!showPatientList)}
          className="w-full mt-3 text-xs text-muted-foreground"
        >
          {showPatientList ? 'Hide saved patients' : `View ${savedPatients.length} saved patients`}
        </Button>
      )}
    </>
  );
}

function NoteTypeSelector({ noteType, setNoteType }: { noteType: string; setNoteType: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        ['H&P', '🏥'],
        ['Consult', '🩺'],
        ['Progress', '📋'],
      ].map(([type, icon]) => (
        <Button
          key={type}
          onClick={() => setNoteType(type)}
          variant="ghost"
          className={cn(
            'flex flex-col gap-2 h-auto py-3 md:py-4 rounded-xl border-2 transition-all',
            noteType === type
              ? 'bg-primary text-primary-foreground border-transparent'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted'
          )}
        >
          <span className="text-lg md:text-xl">{icon}</span>
          <span className="text-xs font-semibold">{type}</span>
        </Button>
      ))}
    </div>
  );
}

function BillingSection({ codes, setToast }: { codes: BillingCodes; setToast: (v: string) => void }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 p-3 md:p-4 bg-warning/10 border border-warning/20 rounded-xl">
        <span className="text-2xl md:text-3xl">🏷️</span>
        <div>
          <div className="text-xl md:text-2xl font-bold text-warning">
            {codes.em}
          </div>
          <div className="text-xs text-muted-foreground">
            E/M Level
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
          ICD-10 Codes
        </div>
        <div className="flex flex-wrap gap-1.5">
          {codes.icd10?.slice(0, 5).map((c, i) => (
            <span
              key={i}
              onClick={() => copyToClipboard(c.code, setToast)}
              className="px-2.5 py-1.5 bg-secondary/15 border border-secondary/30 rounded-lg text-xs text-secondary cursor-pointer hover:bg-secondary/25 transition-colors font-mono"
            >
              {c.code}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
          CPT Codes
        </div>
        <div className="flex flex-wrap gap-1.5">
          {codes.cpt?.map((c, i) => (
            <span
              key={i}
              onClick={() => copyToClipboard(c.code, setToast)}
              className="px-2.5 py-1.5 bg-primary/15 border border-primary/30 rounded-lg text-xs text-primary cursor-pointer hover:bg-primary/25 transition-colors font-mono"
            >
              {c.code}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-muted/50 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            MDM Complexity
          </span>
          <span className="font-bold text-primary">
            {codes.mdm}
          </span>
        </div>
      </div>

      <Button
        onClick={() =>
          copyToClipboard(
            `E/M: ${codes.em}\nMDM: ${codes.mdm}\nRVU: ${codes.rvu}\nICD-10: ${codes.icd10
              ?.map((c) => c.code)
              .join(', ')}\nCPT: ${codes.cpt?.map((c) => c.code).join(', ')}`,
            setToast
          )
        }
        className="w-full h-11 bg-warning hover:bg-warning/90 text-warning-foreground font-semibold rounded-xl"
      >
        📋 Copy All Codes
      </Button>
    </div>
  );
}
