export const PIE_COLORS = [
  'var(--pie-1)','var(--pie-2)','var(--pie-3)','var(--pie-4)','var(--pie-5)',
  'var(--pie-6)','var(--pie-7)','var(--pie-8)','var(--pie-9)',
];
export const OVC_ITEMS = ['Energy & Utilities','Direct Labor Costs','PPI Manufacturing Europe','ECI USA','Container Freight WCI','Labor China'];
export const RM_ITEMS = ['Oil Price','Chlorine','Aluminum','Iron','Ammonia','Natural Gas','Naphtha','Copper','Ethylene','Caustic Soda','Methanol'];
// Incoterms 2020. `modes: 'sea'` are maritime/inland-waterway only and should
// not be used for containerized or non-water transport — the UI can warn on
// that. Mirror of backend/app/constants/incoterms.py.
export const INCOTERM_META = [
  { code: 'EXW', label: 'Ex Works', modes: 'any' },
  { code: 'FCA', label: 'Free Carrier', modes: 'any' },
  { code: 'FAS', label: 'Free Alongside Ship', modes: 'sea' },
  { code: 'FOB', label: 'Free On Board', modes: 'sea' },
  { code: 'CFR', label: 'Cost and Freight', modes: 'sea' },
  { code: 'CIF', label: 'Cost, Insurance & Freight', modes: 'sea' },
  { code: 'CPT', label: 'Carriage Paid To', modes: 'any' },
  { code: 'CIP', label: 'Carriage and Insurance Paid To', modes: 'any' },
  { code: 'DAP', label: 'Delivered At Place', modes: 'any' },
  { code: 'DPU', label: 'Delivered At Place Unloaded', modes: 'any' },
  { code: 'DDP', label: 'Delivered Duty Paid', modes: 'any' },
];

export const DEPRECATED_INCOTERMS = [
  { code: 'DAT', label: 'Delivered At Terminal (replaced by DPU in 2020)' },
  { code: 'DDU', label: 'Delivered Duty Unpaid (pre-2010)' },
];

export const INCOTERMS = INCOTERM_META.map(i => i.code);
