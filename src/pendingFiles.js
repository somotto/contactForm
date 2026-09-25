// Holds optional registration uploads (company video, company profile
// document) between register.html and the vendor's first dashboard login,
// when they can finally be written to S3. IndexedDB rather than localStorage
// (which is what the logo uses) because localStorage caps out around 5 MB —
// far too small for a video — and can't store Blobs without base64 bloat.

const DB_NAME = 'pendingVendorFiles';
const STORE = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export const putPendingFile = (name, file) => run('readwrite', (s) => s.put(file, name));
export const getPendingFile = (name) => run('readonly', (s) => s.get(name));
export const clearPendingFiles = () => run('readwrite', (s) => s.clear());
