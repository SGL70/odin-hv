import type { ChangelogEntry } from './changelog';

export type Role = 'reader' | 'editor' | 'admin';
export type LayerGroup = 'events' | 'resources' | 'layers' | 'basemap';

export interface User {
  id: number;
  username: string;
  role: Role;
}

export type AlertRuleType = 'threshold' | 'proximity' | 'cluster';
export type AlertStatus = 'open' | 'acknowledged';

export interface AlertRuleConfig {
  score_threshold?: number;
  layer?: LayerId;
  min_criticality?: 'gul' | 'rod';
  target_uid?: string;
  distance_m?: number;
  min_count?: number;
  radius_m?: number;
}

export interface AlertRule {
  id: number;
  name: string;
  type: AlertRuleType;
  enabled: boolean;
  config: AlertRuleConfig;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SmsTip {
  id: number;
  elks_id: string | null;
  from_number: string;
  message: string;
  received_at: string;
  status: 'pending' | 'tagged' | 'discarded';
  created_at: string;
}

export interface SmsSender {
  phone: string;
  status: 'unknown' | 'known' | 'blocked';
  label: string | null;
  lat: number | null;
  lng: number | null;
  message_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface NewsSource {
  id: number;
  name: string;
  site_url: string;
  feed_url: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface NewsItem {
  id: number;
  source_id: number;
  source_name: string;
  guid: string;
  title: string;
  link: string | null;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  status: 'pending' | 'tagged' | 'discarded';
  relevant: boolean | null;
  category: string | null;
  classifier_note: string | null;
}

export interface AlertEvent {
  id: number;
  rule_id: number | null;
  rule_name: string;
  rule_type: AlertRuleType;
  entity_key: string;
  status: AlertStatus;
  message: string;
  details: Record<string, unknown>;
  feature_uid: string | null;
  acknowledged_by: number | null;
  acknowledged_by_name?: string;
  acknowledged_at: string | null;
  created_at: string;
}

export interface WeatherHourly {
  time: string;
  temperature: number | null;
  wind_direction: number | null;
  wind_speed: number | null;
  wind_gust: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
}

export interface WeatherForecast {
  lat: number;
  lng: number;
  reference_time: string | null;
  current: WeatherHourly | null;
  hourly: WeatherHourly[];
}

export interface CatchupData {
  alerts: AlertEvent[];
  changelogEntries: ChangelogEntry[];
}

export type LayerId = 'fuel' | 'food' | 'water' | 'raw_materials' | 'vehicles' | 'firewood' | 'consumables' | 'roads' | 'bridges' | 'maintenance' | 'hygiene' | 'staging_areas' | 'transshipment' | 'cameras' | 'powerlines' | 'telecom' | 'railways' | 'ports' | 'airports' | 'medical' | 'emergency' | 'tunnels' | 'fording_points' | 'police_events' | 'road_situations' | 'power_outages' | 'sms_alerts' | 'intelligence_reports' | 'railway_situations' | 'news_reports' | 'weather_warnings';

export interface LayerConfig {
  id: LayerId;
  label: string;
  color: string;
  icon: string;
  group: LayerGroup;
  fields: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'select';
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
    group: 'resources',
    fields: [
      { key: 'brand',             label: 'Varumärke',          type: 'text' },
      { key: 'address',           label: 'Adress',             type: 'text' },
      { key: 'phone',             label: 'Telefon',            type: 'text' },
      { key: 'opening_hours',     label: 'Öppettider',         type: 'text' },
      { key: 'source',            label: 'Källa',              type: 'text' },
      { key: 'diesel_cap_l',      label: 'Diesel – Kapacitet', type: 'number', unit: 'L' },
      { key: 'diesel_level_pct',  label: 'Diesel – Lagernivå', type: 'number', unit: '%' },
      { key: 'bensin_cap_l',      label: 'Bensin – Kapacitet', type: 'number', unit: 'L' },
      { key: 'bensin_level_pct',  label: 'Bensin – Lagernivå', type: 'number', unit: '%' },
      { key: 'hvo_cap_l',         label: 'HVO – Kapacitet',    type: 'number', unit: 'L' },
      { key: 'hvo_level_pct',     label: 'HVO – Lagernivå',    type: 'number', unit: '%' },
      { key: 'data_date',         label: 'Uppgiftsdatum',      type: 'date' },
      { key: 'owner',             label: 'Ägare',              type: 'text' },
    ],
  },
  {
    id: 'food',
    label: 'Livsmedel',
    color: '#27ae60',
    icon: '🍞',
    group: 'resources',
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
    group: 'resources',
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
    group: 'resources',
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
    group: 'resources',
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
    group: 'layers',
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
    group: 'layers',
    fields: [
      { key: 'max_load_ton', label: 'Maxlast', type: 'number', unit: 'ton' },
      { key: 'width_m', label: 'Bredd', type: 'number', unit: 'm' },
      { key: 'height_m', label: 'Höjd', type: 'number', unit: 'm' },
    ],
  },
  {
    id: 'firewood',
    label: 'Ved',
    color: '#6d4c41',
    icon: '🪵',
    group: 'resources',
    fields: [
      { key: 'wood_type', label: 'Träslag', type: 'select', options: ['Björk', 'Gran', 'Tall', 'Blandved', 'Övrigt'] },
      { key: 'quantity_m3', label: 'Mängd', type: 'number', unit: 'm³' },
      { key: 'moisture_pct', label: 'Fuktighet', type: 'number', unit: '%' },
      { key: 'owner', label: 'Ägare', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Tillgänglig', 'Reserverad', 'Ej tillgänglig'] },
    ],
  },
  {
    id: 'consumables',
    label: 'Förbrukningsart',
    color: '#78909c',
    icon: '📦',
    group: 'resources',
    fields: [
      { key: 'item_type', label: 'Typ', type: 'text' },
      { key: 'quantity', label: 'Antal/Mängd', type: 'number' },
      { key: 'unit', label: 'Enhet', type: 'select', options: ['st', 'kg', 'liter', 'förp', 'kartong'] },
      { key: 'expiry', label: 'Hållbarhet', type: 'date' },
      { key: 'owner', label: 'Ägare/Förband', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Tillgänglig', 'Lågt lager', 'Slut'] },
    ],
  },
  {
    id: 'maintenance',
    label: 'Underhåll',
    color: '#e67e22',
    icon: '🔧',
    group: 'resources',
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
    group: 'resources',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'resources',
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
    group: 'resources',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
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
    group: 'layers',
    fields: [
      { key: 'facility_type', label: 'Typ', type: 'select', options: ['Lastkaj', 'Ramp', 'Järnvägsterminal', 'Helikopterplatta', 'Färjeläge', 'Övrigt'] },
      { key: 'max_load_ton', label: 'Max boggi', type: 'number', unit: 'ton' },
      { key: 'height_m', label: 'Kajhöjd', type: 'number', unit: 'm' },
      { key: 'width_m', label: 'Bredd', type: 'number', unit: 'm' },
      { key: 'status', label: 'Status', type: 'select', options: ['Operativ', 'Ej operativ', 'Begränsad kapacitet'] },
    ],
  },
  {
    id: 'road_situations',
    label: 'Trafikhändelser',
    color: '#f39c12',
    icon: '⚠',
    group: 'events',
    fields: [
      { key: 'event_type',  label: 'Typ',         type: 'text' },
      { key: 'severity',    label: 'Allvarlighet', type: 'text' },
      { key: 'start_time',  label: 'Starttid',     type: 'text' },
      { key: 'end_time',    label: 'Sluttid',      type: 'text' },
      { key: 'road_number', label: 'Vägnummer',    type: 'text' },
      { key: 'description', label: 'Beskrivning',  type: 'text' },
      { key: 'source',      label: 'Källa',        type: 'text' },
    ],
  },
  {
    id: 'railway_situations',
    label: 'Tågstörningar',
    color: '#8e44ad',
    icon: '🚆',
    group: 'events',
    fields: [
      { key: 'event_type',      label: 'Typ',              type: 'text' },
      { key: 'activity_type',   label: 'Aktivitet',         type: 'text' },
      { key: 'scheduled_time',  label: 'Planerad tid',      type: 'text' },
      { key: 'train_ident',     label: 'Tåguppdrag',        type: 'text' },
      { key: 'canceled',        label: 'Inställt',          type: 'text' },
      { key: 'operator',        label: 'Operatör',          type: 'text' },
      { key: 'description',     label: 'Beskrivning',       type: 'text' },
      { key: 'source',          label: 'Källa',             type: 'text' },
    ],
  },
  {
    id: 'police_events',
    label: 'Polishändelser',
    color: '#3498db',
    icon: '🚔',
    group: 'events',
    fields: [
      { key: 'event_type',  label: 'Typ',        type: 'text' },
      { key: 'datetime',    label: 'Tid',         type: 'text' },
      { key: 'summary',     label: 'Sammanfattning', type: 'text' },
      { key: 'location',    label: 'Plats',       type: 'text' },
      { key: 'url',         label: 'Länk',        type: 'text' },
      { key: 'source',      label: 'Källa',       type: 'text' },
    ],
  },
  {
    id: 'power_outages',
    label: 'Elavbrott',
    color: '#e67e22',
    icon: '⚡',
    group: 'events',
    fields: [
      { key: 'provider',            label: 'Leverantör',         type: 'text' },
      { key: 'municipality',        label: 'Kommun',             type: 'text' },
      { key: 'affected_customers',  label: 'Berörda hushåll',    type: 'text' },
      { key: 'status',              label: 'Status',             type: 'text' },
      { key: 'is_planned',          label: 'Planerat',           type: 'text' },
      { key: 'start_time',          label: 'Starttid',           type: 'text' },
      { key: 'completion_time',     label: 'Förväntas klart',    type: 'text' },
      { key: 'description',         label: 'Beskrivning',        type: 'text' },
      { key: 'source',              label: 'Källa',              type: 'text' },
    ],
  },
  {
    id: 'sms_alerts',
    label: 'SMS-aviseringar',
    color: '#9b59b6',
    icon: '📱',
    group: 'events',
    fields: [
      { key: 'source',       label: 'Avsändare',    type: 'text' },
      { key: 'description',  label: 'Meddelande',   type: 'text' },
      { key: 'received_at',  label: 'Mottaget',     type: 'text' },
    ],
  },
  {
    id: 'news_reports',
    label: 'Nyhetsrapporter',
    color: '#16a085',
    icon: '📰',
    group: 'events',
    fields: [
      { key: 'source',        label: 'Källa',        type: 'text' },
      { key: 'description',   label: 'Sammanfattning', type: 'text' },
      { key: 'link',          label: 'Länk',         type: 'text' },
      { key: 'published_at',  label: 'Publicerad',   type: 'text' },
    ],
  },
  {
    id: 'weather_warnings',
    label: 'Vädervarningar',
    color: '#e8a33c',
    icon: '⛈',
    group: 'events',
    fields: [
      { key: 'event_type',  label: 'Typ',          type: 'text' },
      { key: 'severity',    label: 'Allvarlighet',  type: 'text' },
      { key: 'start_time',  label: 'Gäller från',   type: 'text' },
      { key: 'end_time',    label: 'Gäller till',   type: 'text' },
      { key: 'description', label: 'Beskrivning',   type: 'text' },
      { key: 'source',      label: 'Källa',         type: 'text' },
    ],
  },
  {
    id: 'intelligence_reports',
    label: 'Underrättelserapporter',
    color: '#c0392b',
    icon: '🕵',
    group: 'events',
    fields: [
      { key: 'datetime',       label: 'Stund (tidpunkt, lämna blank för NU)',   type: 'datetime' },
      { key: 'slag',           label: 'Slag (förbandstyp)',                     type: 'select', options: ['Infanteri', 'Mekaniserad/Pansar', 'Artilleri', 'Luftvärn', 'Ledning/Stab', 'Underrättelse/Spaning', 'Logistik/Trupptransport', 'Flyg', 'Marin', 'Civil/Okänd', 'Övrigt'] },
      { key: 'affiliation',    label: 'Symbol – Tillhörighet',                  type: 'select', options: ['Egen (Friendly)', 'Fientlig (Hostile)', 'Neutral', 'Okänd (Unknown)'] },
      { key: 'symbol_type',    label: 'Symbol – Typ',                           type: 'select', options: ['Markstyrka (allmän)', 'Mekaniserad/Fordon', 'Eldenhet/Beväpning', 'Ledning/Stab', 'Anläggning/Installation'] },
      { key: 'stalle',         label: 'Ställe (platsbeskrivning)',              type: 'text' },
      { key: 'styrka',         label: 'Styrka',                                 type: 'text' },
      { key: 'sysselsattning', label: 'Sysselsättning (verksamhet)',            type: 'text' },
      { key: 'sagesman',       label: 'Sagesman (källa/uppgiftslämnare)',       type: 'text' },
      { key: 'source_value',   label: 'Källans tillförlitlighet (STANAG 2511)', type: 'select', options: ['A – Fullt tillförlitlig', 'B – Vanligen tillförlitlig', 'C – Ganska tillförlitlig', 'D – Inte alltid tillförlitlig', 'E – Otillförlitlig', 'F – Kan ej bedömas'] },
      { key: 'info_value',     label: 'Uppgiftens trovärdighet (STANAG 2511)',  type: 'select', options: ['1 – Bekräftad', '2 – Sannolikt sann', '3 – Möjligen sann', '4 – Tveksam', '5 – Osannolik', '6 – Kan ej bedömas'] },
      { key: 'description',    label: 'Uppgift / beskrivning av händelsen',     type: 'text' },
    ],
  },
];

export function getLayer(id: LayerId): LayerConfig {
  return LAYERS.find(l => l.id === id)!;
}
