// ELYN™ by Virtualis - AI-Powered maxRVU Billing Agent
// Refactored: Uses unified useBilling hook

import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Bot, Settings, Loader2, FileDown, BarChart3, FileText, ClipboardList, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import elynLogo from '@/assets/elyn-logo.png';
import virtualisLogo from '@/assets/virtualis-logo.png';
import { useBilling, UnifiedBill } from '@/hooks/useBilling';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { MaxRVUConfig, MaxRVUStorage } from '@/data/billingCodes';

// Extracted components
import BillingRecordEditModal from '@/components/billing/BillingRecordEditModal';
import BillingAnalyticsDashboard from '@/components/billing/BillingAnalyticsDashboard';
import ManualBillCard from '@/components/billing/ManualBillCard';
import NoteBillingRecordCard from '@/components/billing/NoteBillingRecordCard';
import CreateBillModal from '@/components/billing/CreateBillModal';
import MaxRVUSetup from '@/components/billing/MaxRVUSetup';
import AgentExecutionModal from '@/components/billing/AgentExecutionModal';
import BillsExportModal from '@/components/billing/BillsExportModal';
import RecordsExportModal from '@/components/billing/RecordsExportModal';
import ViewModeToggle from '@/components/billing/ViewModeToggle';

export default function ElynBillingAgent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Use unified billing hook
  const { 
    bills: allBills, 
    loading, 
    viewMode, 
    setViewMode, 
    filters,
    setFilters,
    facilities,
    isAdmin, 
    addBill, 
    deleteBill,
    updateBillingRecord,
    markAsSubmitted,
  } = useBilling();
  
  // Separate note-based and manual bills
  const manualBills = useMemo(() => allBills.filter(b => b.source === 'manual'), [allBills]);
  const billingRecords = useMemo(() => allBills.filter(b => b.source === 'note'), [allBills]);
  
  const [activeTab, setActiveTab] = useState<'manual' | 'notes' | 'analytics'>('notes');
  const [maxrvu, setMaxrvu] = useState<MaxRVUConfig | null>(null);
  const [showMaxRVU, setShowMaxRVU] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRecordsExport, setShowRecordsExport] = useState(false);
  const [agentBill, setAgentBill] = useState<UnifiedBill | null>(null);
  const [editingRecord, setEditingRecord] = useState<UnifiedBill | null>(null);

  useEffect(() => {
    setMaxrvu(MaxRVUStorage.get());
  }, []);

  const totalRVU = manualBills.reduce((s, b) => s + (b.rvu || 0), 0);
  const pendingRVU = manualBills.filter(b => b.status === 'pending').reduce((s, b) => s + (b.rvu || 0), 0);
  
  const recordsTotalRVU = billingRecords.reduce((s, r) => s + (r.rvu || 0), 0);
  const recordsPendingRVU = billingRecords.filter(r => r.status === 'pending').reduce((s, r) => s + (r.rvu || 0), 0);

  const handleRPA = async (bill: UnifiedBill) => {
    localStorage.setItem('elyn_maxrvu_submit', JSON.stringify({
      timestamp: Date.now(),
      type: 'rpa',
      credentials: maxrvu?.password ? { username: maxrvu.username, password: maxrvu.password } : null,
      bill: {
        patientName: bill.patient_name,
        patientMRN: bill.patient_mrn,
        patientDOB: bill.patient_dob,
        dos: bill.created_at,
        facility: bill.facility || maxrvu?.facility,
        cptCode: bill.cpt_codes[0],
        modifiers: bill.modifiers,
        diagnosis: bill.diagnosis
      },
    }));
    window.open(maxrvu?.url || 'https://www.maxrvu.com', '_blank');
    await markAsSubmitted(bill.id, bill.source);
  };

  const handleDelete = async (bill: UnifiedBill) => {
    if (confirm('Delete this bill?')) {
      const result = await deleteBill(bill.id, bill.source);
      if (result.success) {
        toast.success('Bill deleted');
      } else {
        toast.error(result.error || 'Failed to delete bill');
      }
    }
  };

  const handleDeleteRecord = async (record: UnifiedBill) => {
    if (confirm('Delete this billing record?')) {
      const result = await deleteBill(record.id, 'note');
      if (result.success) {
        toast.success('Billing record deleted');
      } else {
        toast.error(result.error || 'Failed to delete billing record');
      }
    }
  };

  const handleMarkRecordSubmitted = async (record: UnifiedBill) => {
    const result = await markAsSubmitted(record.id, 'note');
    if (result.success) {
      toast.success('Marked as submitted');
    } else {
      toast.error('Failed to update status');
    }
  };

  const handleSaveRecordEdit = async (updates: any) => {
    if (!editingRecord) return;
    const result = await updateBillingRecord(editingRecord.id, updates);
    if (result.success) {
      toast.success('Billing record updated');
    } else {
      toast.error('Failed to update billing record');
      throw new Error(result.error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10 glass-card p-8 max-w-md text-center">
          <img src={elynLogo} alt="ELYN" className="w-16 h-16 rounded-xl mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">ELYN™ Billing Agent</h1>
          <p className="text-muted-foreground mb-6">Please sign in to access the billing system</p>
          <Button onClick={() => navigate('/auth')} className="w-full">Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent" />
      <div className="fixed inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/emr-access')} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <img src={elynLogo} alt="ELYN" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold gradient-text">ELYN™</h1>
              <p className="text-[10px] text-muted-foreground tracking-widest">AI-POWERED BILLING</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/admin-dashboard')} className="flex items-center gap-1">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manual' | 'notes' | 'analytics')} className="mb-4">
          <TabsList className="w-full grid grid-cols-3 bg-muted/30">
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Note-Based</span>
              <span className="sm:hidden">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Manual Bills</span>
              <span className="sm:hidden">Manual</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
          </TabsList>

          {/* Note-Based Billing Tab */}
          <TabsContent value="notes" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: billingRecords.length, label: 'Total Records', color: 'text-secondary' },
                { value: recordsPendingRVU.toFixed(1), label: 'Pending RVU', color: 'text-primary' },
                { value: `$${(recordsTotalRVU * 40).toFixed(0)}`, label: 'Total Value', color: 'text-success' },
              ].map(stat => (
                <div key={stat.label} className="glass-surface rounded-xl p-3 text-center">
                  <div className={cn("text-xl font-bold", stat.color)}>{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            <Button onClick={() => setShowRecordsExport(true)} disabled={billingRecords.length === 0} variant="outline" className="flex items-center gap-2 w-full">
              <FileDown className="w-4 h-4" />Export Note-Based Billing
            </Button>

            <div className="glass-card-blue p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-secondary" />
                <span className="font-medium text-foreground">Auto-Generated from Notes</span>
              </div>
              <p className="text-xs text-muted-foreground">Billing codes are automatically extracted when you create clinical notes.</p>
            </div>

            {loading ? (
              <div className="glass-card p-10 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">Loading billing records...</p>
              </div>
            ) : billingRecords.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <div className="text-4xl mb-3">📋</div>
                <h3 className="font-medium text-foreground mb-1">No Billing Records</h3>
                <p className="text-xs text-muted-foreground mb-4">Create clinical notes to automatically generate billing codes</p>
                <Button onClick={() => navigate('/')} className="btn-minimal bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />Create Note
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {billingRecords.map(record => (
                  <NoteBillingRecordCard key={record.id} record={record} onEdit={setEditingRecord} onDelete={handleDeleteRecord} onMarkSubmitted={handleMarkRecordSubmitted} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Manual Bills Tab */}
          <TabsContent value="manual" className="mt-4 space-y-4">
            <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} isAdmin={isAdmin} />

            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{maxrvu ? '✅' : '⚠️'}</span>
                  <div>
                    <div className="font-medium text-foreground">maxRVU Connection</div>
                    <div className="text-xs text-muted-foreground">{maxrvu?.username || 'Not configured'}</div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowMaxRVU(true)}>
                  <Settings className="w-4 h-4 mr-1" />{maxrvu ? 'Edit' : 'Configure'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { value: manualBills.length, label: viewMode === 'my-bills' ? 'My Bills' : 'Total Bills', color: 'text-secondary' },
                { value: pendingRVU.toFixed(1), label: 'Pending RVU', color: 'text-primary' },
                { value: `$${(totalRVU * 40).toFixed(0)}`, label: 'Total Value', color: 'text-success' },
              ].map(stat => (
                <div key={stat.label} className="glass-surface rounded-xl p-3 text-center">
                  <div className={cn("text-xl font-bold", stat.color)}>{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={() => setShowCreate(true)} className="flex-1 btn-minimal bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />Create Bill
              </Button>
              <Button onClick={() => setShowExport(true)} disabled={manualBills.length === 0} variant="outline" className="flex items-center gap-2">
                <FileDown className="w-4 h-4" />Export CSV
              </Button>
            </div>

            <div className="glass-card-blue p-4">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-5 h-5 text-secondary" />
                <span className="font-medium text-foreground">AI Agent Included</span>
                <span className="badge-minimal text-success bg-success/20 border-success/30 text-xs">Free</span>
              </div>
              <p className="text-xs text-muted-foreground">Uses Lovable AI to analyze maxRVU pages and intelligently fill forms. No API key required.</p>
            </div>

            {loading ? (
              <div className="glass-card p-10 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">Loading bills...</p>
              </div>
            ) : manualBills.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <div className="text-4xl mb-3">💰</div>
                <h3 className="font-medium text-foreground mb-1">{viewMode === 'my-bills' ? 'No Bills Yet' : 'No Bills Found'}</h3>
                <p className="text-xs text-muted-foreground mb-4">{viewMode === 'my-bills' ? 'Create your first bill to capture RVUs' : 'No bills available in this view'}</p>
                {viewMode === 'my-bills' && (
                  <Button onClick={() => setShowCreate(true)} className="btn-minimal bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />Create Bill
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {manualBills.map(b => (
                  <ManualBillCard key={b.id} bill={b} onAgent={setAgentBill} onRPA={handleRPA} onDelete={handleDelete} showProvider={viewMode !== 'my-bills'} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-4">
            <BillingAnalyticsDashboard billingRecords={billingRecords} manualBills={manualBills} />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border flex justify-center">
          <img src={virtualisLogo} alt="Virtualis" className="h-6 opacity-60" />
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showMaxRVU && <MaxRVUSetup existing={maxrvu} onComplete={(c) => { setMaxrvu(c); setShowMaxRVU(false); }} onCancel={() => setShowMaxRVU(false)} />}
        {showCreate && <CreateBillModal onComplete={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} addBill={addBill} />}
        {agentBill && <AgentExecutionModal bill={agentBill} maxrvuConfig={maxrvu} onComplete={() => setAgentBill(null)} onCancel={() => setAgentBill(null)} markAsSubmitted={(id) => markAsSubmitted(id, 'manual')} />}
        {showExport && <BillsExportModal bills={manualBills} onClose={() => setShowExport(false)} />}
        {showRecordsExport && <RecordsExportModal records={billingRecords} facilities={facilities} onClose={() => setShowRecordsExport(false)} />}
        {editingRecord && (
          <BillingRecordEditModal isOpen={!!editingRecord} onClose={() => setEditingRecord(null)} record={editingRecord} onSave={handleSaveRecordEdit} />
        )}
      </AnimatePresence>
    </div>
  );
}
