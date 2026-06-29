export type Role = 'reader' | 'editor' | 'admin';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export type LayerId = 'fuel' | 'food' | 'water' | 'raw_materials' | 'vehicles' | 'roads' | 'bridges' | 'maintenance' | 'hygiene' | 'staging_areas' | 'transshipment' | 'cameras' | 'powerlines' | 'telecom' | 'railways' | 'ports' | 'airports' | 'medical' | 'emergency' | 'tunnels' | 'fording_points';

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
    color: '#27ae60',
    icon: '🛣',
    fields: [
      { key: 'bk_class',      label: 'Bärighetsklass',  type: 'select', options: ['BK 1', 'BK 2', 'BK 3', 'BK 4'] },
      { key: 'max_axle_ton',  label: 'Max axellast',     type: 'number', unit: 'ton' },
      { key: 'bk_winter',     label: 'Vinterbärighet',   type: 'text' },
      { key: 'avg_speed_kmh', label: 'Aktuell hastighet',type: 'number', unit: 'km/h' },
      { key: 'flow_per_hour', label: 'Trafikflöde',      type: 'number', unit: 'fordon/h' },
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
  {
    id: 'maintenance',
    label: 'Underhåll',
    color: '#e67e22',
    icon: '🔧',
    fields: [
      { key: 'item_type', label: 'Typ', type: 'select', options: ['Verktyg', 'Reservdelar', 'Aggregat/Generator', 'Verkstadsutrustning', 'Drivlina', 'Övrigt'] },
      { key: 'quantity', label: 'Antal/Mängd', type: 'number' },
      { key: 'unit', label: 'Enhet', type: 'select', options: ['st', 'kg', 'liter', 'sats'] },
      { key: 'condition', label: 'Skick', type: 'select', options: ['Bra', 'Tillfredsställande', 'Dåligt'] },
      { key: 'owner', label: 'Ägare/Förband', type: 'text' },
    ],
  },
  {
    id: 'hygiene',
    label: 'Hygien',
    color: '#1abc9c',
    icon: '🚿',
    fields: [
      { key: 'facility_type', label: 'Typ', type: 'select', options: ['Fälttoalett', 'Dusch', 'Tvättstation', 'Sanitetstation', 'Avfallshantering', 'Övrigt'] },
      { key: 'capacity_persons', label: 'Kapacitet', type: 'number', unit: 'pers/dygn' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Under underhåll'] },
      { key: 'water_required', label: 'Kräver vatten', type: 'select', options: ['Ja', 'Nej'] },
    ],
  },
  {
    id: 'cameras',
    label: 'Kameror',
    color: '#e74c3c',
    icon: '📷',
    fields: [
      { key: 'camera_type', label: 'Typ', type: 'select', options: ['Trafikkamera', 'CCTV', 'Övervakningskamera', 'PTZ', 'Termisk', 'Övrigt'] },
      { key: 'owner', label: 'Ägare', type: 'select', options: ['Trafikverket', 'Polisen', 'Kommun', 'Privat', 'Försvarsmakten'] },
      { key: 'direction', label: 'Riktning (°)', type: 'number' },
      { key: 'fov_deg', label: 'Synfält (°)', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Okänd'] },
    ],
  },
  {
    id: 'powerlines',
    label: 'Elkraft',
    color: '#f1c40f',
    icon: '⚡',
    fields: [
      { key: 'line_type', label: 'Typ', type: 'select', options: ['Stamnät (400kV)', 'Regionnät (130kV)', 'Lokalnät', 'Transformatorstation', 'Reservkraft/Aggregat'] },
      { key: 'voltage_kv', label: 'Spänning', type: 'number', unit: 'kV' },
      { key: 'owner', label: 'Ägare', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Begränsad'] },
    ],
  },
  {
    id: 'telecom',
    label: 'Telekommunikation',
    color: '#9b59b6',
    icon: '📡',
    fields: [
      { key: 'site_type', label: 'Typ', type: 'select', options: ['Mobilmast (4G)', 'Mobilmast (5G)', 'Radiomast', 'Fiberknytpunkt', 'Satellit', 'RAKEL-nod', 'Övrigt'] },
      { key: 'owner', label: 'Operatör', type: 'text' },
      { key: 'height_m', label: 'Höjd', type: 'number', unit: 'm' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Degraderad'] },
    ],
  },
  {
    id: 'railways',
    label: 'Järnväg',
    color: '#2c3e50',
    icon: '🚂',
    fields: [
      { key: 'track_type', label: 'Typ', type: 'select', options: ['Huvudbana', 'Sidospår', 'Bangård', 'Industrispår', 'Tunnelbana'] },
      { key: 'electrified', label: 'Elektrifierad', type: 'select', options: ['Ja', 'Nej'] },
      { key: 'max_axle_ton', label: 'Max axellast', type: 'number', unit: 'ton' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Begränsad'] },
    ],
  },
  {
    id: 'ports',
    label: 'Hamnar & Färjelägen',
    color: '#1a5276',
    icon: '⚓',
    fields: [
      { key: 'port_type', label: 'Typ', type: 'select', options: ['Handelshamn', 'Militärhamn', 'Färjeläge', 'Marina', 'Fiskehamn'] },
      { key: 'max_draught_m', label: 'Max djupgående', type: 'number', unit: 'm' },
      { key: 'quay_length_m', label: 'Kajlängd', type: 'number', unit: 'm' },
      { key: 'crane', label: 'Kran', type: 'select', options: ['Ja', 'Nej'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Begränsad'] },
    ],
  },
  {
    id: 'airports',
    label: 'Flygplatser',
    color: '#85c1e9',
    icon: '✈',
    fields: [
      { key: 'airport_type', label: 'Typ', type: 'select', options: ['Civil flygplats', 'Militär flygplats', 'Helikopterplatta', 'Nödlandningsplats', 'Flygfält'] },
      { key: 'runway_length_m', label: 'Banlängd', type: 'number', unit: 'm' },
      { key: 'runway_surface', label: 'Banyta', type: 'select', options: ['Asfalt', 'Betong', 'Gräs', 'Grus'] },
      { key: 'icao', label: 'ICAO-kod', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Militär', 'Stängd', 'Begränsad'] },
    ],
  },
  {
    id: 'medical',
    label: 'Sjukvård',
    color: '#e74c3c',
    icon: '🏥',
    fields: [
      { key: 'facility_type', label: 'Typ', type: 'select', options: ['Sjukhus', 'Fältsjukhus', 'Vårdcentral', 'Akutmottagning', 'Läkarstation', 'Övrigt'] },
      { key: 'beds', label: 'Vårdplatser', type: 'number', unit: 'st' },
      { key: 'trauma', label: 'Traumakapacitet', type: 'select', options: ['Ja', 'Nej'] },
      { key: 'helipad', label: 'Helikopterplatta', type: 'select', options: ['Ja', 'Nej'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Reducerad kapacitet', 'Ej operativ'] },
    ],
  },
  {
    id: 'emergency',
    label: 'Räddning & Blåljus',
    color: '#e67e22',
    icon: '🚒',
    fields: [
      { key: 'unit_type', label: 'Typ', type: 'select', options: ['Brandstation', 'Polisstation', 'Räddningstjänst', 'Ambulansstation', 'Hemvärnscentrum', 'Civilförsvaret'] },
      { key: 'personnel', label: 'Personal', type: 'number', unit: 'st' },
      { key: 'vehicles', label: 'Fordon', type: 'number', unit: 'st' },
      { key: 'status', label: 'Status', type: 'select', options: ['Bemannad', 'Delvis bemannad', 'Ej bemannad'] },
    ],
  },
  {
    id: 'tunnels',
    label: 'Tunnlar',
    color: '#626567',
    icon: '🚇',
    fields: [
      { key: 'tunnel_type', label: 'Typ', type: 'select', options: ['Vägtunnel', 'Järnvägstunnel', 'Gångtunnel', 'Ledningskulvert'] },
      { key: 'length_m', label: 'Längd', type: 'number', unit: 'm' },
      { key: 'height_m', label: 'Fri höjd', type: 'number', unit: 'm' },
      { key: 'width_m', label: 'Fri bredd', type: 'number', unit: 'm' },
      { key: 'max_load_ton', label: 'Maxlast', type: 'number', unit: 'ton' },
    ],
  },
  {
    id: 'fording_points',
    label: 'Vadställen',
    color: '#76d7c4',
    icon: '〰',
    fields: [
      { key: 'water_body', label: 'Vattendrag', type: 'text' },
      { key: 'depth_m', label: 'Djup', type: 'number', unit: 'm' },
      { key: 'width_m', label: 'Bredd', type: 'number', unit: 'm' },
      { key: 'bottom_type', label: 'Bottentyp', type: 'select', options: ['Sand', 'Grus', 'Sten', 'Lera', 'Berg'] },
      { key: 'vehicle_class', label: 'Fordonstyp', type: 'select', options: ['Bandvagn', 'Hjulfordon lätt', 'Hjulfordon tungt', 'Ej fordonsbart'] },
      { key: 'seasonal', label: 'Säsongsberoende', type: 'select', options: ['Ja', 'Nej'] },
    ],
  },
  {
    id: 'staging_areas',
    label: 'Uppställningsytor',
    color: '#d4ac0d',
    icon: '🅿',
    fields: [
      { key: 'area_type', label: 'Typ', type: 'select', options: ['Fordon', 'Personal', 'Materiel', 'Blandad'] },
      { key: 'area_m2', label: 'Areal', type: 'number', unit: 'm²' },
      { key: 'capacity_vehicles', label: 'Kapacitet', type: 'number', unit: 'fordon' },
      { key: 'surface', label: 'Underlag', type: 'select', options: ['Asfalt', 'Betong', 'Grus', 'Gräs', 'Jord'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Tillgänglig', 'Belagd', 'Ej tillgänglig'] },
    ],
  },
  {
    id: 'transshipment',
    label: 'Omlastningsplatser',
    color: '#c8a2c8',
    icon: '🏗',
    fields: [
      { key: 'facility_type', label: 'Typ', type: 'select', options: ['Lastkaj', 'Ramp', 'Järnvägsterminal', 'Helikopterplatta', 'Färjeläge', 'Övrigt'] },
      { key: 'max_load_ton', label: 'Max boggi', type: 'number', unit: 'ton' },
      { key: 'height_m', label: 'Kajhöjd', type: 'number', unit: 'm' },
      { key: 'width_m', label: 'Bredd', type: 'number', unit: 'm' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Begränsad kapacitet'] },
    ],
  },
];

export function getLayer(id: LayerId): LayerConfig {
  return LAYERS.find(l => l.id === id)!;
}
