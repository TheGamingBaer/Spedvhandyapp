const DB_NAME = "spedv-mobile-vault";
const STORE = "vault";
const KEY_ID = "device-key";
const SECRET_ID = "api-secret";

interface EncryptedSecret {
  iv: number[];
  ciphertext: number[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getValue<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function setValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteValue(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await getValue<CryptoKey>(KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await setValue(KEY_ID, key);
  return key;
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  await setValue<EncryptedSecret>(SECRET_ID, {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  });
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const encrypted = await getValue<EncryptedSecret>(SECRET_ID);
    if (!encrypted) return null;
    const key = await getValue<CryptoKey>(KEY_ID);
    if (!key) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.ciphertext),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function clearApiKey(): Promise<void> {
  await deleteValue(SECRET_ID);
}
