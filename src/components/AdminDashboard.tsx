import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  DollarSign, 
  FileText, 
  TrendingUp, 
  Building2, 
  Users, 
  Stethoscope,
  ChevronRight,
  X,
  BarChart3,
  Activity,
  RefreshCw,
  Calendar,
  ChevronDown,
  Download,
  Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import elynLogo from '@/assets/elyn-logo.png';
import virtualisLogo from '@/assets/virtualis-logo.png';
import { useAdminDashboard, SpecialtyMetrics, FacilityMetrics, ProviderMetrics, DatePreset } from '@/hooks/useAdminDashboard';
import PrintableReport from './admin/PrintableReport';
import AuditLogViewer from './admin/AuditLogViewer';

// Date Range Presets
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'this-week', label: 'This Week' },
  { id: 'last-week', label: 'Last Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

// Metric Card Component
const MetricCard = ({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  color = 'text-primary',
  onClick
}: { 
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  onClick?: () => void;
}) => (
  <motion.div
    whileHover={onClick ? { y: -2, scale: 1.02 } : {}}
    onClick={onClick}
    className={cn(
      "glass-card p-4",
      onClick && "cursor-pointer"
    )}
  >
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg bg-muted/30", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-xl font-bold", color)}>{value}</div>
        {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
    </div>
  </motion.div>
);

// Specialty Row Component
const SpecialtyRow = ({ 
  metrics, 
  onClick,
  isSelected
}: { 
  metrics: SpecialtyMetrics;
  onClick: () => void;
  isSelected: boolean;
}) => (
  <motion.div
    whileHover={{ x: 4 }}
    onClick={onClick}
    className={cn(
      "p-4 rounded-xl border cursor-pointer transition-all",
      isSelected 
        ? "bg-primary/20 border-primary" 
        : "bg-muted/20 border-border hover:bg-muted/40"
    )}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-secondary/30 to-secondary/10 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <div className="font-medium text-foreground">{metrics.specialty}</div>
          <div className="text-xs text-muted-foreground">
            {metrics.provider_count} provider{metrics.provider_count !== 1 ? 's' : ''} • {metrics.bill_count} bill{metrics.bill_count !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-success">{metrics.total_rvu.toFixed(1)} RVU</div>
        <div className="text-xs text-muted-foreground">${(metrics.total_rvu * 40).toFixed(0)}</div>
      </div>
    </div>
    {metrics.pending_rvu > 0 && (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-success rounded-full" 
            style={{ width: `${(metrics.submitted_rvu / metrics.total_rvu) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {((metrics.submitted_rvu / metrics.total_rvu) * 100).toFixed(0)}% submitted
        </span>
      </div>
    )}
  </motion.div>
);

// Facility Row Component
const FacilityRow = ({ 
  metrics, 
  onClick,
  isSelected
}: { 
  metrics: FacilityMetrics;
  onClick: () => void;
  isSelected: boolean;
}) => (
  <motion.div
    whileHover={{ x: 4 }}
    onClick={onClick}
    className={cn(
      "p-4 rounded-xl border cursor-pointer transition-all",
      isSelected 
        ? "bg-secondary/20 border-secondary" 
        : "bg-muted/20 border-border hover:bg-muted/40"
    )}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="font-medium text-foreground">{metrics.facility}</div>
          <div className="text-xs text-muted-foreground">
            {metrics.provider_count} provider{metrics.provider_count !== 1 ? 's' : ''} • {metrics.specialties.length} specialt{metrics.specialties.length !== 1 ? 'ies' : 'y'}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-success">{metrics.total_rvu.toFixed(1)} RVU</div>
        <div className="text-xs text-muted-foreground">{metrics.bill_count} bills</div>
      </div>
    </div>
  </motion.div>
);

// Provider Leaderboard Row
const ProviderRow = ({ metrics, rank }: { metrics: ProviderMetrics; rank: number }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
    <div className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
      rank === 1 ? "bg-yellow-500/20 text-yellow-500" :
      rank === 2 ? "bg-gray-400/20 text-gray-400" :
      rank === 3 ? "bg-orange-600/20 text-orange-600" :
      "bg-muted/50 text-muted-foreground"
    )}>
      {rank}
    </div>
    <div className="flex-1">
      <div className="font-medium text-foreground text-sm">{metrics.full_name}</div>
      <div className="text-xs text-muted-foreground">{metrics.specialty}</div>
    </div>
    <div className="text-right">
      <div className="font-bold text-success">{metrics.total_rvu.toFixed(1)}</div>
      <div className="text-xs text-muted-foreground">{metrics.bill_count} bills</div>
    </div>
  </div>
);

// Activity Chart (simple bar visualization)
const ActivityChart = ({ data }: { data: { date: string; bills: number; rvu: number }[] }) => {
  const maxRvu = Math.max(...data.map(d => d.rvu), 1);
  
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-primary" />
        <span className="font-medium text-foreground">7-Day Activity</span>
      </div>
      <div className="flex items-end gap-2 h-24">
        {data.map((day, i) => (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
            <div 
              className="w-full bg-gradient-to-t from-primary to-primary/50 rounded-t transition-all"
              style={{ height: `${(day.rvu / maxRvu) * 80}px`, minHeight: day.rvu > 0 ? '8px' : '2px' }}
            />
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(day.date), 'EEE')}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
        <span>Total: {data.reduce((sum, d) => sum + d.bills, 0)} bills</span>
        <span className="text-success">{data.reduce((sum, d) => sum + d.rvu, 0).toFixed(1)} RVU</span>
      </div>
    </div>
  );
};

// Drill-down Modal
const DrillDownModal = ({ 
  title,
  subtitle,
  onClose,
  children
}: { 
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      onClick={e => e.stopPropagation()}
      className="w-full max-w-2xl max-h-[85vh] overflow-auto glass-card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
      {children}
    </motion.div>
  </motion.div>
);

// Main Admin Dashboard Component
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { 
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
    refetch,
    exportToCSV
  } = useAdminDashboard();
  
  const [exporting, setExporting] = useState(false);
  
  const [showSpecialtyDrill, setShowSpecialtyDrill] = useState(false);
  const [showFacilityDrill, setShowFacilityDrill] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [tempDateFrom, setTempDateFrom] = useState<Date | undefined>(dateRange.from);
  const [tempDateTo, setTempDateTo] = useState<Date | undefined>(dateRange.to);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Not admin - show access denied
  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10 glass-card p-8 max-w-md text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Admin Access Required</h1>
          <p className="text-muted-foreground mb-6">
            This dashboard is only available to administrators.
          </p>
          <Button onClick={() => navigate('/billing-agent')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Billing
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center animate-pulse">
            <BarChart3 className="w-8 h-8 text-slate-900" />
          </div>
          <p className="text-cyan-400 text-sm tracking-widest">LOADING DASHBOARD...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10 glass-card p-8 max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-foreground mb-2">Error Loading Dashboard</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={refetch}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const selectedSpecialtyData = data.bySpecialty.find(s => s.specialty === selectedSpecialty);
  const selectedFacilityData = data.byFacility.find(f => f.facility === selectedFacility);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent" />
      <div className="fixed inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/billing-agent')}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <img src={elynLogo} alt="ELYN" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold gradient-text">Admin Dashboard</h1>
              <p className="text-[10px] text-muted-foreground tracking-widest">GLOBAL REVENUE METRICS</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrint}
              disabled={!data?.summary.total_bills}
              className="print:hidden"
            >
              <Printer className="w-4 h-4" />
              <span className="ml-1.5 hidden sm:inline">Print Report</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                setExporting(true);
                await exportToCSV();
                setExporting(false);
              }}
              disabled={exporting || !data?.summary.total_bills}
              className="print:hidden"
            >
              <Download className={cn("w-4 h-4", exporting && "animate-pulse")} />
              <span className="ml-1.5 hidden sm:inline">Export CSV</span>
            </Button>
            <Button variant="outline" size="sm" onClick={refetch} className="print:hidden">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Date Range</span>
            </div>
            
            {/* Preset Buttons */}
            <div className="flex flex-wrap gap-2 flex-1">
              {DATE_PRESETS.filter(p => p.id !== 'custom').map(preset => (
                <Button
                  key={preset.id}
                  variant={dateRange.preset === preset.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDatePreset(preset.id)}
                  className={cn(
                    "text-xs",
                    dateRange.preset === preset.id && "bg-primary text-primary-foreground"
                  )}
                >
                  {preset.label}
                </Button>
              ))}
              
              {/* Custom Date Picker */}
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant={dateRange.preset === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      "text-xs",
                      dateRange.preset === 'custom' && "bg-primary text-primary-foreground"
                    )}
                  >
                    Custom
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4 bg-popover border-border" align="end">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">From</label>
                        <CalendarComponent
                          mode="single"
                          selected={tempDateFrom}
                          onSelect={setTempDateFrom}
                          className="rounded-md border border-border pointer-events-auto"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">To</label>
                        <CalendarComponent
                          mode="single"
                          selected={tempDateTo}
                          onSelect={setTempDateTo}
                          className="rounded-md border border-border pointer-events-auto"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDatePicker(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (tempDateFrom && tempDateTo) {
                            setCustomDateRange(tempDateFrom, tempDateTo);
                            setShowDatePicker(false);
                          }
                        }}
                        disabled={!tempDateFrom || !tempDateTo}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Current Range Display */}
            <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg whitespace-nowrap">
              {format(dateRange.from, 'MMM d')} – {format(dateRange.to, 'MMM d, yyyy')}
            </div>
          </div>
        </div>

        {/* Global Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={FileText}
            label="Total Encounters"
            value={data.summary.total_bills}
            color="text-secondary"
          />
          <MetricCard
            icon={TrendingUp}
            label="Total RVU"
            value={data.summary.total_rvu.toFixed(1)}
            subValue={`${data.summary.pending_rvu.toFixed(1)} pending`}
            color="text-primary"
          />
          <MetricCard
            icon={DollarSign}
            label="Total Revenue"
            value={`$${(data.summary.total_value / 1000).toFixed(1)}k`}
            color="text-success"
          />
          <MetricCard
            icon={Users}
            label="Active Providers"
            value={data.topProviders.length}
            color="text-purple-400"
          />
        </div>

        {/* Activity Chart */}
        <div className="mb-6">
          <ActivityChart data={data.recentActivity} />
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* By Specialty */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-secondary" />
                <span className="font-medium text-foreground">By Specialty</span>
              </div>
              <button
                onClick={() => setShowSpecialtyDrill(true)}
                className="text-xs text-primary hover:underline"
              >
                View All
              </button>
            </div>
            <div className="space-y-2">
              {data.bySpecialty.slice(0, 4).map(specialty => (
                <SpecialtyRow
                  key={specialty.specialty}
                  metrics={specialty}
                  onClick={() => {
                    setSelectedSpecialty(specialty.specialty);
                    setShowSpecialtyDrill(true);
                  }}
                  isSelected={selectedSpecialty === specialty.specialty}
                />
              ))}
            </div>
          </div>

          {/* By Facility */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">By Facility</span>
              </div>
              <button
                onClick={() => setShowFacilityDrill(true)}
                className="text-xs text-primary hover:underline"
              >
                View All
              </button>
            </div>
            <div className="space-y-2">
              {data.byFacility.slice(0, 4).map(facility => (
                <FacilityRow
                  key={facility.facility}
                  metrics={facility}
                  onClick={() => {
                    setSelectedFacility(facility.facility);
                    setShowFacilityDrill(true);
                  }}
                  isSelected={selectedFacility === facility.facility}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Top Providers Leaderboard */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-400" />
            <span className="font-medium text-foreground">Top Providers by RVU</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {data.topProviders.slice(0, 6).map((provider, idx) => (
              <ProviderRow key={provider.user_id} metrics={provider} rank={idx + 1} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border flex justify-center">
          <img src={virtualisLogo} alt="Virtualis" className="h-6 opacity-60" />
        </div>
      </div>

      {/* Drill-down Modals */}
      <AnimatePresence>
        {showSpecialtyDrill && (
          <DrillDownModal
            title="Specialty Breakdown"
            subtitle={`${data.bySpecialty.length} specialties • ${data.summary.total_rvu.toFixed(1)} total RVU`}
            onClose={() => {
              setShowSpecialtyDrill(false);
              setSelectedSpecialty(null);
            }}
          >
            <div className="space-y-2">
              {data.bySpecialty.map(specialty => (
                <SpecialtyRow
                  key={specialty.specialty}
                  metrics={specialty}
                  onClick={() => setSelectedSpecialty(
                    selectedSpecialty === specialty.specialty ? null : specialty.specialty
                  )}
                  isSelected={selectedSpecialty === specialty.specialty}
                />
              ))}
            </div>
            
            {selectedSpecialtyData && (
              <div className="mt-6 pt-4 border-t border-border">
                <h3 className="font-medium text-foreground mb-3">
                  {selectedSpecialtyData.specialty} Providers
                </h3>
                <div className="space-y-2">
                  {data.topProviders
                    .filter(p => p.specialty === selectedSpecialtyData.specialty)
                    .map((provider, idx) => (
                      <ProviderRow key={provider.user_id} metrics={provider} rank={idx + 1} />
                    ))}
                </div>
              </div>
            )}
          </DrillDownModal>
        )}

        {showFacilityDrill && (
          <DrillDownModal
            title="Facility Breakdown"
            subtitle={`${data.byFacility.length} facilities • ${data.summary.total_rvu.toFixed(1)} total RVU`}
            onClose={() => {
              setShowFacilityDrill(false);
              setSelectedFacility(null);
            }}
          >
            <div className="space-y-2">
              {data.byFacility.map(facility => (
                <FacilityRow
                  key={facility.facility}
                  metrics={facility}
                  onClick={() => setSelectedFacility(
                    selectedFacility === facility.facility ? null : facility.facility
                  )}
                  isSelected={selectedFacility === facility.facility}
                />
              ))}
            </div>
            
            {selectedFacilityData && (
              <div className="mt-6 pt-4 border-t border-border">
                <h3 className="font-medium text-foreground mb-2">
                  {selectedFacilityData.facility}
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedFacilityData.specialties.map(specialty => (
                    <span 
                      key={specialty}
                      className="px-2 py-1 rounded-md bg-secondary/20 text-secondary text-xs"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-muted/20">
                    <div className="text-lg font-bold text-foreground">{selectedFacilityData.bill_count}</div>
                    <div className="text-xs text-muted-foreground">Bills</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20">
                    <div className="text-lg font-bold text-success">{selectedFacilityData.total_rvu.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">RVU</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20">
                    <div className="text-lg font-bold text-primary">{selectedFacilityData.provider_count}</div>
                    <div className="text-xs text-muted-foreground">Providers</div>
                  </div>
                </div>
              </div>
            )}
          </DrillDownModal>
        )}
      </AnimatePresence>

      {/* Audit Logs Section */}
      <div className="glass-card p-4 mt-6 print:hidden">
        <AuditLogViewer />
      </div>

      {/* Printable Report - Hidden on screen, visible when printing */}
      <div className="hidden print:block">
        <PrintableReport ref={printRef} data={data} dateRange={dateRange} />
      </div>
    </div>
  );
}
