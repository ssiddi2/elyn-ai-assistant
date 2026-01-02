import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format } from 'date-fns';

export type DatePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
  preset: DatePreset;
}

export interface BillSummary {
  total_bills: number;
  total_rvu: number;
  pending_rvu: number;
  submitted_rvu: number;
  total_value: number;
}

export interface SpecialtyMetrics {
  specialty: string;
  provider_count: number;
  bill_count: number;
  total_rvu: number;
  pending_rvu: number;
  submitted_rvu: number;
}

export interface FacilityMetrics {
  facility: string;
  bill_count: number;
  total_rvu: number;
  pending_rvu: number;
  provider_count: number;
  specialties: string[];
}

export interface ProviderMetrics {
  user_id: string;
  full_name: string;
  specialty: string;
  bill_count: number;
  total_rvu: number;
  pending_rvu: number;
}

export interface DashboardData {
  summary: BillSummary;
  bySpecialty: SpecialtyMetrics[];
  byFacility: FacilityMetrics[];
  topProviders: ProviderMetrics[];
  recentActivity: {
    date: string;
    bills: number;
    rvu: number;
  }[];
}

export function getDateRangeFromPreset(preset: DatePreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'this-week':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last-week':
      const lastWeek = subWeeks(now, 1);
      return { from: startOfWeek(lastWeek, { weekStartsOn: 1 }), to: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
    case 'this-month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last-month':
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    case 'custom':
      return { from: customFrom || startOfMonth(now), to: customTo || now };
    default:
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  }
}

export function useAdminDashboard() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  
  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const { from, to } = getDateRangeFromPreset('this-month');
    return { from, to, preset: 'this-month' };
  });

  const fetchDashboardData = useCallback(async () => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Format date range for query
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');
      
      // Fetch bills within date range (admin RLS policy allows this)
      const { data: bills, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .gte('date_of_service', fromDate)
        .lte('date_of_service', toDate)
        .order('created_at', { ascending: false });

      if (billsError) throw billsError;

      // Fetch all profiles for enrichment
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, specialty');

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Calculate summary
      const summary: BillSummary = {
        total_bills: bills?.length || 0,
        total_rvu: bills?.reduce((sum, b) => sum + (b.rvu || 0), 0) || 0,
        pending_rvu: bills?.filter(b => b.status === 'pending').reduce((sum, b) => sum + (b.rvu || 0), 0) || 0,
        submitted_rvu: bills?.filter(b => b.status === 'submitted').reduce((sum, b) => sum + (b.rvu || 0), 0) || 0,
        total_value: 0,
      };
      summary.total_value = summary.total_rvu * 40;

      // Group by specialty
      const specialtyMap = new Map<string, SpecialtyMetrics>();
      const providersBySpecialty = new Map<string, Set<string>>();

      bills?.forEach(bill => {
        const profile = profileMap.get(bill.user_id);
        const specialty = profile?.specialty || 'Unassigned';
        
        if (!specialtyMap.has(specialty)) {
          specialtyMap.set(specialty, {
            specialty,
            provider_count: 0,
            bill_count: 0,
            total_rvu: 0,
            pending_rvu: 0,
            submitted_rvu: 0,
          });
          providersBySpecialty.set(specialty, new Set());
        }

        const metrics = specialtyMap.get(specialty)!;
        metrics.bill_count++;
        metrics.total_rvu += bill.rvu || 0;
        if (bill.status === 'pending') metrics.pending_rvu += bill.rvu || 0;
        if (bill.status === 'submitted') metrics.submitted_rvu += bill.rvu || 0;
        providersBySpecialty.get(specialty)!.add(bill.user_id);
      });

      // Update provider counts
      specialtyMap.forEach((metrics, specialty) => {
        metrics.provider_count = providersBySpecialty.get(specialty)?.size || 0;
      });

      // Group by facility
      const facilityMap = new Map<string, FacilityMetrics>();
      const providersByFacility = new Map<string, Set<string>>();
      const specialtiesByFacility = new Map<string, Set<string>>();

      bills?.forEach(bill => {
        const facility = bill.facility || 'Unknown Facility';
        const profile = profileMap.get(bill.user_id);
        const specialty = profile?.specialty || 'Unassigned';

        if (!facilityMap.has(facility)) {
          facilityMap.set(facility, {
            facility,
            bill_count: 0,
            total_rvu: 0,
            pending_rvu: 0,
            provider_count: 0,
            specialties: [],
          });
          providersByFacility.set(facility, new Set());
          specialtiesByFacility.set(facility, new Set());
        }

        const metrics = facilityMap.get(facility)!;
        metrics.bill_count++;
        metrics.total_rvu += bill.rvu || 0;
        if (bill.status === 'pending') metrics.pending_rvu += bill.rvu || 0;
        providersByFacility.get(facility)!.add(bill.user_id);
        specialtiesByFacility.get(facility)!.add(specialty);
      });

      // Update provider and specialty counts
      facilityMap.forEach((metrics, facility) => {
        metrics.provider_count = providersByFacility.get(facility)?.size || 0;
        metrics.specialties = Array.from(specialtiesByFacility.get(facility) || []);
      });

      // Calculate top providers
      const providerMap = new Map<string, ProviderMetrics>();
      bills?.forEach(bill => {
        const profile = profileMap.get(bill.user_id);
        
        if (!providerMap.has(bill.user_id)) {
          providerMap.set(bill.user_id, {
            user_id: bill.user_id,
            full_name: profile?.full_name || 'Unknown Provider',
            specialty: profile?.specialty || 'Unassigned',
            bill_count: 0,
            total_rvu: 0,
            pending_rvu: 0,
          });
        }

        const metrics = providerMap.get(bill.user_id)!;
        metrics.bill_count++;
        metrics.total_rvu += bill.rvu || 0;
        if (bill.status === 'pending') metrics.pending_rvu += bill.rvu || 0;
      });

      // Sort providers by RVU
      const topProviders = Array.from(providerMap.values())
        .sort((a, b) => b.total_rvu - a.total_rvu)
        .slice(0, 10);

      // Calculate recent activity (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
      });

      const activityMap = new Map<string, { bills: number; rvu: number }>();
      last7Days.forEach(date => activityMap.set(date, { bills: 0, rvu: 0 }));

      bills?.forEach(bill => {
        const billDate = bill.created_at?.split('T')[0];
        if (billDate && activityMap.has(billDate)) {
          const activity = activityMap.get(billDate)!;
          activity.bills++;
          activity.rvu += bill.rvu || 0;
        }
      });

      const recentActivity = last7Days.map(date => ({
        date,
        ...activityMap.get(date)!,
      }));

      setData({
        summary,
        bySpecialty: Array.from(specialtyMap.values()).sort((a, b) => b.total_rvu - a.total_rvu),
        byFacility: Array.from(facilityMap.values()).sort((a, b) => b.total_rvu - a.total_rvu),
        topProviders,
        recentActivity,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, dateRange]);
  
  // Helper to update date range with preset
  const setDatePreset = useCallback((preset: DatePreset) => {
    const { from, to } = getDateRangeFromPreset(preset);
    setDateRange({ from, to, preset });
  }, []);
  
  // Helper to update custom date range
  const setCustomDateRange = useCallback((from: Date, to: Date) => {
    setDateRange({ from, to, preset: 'custom' });
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Export bills data to CSV
  const exportToCSV = useCallback(async () => {
    if (!user || !isAdmin) return;
    
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');
      
      // Fetch bills for export
      const { data: bills, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .gte('date_of_service', fromDate)
        .lte('date_of_service', toDate)
        .order('date_of_service', { ascending: false });
      
      if (billsError) throw billsError;
      if (!bills || bills.length === 0) return;
      
      // Fetch profiles for provider names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, specialty');
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      // Build CSV content
      const headers = [
        'Date of Service',
        'Patient Name',
        'Patient MRN',
        'Patient DOB',
        'Diagnosis',
        'CPT Code',
        'CPT Description',
        'Modifiers',
        'RVU',
        'Status',
        'Facility',
        'Provider Name',
        'Provider Specialty',
        'Submitted At',
        'Created At'
      ];
      
      const rows = bills.map(bill => {
        const profile = profileMap.get(bill.user_id);
        return [
          bill.date_of_service,
          bill.patient_name,
          bill.patient_mrn || '',
          bill.patient_dob || '',
          bill.diagnosis || '',
          bill.cpt_code,
          bill.cpt_description || '',
          (bill.modifiers || []).join('; '),
          bill.rvu?.toString() || '0',
          bill.status || 'pending',
          bill.facility || '',
          profile?.full_name || 'Unknown',
          profile?.specialty || 'Unassigned',
          bill.submitted_at || '',
          bill.created_at || ''
        ];
      });
      
      // Escape CSV values
      const escapeCSV = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };
      
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `billing-export-${fromDate}-to-${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      return true;
    } catch (err) {
      console.error('Export failed:', err);
      return false;
    }
  }, [user, isAdmin, dateRange]);

  return {
    data,
    loading,
    error,
    isAdmin,
    selectedSpecialty,
    setSelectedSpecialty,
    selectedFacility,
    setSelectedFacility,
    dateRange,
    setDatePreset,
    setCustomDateRange,
    refetch: fetchDashboardData,
    exportToCSV,
  };
}
