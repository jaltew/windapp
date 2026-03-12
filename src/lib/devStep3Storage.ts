export const DEV_STEP3_CACHE_KEY = "windapp.dev.step3.payload.v1";
export const LATEST_STEP3_CACHE_KEY = "windapp.step3.latest.v1";

export function readStorageJson(key: string): unknown | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeStorageJson(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota/security errors in dev helper.
  }
}

export function removeStorageKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage quota/security errors in dev helper.
  }
}
