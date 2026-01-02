/**
 * Unified Billing Hook
 * 
 * Consolidates useBillingRecords and useBills into a single,
 * efficient hook with database-level filtering and pagination.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type BillStatus = 'pending' | 'submitted';
export type BillSource = 'note' | 'manual';
export type ViewMode = 'my-bills' | 'specialty-bills' | 'all-bills';

export interface UnifiedBill {
  id: string;
  source: BillSource;
  user_id: string;
  created_at: string;
  status: BillStatus;
  submitted_at: string | null;
  facility: string | null;
  rvu: number;
  // Patient info
  patient_name: string;
  patient_mrn: string | null;
  patient_dob: string | null;
  // Billing codes
  cpt_codes: string[];
  cpt_description: string | null;
  icd10_codes: string[];
  modifiers: string[] | null;
  diagnosis: string | null;
  // E/M details (for note-based)
  em_level: string | null;
  mdm_complexity: string | null;
  // Risk assessment
  denial_risk_score: number | null;
  denial_risk_factors: unknown | null;
  // Note link
  note_id: string | null;
  note_type: string | null;
  note_date: string | null;
  // Provider info (for specialty/all views)
  provider_name?: string;
  provider_specialty?: string;
}

export interface BillingFilters {
  startDate?: Date;
  endDate?: Date;
  status?: 'all' | 'pending' | 'submitted';
  facility?: string;
  source?: 'all' | 'note' | 'manual';
}

export interface BillInput {
  patient_name: string;
  patient_mrn?: string;
  patient_dob?: string;
  date_of_service: string;
  facility?: string;
  cpt_code: string;
  cpt_description?: string;
  modifiers?: string[];
  diagnosis?: string;
  rvu: number;
}

const PAGE_SIZE = 50;

export function useBilling(initialFilters?: BillingFilters) {
  const { user, isAdmin } = useAuth();
  const [bills, setBills] = useState<UnifiedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('my-bills');
  const [filters, setFilters] = useState<BillingFilters>(initialFilters || {});
  const [facilities, setFacilities] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Fetch billing records (note-based)
  const fetchBillingRecords = useCallback(async (): Promise<UnifiedBill[]> => {
    if (!user) return [];

    let query = supabase
      .from('billing_records')
      .select(`
        *,
        clinical_notes!inner (
          id,
          note_type,
          created_at,
          patient_id,
          patients (
            name,
            mrn,
            dob,
            facility_id,
            facilities (name)
          )
        )
      `)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Apply database-level filters
    if (viewMode === 'my-bills') {
      query = query.eq('user_id', user.id);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.facility) {
      query = query.eq('facility', filters.facility);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    const { data, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    return (data || []).map((r: any) => ({
      id: r.id,
      source: 'note' as BillSource,
      user_id: r.user_id,
      created_at: r.created_at,
      status: (r.status || 'pending') as BillStatus,
      submitted_at: r.submitted_at,
      facility: r.facility || r.clinical_notes?.patients?.facilities?.name || null,
      rvu: r.rvu || 0,
      patient_name: r.clinical_notes?.patients?.name || 'Unknown',
      patient_mrn: r.clinical_notes?.patients?.mrn || null,
      patient_dob: r.clinical_notes?.patients?.dob || null,
      cpt_codes: r.cpt_codes || [],
      cpt_description: null,
      icd10_codes: r.icd10_codes || [],
      modifiers: null,
      diagnosis: null,
      em_level: r.em_level,
      mdm_complexity: r.mdm_complexity,
      denial_risk_score: r.denial_risk_score,
      denial_risk_factors: r.denial_risk_factors,
      note_id: r.note_id,
      note_type: r.clinical_notes?.note_type,
      note_date: r.clinical_notes?.created_at,
    }));
  }, [user, viewMode, filters, page]);

  // Fetch manual bills
  const fetchManualBills = useCallback(async (): Promise<UnifiedBill[]> => {
    if (!user) return [];

    let query = supabase
      .from('bills')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Apply database-level filters
    if (viewMode === 'my-bills') {
      query = query.eq('user_id', user.id);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.facility) {
      query = query.eq('facility', filters.facility);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    const { data, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    // Enrich with provider info if needed
    let enrichedData = data || [];
    if (viewMode !== 'my-bills' && enrichedData.length > 0) {
      const userIds = [...new Set(enrichedData.map(b => b.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, specialty')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      enrichedData = enrichedData.map(b => ({
        ...b,
        provider_name: profileMap.get(b.user_id)?.full_name || 'Unknown',
        provider_specialty: profileMap.get(b.user_id)?.specialty || 'Unknown',
      }));
    }

    return enrichedData.map((b: any) => ({
      id: b.id,
      source: 'manual' as BillSource,
      user_id: b.user_id,
      created_at: b.created_at,
      status: (b.status || 'pending') as BillStatus,
      submitted_at: b.submitted_at,
      facility: b.facility,
      rvu: b.rvu || 0,
      patient_name: b.patient_name,
      patient_mrn: b.patient_mrn,
      patient_dob: b.patient_dob,
      cpt_codes: [b.cpt_code],
      cpt_description: b.cpt_description,
      icd10_codes: [],
      modifiers: b.modifiers,
      diagnosis: b.diagnosis,
      em_level: null,
      mdm_complexity: null,
      denial_risk_score: null,
      denial_risk_factors: null,
      note_id: null,
      note_type: null,
      note_date: null,
      provider_name: b.provider_name,
      provider_specialty: b.provider_specialty,
    }));
  }, [user, viewMode, filters, page]);

  // Main fetch function
  const fetchBills = useCallback(async (resetPage = true) => {
    if (!user) {
      setBills([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (resetPage) {
      setPage(0);
    }

    try {
      let results: UnifiedBill[] = [];

      // Fetch based on source filter
      if (!filters.source || filters.source === 'all') {
        const [records, manualBills] = await Promise.all([
          fetchBillingRecords(),
          fetchManualBills(),
        ]);
        results = [...records, ...manualBills];
      } else if (filters.source === 'note') {
        results = await fetchBillingRecords();
      } else {
        results = await fetchManualBills();
      }

      // Sort by created_at
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Check if there's more data
      setHasMore(results.length >= PAGE_SIZE);

      // Update or append based on page
      if (resetPage) {
        setBills(results);
      } else {
        setBills(prev => [...prev, ...results]);
      }

      // Extract unique facilities
      const uniqueFacilities = [...new Set(results.map(b => b.facility).filter(Boolean))] as string[];
      setFacilities(prev => [...new Set([...prev, ...uniqueFacilities])]);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, filters, fetchBillingRecords, fetchManualBills]);

  // Add manual bill
  const addBill = useCallback(async (input: BillInput) => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const { error } = await supabase.from('bills').insert({
        user_id: user.id,
        patient_name: input.patient_name,
        patient_mrn: input.patient_mrn || null,
        patient_dob: input.patient_dob || null,
        date_of_service: input.date_of_service,
        facility: input.facility || null,
        cpt_code: input.cpt_code,
        cpt_description: input.cpt_description || null,
        modifiers: input.modifiers || null,
        diagnosis: input.diagnosis || null,
        rvu: input.rvu,
        status: 'pending',
      });

      if (error) throw error;
      await fetchBills();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [user, fetchBills]);

  // Update bill status
  const updateBillStatus = useCallback(async (id: string, source: BillSource, status: BillStatus) => {
    try {
      const table = source === 'note' ? 'billing_records' : 'bills';
      const updates = {
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from(table).update(updates).eq('id', id);
      if (error) throw error;

      setBills(prev => prev.map(b => 
        b.id === id ? { ...b, ...updates } : b
      ));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  // Delete bill
  const deleteBill = useCallback(async (id: string, source: BillSource) => {
    try {
      const table = source === 'note' ? 'billing_records' : 'bills';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;

      setBills(prev => prev.filter(b => b.id !== id));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  // Update billing record (for note-based bills)
  const updateBillingRecord = useCallback(async (
    id: string,
    updates: Partial<Pick<UnifiedBill, 'icd10_codes' | 'cpt_codes' | 'em_level' | 'mdm_complexity' | 'rvu' | 'facility'>>
  ) => {
    try {
      const { error } = await supabase
        .from('billing_records')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setBills(prev => prev.map(b => 
        b.id === id ? { ...b, ...updates } : b
      ));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  // Mark as submitted helper
  const markAsSubmitted = useCallback(async (id: string, source: BillSource) => {
    return updateBillStatus(id, source, 'submitted');
  }, [updateBillStatus]);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loading, hasMore]);

  // Computed metrics
  const metrics = useMemo(() => {
    const totalRvu = bills.reduce((sum, b) => sum + b.rvu, 0);
    const submittedCount = bills.filter(b => b.status === 'submitted').length;
    const pendingCount = bills.filter(b => b.status === 'pending').length;
    
    return {
      totalBills: bills.length,
      totalRvu,
      estimatedRevenue: totalRvu * 40,
      submittedCount,
      pendingCount,
      submissionRate: bills.length > 0 ? (submittedCount / bills.length) * 100 : 0,
    };
  }, [bills]);

  // Initial load and filter changes
  useEffect(() => {
    fetchBills();
  }, [viewMode, filters]);

  // Load more when page changes (but not on initial)
  useEffect(() => {
    if (page > 0) {
      fetchBills(false);
    }
  }, [page]);

  return {
    bills,
    loading,
    error,
    viewMode,
    setViewMode,
    filters,
    setFilters,
    facilities,
    metrics,
    hasMore,
    isAdmin,
    // Actions
    addBill,
    updateBillStatus,
    deleteBill,
    updateBillingRecord,
    markAsSubmitted,
    loadMore,
    refetch: () => fetchBills(true),
  };
}

export default useBilling;
