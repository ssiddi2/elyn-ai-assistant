// ELYN™ by Virtualis - Universal EMR Access + maxRVU Billing
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Star, Settings, Send, Trash2, Edit, ExternalLink, Shield, Zap, CheckCircle, X, ChevronRight } from 'lucide-react';
import elynLogo from '@/assets/elyn-logo.png';
import virtualisLogo from '@/assets/virtualis-logo.png';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// E/M Code Library
const EM_CODES = [
  { code: '99221', level: 'Initial Hospital Care (Low)', rvu: 1.92, desc: 'Initial admit, low complexity' },
  { code: '99222', level: 'Initial Hospital Care (Mod)', rvu: 2.61, desc: 'Initial admit, moderate complexity' },
  { code: '99223', level: 'Initial Hospital Care (High)', rvu: 3.86, desc: 'Initial admit, high complexity' },
  { code: '99231', level: 'Subsequent Hospital (Low)', rvu: 0.76, desc: 'Follow-up, low complexity' },
  { code: '99232', level: 'Subsequent Hospital (Mod)', rvu: 1.39, desc: 'Follow-up, moderate complexity' },
  { code: '99233', level: 'Subsequent Hospital (High)', rvu: 2.00, desc: 'Follow-up, high complexity' },
  { code: '99238', level: 'Discharge Day (<30 min)', rvu: 1.28, desc: 'Discharge, less than 30 mins' },
  { code: '99239', level: 'Discharge Day (>30 min)', rvu: 1.90, desc: 'Discharge, more than 30 mins' },
  { code: '99252', level: 'Inpatient Consult (Low)', rvu: 1.50, desc: 'Consult, straightforward/low' },
  { code: '99253', level: 'Inpatient Consult (Mod)', rvu: 2.08, desc: 'Consult, moderate complexity' },
  { code: '99254', level: 'Inpatient Consult (Mod-High)', rvu: 3.05, desc: 'Consult, moderate-high complexity' },
  { code: '99255', level: 'Inpatient Consult (High)', rvu: 3.86, desc: 'Consult, high complexity' },
  { code: '99281', level: 'ED Visit (Level 1)', rvu: 0.48, desc: 'ED, self-limited problem' },
  { code: '99282', level: 'ED Visit (Level 2)', rvu: 0.93, desc: 'ED, low complexity' },
  { code: '99283', level: 'ED Visit (Level 3)', rvu: 1.60, desc: 'ED, moderate complexity' },
  { code: '99284', level: 'ED Visit (Level 4)', rvu: 2.74, desc: 'ED, high complexity' },
  { code: '99285', level: 'ED Visit (Level 5)', rvu: 4.00, desc: 'ED, high complexity, life-threatening' },
  { code: '99291', level: 'Critical Care (First Hr)', rvu: 4.50, desc: 'Critical care, first 30-74 mins' },
  { code: '99292', level: 'Critical Care (Addl 30)', rvu: 2.25, desc: 'Critical care, each addl 30 mins' },
];

const MFA_TYPES = {
  none: { id: 'none', name: 'No MFA', icon: Shield, desc: 'Single username/password' },
  sms: { id: 'sms', name: 'SMS Code', icon: Zap, desc: 'Code via text message' },
  email: { id: 'email', name: 'Email Code', icon: Zap, desc: 'Code via email' },
  authenticator: { id: 'authenticator', name: 'Authenticator', icon: Shield, desc: 'Duo, Google, Microsoft' },
  push: { id: 'push', name: 'Push Notification', icon: Zap, desc: 'Approve on phone' },
  call: { id: 'call', name: 'Phone Call', icon: Zap, desc: 'Automated call' },
};

const VPN_TYPES = {
  none: { id: 'none', name: 'No VPN Required', icon: '🌐' },
  cisco: { id: 'cisco', name: 'Cisco AnyConnect', icon: '🔒' },
  globalprotect: { id: 'globalprotect', name: 'GlobalProtect', icon: '🔒' },
  pulse: { id: 'pulse', name: 'Pulse Secure', icon: '🔒' },
  fortinet: { id: 'fortinet', name: 'FortiClient', icon: '🔒' },
  citrix: { id: 'citrix', name: 'Citrix Gateway', icon: '🖥️' },
  other: { id: 'other', name: 'Other VPN', icon: '🔒' },
};

const EMR_TYPES = {
  epic: { id: 'epic', name: 'Epic', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  cerner: { id: 'cerner', name: 'Cerner', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  meditech: { id: 'meditech', name: 'MEDITECH', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  athena: { id: 'athena', name: 'athenahealth', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  ecw: { id: 'ecw', name: 'eClinicalWorks', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  allscripts: { id: 'allscripts', name: 'Allscripts', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  other: { id: 'other', name: 'Other', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

interface Hospital {
  id: string;
  name: string;
  nickname: string;
  emrType: string | null;
  emrUrl: string;
  vpnType: string;
  vpnServer: string;
  vpnGroup: string;
  mfaType: string;
  username: string;
  password: string;
  favorite: boolean;
  notes: string;
  lastUsed?: number;
  updatedAt?: number;
}

interface MaxRVUCredentials {
  username: string;
  password: string;
  mfaType: string;
  url: string;
}

interface PendingCharge {
  id: string;
  patientName: string;
  mrn: string;
  dos: string;
  emCode: string;
  emLevel: string;
  rvu: number;
  icd10: string[];
  notes: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  createdAt: number;
}

// Storage utilities
const Storage = {
  getHospitals: (): Hospital[] => {
    try { return JSON.parse(localStorage.getItem('elyn_hospitals') || '[]'); } catch { return []; }
  },
  saveHospitals: (hospitals: Hospital[]) => {
    localStorage.setItem('elyn_hospitals', JSON.stringify(hospitals));
  },
  addHospital: (hospital: Hospital) => {
    const hospitals = Storage.getHospitals();
    const idx = hospitals.findIndex(h => h.id === hospital.id);
    if (idx >= 0) hospitals[idx] = hospital;
    else hospitals.push(hospital);
    Storage.saveHospitals(hospitals);
  },
  removeHospital: (id: string) => {
    Storage.saveHospitals(Storage.getHospitals().filter(h => h.id !== id));
  },
  getMaxRVUCreds: (): MaxRVUCredentials | null => {
    try { return JSON.parse(localStorage.getItem('elyn_maxrvu_creds') || 'null'); } catch { return null; }
  },
  saveMaxRVUCreds: (creds: MaxRVUCredentials) => {
    localStorage.setItem('elyn_maxrvu_creds', JSON.stringify(creds));
  },
  getPendingCharges: (): PendingCharge[] => {
    try { return JSON.parse(localStorage.getItem('elyn_pending_charges') || '[]'); } catch { return []; }
  },
  savePendingCharges: (charges: PendingCharge[]) => {
    localStorage.setItem('elyn_pending_charges', JSON.stringify(charges));
  },
  addPendingCharge: (charge: PendingCharge) => {
    const charges = Storage.getPendingCharges();
    charges.push(charge);
    Storage.savePendingCharges(charges);
  },
  updateChargeStatus: (id: string, status: PendingCharge['status']) => {
    const charges = Storage.getPendingCharges();
    const idx = charges.findIndex(c => c.id === id);
    if (idx >= 0) {
      charges[idx].status = status;
      Storage.savePendingCharges(charges);
    }
  },
  removeCharge: (id: string) => {
    Storage.savePendingCharges(Storage.getPendingCharges().filter(c => c.id !== id));
  },
};

// Modal Backdrop
const ModalBackdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
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
      className="w-full max-w-lg"
    >
      {children}
    </motion.div>
  </motion.div>
);

// Setup Wizard
const SetupWizard = ({ onComplete, onCancel, editHospital }: {
  onComplete: (hospital: Hospital) => void;
  onCancel: () => void;
  editHospital: Hospital | null;
}) => {
  const [step, setStep] = useState(1);
  const [hospital, setHospital] = useState<Hospital>(editHospital || {
    id: `h_${Date.now()}`,
    name: '',
    nickname: '',
    emrType: null,
    emrUrl: '',
    vpnType: 'none',
    vpnServer: '',
    vpnGroup: '',
    mfaType: 'none',
    username: '',
    password: '',
    favorite: false,
    notes: '',
  });

  const update = (data: Partial<Hospital>) => setHospital(prev => ({ ...prev, ...data }));
  const canNext = () => {
    if (step === 1) return hospital.name && hospital.emrType;
    if (step === 2) return hospital.emrUrl;
    return true;
  };

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
    else {
      Storage.addHospital({ ...hospital, updatedAt: Date.now() });
      onComplete(hospital);
    }
  };

  return (
    <ModalBackdrop onClose={onCancel}>
      <div className="glass-card p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {editHospital ? 'Edit Hospital' : 'Add Hospital'}
            </h2>
            <p className="text-sm text-muted-foreground">Step {step} of 5</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                s < step ? "bg-primary text-primary-foreground" :
                s === step ? "bg-secondary text-secondary-foreground" :
                "bg-muted text-muted-foreground"
              )}>
                {s < step ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {i < 4 && <div className={cn("flex-1 h-0.5", s < step ? "bg-primary" : "bg-muted")} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Hospital Name</label>
              <Input
                value={hospital.name}
                onChange={e => update({ name: e.target.value })}
                placeholder="e.g., Memorial Regional Medical Center"
                className="input-minimal"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Nickname (optional)</label>
              <Input
                value={hospital.nickname}
                onChange={e => update({ nickname: e.target.value })}
                placeholder="e.g., Memorial"
                className="input-minimal"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-3 block">EMR System</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.values(EMR_TYPES).map(emr => (
                  <button
                    key={emr.id}
                    onClick={() => update({ emrType: emr.id })}
                    className={cn(
                      "p-3 rounded-xl border text-center transition-all",
                      hospital.emrType === emr.id ? emr.color : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xs font-medium">{emr.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground">Open your EMR login page and copy the URL from your browser's address bar.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">EMR Login URL</label>
              <Input
                value={hospital.emrUrl}
                onChange={e => update({ emrUrl: e.target.value })}
                placeholder="https://emr.hospital.org/login"
                className="input-minimal"
              />
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Does this hospital require VPN?</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(VPN_TYPES).map(vpn => (
                <button
                  key={vpn.id}
                  onClick={() => update({ vpnType: vpn.id })}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all flex items-center gap-3",
                    hospital.vpnType === vpn.id ? "bg-primary/20 border-primary/30 text-foreground" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <span>{vpn.icon}</span>
                  <span className="text-sm font-medium">{vpn.name}</span>
                </button>
              ))}
            </div>
            {hospital.vpnType !== 'none' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 mt-4">
                <Input value={hospital.vpnServer} onChange={e => update({ vpnServer: e.target.value })} placeholder="VPN Server" className="input-minimal" />
                <Input value={hospital.vpnGroup} onChange={e => update({ vpnGroup: e.target.value })} placeholder="VPN Group (optional)" className="input-minimal" />
              </motion.div>
            )}
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Username</label>
              <Input value={hospital.username} onChange={e => update({ username: e.target.value })} placeholder="Your EMR username" className="input-minimal" autoComplete="off" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Password (optional)</label>
              <Input type="password" value={hospital.password} onChange={e => update({ password: e.target.value })} placeholder="Your EMR password" className="input-minimal" autoComplete="new-password" />
              <p className="text-xs text-muted-foreground mt-2">🔒 Encrypted & stored locally</p>
            </div>
            <div className="pt-4 border-t border-border">
              <label className="text-sm text-muted-foreground mb-3 block">MFA Type</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(MFA_TYPES).map(mfa => (
                  <button
                    key={mfa.id}
                    onClick={() => update({ mfaType: mfa.id })}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      hospital.mfaType === mfa.id ? "bg-primary/20 border-primary/30" : "bg-muted/30 border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <mfa.icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{mfa.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{mfa.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5 */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/30 border border-border">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
                <div className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", EMR_TYPES[hospital.emrType as keyof typeof EMR_TYPES]?.color || 'bg-muted')}>
                  {EMR_TYPES[hospital.emrType as keyof typeof EMR_TYPES]?.name || 'EMR'}
                </div>
                <span className="font-medium">{hospital.name}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">URL</span><span className="truncate max-w-48">{hospital.emrUrl}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>{hospital.username || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VPN</span><span>{VPN_TYPES[hospital.vpnType as keyof typeof VPN_TYPES]?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MFA</span><span>{MFA_TYPES[hospital.mfaType as keyof typeof MFA_TYPES]?.name}</span></div>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={hospital.favorite} onChange={e => update({ favorite: e.target.checked })} className="w-4 h-4 rounded" />
              <span className="text-sm">⭐ Add to favorites</span>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">Back</Button>
          )}
          <Button onClick={handleNext} disabled={!canNext()} className="flex-1 btn-minimal bg-primary text-primary-foreground hover:bg-primary/90">
            {step === 5 ? 'Save Hospital' : 'Continue'}
            {step < 5 && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// Launch Modal
const LaunchModal = ({ hospital, onClose, onComplete }: {
  hospital: Hospital;
  onClose: () => void;
  onComplete: () => void;
}) => {
  const [phase, setPhase] = useState(hospital.vpnType !== 'none' ? 'vpn' : 'launch');
  const emr = EMR_TYPES[hospital.emrType as keyof typeof EMR_TYPES] || EMR_TYPES.other;
  const vpn = VPN_TYPES[hospital.vpnType as keyof typeof VPN_TYPES] || VPN_TYPES.none;
  const mfa = MFA_TYPES[hospital.mfaType as keyof typeof MFA_TYPES] || MFA_TYPES.none;

  const launchEMR = () => {
    window.open(hospital.emrUrl, '_blank');
    Storage.addHospital({ ...hospital, lastUsed: Date.now() });
    if (hospital.mfaType !== 'none') setPhase('mfa');
    else { setPhase('done'); setTimeout(onComplete, 1500); }
  };

  useEffect(() => {
    if (hospital.vpnType === 'none') launchEMR();
  }, []);

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="glass-card p-8 text-center">
        {phase === 'vpn' && (
          <>
            <div className="text-5xl mb-4">🔒</div>
            <h3 className="text-xl font-semibold mb-2">Connect to VPN</h3>
            <p className="text-muted-foreground mb-6">{hospital.name} requires VPN</p>
            <div className="p-4 rounded-xl bg-muted/30 text-left mb-6">
              <div className="text-sm"><span className="text-muted-foreground">Client:</span> {vpn.name}</div>
              {hospital.vpnServer && <div className="text-sm mt-1"><span className="text-muted-foreground">Server:</span> {hospital.vpnServer}</div>}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={() => { setPhase('launch'); setTimeout(launchEMR, 500); }} className="flex-1 bg-primary text-primary-foreground">I'm Connected</Button>
            </div>
          </>
        )}
        {phase === 'launch' && (
          <>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-5xl mb-4">⏳</motion.div>
            <h3 className="text-xl font-semibold mb-2">Launching EMR...</h3>
            <p className="text-muted-foreground">Opening {emr.name}</p>
          </>
        )}
        {phase === 'mfa' && (
          <>
            <div className="text-5xl mb-4"><mfa.icon className="w-12 h-12 mx-auto text-primary" /></div>
            <h3 className="text-xl font-semibold mb-2">Complete MFA</h3>
            <p className="text-muted-foreground mb-6">{mfa.desc}</p>
            <Button onClick={() => { setPhase('done'); setTimeout(onComplete, 1500); }} className="w-full bg-primary text-primary-foreground">MFA Complete</Button>
          </>
        )}
        {phase === 'done' && (
          <>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-5xl mb-4">✅</motion.div>
            <h3 className="text-xl font-semibold mb-2">You're In!</h3>
            <p className="text-muted-foreground">Connected to {hospital.name}</p>
          </>
        )}
      </div>
    </ModalBackdrop>
  );
};

// MaxRVU Setup Modal
const MaxRVUSetupModal = ({ creds, onSave, onClose }: {
  creds: MaxRVUCredentials | null;
  onSave: (creds: MaxRVUCredentials) => void;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<MaxRVUCredentials>(creds || { username: '', password: '', mfaType: 'none', url: 'https://secure.maxrvu.com' });
  const update = (data: Partial<MaxRVUCredentials>) => setForm(prev => ({ ...prev, ...data }));

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Setup maxRVU</h2>
            <p className="text-sm text-muted-foreground">Configure billing credentials</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">maxRVU URL</label>
            <Input value={form.url} onChange={e => update({ url: e.target.value })} className="input-minimal" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Username</label>
            <Input value={form.username} onChange={e => update({ username: e.target.value })} className="input-minimal" autoComplete="off" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Password</label>
            <Input type="password" value={form.password} onChange={e => update({ password: e.target.value })} className="input-minimal" autoComplete="new-password" />
          </div>
          <div className="pt-4 border-t border-border">
            <label className="text-sm text-muted-foreground mb-3 block">MFA Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(MFA_TYPES).map(mfa => (
                <button key={mfa.id} onClick={() => update({ mfaType: mfa.id })} className={cn("p-3 rounded-xl border text-left transition-all", form.mfaType === mfa.id ? "bg-primary/20 border-primary/30" : "bg-muted/30 border-border hover:bg-muted/50")}>
                  <span className="text-sm font-medium">{mfa.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => { Storage.saveMaxRVUCreds(form); onSave(form); }} disabled={!form.username} className="flex-1 bg-primary text-primary-foreground">Save</Button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// Charge Entry Modal
const ChargeEntryModal = ({ onSave, onClose }: {
  onSave: (charge: PendingCharge) => void;
  onClose: () => void;
}) => {
  const [form, setForm] = useState({ patientName: '', mrn: '', dos: new Date().toISOString().split('T')[0], emCode: '', icd10: '', notes: '' });
  const selectedCode = EM_CODES.find(c => c.code === form.emCode);
  const update = (data: Partial<typeof form>) => setForm(prev => ({ ...prev, ...data }));

  const handleSave = () => {
    if (!form.patientName || !form.emCode) return;
    const charge: PendingCharge = {
      id: `c_${Date.now()}`,
      patientName: form.patientName,
      mrn: form.mrn,
      dos: form.dos,
      emCode: form.emCode,
      emLevel: selectedCode?.level || '',
      rvu: selectedCode?.rvu || 0,
      icd10: form.icd10.split(',').map(s => s.trim()).filter(Boolean),
      notes: form.notes,
      status: 'pending',
      createdAt: Date.now(),
    };
    Storage.addPendingCharge(charge);
    onSave(charge);
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="glass-card p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Charge</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Patient Name</label>
              <Input value={form.patientName} onChange={e => update({ patientName: e.target.value })} placeholder="Last, First" className="input-minimal" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">MRN</label>
              <Input value={form.mrn} onChange={e => update({ mrn: e.target.value })} placeholder="Optional" className="input-minimal" />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Date of Service</label>
            <Input type="date" value={form.dos} onChange={e => update({ dos: e.target.value })} className="input-minimal" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-3 block">E/M Code</label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto scrollbar-thin">
              {EM_CODES.map(code => (
                <button key={code.code} onClick={() => update({ emCode: code.code })} className={cn("p-2 rounded-lg border text-left transition-all", form.emCode === code.code ? "bg-primary/20 border-primary/30" : "bg-muted/30 border-border hover:bg-muted/50")}>
                  <div className="text-sm font-mono font-semibold">{code.code}</div>
                  <div className="text-xs text-muted-foreground truncate">{code.level}</div>
                  <div className="text-xs text-primary font-medium">{code.rvu} RVU</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">ICD-10 Codes</label>
            <Input value={form.icd10} onChange={e => update({ icd10: e.target.value })} placeholder="Comma-separated" className="input-minimal" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={!form.patientName || !form.emCode} className="flex-1 bg-primary text-primary-foreground">Add Charge</Button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// Hospital Card
const HospitalCard = ({ hospital, onLaunch, onEdit, onDelete }: {
  hospital: Hospital;
  onLaunch: (h: Hospital) => void;
  onEdit: (h: Hospital) => void;
  onDelete: (h: Hospital) => void;
}) => {
  const emr = EMR_TYPES[hospital.emrType as keyof typeof EMR_TYPES] || EMR_TYPES.other;

  return (
    <motion.div whileHover={{ y: -2 }} className="glass-card p-4 group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border", emr.color)}>
            {emr.name}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{hospital.nickname || hospital.name}</span>
              {hospital.favorite && <Star className="w-3.5 h-3.5 text-primary fill-primary" />}
            </div>
            {hospital.nickname && <p className="text-xs text-muted-foreground">{hospital.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(hospital)} className="p-1.5 rounded-lg hover:bg-muted/50"><Edit className="w-4 h-4 text-muted-foreground" /></button>
          <button onClick={() => onDelete(hospital)} className="p-1.5 rounded-lg hover:bg-destructive/20"><Trash2 className="w-4 h-4 text-destructive" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {hospital.vpnType !== 'none' && <span className="badge-minimal text-secondary"><Shield className="w-3 h-3" /> VPN</span>}
        {hospital.mfaType !== 'none' && <span className="badge-minimal"><Zap className="w-3 h-3" /> MFA</span>}
        <div className="flex-1" />
        <Button size="sm" onClick={() => onLaunch(hospital)} className="bg-secondary/20 text-secondary hover:bg-secondary/30 border border-secondary/30">
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Launch
        </Button>
      </div>
    </motion.div>
  );
};

// Charge Card
const ChargeCard = ({ charge, onSend, onRemove }: {
  charge: PendingCharge;
  onSend: (c: PendingCharge) => void;
  onRemove: (c: PendingCharge) => void;
}) => (
  <motion.div whileHover={{ y: -2 }} className="glass-card p-4 group">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-mono font-bold text-sm">
          {charge.emCode.slice(-2)}
        </div>
        <div>
          <div className="font-medium">{charge.patientName}</div>
          <p className="text-xs text-muted-foreground">{charge.mrn && `MRN: ${charge.mrn} • `}{charge.dos}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="badge-minimal bg-primary/20 text-primary border-primary/30">{charge.rvu} RVU</span>
        {charge.status === 'sent' && <span className="badge-minimal bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Sent</span>}
        {charge.status === 'pending' && <span className="badge-minimal bg-amber-500/20 text-amber-400 border-amber-500/30">Pending</span>}
      </div>
    </div>
    <div className="flex items-center gap-2 mt-3 justify-end">
      {charge.status !== 'sent' && (
        <Button size="sm" onClick={() => onSend(charge)} className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30">
          <Send className="w-3.5 h-3.5 mr-1.5" /> Send
        </Button>
      )}
      <button onClick={() => onRemove(charge)} className="p-1.5 rounded-lg hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-4 h-4 text-destructive" />
      </button>
    </div>
  </motion.div>
);

// Main Component
export default function ElynEMRAccess() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'emr' | 'billing'>('emr');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [editHospital, setEditHospital] = useState<Hospital | null>(null);
  const [launchHospital, setLaunchHospital] = useState<Hospital | null>(null);
  const [search, setSearch] = useState('');
  const [maxrvuCreds, setMaxrvuCreds] = useState<MaxRVUCredentials | null>(null);
  const [pendingCharges, setPendingCharges] = useState<PendingCharge[]>([]);
  const [showMaxRVUSetup, setShowMaxRVUSetup] = useState(false);
  const [showChargeEntry, setShowChargeEntry] = useState(false);

  useEffect(() => {
    setHospitals(Storage.getHospitals());
    setMaxrvuCreds(Storage.getMaxRVUCreds());
    setPendingCharges(Storage.getPendingCharges());
  }, []);

  const reload = () => {
    setHospitals(Storage.getHospitals());
    setPendingCharges(Storage.getPendingCharges());
  };

  const filtered = hospitals.filter(h => h.name.toLowerCase().includes(search.toLowerCase()) || h.nickname?.toLowerCase().includes(search.toLowerCase()));
  const favorites = filtered.filter(h => h.favorite);
  const others = filtered.filter(h => !h.favorite);
  const todayCharges = pendingCharges.filter(c => c.dos === new Date().toISOString().split('T')[0]);
  const todayRVU = todayCharges.reduce((sum, c) => sum + c.rvu, 0);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Clean Futuristic Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent" />
      <div className="fixed inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      
      <div className="relative z-10 max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center overflow-hidden">
              <img src={elynLogo} alt="ELYN" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">ELYN™</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tracking-widest">EMR ACCESS</span>
                <span className="text-muted-foreground">•</span>
                <img src={virtualisLogo} alt="Virtualis" className="h-4 opacity-70" />
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('emr')}
            className={cn(
              "px-5 py-2.5 rounded-xl font-medium text-sm transition-all",
              tab === 'emr' ? "bg-primary text-primary-foreground" : "glass-card text-muted-foreground hover:text-foreground"
            )}
          >
            🏥 EMR Access
          </button>
          <button
            onClick={() => setTab('billing')}
            className={cn(
              "px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2",
              tab === 'billing' ? "bg-primary text-primary-foreground" : "glass-card text-muted-foreground hover:text-foreground"
            )}
          >
            💰 Billing
            {pendingCharges.filter(c => c.status === 'pending').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                {pendingCharges.filter(c => c.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/billing-agent')}
            className="px-5 py-2.5 rounded-xl font-medium text-sm transition-all glass-card text-muted-foreground hover:text-foreground flex items-center gap-2 ml-auto bg-gradient-to-r from-pink-500/20 to-secondary/20 border border-pink-500/30"
          >
            🤖 AI Billing Agent
          </button>
        </div>

        {/* EMR Tab */}
        {tab === 'emr' && (
          <div className="space-y-6">
            {/* Search & Add */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hospitals..." className="pl-10 input-minimal" />
              </div>
              <Button onClick={() => { setEditHospital(null); setShowWizard(true); }} className="bg-primary text-primary-foreground gap-2">
                <Plus className="w-4 h-4" /> Add Hospital
              </Button>
            </div>

            {/* Hospitals */}
            {hospitals.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🏥</div>
                <h3 className="text-lg font-semibold mb-2">No Hospitals Added</h3>
                <p className="text-muted-foreground mb-6">Add your first hospital to get started</p>
                <Button onClick={() => setShowWizard(true)} className="bg-primary text-primary-foreground gap-2">
                  <Plus className="w-4 h-4" /> Add Hospital
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {favorites.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Star className="w-3.5 h-3.5" /> Favorites
                    </h3>
                    <div className="space-y-3">
                      {favorites.map(h => (
                        <HospitalCard key={h.id} hospital={h} onLaunch={setLaunchHospital} onEdit={h => { setEditHospital(h); setShowWizard(true); }} onDelete={h => { if(confirm(`Remove ${h.name}?`)) { Storage.removeHospital(h.id); reload(); }}} />
                      ))}
                    </div>
                  </div>
                )}
                {others.length > 0 && (
                  <div>
                    {favorites.length > 0 && <h3 className="text-sm font-medium text-muted-foreground mb-3">All Hospitals</h3>}
                    <div className="space-y-3">
                      {others.map(h => (
                        <HospitalCard key={h.id} hospital={h} onLaunch={setLaunchHospital} onEdit={h => { setEditHospital(h); setShowWizard(true); }} onDelete={h => { if(confirm(`Remove ${h.name}?`)) { Storage.removeHospital(h.id); reload(); }}} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Billing Tab */}
        {tab === 'billing' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-primary">{todayRVU.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Today's RVU</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold">{todayCharges.length}</div>
                <div className="text-xs text-muted-foreground">Today's Charges</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-amber-400">{pendingCharges.filter(c => c.status === 'pending').length}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={() => setShowMaxRVUSetup(true)} variant="outline" className="gap-2">
                <Settings className="w-4 h-4" /> {maxrvuCreds ? 'Edit' : 'Setup'} maxRVU
              </Button>
              <Button onClick={() => setShowChargeEntry(true)} className="bg-primary text-primary-foreground gap-2 flex-1">
                <Plus className="w-4 h-4" /> Add Charge
              </Button>
            </div>

            {/* Charges */}
            {pendingCharges.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-lg font-semibold mb-2">No Charges Yet</h3>
                <p className="text-muted-foreground">Add your first charge to track RVUs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingCharges.map(c => (
                  <ChargeCard
                    key={c.id}
                    charge={c}
                    onSend={() => {
                      if (!maxrvuCreds) { setShowMaxRVUSetup(true); return; }
                      window.open(maxrvuCreds.url, '_blank');
                      Storage.updateChargeStatus(c.id, 'sent');
                      reload();
                    }}
                    onRemove={c => { if(confirm(`Remove charge for ${c.patientName}?`)) { Storage.removeCharge(c.id); reload(); }}}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        <AnimatePresence>
          {showWizard && <SetupWizard editHospital={editHospital} onComplete={() => { setShowWizard(false); reload(); }} onCancel={() => setShowWizard(false)} />}
          {launchHospital && <LaunchModal hospital={launchHospital} onClose={() => setLaunchHospital(null)} onComplete={() => setLaunchHospital(null)} />}
          {showMaxRVUSetup && <MaxRVUSetupModal creds={maxrvuCreds} onSave={c => { setMaxrvuCreds(c); setShowMaxRVUSetup(false); }} onClose={() => setShowMaxRVUSetup(false)} />}
          {showChargeEntry && <ChargeEntryModal onSave={() => { setShowChargeEntry(false); reload(); }} onClose={() => setShowChargeEntry(false)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
