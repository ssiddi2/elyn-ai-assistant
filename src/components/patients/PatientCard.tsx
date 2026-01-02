import { motion } from 'framer-motion';
import { Clock, MapPin, Stethoscope, ChevronRight, Building2, Circle, PlayCircle, CheckCircle, FileSignature, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PatientStatus = 'not_seen' | 'in_progress' | 'seen' | 'signed' | 'discharged';

export interface Patient {
  id: string;
  name: string;
  mrn?: string | null;
  dob?: string | null;
  room?: string | null;
  diagnosis?: string | null;
  allergies?: string[] | null;
  acuity?: 'critical' | 'high' | 'moderate' | 'low';
  specialty?: string;
  lastSeen?: string;
  status?: PatientStatus;
}

interface PatientCardProps {
  patient: Patient;
  isSelected?: boolean;
  onClick?: () => void;
  onRecordClick?: () => void;
  onStatusChange?: (patientId: string, newStatus: PatientStatus) => void;
  facilityName?: string;
}

const acuityConfig = {
  critical: { label: 'Critical', className: 'badge-critical' },
  high: { label: 'High', className: 'badge-high' },
  moderate: { label: 'Moderate', className: 'badge-moderate' },
  low: { label: 'Low', className: 'badge-low' },
};

const statusConfig: Record<PatientStatus, {
  label: string;
  icon: typeof Circle;
  className: string;
  next: PatientStatus;
}> = {
  not_seen: {
    label: 'Not Seen',
    icon: Circle,
    className: 'bg-muted text-muted-foreground',
    next: 'in_progress'
  },
  in_progress: {
    label: 'In Progress',
    icon: PlayCircle,
    className: 'bg-warning/20 text-warning',
    next: 'seen'
  },
  seen: {
    label: 'Seen',
    icon: CheckCircle,
    className: 'bg-success/20 text-success',
    next: 'signed'
  },
  signed: {
    label: 'Signed',
    icon: FileSignature,
    className: 'bg-primary/20 text-primary',
    next: 'not_seen'
  },
  discharged: {
    label: 'Discharged',
    icon: LogOut,
    className: 'bg-gray-500/20 text-gray-500',
    next: 'discharged' // Discharged doesn't cycle
  },
};

export default function PatientCard({ patient, isSelected, onClick, onRecordClick, onStatusChange, facilityName }: PatientCardProps) {
  const acuity = patient.acuity || 'moderate';
  const acuityInfo = acuityConfig[acuity];
  const status = patient.status || 'not_seen';
  const statusInfo = statusConfig[status];
  const StatusIcon = statusInfo.icon;
  
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't allow status cycling for discharged patients
    if (status === 'discharged') return;
    if (onStatusChange) {
      onStatusChange(patient.id, statusInfo.next);
    }
  };

  const isDischargedPatient = status === 'discharged';
  
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'patient-card p-4 cursor-pointer',
        isSelected && 'border-primary/40 bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Patient Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-foreground truncate text-base">
              {patient.name}
            </h3>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full', acuityInfo.className)}>
              {acuityInfo.label}
            </span>
            {/* Status Badge - Clickable */}
            <button
              onClick={handleStatusClick}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all hover:scale-105 active:scale-95',
                statusInfo.className
              )}
              title={`Click to change status to ${statusConfig[statusInfo.next].label}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusInfo.label}
            </button>
          </div>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
            {patient.room && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Room {patient.room}
              </span>
            )}
            {patient.mrn && (
              <span className="opacity-60">MRN: {patient.mrn}</span>
            )}
            {facilityName && (
              <span className="flex items-center gap-1 text-primary/70">
                <Building2 className="w-3 h-3" />
                {facilityName}
              </span>
            )}
          </div>
          
          {patient.diagnosis && (
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
              <Stethoscope className="w-3 h-3 flex-shrink-0" />
              {patient.diagnosis}
            </p>
          )}
          
          {patient.lastSeen && (
            <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last seen {patient.lastSeen}
            </p>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          {onRecordClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecordClick();
              }}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          )}
          <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
        </div>
      </div>
      
      {/* Allergies Warning */}
      {patient.allergies && patient.allergies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            Allergies: {patient.allergies.join(', ')}
          </p>
        </div>
      )}
    </motion.div>
  );
}
