import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, Zap, Bot } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { UnifiedBill } from '@/hooks/useBilling';

interface ManualBillCardProps {
  bill: UnifiedBill;
  onAgent: (bill: UnifiedBill) => void;
  onRPA: (bill: UnifiedBill) => void;
  onDelete: (bill: UnifiedBill) => void;
  showProvider?: boolean;
}

export const ManualBillCard = ({ bill, onAgent, onRPA, onDelete, showProvider }: ManualBillCardProps) => (
  <motion.div
    whileHover={{ y: -2 }}
    className={cn(
      "glass-card p-4 relative",
      bill.status === 'submitted' ? 'border-success/30' : ''
    )}
  >
    <div className={cn(
      "absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium",
      bill.status === 'submitted' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
    )}>
      {bill.status === 'submitted' ? '✓ Submitted' : 'Pending'}
    </div>

    <div className="flex gap-4">
      <div className="flex-1">
        <div className="font-medium text-foreground">{bill.patient_name}</div>
        <div className="text-xs text-muted-foreground">
          DOS: {format(new Date(bill.created_at), 'MMM d, yyyy')} • {bill.diagnosis || 'No Dx'}
        </div>
        {showProvider && bill.provider_name && (
          <div className="text-xs text-secondary mt-1">
            {bill.provider_name} • {bill.provider_specialty}
          </div>
        )}
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {bill.cpt_codes.map((code, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-secondary/20 text-secondary text-xs font-medium">{code}</span>
          ))}
          {bill.modifiers?.map(m => (
            <span key={m} className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground text-xs">-{m}</span>
          ))}
          {bill.facility && (
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground text-xs">{bill.facility}</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">RVU</div>
        <div className="text-xl font-bold text-success">{bill.rvu?.toFixed(2)}</div>
      </div>
    </div>

    {bill.status === 'pending' && (
      <div className="flex gap-2 mt-4 pt-4 border-t border-border">
        <button
          onClick={() => onDelete(bill)}
          className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRPA(bill)}
          className="flex-1 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Zap className="w-4 h-4 inline mr-1" />
          Simple RPA
        </button>
        <button
          onClick={() => onAgent(bill)}
          className="flex-[2] px-3 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-secondary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Bot className="w-4 h-4 inline mr-1" />
          AI Agent
        </button>
      </div>
    )}
  </motion.div>
);

export default ManualBillCard;
