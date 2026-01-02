import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PatientCard, { Patient, PatientStatus } from './PatientCard';
import { cn } from '@/lib/utils';

interface Facility {
  id: string;
  name: string;
  nickname?: string | null;
}

interface PatientWithFacility extends Patient {
  facility_id?: string | null;
}

interface PatientListProps {
  patients: PatientWithFacility[];
  onPatientSelect: (patient: Patient) => void;
  onRecordPatient?: (patient: Patient) => void;
  onStatusChange?: (patientId: string, newStatus: PatientStatus) => void;
  selectedPatientId?: string | null;
  facilities?: Facility[];
}

const acuityFilters = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
];

const statusFilters = [
  { id: 'all', label: 'All Status' },
  { id: 'not_seen', label: 'Not Seen' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'seen', label: 'Seen' },
  { id: 'signed', label: 'Signed' },
  { id: 'discharged', label: 'Discharged' },
];

export default function PatientList({ 
  patients, 
  onPatientSelect, 
  onRecordPatient,
  onStatusChange,
  selectedPatientId,
  facilities = []
}: PatientListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAcuityFilter, setActiveAcuityFilter] = useState('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  
  const filteredPatients = useMemo(() => {
    let result = patients;
    
    // Apply search (includes facility name via lookup)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => {
        const facilityName = p.facility_id 
          ? facilities.find(f => f.id === p.facility_id)?.name?.toLowerCase() || ''
          : '';
        return (
          p.name.toLowerCase().includes(query) ||
          p.room?.toLowerCase().includes(query) ||
          p.mrn?.toLowerCase().includes(query) ||
          p.diagnosis?.toLowerCase().includes(query) ||
          facilityName.includes(query)
        );
      });
    }
    
    // Apply acuity filter
    if (activeAcuityFilter !== 'all') {
      result = result.filter(p => p.acuity === activeAcuityFilter);
    }
    
    // Apply status filter
    if (activeStatusFilter !== 'all') {
      result = result.filter(p => (p.status || 'not_seen') === activeStatusFilter);
    }
    
    return result;
  }, [patients, searchQuery, activeAcuityFilter, activeStatusFilter, facilities]);
  
  // Calculate status counts
  const statusCounts = useMemo(() => {
    return {
      not_seen: patients.filter(p => (p.status || 'not_seen') === 'not_seen').length,
      in_progress: patients.filter(p => p.status === 'in_progress').length,
      seen: patients.filter(p => p.status === 'seen').length,
      signed: patients.filter(p => p.status === 'signed').length,
      discharged: patients.filter(p => p.status === 'discharged').length,
    };
  }, [patients]);
  
  return (
    <div className="flex flex-col h-full">
      {/* Search & Filters Row */}
      <div className="flex-shrink-0 px-4 pt-1 pb-3">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Status Dropdown */}
          <Select value={activeStatusFilter} onValueChange={setActiveStatusFilter}>
            <SelectTrigger className="h-9 w-[130px] rounded-lg text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusFilters.map((filter) => (
                <SelectItem key={filter.id} value={filter.id}>
                  <span className="flex items-center gap-2">
                    {filter.label}
                    {filter.id !== 'all' && (
                      <span className="text-[10px] text-muted-foreground">
                        ({statusCounts[filter.id as keyof typeof statusCounts]})
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Acuity Dropdown */}
          <Select value={activeAcuityFilter} onValueChange={setActiveAcuityFilter}>
            <SelectTrigger className="h-9 w-[100px] rounded-lg text-xs">
              <SelectValue placeholder="Acuity" />
            </SelectTrigger>
            <SelectContent>
              {acuityFilters.map((filter) => (
                <SelectItem key={filter.id} value={filter.id}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Patient Count */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <Users className="w-3.5 h-3.5" />
            <span>{filteredPatients.length}</span>
          </div>
        </div>
      </div>

      {/* Patient Cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredPatients.map((patient, index) => (
            <motion.div
              key={patient.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
            >
              <PatientCard
                patient={patient}
                isSelected={selectedPatientId === patient.id}
                onClick={() => onPatientSelect(patient)}
                onRecordClick={onRecordPatient ? () => onRecordPatient(patient) : undefined}
                onStatusChange={onStatusChange}
                facilityName={
                  patient.facility_id 
                    ? facilities.find(f => f.id === patient.facility_id)?.nickname || 
                      facilities.find(f => f.id === patient.facility_id)?.name 
                    : undefined
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredPatients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No patients found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
