import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { ClaimsValidationResult } from '@/lib/claimsFormatting';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClaimsValidationBadgeProps {
  validation: ClaimsValidationResult;
  className?: string;
}

export function ClaimsValidationBadge({ validation, className }: ClaimsValidationBadgeProps) {
  if (validation.isValid && validation.warnings.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              "bg-success/10 text-success",
              className
            )}>
              <CheckCircle className="w-3.5 h-3.5" />
              Claims Ready
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>All required fields present for claims submission</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (validation.isValid && validation.warnings.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              "bg-warning/10 text-warning",
              className
            )}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <ul className="list-disc list-inside space-y-1">
              {validation.warnings.map((w, i) => (
                <li key={i} className="text-sm">{w}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            "bg-destructive/10 text-destructive",
            className
          )}>
            <AlertCircle className="w-3.5 h-3.5" />
            {validation.errors.length} Missing Field{validation.errors.length > 1 ? 's' : ''}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-1">Required for claims:</p>
          <ul className="list-disc list-inside space-y-1">
            {validation.errors.map((e, i) => (
              <li key={i} className="text-sm">{e}</li>
            ))}
          </ul>
          {validation.warnings.length > 0 && (
            <>
              <p className="font-medium mt-2 mb-1">Warnings:</p>
              <ul className="list-disc list-inside space-y-1">
                {validation.warnings.map((w, i) => (
                  <li key={i} className="text-sm">{w}</li>
                ))}
              </ul>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
