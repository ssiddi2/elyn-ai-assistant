/**
 * Storage utilities for ELYN application.
 * Handles localStorage operations for hospitals, bills, charges, and credentials.
 */

// ===== Types =====

export interface Hospital {
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

export interface MaxRVUCredentials {
  username: string;
  password: string;
  mfaType: string;
  url: string;
}

export interface MaxRVUConfig {
  url: string;
  username: string;
  password: string;
  facility: string;
}

export interface PendingCharge {
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

export interface Bill {
  id: string;
  patientName: string;
  patientMRN: string;
  patientDOB: string;
  dos: string;
  facility: string;
  cptCode: string;
  modifiers: string[];
  diagnosis: string;
  rvu: number;
  status: 'pending' | 'submitted';
  createdAt: number;
  submittedAt?: number;
}

// ===== Storage Keys =====
const KEYS = {
  hospitals: 'elyn_hospitals',
  maxrvuCreds: 'elyn_maxrvu_creds',
  maxrvu: 'elyn_maxrvu',
  pendingCharges: 'elyn_pending_charges',
  bills: 'elyn_bills',
  agentTask: 'elyn_agent_task',
  maxrvuSubmit: 'elyn_maxrvu_submit',
} as const;

// ===== Helper =====
const safeJSONParse = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

// ===== Hospital Storage =====
export const HospitalStorage = {
  getAll: (): Hospital[] => safeJSONParse(KEYS.hospitals, []),
  
  save: (hospitals: Hospital[]) => {
    localStorage.setItem(KEYS.hospitals, JSON.stringify(hospitals));
  },
  
  add: (hospital: Hospital) => {
    const hospitals = HospitalStorage.getAll();
    const idx = hospitals.findIndex((h) => h.id === hospital.id);
    if (idx >= 0) {
      hospitals[idx] = hospital;
    } else {
      hospitals.push(hospital);
    }
    HospitalStorage.save(hospitals);
  },
  
  remove: (id: string) => {
    HospitalStorage.save(HospitalStorage.getAll().filter((h) => h.id !== id));
  },
};

// ===== MaxRVU Credentials Storage =====
export const MaxRVUCredsStorage = {
  get: (): MaxRVUCredentials | null => safeJSONParse(KEYS.maxrvuCreds, null),
  
  save: (creds: MaxRVUCredentials) => {
    localStorage.setItem(KEYS.maxrvuCreds, JSON.stringify(creds));
  },
};

// ===== MaxRVU Config Storage =====
export const MaxRVUConfigStorage = {
  get: (): MaxRVUConfig | null => safeJSONParse(KEYS.maxrvu, null),
  
  save: (config: MaxRVUConfig) => {
    localStorage.setItem(KEYS.maxrvu, JSON.stringify(config));
  },
};

// ===== Pending Charges Storage =====
export const PendingChargesStorage = {
  getAll: (): PendingCharge[] => safeJSONParse(KEYS.pendingCharges, []),
  
  save: (charges: PendingCharge[]) => {
    localStorage.setItem(KEYS.pendingCharges, JSON.stringify(charges));
  },
  
  add: (charge: PendingCharge) => {
    const charges = PendingChargesStorage.getAll();
    charges.push(charge);
    PendingChargesStorage.save(charges);
  },
  
  updateStatus: (id: string, status: PendingCharge['status']) => {
    const charges = PendingChargesStorage.getAll();
    const idx = charges.findIndex((c) => c.id === id);
    if (idx >= 0) {
      charges[idx].status = status;
      PendingChargesStorage.save(charges);
    }
  },
  
  remove: (id: string) => {
    PendingChargesStorage.save(PendingChargesStorage.getAll().filter((c) => c.id !== id));
  },
};

// ===== Bills Storage =====
export const BillsStorage = {
  getAll: (): Bill[] => safeJSONParse(KEYS.bills, []),
  
  save: (bills: Bill[]) => {
    localStorage.setItem(KEYS.bills, JSON.stringify(bills));
  },
  
  add: (bill: Omit<Bill, 'id' | 'createdAt' | 'status'>) => {
    const all = BillsStorage.getAll();
    all.push({
      ...bill,
      id: `b_${Date.now()}`,
      createdAt: Date.now(),
      status: 'pending',
    });
    BillsStorage.save(all);
  },
  
  update: (id: string, updates: Partial<Bill>) => {
    const all = BillsStorage.getAll();
    const idx = all.findIndex((b) => b.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
    }
    BillsStorage.save(all);
  },
  
  remove: (id: string) => {
    BillsStorage.save(BillsStorage.getAll().filter((b) => b.id !== id));
  },
};

// ===== Agent Task Storage =====
export const AgentTaskStorage = {
  get: () => safeJSONParse(KEYS.agentTask, null),
  
  set: (task: unknown) => {
    localStorage.setItem(KEYS.agentTask, JSON.stringify(task));
  },
  
  clear: () => {
    localStorage.removeItem(KEYS.agentTask);
  },
};

// ===== MaxRVU Submit Storage =====
export const MaxRVUSubmitStorage = {
  get: () => safeJSONParse(KEYS.maxrvuSubmit, null),
  
  set: (data: unknown) => {
    localStorage.setItem(KEYS.maxrvuSubmit, JSON.stringify(data));
  },
  
  clear: () => {
    localStorage.removeItem(KEYS.maxrvuSubmit);
  },
};
