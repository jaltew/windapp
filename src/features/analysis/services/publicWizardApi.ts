const DEFAULT_API_BASE_URL = "/api/public-wizard";

export function buildPublicWizardUrl(path: string): string {
  const configuredBaseUrl = import.meta.env.VITE_WIND_API_BASE_URL as string | undefined;
  const baseUrl = configuredBaseUrl?.trim() || DEFAULT_API_BASE_URL;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export async function fetchPublicWizardJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = buildPublicWizardUrl(path);
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(
      `Could not reach analysis API at ${url}. Check that the backend is running, VITE_WIND_API_BASE_URL is correct, and CORS/HTTPS settings allow this request.`
    );
  }

  if (!response.ok) {
    throw new Error(await resolveApiError(response, url));
  }

  if (response.status === 204) {
    return {} as T;
  }

  const textBody = await response.text();
  if (!textBody) {
    return {} as T;
  }

  try {
    return JSON.parse(textBody) as T;
  } catch {
    throw new Error(`API at ${url} returned invalid JSON.`);
  }
}

async function resolveApiError(response: Response, url: string): Promise<string> {
  const bodyText = await response.text();
  const fallback = `Request to ${url} failed with status ${response.status}.`;

  if (!bodyText.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed;
    }

    if (isRecord(parsed)) {
      const message = readString(parsed, "message") ?? readString(parsed, "detail");
      if (message) {
        return message;
      }
    }
  } catch {
    // Fall through to plain text body below.
  }

  return bodyText;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
