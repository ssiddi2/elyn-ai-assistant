import { motion } from 'framer-motion';
import { Home, Mic, Receipt, Settings, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRecordPress: () => void;
  isRecording?: boolean;
}

const tabs = [
  { id: 'patients', icon: Home, label: 'Patients' },
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'record', icon: Mic, label: 'Record', isCenter: true },
  { id: 'bills', icon: Receipt, label: 'Bills' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav({ activeTab, onTabChange, onRecordPress, isRecording }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bottom-nav safe-area-inset md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          if (tab.isCenter) {
            return (
              <button
                key={tab.id}
                onClick={onRecordPress}
                className={cn(
                  'relative flex items-center justify-center w-14 h-14 -mt-6 rounded-full transition-all duration-200',
                  isRecording
                    ? 'bg-destructive recording-pulse'
                    : 'bg-gradient-to-br from-primary to-secondary shadow-lg'
                )}
              >
                <Icon className={cn(
                  'w-6 h-6 transition-transform',
                  isRecording ? 'text-destructive-foreground animate-pulse' : 'text-primary-foreground'
                )} />
                {isRecording && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-destructive"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </button>
            );
          }
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-primary')} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
