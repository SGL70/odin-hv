export type Role = 'reader' | 'editor' | 'admin';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export type LayerId = 'fuel' | 'food' | 'water' | 'raw_materials' | 'vehicles' | 'roads' | 'bridges';

export interface LayerConfig {
  id: LayerId;
  label: string;
  color: string;
  icon: string;
  fields: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  unit?: string;
  options?: string[];
}

export interface Feature {
  type: 'Feature';
  id: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> & {
    uid: string;
    layer: LayerId;
    name: string;
    cot_type: string;
    updated_at: string;
  };
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export const LAYERS: LayerConfig[] = [
  {
    id: 'fuel',
    label: 'Drivmedel',
    color: '#e74c3c',
    icon: '⛽',
    fields: [
      { key: 'fuel_type', label: 'Typ', type: 'select', options: ['Diesel', 'Bensin', 'HVO', 'Jet A-1'] },
      { key: 'volume_l', label: 'Volym', type: 'number', unit: 'L' },
      { key: 'fill_pct', label: 'Fyllnadsgrad', type: 'number', unit: '%' },
      { key: 'owner', label: 'Ägare', type: 'text' },
    ],
  },
  {
    id: 'food',
    label: 'Livsmedel',
    color: '#27ae60',
    icon: '🍞',
    fields: [
      { key: 'category', label: 'Kategori', type: 'text' },
      { key: 'weight_kg', label: 'Vikt', type: 'number', unit: 'kg' },
      { key: 'expiry', label: 'Hållbarhet', type: 'date' },
    ],
  },
  {
    id: 'water',
    label: 'Vatten',
    color: '#2980b9',
    icon: '💧',
    fields: [
      { key: 'water_type', label: 'Typ', type: 'select', options: ['Reservoar', 'Brunn', 'Vattentorn', 'Naturkälla'] },
      { key: 'capacity_m3', label: 'Kapacitet', type: 'number', unit: 'm³/dygn' },
    ],
  },
  {
    id: 'raw_materials',
    label: 'Råvaror',
    color: '#8e44ad',
    icon: '🌾',
    fields: [
      { key: 'material_type', label: 'Typ', type: 'select', options: ['Mjöl', 'Foder', 'Nötkreatur', 'Grisar', 'Fjäderfä', 'Övrigt'] },
      { key: 'quantity', label: 'Mängd', type: 'number' },
      { key: 'unit', label: 'Enhet', type: 'select', options: ['kg', 'ton', 'antal', 'liter'] },
    ],
  },
  {
    id: 'vehicles',
    label: 'Fordon',
    color: '#f39c12',
    icon: '🚛',
    fields: [
      { key: 'vehicle_type', label: 'Fordonstyp', type: 'text' },
      { key: 'max_load_ton', label: 'Maxlast', type: 'number', unit: 'ton' },
      { key: 'status', label: 'Status', type: 'select', options: ['Tillgänglig', 'Ej tillgänglig', 'Under underhåll'] },
      { key: 'reg_nr', label: 'Regnr', type: 'text' },
    ],
  },
  {
    id: 'roads',
    label: 'Vägbärighet',
    color: '#95a5a6',
    icon: '🛣',
    fields: [
      { key: 'bk_class', label: 'BK-klass', type: 'select', options: ['BK1', 'BK2', 'BK3', 'BK4'] },
      { key: 'max_axle_ton', label: 'Max axellast', type: 'number', unit: 'ton' },
    ],
  },
  {
    id: 'bridges',
    label: 'Brobärighet',
    color: '#7f8c8d',
    icon: '🌉',
    fields: [
      { key: 'max_load_ton', label: 'Maxlast', type: 'number', unit: 'ton' },
      { key: 'width_m', label: 'Bredd', type: 'number', unit: 'm' },
      { key: 'height_m', label: 'Höjd', type: 'number', unit: 'm' },
    ],
  },
];

export function getLayer(id: LayerId): LayerConfig {
  return LAYERS.find(l => l.id === id)!;
}
