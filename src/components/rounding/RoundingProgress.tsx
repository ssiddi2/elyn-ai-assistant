import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Circle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Patient, PatientStatus } from '@/components/patients/PatientCard';

interface RoundingProgressProps {
  patients: Patient[];
  className?: string;
}

interface RoundingStats {
  total: number;
  notSeen: number;
  inProgress: number;
  seen: number;
  signed: number;
  discharged: number;
  completedPercent: number;
  criticalNotSeen: number;
}

export default function RoundingProgress({ patients, className }: RoundingProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = useMemo<RoundingStats>(() => {
    const activePatients = patients.filter(p => p.status !== 'discharged');
    const total = activePatients.length;

    const notSeen = activePatients.filter(p => !p.status || p.status === 'not_seen').length;
    const inProgress = activePatients.filter(p => p.status === 'in_progress').length;
    const seen = activePatients.filter(p => p.status === 'seen').length;
    const signed = activePatients.filter(p => p.status === 'signed').length;
    const discharged = patients.filter(p => p.status === 'discharged').length;

    // Completed = seen + signed
    const completed = seen + signed;
    const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Critical patients not yet seen
    const criticalNotSeen = activePatients.filter(
      p => p.acuity === 'critical' && (!p.status || p.status === 'not_seen')
    ).length;

    return {
      total,
      notSeen,
      inProgress,
      seen,
      signed,
      discharged,
      completedPercent,
      criticalNotSeen,
    };
  }, [patients]);

  const getProgressColor = (percent: number) => {
    if (percent >= 80) return 'bg-success';
    if (percent >= 50) return 'bg-warning';
    return 'bg-primary';
  };

  const getProgressTextColor = (percent: number) => {
    if (percent >= 80) return 'text-success';
    if (percent >= 50) return 'text-warning';
    return 'text-primary';
  };

  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden mt-3', className)}>
      {/* Compact Header - Always visible, clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
        </div>

        {/* Progress Bar */}
        <div className="flex-1">
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.completedPercent}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={cn('h-full rounded-full', getProgressColor(stats.completedPercent))}
            />
          </div>
        </div>

        {/* Inline Stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Circle className="w-2.5 h-2.5" />
            {stats.notSeen}
          </span>
          <span className="flex items-center gap-1 text-warning">
            <Clock className="w-2.5 h-2.5" />
            {stats.inProgress}
          </span>
          <span className="flex items-center gap-1 text-success">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {stats.seen}
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Users className="w-2.5 h-2.5" />
            {stats.signed}
          </span>
        </div>

        {/* Percentage */}
        <span className={cn('text-sm font-bold min-w-[45px] text-right', getProgressTextColor(stats.completedPercent))}>
          {stats.completedPercent}%
        </span>

        {/* Expand Icon */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="p-3 pt-2">
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Circle className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="text-base font-bold text-foreground">{stats.notSeen}</div>
                  <div className="text-[9px] text-muted-foreground">Not Seen</div>
                </div>

                <div className="text-center p-2 rounded-lg bg-warning/10">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="w-3 h-3 text-warning" />
                  </div>
                  <div className="text-base font-bold text-warning">{stats.inProgress}</div>
                  <div className="text-[9px] text-muted-foreground">In Progress</div>
                </div>

                <div className="text-center p-2 rounded-lg bg-success/10">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle2 className="w-3 h-3 text-success" />
                  </div>
                  <div className="text-base font-bold text-success">{stats.seen}</div>
                  <div className="text-[9px] text-muted-foreground">Seen</div>
                </div>

                <div className="text-center p-2 rounded-lg bg-primary/10">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Users className="w-3 h-3 text-primary" />
                  </div>
                  <div className="text-base font-bold text-primary">{stats.signed}</div>
                  <div className="text-[9px] text-muted-foreground">Signed</div>
                </div>
              </div>

              {/* Critical Alert */}
              {stats.criticalNotSeen > 0 && (
                <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  <span className="text-xs text-destructive font-medium">
                    {stats.criticalNotSeen} critical patient{stats.criticalNotSeen > 1 ? 's' : ''} not yet seen
                  </span>
                </div>
              )}

              {/* Summary */}
              <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{stats.total} active patients</span>
                <span>{stats.discharged} discharged today</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact version for mobile
export function RoundingProgressCompact({ patients, className }: RoundingProgressProps) {
  const stats = useMemo(() => {
    const activePatients = patients.filter(p => p.status !== 'discharged');
    const total = activePatients.length;
    const completed = activePatients.filter(
      p => p.status === 'seen' || p.status === 'signed'
    ).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percent };
  }, [patients]);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Rounding</span>
          <span className="font-medium text-foreground">{stats.completed}/{stats.total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stats.percent}%` }}
            transition={{ duration: 0.3 }}
            className={cn(
              'h-full rounded-full',
              stats.percent >= 80 ? 'bg-success' : stats.percent >= 50 ? 'bg-warning' : 'bg-primary'
            )}
          />
        </div>
      </div>
      <span className={cn(
        'text-sm font-bold',
        stats.percent >= 80 ? 'text-success' : stats.percent >= 50 ? 'text-warning' : 'text-primary'
      )}>
        {stats.percent}%
      </span>
    </div>
  );
}
