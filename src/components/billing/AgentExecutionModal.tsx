import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { UnifiedBill } from '@/hooks/useBilling';
import { MaxRVUConfig } from '@/data/billingCodes';
import ModalBackdrop from './ModalBackdrop';

interface AgentExecutionModalProps {
  bill: UnifiedBill;
  maxrvuConfig: MaxRVUConfig | null;
  onComplete: () => void;
  onCancel: () => void;
  markAsSubmitted: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const AgentExecutionModal = ({ 
  bill, 
  maxrvuConfig, 
  onComplete, 
  onCancel, 
  markAsSubmitted 
}: AgentExecutionModalProps) => {
  const [phase, setPhase] = useState<'starting' | 'waiting' | 'analyzing' | 'executing' | 'done'>('starting');
  const [logs, setLogs] = useState<{ type: string; msg: string; time: string }[]>([]);

  const addLog = useCallback((type: string, msg: string) => {
    setLogs(prev => [...prev, { type, msg, time: new Date().toLocaleTimeString() }]);
  }, []);

  useEffect(() => {
    const start = async () => {
      addLog('info', 'Initializing AI agent...');

      const task = {
        timestamp: Date.now(),
        type: 'agent_task',
        bill: {
          patientName: bill.patient_name,
          patientMRN: bill.patient_mrn,
          patientDOB: bill.patient_dob,
          dos: bill.created_at,
          facility: bill.facility || maxrvuConfig?.facility,
          cptCode: bill.cpt_codes[0],
          modifiers: bill.modifiers,
          diagnosis: bill.diagnosis
        },
        credentials: maxrvuConfig?.password ? {
          username: maxrvuConfig.username,
          password: maxrvuConfig.password
        } : null,
      };
      localStorage.setItem('elyn_agent_task', JSON.stringify(task));

      addLog('action', 'Opening maxRVU...');
      window.open(maxrvuConfig?.url || 'https://www.maxrvu.com', '_blank');

      setPhase('waiting');
      addLog('success', 'maxRVU opened in new tab');
      addLog('info', 'Waiting for Chrome extension...');
    };
    start();
  }, [bill, maxrvuConfig, addLog]);

  const handleMarkSubmitted = async () => {
    const result = await markAsSubmitted(bill.id);
    if (result.success) {
      toast.success('Bill marked as submitted');
      onComplete();
    } else {
      toast.error(result.error || 'Failed to update bill');
    }
  };

  return (
    <ModalBackdrop onClose={onCancel}>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={phase === 'analyzing' || phase === 'executing' ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-secondary flex items-center justify-center"
            >
              <Bot className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Billing Agent</h2>
              <p className="text-xs text-muted-foreground">
                {phase === 'starting' && 'Starting...'}
                {phase === 'waiting' && 'Waiting for page...'}
                {phase === 'analyzing' && 'AI analyzing page...'}
                {phase === 'executing' && 'Filling form...'}
                {phase === 'done' && 'Complete!'}
              </p>
            </div>
          </div>
          <span className="badge-minimal text-success bg-success/20 border-success/30">
            No API Key Needed
          </span>
        </div>

        <div className="glass-surface rounded-xl p-4 mb-4 flex justify-between items-center">
          <div>
            <div className="font-medium text-foreground">{bill.patient_name}</div>
            <div className="text-xs text-muted-foreground">Created: {new Date(bill.created_at).toLocaleDateString()}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-secondary">{bill.cpt_codes[0]}</div>
            <div className="text-xs text-success">{bill.rvu?.toFixed(2)} RVU</div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="glass-surface rounded-xl p-3 max-h-48 overflow-auto scrollbar-thin mb-4">
          <div className="text-xs space-y-1.5">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">{log.time}</span>
                <span className={cn(
                  log.type === 'success' && 'text-success',
                  log.type === 'error' && 'text-destructive',
                  log.type === 'action' && 'text-primary',
                  log.type === 'info' && 'text-muted-foreground'
                )}>
                  {log.msg}
                </span>
              </div>
            ))}
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-muted-foreground"
            >
              ▋
            </motion.div>
          </div>
        </div>

        <div className="glass-card-blue p-3 mb-4">
          <p className="text-xs text-muted-foreground">
            <strong>Important:</strong> Keep the maxRVU tab open. Once complete, return here to mark as submitted.
          </p>
        </div>

        <div className="flex gap-3">
          {phase === 'waiting' ? (
            <>
              <Button variant="outline" onClick={onCancel} className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleMarkSubmitted} className="flex-1 btn-minimal bg-success text-white hover:bg-success/90">
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Submitted
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
              <Button variant="destructive" onClick={onCancel} className="flex-1">
                Stop Agent
              </Button>
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
};

export default AgentExecutionModal;
