import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaxRVUConfig, MaxRVUStorage } from '@/data/billingCodes';
import ModalBackdrop from './ModalBackdrop';

interface MaxRVUSetupProps {
  existing: MaxRVUConfig | null;
  onComplete: (config: MaxRVUConfig) => void;
  onCancel: () => void;
}

export const MaxRVUSetup = ({ existing, onComplete, onCancel }: MaxRVUSetupProps) => {
  const [config, setConfig] = useState<MaxRVUConfig>(existing || {
    url: 'https://www.maxrvu.com/login',
    username: '',
    password: '',
    facility: '',
  });

  return (
    <ModalBackdrop onClose={onCancel}>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Configure maxRVU</h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Login URL</label>
            <Input
              value={config.url}
              onChange={e => setConfig({ ...config, url: e.target.value })}
              placeholder="https://www.maxrvu.com/login"
              className="input-minimal"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Username / Email *</label>
            <Input
              value={config.username}
              onChange={e => setConfig({ ...config, username: e.target.value })}
              placeholder="your@email.com"
              className="input-minimal"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Password (optional)</label>
            <Input
              type="password"
              value={config.password}
              onChange={e => setConfig({ ...config, password: e.target.value })}
              placeholder="Your password"
              className="input-minimal"
            />
            <p className="text-xs text-muted-foreground mt-2">🔒 Stored only on your device</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Default Facility (optional)</label>
            <Input
              value={config.facility}
              onChange={e => setConfig({ ...config, facility: e.target.value })}
              placeholder="Hospital name"
              className="input-minimal"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button
            onClick={() => { MaxRVUStorage.save(config); onComplete(config); }}
            disabled={!config.username}
            className="flex-1 btn-minimal bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

export default MaxRVUSetup;
