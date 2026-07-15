const DB_NAME = "spedv-mobile-vault";
const STORE = "vault";
const KEY_ID = "device-key";
const SECRET_ID = "api-secret";
const MAX_SECRET_LENGTH = 8_192;

interface EncryptedSecret {
  version: 1;
  iv: number[];
  ciphertext: number[];
}

let volatileSecret: string | null = null;
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB ist auf diesem Gerät nicht verfügbar."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Der sichere Gerätespeicher konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Der sichere Gerätespeicher ist vorübergehend blockiert."));
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
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function setValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function deleteValues(keys: string[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    keys.forEach((key) => store.delete(key));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function createOrLoadDeviceKey(): Promise<CryptoKey> {
  const existing = await getValue<CryptoKey>(KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await setValue(KEY_ID, key);
  return key;
}

function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (!deviceKeyPromise) {
    deviceKeyPromise = createOrLoadDeviceKey().catch((error) => {
      deviceKeyPromise = null;
      throw error;
    });
  }
  return deviceKeyPromise;
}

function normalizeSecret(value: string) {
  const secret = value.trim();
  if (!secret) throw new Error("Der SPEDV-Hauptschlüssel darf nicht leer sein.");
  if (secret.length > MAX_SECRET_LENGTH) throw new Error("Der SPEDV-Hauptschlüssel ist ungewöhnlich lang.");
  return secret;
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedSecret>;
  return candidate.version === 1
    && Array.isArray(candidate.iv)
    && candidate.iv.length === 12
    && candidate.iv.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    && Array.isArray(candidate.ciphertext)
    && candidate.ciphertext.length > 0
    && candidate.ciphertext.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const secret = normalizeSecret(apiKey);
  volatileSecret = secret;

  try {
    const key = await getOrCreateDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(secret);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    await setValue<EncryptedSecret>(SECRET_ID, {
      version: 1,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
    });
  } catch {
    // Restricted Safari/private-mode storage must not block the current session.
    // The key remains in memory only and disappears when the app is closed.
  }
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const encrypted = await getValue<unknown>(SECRET_ID);
    if (!encrypted) return volatileSecret;
    if (!isEncryptedSecret(encrypted)) {
      await deleteValues([SECRET_ID]);
      return volatileSecret;
    }

    const key = await getValue<CryptoKey>(KEY_ID);
    if (!key) {
      await deleteValues([SECRET_ID]);
      return volatileSecret;
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.ciphertext),
    );
    const secret = normalizeSecret(new TextDecoder().decode(decrypted));
    volatileSecret = secret;
    return secret;
  } catch {
    try { await deleteValues([SECRET_ID]); } catch { /* Ignore blocked storage during recovery. */ }
    return volatileSecret;
  }
}

export async function clearApiKey(): Promise<void> {
  volatileSecret = null;
  deviceKeyPromise = null;
  try {
    await deleteValues([SECRET_ID, KEY_ID]);
  } catch {
    // Logging out must still succeed when IndexedDB is unavailable or blocked.
  }
}
