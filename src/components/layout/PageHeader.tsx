import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import elynLogo from '@/assets/elyn-logo.png';
import virtualisLogo from '@/assets/virtualis-logo.png';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  showLogo?: boolean;
  showVirtualis?: boolean;
  rightContent?: React.ReactNode;
}

/**
 * Reusable page header with back button, logo, title, and optional right content.
 */
const PageHeader = ({
  title,
  subtitle,
  backTo = '/',
  backLabel = 'Back',
  showLogo = true,
  showVirtualis = true,
  rightContent,
}: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        {showLogo && (
          <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center overflow-hidden">
            <img src={elynLogo} alt="ELYN" className="w-10 h-10 object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold gradient-text">{title}</h1>
          <div className="flex items-center gap-2">
            {subtitle && <span className="text-xs text-muted-foreground tracking-widest">{subtitle}</span>}
            {showVirtualis && subtitle && <span className="text-muted-foreground">•</span>}
            {showVirtualis && <img src={virtualisLogo} alt="Virtualis" className="h-4 opacity-70" />}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {rightContent}
        <Button variant="outline" onClick={() => navigate(backTo)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Button>
      </div>
    </div>
  );
};

export default PageHeader;
