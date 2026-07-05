import { api } from '../api';

// Fältrapporter skapas direkt som riktiga objekt (till skillnad från Tips via SMS/Mediabevakningens
// granskningsinkorg — annan förtroendemodell eftersom det är en inloggad användare med riktig GPS),
// men med attributes.unclassified: 'true' tills en stabsmedlem granskat dem (se MapView/FeaturePanel).
// Strängvärde, inte boolean — matchar hur alla andra attribut redan rondtrippar som text genom
// FeaturePanel.tsx:s formulärstate (annars skulle en boolean tyst bli strängen "true" vid nästa
// vanliga Spara och sluta matcha ett strikt boolean-filter på kartan).
// Vid dålig/utebliven mobiltäckning i fält köas rapporten i IndexedDB i stället för att tappas.

const DB_NAME = 'odin-field-reports';
const STORE = 'queue';

export interface QueuedReport {
  id?: number;
  layer: string;
  name: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  fields: Record<string, string>;
  photoBlob?: Blob;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueReport(item: Omit<QueuedReport, 'id' | 'queuedAt'>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ ...item, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedReports(): Promise<QueuedReport[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedReport[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Enda stället som faktiskt skickar en fältrapport — delas mellan direktinskick och kö-flush.
// POST /api/features är helt generisk (layer/name/geometry + fritt attributes-innehåll), så
// fälten läggs platt i body precis som features.js förväntar sig, inte nästlat under "attributes".
async function sendReport(item: Omit<QueuedReport, 'id' | 'queuedAt'>): Promise<void> {
  let photo_url: string | undefined;
  if (item.photoBlob) {
    const form = new FormData();
    form.append('file', item.photoBlob, 'rapport.jpg');
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: form,
    });
    if (!res.ok) throw new Error('Kunde inte ladda upp bild');
    photo_url = (await res.json()).url;
  }
  await api.createFeature({
    layer: item.layer,
    name: item.name,
    geometry: item.geometry,
    unclassified: 'true',
    ...(photo_url ? { photo_url } : {}),
    ...item.fields,
  });
}

export async function trySubmitOrQueue(item: Omit<QueuedReport, 'id' | 'queuedAt'>): Promise<'sent' | 'queued'> {
  if (navigator.onLine) {
    try {
      await sendReport(item);
      return 'sent';
    } catch {
      await queueReport(item);
      return 'queued';
    }
  }
  await queueReport(item);
  return 'queued';
}

// Körs vid 'online'-event + periodiskt (se FieldReportView.tsx) — misslyckade poster lämnas
// kvar i kön för nästa försök i stället för att tappas.
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const items = await getQueuedReports();
  let sent = 0;
  for (const item of items) {
    try {
      await sendReport(item);
      if (item.id != null) await removeQueued(item.id);
      sent++;
    } catch {
      // lämnas kvar, försök igen nästa gång
    }
  }
  return { sent, remaining: await getQueueCount() };
}
