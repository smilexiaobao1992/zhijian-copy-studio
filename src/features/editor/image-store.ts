const DATABASE_NAME = 'zhijian-copy-studio-images';
const DATABASE_VERSION = 1;
const STORE_NAME = 'images';

export const WECHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const WECHAT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

const localImagePattern = /^zhijian-image:\/\/([a-z0-9-]+)$/iu;
const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface StoredImage {
  id: string;
  dataUrl: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface LocalImageAsset {
  id: string;
  uri: string;
  dataUrl: string;
  alt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地图片库'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地图片读写失败'));
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function createImageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function imageAlt(name: string): string {
  const withoutExtension = name.replace(/\.(?:png|jpe?g|webp)$/iu, '').trim();
  return (withoutExtension || '图片').replace(/[\[\]\r\n]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function validateImage(file: File): void {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('仅支持 PNG、JPG 和 WebP 图片');
  }
  if (file.size > WECHAT_IMAGE_MAX_BYTES) {
    throw new Error('单张图片不能超过 10 MB');
  }
}

export async function storeLocalImage(file: File): Promise<LocalImageAsset> {
  validateImage(file);
  const dataUrl = await readFileAsDataUrl(file);
  const database = await openDatabase();
  const id = createImageId();
  const record: StoredImage = {
    id,
    dataUrl,
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: Date.now(),
  };

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
  } finally {
    database.close();
  }

  return { id, uri: `zhijian-image://${id}`, dataUrl, alt: imageAlt(file.name) };
}

export function collectLocalImageUris(source: string): string[] {
  const matches = source.matchAll(/zhijian-image:\/\/[a-z0-9-]+/giu);
  return [...new Set(Array.from(matches, (match) => match[0]))];
}

export async function loadLocalImageSources(source: string): Promise<ReadonlyMap<string, string>> {
  const uris = collectLocalImageUris(source);
  if (uris.length === 0) return new Map();

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const records = await Promise.all(uris.map(async (uri) => {
      const id = localImagePattern.exec(uri)?.[1];
      if (!id) return null;
      const image = await requestResult(store.get(id) as IDBRequest<StoredImage | undefined>);
      return image ? [uri, image.dataUrl] as const : null;
    }));
    return new Map(records.filter((record): record is readonly [string, string] => record !== null));
  } finally {
    database.close();
  }
}
