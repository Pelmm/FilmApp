const REQUEST_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function getApiUrl(path, baseUrl = process.env.EXPO_PUBLIC_API_URL) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new ApiError('Backendadressen saknas. Ange EXPO_PUBLIC_API_URL i mobile/.env och ladda om appen.', 'CONFIG');
  }

  try {
    const url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid backend URL');
    }
    return `${url.toString().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  } catch {
    throw new ApiError('Backendadressen är ogiltig. EXPO_PUBLIC_API_URL ska vara en HTTP- eller HTTPS-adress utan inloggningsuppgifter, query eller fragment.', 'CONFIG');
  }
}

export async function getHealth({ signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = getApiUrl('health');
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  let timedOut = false;

  signal?.addEventListener('abort', abortRequest);
  if (signal?.aborted) controller.abort();

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    // fetch avvisar nätverksfel, men HTTP-fel måste vi kontrollera själva.
    if (!response.ok) {
      throw new ApiError(`Servern svarade med HTTP ${response.status}. Försök igen.`, 'HTTP');
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError('Servern skickade ett svar som inte är giltig JSON. Försök igen.', 'INVALID_JSON');
    }

    if (!data || typeof data !== 'object' || Array.isArray(data) || data.status !== 'ok') {
      throw new ApiError('Serverns svar saknar förväntad status "ok". Försök igen.', 'INVALID_RESPONSE');
    }

    return data;
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error('Anropet avbröts.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    if (timedOut) {
      throw new ApiError('Servern svarade inte i tid. Kontrollera anslutningen och försök igen.', 'TIMEOUT');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Kunde inte nå servern. Kontrollera att backend är igång och att backendadressen och nätverket stämmer. Försök igen.', 'NETWORK');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}
