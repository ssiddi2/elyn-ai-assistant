import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFacility } from '@/contexts/FacilityContext';
import useSpeech from '@/hooks/useSpeech';
import AI from '@/services/ai';
import type { DocumentMode, RadiologyModality, RadiologyContext } from '@/types/medical';

import BottomNav from './BottomNav';
import PatientList from '@/components/patients/PatientList';
import { Patient, PatientStatus } from '@/components/patients/PatientCard';
import PatientDetailSheet from '@/components/patients/PatientDetailSheet';
import DischargePatientModal, { DischargeData } from '@/components/patients/DischargePatientModal';
import HandoffNotesModal from '@/components/handoff/HandoffNotesModal';
import RoundingProgress, { RoundingProgressCompact } from '@/components/rounding/RoundingProgress';
import RoundingModeToggle from '@/components/rounding/RoundingModeToggle';
import RecordingSheet from '@/components/recording/RecordingSheet';
import BillCard, { Bill } from '@/components/billing/BillCard';
import BillingConfirmationModal, { ExtractedBilling } from '@/components/billing/BillingConfirmationModal';
import BillingAnalyticsDashboard from '@/components/billing/BillingAnalyticsDashboard';
import FaceSheetParser from '@/components/facesheet/FaceSheetParser';
import QuickAddPatient from '@/components/patients/QuickAddPatient';
import NotesHistory from '@/components/notes/NotesHistory';
import FacilitySelector from '@/components/facility/FacilitySelector';
import ManageFacilities from '@/components/facility/ManageFacilities';
import { exportNoteToText, exportNoteToJSON, copyNoteToClipboard, NoteExport } from '@/lib/exportNotes';
import useBilling from '@/hooks/useBilling';

// Local export utility for CommandCenter bills
const exportBillsToCSV = (bills: { patientName: string; dateOfService: string; cptCode: string; rvu?: number; status: string; facility?: string | null }[]) => {
  const headers = ['Patient Name', 'Date of Service', 'CPT Code', 'RVU', 'Status', 'Facility'];
  const rows = bills.map(b => [
    b.patientName,
    b.dateOfService,
    b.cptCode,
    b.rvu?.toFixed(2) || '0',
    b.status,
    b.facility || ''
  ]);
  const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bills-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

import { Button } from '@/components/ui/button';
import {
  FileText,
  TrendingUp,
  Activity,
  Clock,
  LogOut,
  User,
  Settings as SettingsIcon,
  CreditCard,
  ChevronRight,
  Plus,
  DollarSign,
  Download,
  UserPlus,
  Copy,
  FileDown,
  X,
  Check,
  Building2,
  LayoutDashboard,
  ScanLine,
  ClipboardList,
  Stethoscope,
  BarChart3,
  List
} from 'lucide-react';
import elynLogo from '@/assets/elyn-logo.png';
import { cn } from '@/lib/utils';
import { Toast } from '@/components/elyn/index';

interface TodayStats {
  notes: number;
  rvu: number;
  consults: number;
  avgTime: string;
}

interface PatientWithFacility extends Patient {
  facility_id?: string | null;
  status?: PatientStatus;
}

interface BillWithFacility extends Bill {
  facility?: string | null;
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { facilities, selectedFacilityId, selectedFacility } = useFacility();
  const speech = useSpeech();
  const { bills: unifiedBills, loading: billsLoading, updateBillStatus, refetch: refetchBills } = useBilling();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('patients');
  
  // Data state
  const [patients, setPatients] = useState<PatientWithFacility[]>([]);
  const [bills, setBills] = useState<BillWithFacility[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [todayStats, setTodayStats] = useState<TodayStats>({
    notes: 0,
    rvu: 0,
    consults: 0,
    avgTime: '0m',
  });
  
  // Recording state
  const [isRecordingSheetOpen, setIsRecordingSheetOpen] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [noteType, setNoteType] = useState('H&P');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Radiology mode state
  const [documentMode, setDocumentMode] = useState<DocumentMode>('clinical');
  const [radiologyModality, setRadiologyModality] = useState<RadiologyModality>('ct');
  const [radiologyContext, setRadiologyContext] = useState<RadiologyContext>({
    modality: 'ct',
    bodyPart: '',
    indication: '',
    comparison: '',
    technique: '',
    contrast: false,
  });
  
  // Quick add patient state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  
  // Manage facilities modal
  const [isManageFacilitiesOpen, setIsManageFacilitiesOpen] = useState(false);
  
  // Generated note export state
  const [generatedNoteModal, setGeneratedNoteModal] = useState<{
    isOpen: boolean;
    note: NoteExport | null;
  }>({ isOpen: false, note: null });
  const [copiedNote, setCopiedNote] = useState(false);
  
  // Billing confirmation state
  const [billingConfirmation, setBillingConfirmation] = useState<{
    isOpen: boolean;
    billing: ExtractedBilling | null;
    pendingNote: string;
    pendingNoteExport: NoteExport | null;
  }>({ isOpen: false, billing: null, pendingNote: '', pendingNoteExport: null });
  
  // Patient detail sheet state
  const [patientDetailOpen, setPatientDetailOpen] = useState(false);

  // Discharge modal state
  const [dischargeModalOpen, setDischargeModalOpen] = useState(false);
  const [patientToDischarge, setPatientToDischarge] = useState<Patient | null>(null);

  // Handoff modal state
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);

  // Rounding mode state
  const [isRoundingMode, setIsRoundingMode] = useState(false);

  // Face Sheet Parser modal state
  const [isFaceSheetOpen, setIsFaceSheetOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  // Billing view mode state (list vs analytics)
  const [billingViewMode, setBillingViewMode] = useState<'list' | 'analytics'>('list');

  // Billing status filter
  const [billingStatusFilter, setBillingStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'approved'>('all');

  // UI state
  const [toast, setToast] = useState('');
  
  // Load data
  useEffect(() => {
    if (user) loadData();
  }, [user]);
  
  // Sync transcript
  useEffect(() => {
    if (speech.transcript) setEditableTranscript(speech.transcript);
  }, [speech.transcript]);
  
  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load patients
      const { data: patientsData } = await supabase
        .from('patients')
        .select('*')
        .order('updated_at', { ascending: false });
      
      // Transform to Patient type with acuity, facility_id, hospital, and status
      const transformedPatients: PatientWithFacility[] = (patientsData || []).map((p, i) => ({
        id: p.id,
        name: p.name,
        mrn: p.mrn,
        dob: p.dob,
        room: p.room,
        diagnosis: p.diagnosis,
        allergies: p.allergies,
        facility_id: p.facility_id,
        hospital: (p as any).hospital,
        status: (p.status as PatientStatus) || 'not_seen',
        acuity: (['critical', 'high', 'moderate', 'low'] as const)[i % 4],
        lastSeen: 'Today',
      }));
      setPatients(transformedPatients);
      
      // Load today's notes for stats
      const today = new Date().toISOString().split('T')[0];
      const { data: notes } = await supabase
        .from('clinical_notes')
        .select('*, billing_records(*)')
        .gte('created_at', today);
      
      if (notes?.length) {
        const totalRvu = notes.reduce(
          (sum: number, n: any) =>
            sum + (n.billing_records?.[0]?.rvu ? parseFloat(n.billing_records[0].rvu) : 0),
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
      
      // Load bills
      const { data: billsData } = await supabase
        .from('bills')
        .select('*')
        .order('date_of_service', { ascending: false })
        .limit(20);
      
      const transformedBills: BillWithFacility[] = (billsData || []).map((b) => ({
        id: b.id,
        patientName: b.patient_name,
        dateOfService: b.date_of_service,
        cptCode: b.cpt_code,
        cptDescription: b.cpt_description,
        rvu: b.rvu,
        status: (b.status || 'pending') as Bill['status'],
        diagnosis: b.diagnosis,
        facility: b.facility,
      }));
      setBills(transformedBills);
      
    } catch (e) {
      console.error('Error loading data:', e);
    }
    setIsLoading(false);
  };
  
  // Filter patients and bills by selected facility
  const filteredPatients = useMemo(() => {
    if (selectedFacilityId === 'all') return patients;
    return patients.filter(p => p.facility_id === selectedFacilityId);
  }, [patients, selectedFacilityId]);
  
  // Transform unifiedBills to Bill format for display
  const allBills = useMemo(() => {
    return unifiedBills.map(b => ({
      id: b.id,
      patientName: b.patient_name,
      dateOfService: b.created_at,
      cptCode: b.cpt_codes?.[0] || '',
      cptDescription: b.cpt_description || undefined,
      rvu: b.rvu,
      status: (b.status || 'pending') as 'pending' | 'submitted' | 'approved' | 'rejected',
      diagnosis: b.diagnosis || undefined,
      facility: b.facility,
      source: b.source,
    }));
  }, [unifiedBills]);

  const filteredBills = useMemo(() => {
    let filtered = allBills;

    // Filter by facility
    if (selectedFacilityId !== 'all') {
      const selectedName = selectedFacility?.name;
      const selectedNickname = selectedFacility?.nickname;
      filtered = filtered.filter(b =>
        b.facility === selectedName ||
        b.facility === selectedNickname ||
        !b.facility
      );
    }

    // Filter by status
    if (billingStatusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === billingStatusFilter);
    }

    return filtered;
  }, [allBills, selectedFacilityId, selectedFacility, billingStatusFilter]);
  
  const handleRecordPress = () => {
    setIsRecordingSheetOpen(true);
  };
  
  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientDetailOpen(true);
  };
  
  const handleRecordPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientDetailOpen(false);
    setIsRecordingSheetOpen(true);
  };
  
  const handleStatusChange = async (patientId: string, newStatus: PatientStatus) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('patients')
        .update({ status: newStatus })
        .eq('id', patientId);
      
      if (error) throw error;
      
      // Update local state
      setPatients(prev => prev.map(p => 
        p.id === patientId ? { ...p, status: newStatus } : p
      ));
      
      // Show toast
      const statusLabels: Record<PatientStatus, string> = {
        not_seen: 'Not Seen',
        in_progress: 'In Progress',
        seen: 'Seen',
        signed: 'Signed',
        discharged: 'Discharged'
      };
      setToast(`Status updated to ${statusLabels[newStatus]}`);
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      console.error('Error updating status:', e);
      setToast('Error updating status');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const handleOpenDischargeModal = (patient: Patient) => {
    setPatientToDischarge(patient);
    setDischargeModalOpen(true);
  };

  const handleDischarge = async (data: DischargeData) => {
    try {
      // Update patient status to discharged
      const { error: patientError } = await supabase
        .from('patients')
        .update({
          status: 'discharged',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.patientId);

      if (patientError) throw patientError;

      // Get RVU for the discharge CPT code
      const dischargeRvu = data.dischargeCptCode === '99239' ? 1.90 : 1.28;

      // Create billing record for discharge
      await supabase.from('bills').insert({
        user_id: user?.id as string,
        patient_name: patientToDischarge?.name || 'Unknown',
        patient_mrn: patientToDischarge?.mrn || null,
        date_of_service: new Date().toISOString().split('T')[0],
        cpt_code: data.dischargeCptCode,
        cpt_description: data.dischargeCptCode === '99239'
          ? 'Hospital discharge day management, >30 min'
          : 'Hospital discharge day management, ≤30 min',
        diagnosis: patientToDischarge?.diagnosis || null,
        rvu: dischargeRvu,
        facility: selectedFacility?.name || null,
        status: 'pending',
      });

      // Update local patient state
      setPatients((prev) =>
        prev.map((p) =>
          p.id === data.patientId ? { ...p, status: 'discharged' as PatientStatus } : p
        )
      );

      // Update stats
      setTodayStats((prev) => ({
        ...prev,
        rvu: prev.rvu + dischargeRvu,
      }));

      showToast(`${patientToDischarge?.name} discharged successfully`);

      // Reload data to get updated bills
      loadData();
    } catch (e) {
      console.error('Error discharging patient:', e);
      showToast('Error discharging patient');
    }
  };

  const generateNote = async () => {
    if (!editableTranscript.trim()) return;
    
    // Require patient selection for radiology reports
    if (documentMode === 'radiology' && !selectedPatient) {
      showToast('Please select a patient for radiology reports');
      return;
    }
    
    setIsGenerating(true);
    try {
      const patientCtx = selectedPatient ? {
        name: selectedPatient.name,
        mrn: selectedPatient.mrn || '',
        dob: selectedPatient.dob || '',
        room: selectedPatient.room || '',
        diagnosis: selectedPatient.diagnosis || '',
        allergies: selectedPatient.allergies || [],
      } : null;
      
      // Determine the note type to use
      const effectiveNoteType = documentMode === 'radiology' ? radiologyModality : noteType;
      
      // Use the consolidated API that generates note + billing together
      const result = await AI.generateNoteWithBilling(
        editableTranscript, 
        effectiveNoteType, 
        patientCtx,
        documentMode === 'radiology' ? radiologyContext : null
      );
      
      // Prepare billing data for confirmation
      const billingData: ExtractedBilling = {
        icd10: (result.billing.icd10 || []).map(c => ({ code: c.code, description: c.description || '' })),
        cpt: (result.billing.cpt || []).map(c => ({ code: c.code, description: c.description || '' })),
        emLevel: result.billing.em || (documentMode === 'radiology' ? 'N/A' : '99213'),
        rvu: result.billing.rvu || 0,
        mdmComplexity: result.billing.mdm || (documentMode === 'radiology' ? 'N/A' : 'Low'),
      };
      
      // Prepare note export data
      const noteExport: NoteExport = {
        patientName: selectedPatient?.name,
        mrn: selectedPatient?.mrn || undefined,
        noteType: effectiveNoteType,
        dateGenerated: new Date().toLocaleString(),
        transcript: editableTranscript,
        generatedNote: result.note,
      };
      
      // Show billing confirmation modal instead of saving immediately
      setBillingConfirmation({
        isOpen: true,
        billing: billingData,
        pendingNote: result.note,
        pendingNoteExport: noteExport,
      });
      
      // Close recording sheet
      setIsRecordingSheetOpen(false);
      
    } catch (e) {
      console.error('Error generating note:', e);
      setToast('Error generating note');
      setTimeout(() => setToast(''), 2000);
    }
    setIsGenerating(false);
  };
  
  const handleBillingConfirm = async (confirmedBilling: ExtractedBilling) => {
    if (!billingConfirmation.pendingNote || !billingConfirmation.pendingNoteExport) return;
    
    try {
      // Determine note type - handle both clinical and radiology modalities
      let noteTypeValue: string;
      if (documentMode === 'radiology') {
        // Radiology modalities: xray, ct, mri, ultrasound, mammography, fluoroscopy
        noteTypeValue = radiologyModality;
      } else {
        // Clinical note types
        const noteTypeMap: Record<string, string> = {
          'H&P': 'hp',
          Consult: 'consult',
          Progress: 'progress',
        };
        noteTypeValue = noteTypeMap[noteType] || 'progress';
      }
      
      // Build base note insert object
      const baseNoteInsert = {
        user_id: user?.id as string,
        patient_id: selectedPatient?.id || null,
        note_type: noteTypeValue as 'hp' | 'consult' | 'progress' | 'xray' | 'ct' | 'mri' | 'ultrasound' | 'mammography' | 'fluoroscopy',
        transcript: editableTranscript,
        generated_note: billingConfirmation.pendingNote,
        // Radiology-specific fields (null for clinical notes)
        modality: documentMode === 'radiology' ? radiologyModality : null,
        body_part: documentMode === 'radiology' ? (radiologyContext.bodyPart || null) : null,
        clinical_indication: documentMode === 'radiology' ? (radiologyContext.indication || null) : null,
        comparison_studies: documentMode === 'radiology' ? (radiologyContext.comparison || null) : null,
        technique: documentMode === 'radiology' ? (radiologyContext.contrast ? 'With contrast' : 'Without contrast') : null,
      };
      
      const { data: savedNote } = await supabase
        .from('clinical_notes')
        .insert(baseNoteInsert)
        .select()
        .single();
      
      // Save billing record with confirmed codes
      await supabase.from('billing_records').insert({
        user_id: user?.id as string,
        note_id: savedNote?.id as string,
        icd10_codes: confirmedBilling.icd10.map((c) => c.code),
        cpt_codes: confirmedBilling.cpt.map((c) => c.code),
        em_level: confirmedBilling.emLevel,
        rvu: confirmedBilling.rvu,
        mdm_complexity: confirmedBilling.mdmComplexity,
      });
      
      // Create bill record
      if (confirmedBilling.cpt.length > 0) {
        await supabase.from('bills').insert({
          user_id: user?.id as string,
          patient_name: selectedPatient?.name || 'Unknown',
          patient_mrn: selectedPatient?.mrn || null,
          date_of_service: new Date().toISOString().split('T')[0],
          cpt_code: confirmedBilling.cpt[0].code,
          cpt_description: confirmedBilling.cpt[0].description,
          diagnosis: selectedPatient?.diagnosis || confirmedBilling.icd10[0]?.description || null,
          rvu: confirmedBilling.rvu,
          facility: selectedFacility?.name || null,
          status: 'pending',
        });
      }
      
      // Update stats
      setTodayStats((prev) => ({
        notes: prev.notes + 1,
        rvu: prev.rvu + confirmedBilling.rvu,
        consults: noteType === 'Consult' ? prev.consults + 1 : prev.consults,
        avgTime: `~3m`,
      }));
      
      // Show export modal
      setGeneratedNoteModal({ isOpen: true, note: billingConfirmation.pendingNoteExport });
      
      // Reset recording
      setEditableTranscript('');
      speech.clear();
      
      // Reload bills
      loadData();
      
      showToast('Note and billing saved');
      
    } catch (e) {
      console.error('Error saving note and billing:', e);
      showToast('Error saving note');
    }
    
    // Close billing confirmation
    setBillingConfirmation({ isOpen: false, billing: null, pendingNote: '', pendingNoteExport: null });
  };
  
  const handleBillingDiscard = () => {
    setBillingConfirmation({ isOpen: false, billing: null, pendingNote: '', pendingNoteExport: null });
    showToast('Billing discarded');
  };
  
  const handleCopyNote = async () => {
    if (!generatedNoteModal.note) return;
    await copyNoteToClipboard(generatedNoteModal.note);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
    setToast('Copied to clipboard');
    setTimeout(() => setToast(''), 2000);
  };
  
  const handleExportNote = (format: 'txt' | 'json') => {
    if (!generatedNoteModal.note) return;
    if (format === 'txt') {
      exportNoteToText(generatedNoteModal.note);
    } else {
      exportNoteToJSON(generatedNoteModal.note);
    }
    setToast(`Exported as ${format.toUpperCase()}`);
    setTimeout(() => setToast(''), 2000);
  };
  
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  };
  
  // Stats cards data
  const statsCards = [
    { label: 'Notes', value: todayStats.notes, icon: FileText, color: 'text-primary' },
    { label: 'RVU', value: todayStats.rvu.toFixed(1), icon: TrendingUp, color: 'text-success' },
    { label: 'Consults', value: todayStats.consults, icon: Activity, color: 'text-secondary' },
    { label: 'Avg Time', value: todayStats.avgTime, icon: Clock, color: 'text-warning' },
  ];
  
  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 z-40 glass-card rounded-none border-x-0 border-t-0">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img src={elynLogo} alt="ELYN" className="w-10 h-10 object-contain" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold gradient-text">ELYN™</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Clinical Rounding Intelligence
              </p>
            </div>
          </div>
          
          {/* Facility Selector */}
          <div className="flex items-center">
            <FacilitySelector onManageClick={() => setIsManageFacilitiesOpen(true)} />
          </div>
          
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 bg-muted/50 p-1 rounded-xl">
            {[
              { id: 'patients', label: 'Patients', icon: User },
              { id: 'notes', label: 'Notes', icon: FileText },
              { id: 'bills', label: 'Billing', icon: CreditCard },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
            ].map((tab) => (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant="ghost"
                size="sm"
                className={cn(
                  'px-2 lg:px-4 py-2 rounded-lg transition-all gap-1 lg:gap-2',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden lg:inline">{tab.label}</span>
              </Button>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            <Button
              onClick={() => setIsRoundingMode(!isRoundingMode)}
              variant={isRoundingMode ? "default" : "outline"}
              size="sm"
              className={cn("rounded-xl px-2 lg:px-4", isRoundingMode && "bg-primary")}
            >
              <Stethoscope className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">{isRoundingMode ? "End Rounds" : "Start Rounds"}</span>
            </Button>
            <Button
              onClick={() => setHandoffModalOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-xl px-2 lg:px-4"
            >
              <ClipboardList className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Handoff</span>
            </Button>
            <Button
              onClick={() => setIsFaceSheetOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-xl px-2 lg:px-4"
            >
              <ScanLine className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Face Sheet</span>
            </Button>
            <Button
              onClick={() => setIsQuickAddOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-xl px-2 lg:px-4"
            >
              <UserPlus className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Add Patient</span>
            </Button>
            <Button
              onClick={handleRecordPress}
              size="sm"
              className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold rounded-xl px-3 lg:px-5"
            >
              <Plus className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">New Note</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground px-2">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Mobile Stats Badge */}
          <div className="md:hidden flex items-center gap-2">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <DollarSign className="w-3 h-3" />
              {todayStats.rvu.toFixed(1)} RVU
            </span>
          </div>
        </div>
        
        {/* Desktop Stats Bar */}
        <div className="hidden md:grid grid-cols-4 gap-2 lg:gap-3 px-4 pb-4">
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-surface rounded-xl p-2 lg:p-3 flex items-center gap-2 lg:gap-3"
            >
              <div className={cn('p-1.5 lg:p-2 rounded-lg bg-muted', stat.color)}>
                <stat.icon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </div>
              <div>
                <div className="text-base lg:text-lg font-bold text-foreground">{stat.value}</div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Mobile Stats */}
      <div className="flex-shrink-0 md:hidden grid grid-cols-4 gap-2 px-4 py-3">
        {statsCards.map((stat) => (
          <div
            key={stat.label}
            className="glass-card p-2.5 text-center"
          >
            <div className="text-lg font-bold text-foreground">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
      
      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'patients' && (
            <motion.div
              key="patients"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col relative"
            >
              {/* Rounding Progress - Desktop */}
              <div className="hidden md:block px-4 pb-2 flex-shrink-0">
                <RoundingProgress patients={patients} />
              </div>

              {/* Rounding Progress - Mobile */}
              <div className="md:hidden px-4 pb-2 flex-shrink-0">
                <RoundingProgressCompact patients={patients} />
              </div>

              <div className="flex-1 min-h-0">
                <PatientList
                  patients={filteredPatients}
                  onPatientSelect={handlePatientSelect}
                  onRecordPatient={handleRecordPatient}
                  onStatusChange={handleStatusChange}
                  selectedPatientId={selectedPatient?.id}
                  facilities={facilities}
                />
              </div>

              {/* Rounding Mode Panel - Shows when rounding is active */}
              {isRoundingMode && (
                <RoundingModeToggle
                  isActive={isRoundingMode}
                  onToggle={() => setIsRoundingMode(false)}
                  patients={filteredPatients}
                  onStatusChange={handleStatusChange}
                  onPatientSelect={handlePatientSelect}
                />
              )}

              {/* Mobile FAB Menu */}
              {!isRoundingMode && (
                <div className="fixed bottom-24 right-4 md:hidden z-30">
                  {/* Expanded Menu Items */}
                  <AnimatePresence>
                    {isFabMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-3 mb-3"
                      >
                        <button
                          onClick={() => {
                            setIsRoundingMode(true);
                            setIsFabMenuOpen(false);
                          }}
                          className="w-12 h-12 rounded-full bg-success text-success-foreground shadow-lg flex items-center justify-center"
                        >
                          <Stethoscope className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setHandoffModalOpen(true);
                            setIsFabMenuOpen(false);
                          }}
                          className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground shadow-lg flex items-center justify-center"
                        >
                          <ClipboardList className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setIsFaceSheetOpen(true);
                            setIsFabMenuOpen(false);
                          }}
                          className="w-12 h-12 rounded-full bg-info text-info-foreground shadow-lg flex items-center justify-center"
                        >
                          <ScanLine className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setIsQuickAddOpen(true);
                            setIsFabMenuOpen(false);
                          }}
                          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
                        >
                          <UserPlus className="w-5 h-5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Main FAB Button with Logo */}
                  <button
                    onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                    className={cn(
                      "w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
                      isFabMenuOpen
                        ? "bg-muted rotate-45"
                        : "bg-card border border-border"
                    )}
                  >
                    {isFabMenuOpen ? (
                      <Plus className="w-6 h-6 text-foreground" />
                    ) : (
                      <img src={elynLogo} alt="Menu" className="w-8 h-8 object-contain" />
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          )}
          
          {activeTab === 'notes' && (
            <motion.div
              key="notes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <NotesHistory onToast={showToast} />
            </motion.div>
          )}
          
          {activeTab === 'bills' && (
            <motion.div
              key="bills"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full px-4 pt-4"
            >
              {/* Billing Header */}
              <div className="flex-shrink-0 flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Billing</h2>
                  <p className="text-sm text-muted-foreground">
                    {allBills.length} charges this period
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* View Toggle */}
                  <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                    <button
                      onClick={() => setBillingViewMode('list')}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        billingViewMode === 'list'
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="List View"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setBillingViewMode('analytics')}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        billingViewMode === 'analytics'
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Analytics View"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                  </div>
                  <Button
                    onClick={() => exportBillsToCSV(allBills)}
                    variant="outline"
                    size="sm"
                    disabled={allBills.length === 0}
                    className="rounded-lg h-9"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    CSV
                  </Button>
                  <div className="text-right">
                    <div className="text-xl font-bold text-primary">
                      ${(todayStats.rvu * 35).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Est. Revenue</div>
                  </div>
                </div>
              </div>

              {/* Analytics View */}
              {billingViewMode === 'analytics' && (
                <div className="pb-20 md:pb-4">
                  <BillingAnalyticsDashboard
                    billingRecords={unifiedBills.filter(b => b.source === 'note')}
                    manualBills={unifiedBills.filter(b => b.source === 'manual')}
                  />
                </div>
              )}

              {/* List View */}
              {billingViewMode === 'list' && (
                <>
                  {/* Filter Pills */}
                  <div className="flex-shrink-0 flex gap-2 mb-4 overflow-x-auto scrollbar-thin pb-1">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'pending', label: 'Pending' },
                      { id: 'submitted', label: 'Submitted' },
                      { id: 'approved', label: 'Approved' }
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setBillingStatusFilter(filter.id as typeof billingStatusFilter)}
                        className={cn(
                          'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all',
                          billingStatusFilter === filter.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface text-muted-foreground hover:bg-surface-hover'
                        )}
                      >
                        {filter.label}
                        {filter.id !== 'all' && (
                          <span className="ml-1.5 text-xs opacity-70">
                            {allBills.filter(b => b.status === filter.id).length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Bills List - Scrollable */}
                  <div className="flex-1 overflow-y-auto space-y-3 pb-20 md:pb-4">
                    {filteredBills.map((bill, index) => (
                      <motion.div
                        key={bill.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <BillCard
                          bill={bill}
                          onStatusChange={async (billId, newStatus, source) => {
                            const result = await updateBillStatus(billId, source || 'note', newStatus as any);
                            if (result.success) {
                              showToast(`Bill marked as ${newStatus}`);
                              // Refetch bills to get updated data
                              refetchBills();
                            } else {
                              showToast('Failed to update bill status');
                            }
                          }}
                        />
                      </motion.div>
                    ))}

                    {filteredBills.length === 0 && (
                      <div className="text-center py-12">
                        <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">
                          {billingStatusFilter === 'all'
                            ? 'No billing records yet'
                            : `No ${billingStatusFilter} bills`}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
          
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col overflow-hidden"
            >
              {/* Settings Content - No scroll */}
              <div className="flex-1 px-4 pt-4 overflow-hidden">
                <h2 className="text-xl font-bold text-foreground mb-4">Profile & Settings</h2>

                <div className="space-y-3">
                  <Button
                    onClick={() => setIsManageFacilitiesOpen(true)}
                    variant="outline"
                    className="w-full justify-between h-14 px-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Facilities</div>
                        <div className="text-xs text-muted-foreground">{facilities.length} hospital{facilities.length !== 1 ? 's' : ''} configured</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Button>

                  <Button
                    onClick={() => navigate('/practice-manager')}
                    variant="outline"
                    className="w-full justify-between h-14 px-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Practice Manager</div>
                        <div className="text-xs text-muted-foreground">Multi-specialty census & dashboard</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Button>

                  <Button
                    onClick={() => navigate('/profile')}
                    variant="outline"
                    className="w-full justify-between h-14 px-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Profile</div>
                        <div className="text-xs text-muted-foreground">Name, specialty, NPI</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              {/* Fixed Sign Out Button at Bottom */}
              <div className="px-4 py-4 pb-20 md:pb-6 border-t border-border bg-background">
                <Button
                  onClick={signOut}
                  variant="outline"
                  className="w-full h-12 justify-center text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10 rounded-xl"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      {/* Bottom Navigation (Mobile) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRecordPress={handleRecordPress}
        isRecording={speech.isRecording}
      />
      
      {/* Recording Sheet */}
      <RecordingSheet
        isOpen={isRecordingSheetOpen}
        onClose={() => setIsRecordingSheetOpen(false)}
        isRecording={speech.isRecording}
        onToggleRecording={speech.isRecording ? speech.stop : speech.start}
        transcript={editableTranscript}
        onTranscriptChange={setEditableTranscript}
        interimText={speech.interim}
        noteType={noteType}
        onNoteTypeChange={setNoteType}
        onGenerate={generateNote}
        isGenerating={isGenerating}
        patientName={selectedPatient?.name}
        patientId={selectedPatient?.id}
        patients={filteredPatients}
        onPatientSelect={setSelectedPatient}
        isSupported={speech.isSupported}
        documentMode={documentMode}
        onDocumentModeChange={setDocumentMode}
        radiologyModality={radiologyModality}
        onRadiologyModalityChange={(modality) => {
          setRadiologyModality(modality);
          setRadiologyContext(prev => ({ ...prev, modality }));
        }}
        radiologyContext={radiologyContext}
        onRadiologyContextChange={setRadiologyContext}
      />
      
      {/* Manage Facilities Modal */}
      <ManageFacilities
        isOpen={isManageFacilitiesOpen}
        onClose={() => setIsManageFacilitiesOpen(false)}
      />
      
      {/* Quick Add Patient Modal */}
      <QuickAddPatient
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onPatientAdded={() => {
          loadData();
          showToast('Patient added successfully');
        }}
        onBillCreated={(bill) => {
          setBills(prev => [{ ...bill, status: bill.status || 'pending' }, ...prev]);
          showToast('Bill created automatically');
        }}
      />
      
      {/* Note Export Modal */}
      <AnimatePresence>
        {generatedNoteModal.isOpen && generatedNoteModal.note && (
          <div className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGeneratedNoteModal({ isOpen: false, note: null })}
              className="absolute inset-0 bg-black/50"
            />
            {/* Modal - Bottom sheet on mobile, centered on desktop */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed md:relative bottom-20 left-4 right-4 md:bottom-auto md:left-auto md:right-auto z-50 glass-card rounded-2xl p-5 max-h-[75vh] md:max-h-[80vh] overflow-y-auto md:max-w-lg md:w-full"
            >
              {/* Handle - mobile only */}
              <div className="flex justify-center -mt-2 mb-3 md:hidden">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Note Generated!</h3>
                    <p className="text-xs text-muted-foreground">{generatedNoteModal.note.noteType} for {generatedNoteModal.note.patientName || 'Unknown'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setGeneratedNoteModal({ isOpen: false, note: null })}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              {/* Preview */}
              <div className="bg-muted/50 rounded-xl p-3 mb-4 max-h-48 overflow-y-auto scrollbar-thin">
                <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">
                  {generatedNoteModal.note.generatedNote.slice(0, 500)}...
                </p>
              </div>
              
              {/* Export Options */}
              <p className="text-sm font-medium text-foreground mb-3">Transfer to Desktop</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={handleCopyNote}
                  variant="outline"
                  className="flex-col h-auto py-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                >
                  {copiedNote ? (
                    <Check className="w-5 h-5 mb-1 text-success" />
                  ) : (
                    <Copy className="w-5 h-5 mb-1 text-primary" />
                  )}
                  <span className="text-xs">Copy</span>
                </Button>
                <Button
                  onClick={() => handleExportNote('txt')}
                  variant="outline"
                  className="flex-col h-auto py-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                >
                  <FileDown className="w-5 h-5 mb-1 text-primary" />
                  <span className="text-xs">TXT File</span>
                </Button>
                <Button
                  onClick={() => handleExportNote('json')}
                  variant="outline"
                  className="flex-col h-auto py-4 rounded-xl border-border hover:border-primary/40 hover:bg-primary/5"
                >
                  <Download className="w-5 h-5 mb-1 text-primary" />
                  <span className="text-xs">JSON</span>
                </Button>
              </div>
              
              <Button
                onClick={() => setGeneratedNoteModal({ isOpen: false, note: null })}
                className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
              >
                Done
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Billing Confirmation Modal */}
      <BillingConfirmationModal
        isOpen={billingConfirmation.isOpen}
        onClose={() => setBillingConfirmation({ isOpen: false, billing: null, pendingNote: '', pendingNoteExport: null })}
        billing={billingConfirmation.billing || { icd10: [], cpt: [], emLevel: '99213', rvu: 0, mdmComplexity: 'Low' }}
        patientName={selectedPatient?.name}
        noteType={noteType}
        onConfirm={handleBillingConfirm}
        onDiscard={handleBillingDiscard}
      />
      
      {/* Patient Detail Sheet */}
      {selectedPatient && (
        <PatientDetailSheet
          isOpen={patientDetailOpen}
          onClose={() => setPatientDetailOpen(false)}
          patient={selectedPatient}
          onRecordClick={() => handleRecordPatient(selectedPatient)}
          onDischargeClick={() => handleOpenDischargeModal(selectedPatient)}
          onToast={showToast}
          onPatientUpdate={(updatedPatient) => {
            // Update local state
            setPatients(prev => prev.map(p =>
              p.id === updatedPatient.id ? { ...p, ...updatedPatient } : p
            ));
            // Update selected patient
            setSelectedPatient(updatedPatient);
          }}
        />
      )}

      {/* Discharge Patient Modal */}
      {patientToDischarge && (
        <DischargePatientModal
          isOpen={dischargeModalOpen}
          onClose={() => {
            setDischargeModalOpen(false);
            setPatientToDischarge(null);
          }}
          patient={patientToDischarge}
          onDischarge={handleDischarge}
        />
      )}

      {/* Handoff Notes Modal */}
      <HandoffNotesModal
        isOpen={handoffModalOpen}
        onClose={() => setHandoffModalOpen(false)}
        patients={patients}
        onToast={showToast}
      />

      {/* Face Sheet Parser Modal */}
      <AnimatePresence>
        {isFaceSheetOpen && (
          <div className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsFaceSheetOpen(false)}
              className="absolute inset-0 bg-black/50"
            />

            {/* Modal */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed md:relative bottom-20 left-4 right-4 md:bottom-auto md:left-auto md:right-auto z-50 glass-card rounded-2xl md:rounded-2xl max-h-[75vh] md:max-h-[85vh] flex flex-col md:max-w-2xl md:w-full"
            >
              {/* Handle - mobile only */}
              <div className="flex justify-center pt-3 pb-2 md:hidden">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Header */}
              <div className="px-4 pt-4 md:pt-5 pb-4 border-b border-border">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <ScanLine className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">AI Face Sheet Parser</h3>
                      <p className="text-sm text-muted-foreground">Extract patient info from face sheets</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsFaceSheetOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
                <FaceSheetParser
                  onPatientCreated={(patientId) => {
                    showToast('Patient created successfully');
                    setIsFaceSheetOpen(false);
                    loadData();
                  }}
                  onToast={showToast}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} />}
      </AnimatePresence>
    </div>
  );
}
