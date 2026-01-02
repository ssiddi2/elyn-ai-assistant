// CPT Codes Library
export const CPT_CODES: Record<string, { code: string; desc: string; rvu: number }> = {
  '99221': { code: '99221', desc: 'Initial Hospital Care - Low', rvu: 1.92 },
  '99222': { code: '99222', desc: 'Initial Hospital Care - Mod', rvu: 2.61 },
  '99223': { code: '99223', desc: 'Initial Hospital Care - High', rvu: 3.86 },
  '99231': { code: '99231', desc: 'Subsequent Hospital - Low', rvu: 0.76 },
  '99232': { code: '99232', desc: 'Subsequent Hospital - Mod', rvu: 1.39 },
  '99233': { code: '99233', desc: 'Subsequent Hospital - High', rvu: 2.00 },
  '99238': { code: '99238', desc: 'Discharge Day ≤30 min', rvu: 1.28 },
  '99239': { code: '99239', desc: 'Discharge Day >30 min', rvu: 1.90 },
  '99291': { code: '99291', desc: 'Critical Care First Hour', rvu: 4.50 },
  '99292': { code: '99292', desc: 'Critical Care +30 min', rvu: 2.25 },
  '99251': { code: '99251', desc: 'Consult L1', rvu: 0.99 },
  '99252': { code: '99252', desc: 'Consult L2', rvu: 1.73 },
  '99253': { code: '99253', desc: 'Consult L3', rvu: 2.42 },
  '99254': { code: '99254', desc: 'Consult L4', rvu: 3.30 },
  '99255': { code: '99255', desc: 'Consult L5', rvu: 4.24 },
};

export const MODIFIERS = [
  { code: '25', desc: 'Significant E/M' },
  { code: '26', desc: 'Professional Component' },
  { code: 'GT', desc: 'Telehealth' },
  { code: '95', desc: 'Synchronous Telemedicine' },
];

// maxRVU config type
export interface MaxRVUConfig {
  url: string;
  username: string;
  password: string;
  facility: string;
}

// Storage for maxRVU config
export const MaxRVUStorage = {
  get: (): MaxRVUConfig | null => {
    try { return JSON.parse(localStorage.getItem('elyn_maxrvu') || 'null'); } catch { return null; }
  },
  save: (c: MaxRVUConfig) => localStorage.setItem('elyn_maxrvu', JSON.stringify(c)),
};
