export class ApiError extends Error {
  constructor(message, { kind = 'http', status = 0, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

export const isAbortError = (error) => Boolean(error) && (error.kind === 'abort' || error.name === 'AbortError');

export function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  return url.toString();
}

export async function fetchJson(url, { signal, timeout = 12000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', forwardAbort);
  };

  const translate = (error) => {
    if (timedOut) return new ApiError('The service took too long to respond.', { kind: 'timeout', cause: error });
    if ((signal && signal.aborted) || (error && error.name === 'AbortError')) {
      return new ApiError('Request cancelled.', { kind: 'abort', cause: error });
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(offline ? 'You appear to be offline.' : 'The service could not be reached.', { kind: 'network', cause: error });
  };

  let response;
  let text;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    text = await response.text();
  } catch (error) {
    cleanup();
    throw translate(error);
  }
  cleanup();

  let data = null;
  let parseFailed = false;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      parseFailed = true;
      if (response.ok) {
        throw new ApiError('The service sent a response that could not be read.', { kind: 'parse', status: response.status, cause: error });
      }
    }
  }

  if (!response.ok) {
    const reason = data && typeof data.reason === 'string' ? data.reason : '';
    const message = response.status === 429
      ? 'Too many requests right now. Please wait a minute and try again.'
      : response.status >= 500
        ? `The weather service is having trouble (HTTP ${response.status}).`
        : reason || `The request failed (HTTP ${response.status}).`;
    throw new ApiError(message, { kind: 'http', status: response.status });
  }

  if (data && typeof data === 'object' && data.error === true) {
    throw new ApiError(typeof data.reason === 'string' ? data.reason : 'The service returned an error.', { kind: 'api', status: response.status });
  }

  if (data === null || parseFailed) {
    throw new ApiError('The service sent an empty response.', { kind: 'parse', status: response.status });
  }

  return data;
}

export function describeError(error) {
  if (!error) return { title: 'Something went wrong', message: 'An unexpected error occurred.' };
  switch (error.kind) {
    case 'network':
      return typeof navigator !== 'undefined' && navigator.onLine === false
        ? { title: 'You’re offline', message: 'Reconnect to the internet to fetch the latest weather.' }
        : { title: 'Can’t reach the weather service', message: 'Open-Meteo didn’t respond. Check your connection and try again.' };
    case 'timeout':
      return { title: 'The forecast is taking too long', message: 'Open-Meteo is slow to respond right now. Try again in a moment.' };
    case 'parse':
      return { title: 'Unexpected data', message: 'The weather service sent data we couldn’t read. Try again shortly.' };
    case 'api':
      return { title: 'The weather service declined the request', message: error.message };
    case 'http':
      return { title: error.status === 429 ? 'Slow down a little' : 'The weather service returned an error', message: error.message };
    default:
      return { title: 'Something went wrong', message: error.message || 'An unexpected error occurred.' };
  }
}
