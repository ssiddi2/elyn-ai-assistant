import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/contexts/SyncContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import {
  FileText,
  Copy,
  FileDown,
  Download,
  Clock,
  User,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
  X,
  FileEdit,
  Eye,
  CheckCircle2,
  Pen,
  RefreshCw,
  Cloud
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportNoteToText, exportNoteToJSON, copyNoteToClipboard, NoteExport } from '@/lib/exportNotes';

type NoteStatus = 'draft' | 'pending_review' | 'signed';

interface ClinicalNote {
  id: string;
  note_type: 'hp' | 'consult' | 'progress';
  transcript: string | null;
  generated_note: string | null;
  created_at: string;
  patient_id: string | null;
  status: NoteStatus;
  signed_at: string | null;
  signed_by: string | null;
  patient?: {
    name: string;
    mrn: string | null;
  } | null;
}

// Status configuration
const STATUS_CONFIG: Record<NoteStatus, { label: string; icon: typeof FileEdit; color: string; bg: string }> = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
  },
  pending_review: {
    label: 'Pending Review',
    icon: Eye,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
  },
  signed: {
    label: 'Signed',
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500/10',
  },
};

interface NotesHistoryProps {
  onToast: (message: string) => void;
}

const noteTypeLabels: Record<string, string> = {
  hp: 'H&P',
  consult: 'Consult',
  progress: 'Progress',
};

// SOAP section colors
const SOAP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SUBJECTIVE: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600 dark:text-blue-400' },
  OBJECTIVE: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-600 dark:text-green-400' },
  ASSESSMENT: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
  PLAN: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-600 dark:text-purple-400' },
};

// Parse SOAP sections from note text
function parseSOAPSections(noteText: string): { section: string; content: string }[] {
  const sections: { section: string; content: string }[] = [];
  const soapRegex = /##\s*(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)\s*\n([\s\S]*?)(?=##\s*(?:SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)|$)/gi;

  let match;
  while ((match = soapRegex.exec(noteText)) !== null) {
    sections.push({
      section: match[1].toUpperCase(),
      content: match[2].trim(),
    });
  }

  return sections;
}

// SOAP Section Display Component
function SOAPNoteDisplay({ noteText }: { noteText: string }) {
  const sections = parseSOAPSections(noteText);

  if (sections.length === 0) {
    // Not SOAP format, display as plain text
    return (
      <p className="text-sm text-foreground whitespace-pre-wrap">
        {noteText}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => {
        const colors = SOAP_COLORS[section.section] || SOAP_COLORS.SUBJECTIVE;
        return (
          <div
            key={index}
            className={cn(
              "rounded-lg border p-3",
              colors.bg,
              colors.border
            )}
          >
            <div className={cn("text-xs font-bold mb-1.5 uppercase tracking-wider", colors.text)}>
              {section.section}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {section.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function NotesHistory({ onToast }: NotesHistoryProps) {
  const { user } = useAuth();
  const { refreshKey, isSyncing } = useSync();
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Load notes on mount and when refreshKey changes (sync from other devices)
  useEffect(() => {
    if (user) loadNotes();
  }, [user, refreshKey]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('clinical_notes')
        .select(`
          id,
          note_type,
          transcript,
          generated_note,
          created_at,
          patient_id,
          status,
          signed_at,
          signed_by,
          patients (
            name,
            mrn
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const transformedNotes: ClinicalNote[] = (data || []).map((note: any) => ({
        id: note.id,
        note_type: note.note_type,
        transcript: note.transcript,
        generated_note: note.generated_note,
        created_at: note.created_at,
        patient_id: note.patient_id,
        status: note.status || 'draft',
        signed_at: note.signed_at,
        signed_by: note.signed_by,
        patient: note.patients ? {
          name: note.patients.name,
          mrn: note.patients.mrn,
        } : null,
      }));

      setNotes(transformedNotes);
    } catch (e) {
      console.error('Error loading notes:', e);
    }
    setIsLoading(false);
  };

  // Update note status
  const updateNoteStatus = async (noteId: string, newStatus: NoteStatus) => {
    try {
      const updateData: any = { status: newStatus };

      // If signing, add signature info
      if (newStatus === 'signed') {
        updateData.signed_at = new Date().toISOString();
        updateData.signed_by = user?.id;
      }

      const { error } = await supabase
        .from('clinical_notes')
        .update(updateData)
        .eq('id', noteId);

      if (error) throw error;

      // Update local state
      setNotes(prev => prev.map(note =>
        note.id === noteId
          ? { ...note, status: newStatus, signed_at: updateData.signed_at || note.signed_at }
          : note
      ));

      onToast(`Note ${newStatus === 'signed' ? 'signed' : 'status updated'} successfully`);
    } catch (e) {
      console.error('Error updating note status:', e);
      onToast('Failed to update note status');
    }
  };

  const getExportData = (note: ClinicalNote): NoteExport => ({
    patientName: note.patient?.name,
    mrn: note.patient?.mrn || undefined,
    noteType: noteTypeLabels[note.note_type] || note.note_type,
    dateGenerated: new Date(note.created_at).toLocaleString(),
    transcript: note.transcript || '',
    generatedNote: note.generated_note || '',
  });

  const handleCopy = async (note: ClinicalNote) => {
    await copyNoteToClipboard(getExportData(note));
    setCopiedNoteId(note.id);
    setTimeout(() => setCopiedNoteId(null), 2000);
    onToast('Copied to clipboard');
  };

  const handleExportTxt = (note: ClinicalNote) => {
    exportNoteToText(getExportData(note));
    onToast('Exported as TXT');
  };

  const handleExportJson = (note: ClinicalNote) => {
    exportNoteToJSON(getExportData(note));
    onToast('Exported as JSON');
  };

  const clearDateFilter = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = searchQuery === '' ||
      note.patient?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.generated_note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.transcript?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'all' || note.note_type === filterType;
    const matchesStatus = filterStatus === 'all' || note.status === filterStatus;

    const noteDate = new Date(note.created_at);
    const matchesDateFrom = !dateFrom || noteDate >= dateFrom;
    const matchesDateTo = !dateTo || noteDate <= new Date(dateTo.getTime() + 86400000);

    return matchesSearch && matchesType && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pt-4">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            Notes History
            {isSyncing && (
              <span className="flex items-center gap-1 text-xs font-normal text-blue-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing...
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {filteredNotes.length} clinical notes
            <span className="flex items-center gap-1 text-green-500">
              <Cloud className="w-3 h-3" />
              <span className="text-[10px]">Synced across devices</span>
            </span>
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Filters Row - Date, Type, Status */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 mb-4">
        {/* Date Range */}
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 rounded-lg text-xs min-w-[100px]",
                  dateFrom && "border-primary text-primary"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {dateFrom ? format(dateFrom, "MMM d") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                disabled={(date) => date > new Date() || (dateTo ? date > dateTo : false)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground text-xs">-</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 rounded-lg text-xs min-w-[100px]",
                  dateTo && "border-primary text-primary"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {dateTo ? format(dateTo, "MMM d") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                disabled={(date) => date > new Date() || (dateFrom ? date < dateFrom : false)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDateFilter}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Type Dropdown */}
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-[120px] rounded-lg text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="hp">H&P</SelectItem>
            <SelectItem value="consult">Consult</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Dropdown */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[140px] rounded-lg text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">
              <span className="flex items-center gap-1.5">
                <FileEdit className="w-3 h-3" />
                Draft
              </span>
            </SelectItem>
            <SelectItem value="pending_review">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3 h-3" />
                Pending Review
              </span>
            </SelectItem>
            <SelectItem value="signed">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Signed
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notes List - Scrollable */}
      <div className="flex-1 overflow-y-auto pb-20 md:pb-4 space-y-3">
        {filteredNotes.map((note, index) => (
          <motion.div
            key={note.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="glass-card overflow-hidden"
          >
            {/* Note Header */}
            <button
              onClick={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  note.note_type === 'hp' ? 'bg-primary/10' :
                  note.note_type === 'consult' ? 'bg-secondary/10' :
                  'bg-warning/10'
                )}>
                  <FileText className={cn(
                    'w-5 h-5',
                    note.note_type === 'hp' ? 'text-primary' :
                    note.note_type === 'consult' ? 'text-secondary' :
                    'text-warning'
                  )} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">
                      {noteTypeLabels[note.note_type]}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      {note.note_type.toUpperCase()}
                    </span>
                    {/* Status Badge */}
                    {(() => {
                      const status = note.status || 'draft';
                      const config = STATUS_CONFIG[status];
                      const StatusIcon = config.icon;
                      return (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1",
                          config.bg,
                          config.color
                        )}>
                          <StatusIcon className="w-2.5 h-2.5" />
                          {config.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {note.patient && (
                      <>
                        <User className="w-3 h-3" />
                        <span className="truncate">{note.patient.name}</span>
                        <span>·</span>
                      </>
                    )}
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(note.created_at)}</span>
                    {note.status === 'signed' && note.signed_at && (
                      <>
                        <span>·</span>
                        <Pen className="w-3 h-3 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">
                          Signed {formatDate(note.signed_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {expandedNoteId === note.id ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {/* Expanded Content */}
            {expandedNoteId === note.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border"
              >
                {/* Note Preview - SOAP Format */}
                <div className="p-4 bg-muted/30 max-h-[400px] overflow-y-auto">
                  {note.generated_note ? (
                    <SOAPNoteDisplay noteText={note.generated_note} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No generated note content</p>
                  )}
                </div>

                {/* Status Actions */}
                <div className="p-3 border-t border-border flex items-center gap-2 bg-surface/30">
                  <span className="text-xs text-muted-foreground mr-2">Status:</span>
                  {note.status === 'draft' && (
                    <Button
                      onClick={() => updateNoteStatus(note.id, 'pending_review')}
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-8 px-3 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Mark for Review
                    </Button>
                  )}
                  {note.status === 'pending_review' && (
                    <>
                      <Button
                        onClick={() => updateNoteStatus(note.id, 'draft')}
                        variant="outline"
                        size="sm"
                        className="rounded-lg h-8 px-3"
                      >
                        <FileEdit className="w-3.5 h-3.5 mr-1.5" />
                        Back to Draft
                      </Button>
                      <Button
                        onClick={() => updateNoteStatus(note.id, 'signed')}
                        size="sm"
                        className="rounded-lg h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Pen className="w-3.5 h-3.5 mr-1.5" />
                        Sign Note
                      </Button>
                    </>
                  )}
                  {note.status === 'signed' && (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Note is signed and finalized
                    </span>
                  )}
                </div>

                {/* Export Actions */}
                <div className="p-3 flex items-center gap-2 bg-surface/50">
                  <span className="text-xs text-muted-foreground mr-auto">Export:</span>
                  <Button
                    onClick={() => handleCopy(note)}
                    variant="outline"
                    size="sm"
                    className="rounded-lg h-8 px-3"
                  >
                    {copiedNoteId === note.id ? (
                      <Check className="w-3.5 h-3.5 mr-1.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Copy
                  </Button>
                  <Button
                    onClick={() => handleExportTxt(note)}
                    variant="outline"
                    size="sm"
                    className="rounded-lg h-8 px-3"
                  >
                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                    TXT
                  </Button>
                  <Button
                    onClick={() => handleExportJson(note)}
                    variant="outline"
                    size="sm"
                    className="rounded-lg h-8 px-3"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    JSON
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}

        {filteredNotes.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No notes match your search' : 'No clinical notes yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
