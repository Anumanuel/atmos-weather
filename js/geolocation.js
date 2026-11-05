export class GeoError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'GeoError';
    this.kind = kind;
  }
}

export const GEO_MESSAGES = {
  denied: {
    title: 'Location access is turned off',
    message: 'ATMOS can’t see your location because permission was denied. You can allow it in your browser’s site settings, or search for a city instead.',
  },
  unavailable: {
    title: 'Your location couldn’t be determined',
    message: 'Your device didn’t return a position. Check that location services are on, or search for a city.',
  },
  timeout: {
    title: 'Finding your location took too long',
    message: 'The location request timed out. Try again, or search for a city instead.',
  },
  unsupported: {
    title: 'Location isn’t supported here',
    message: 'This browser doesn’t offer geolocation. Search for a city to see its weather.',
  },
  insecure: {
    title: 'Location needs a secure connection',
    message: 'Browsers only share location over HTTPS or localhost. Open ATMOS from a secure address, or search for a city.',
  },
};

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export async function getPermissionState() {
  if (!isGeolocationSupported()) return 'unsupported';
  try {
    if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export function getCurrentPosition({ timeout = 15000, maximumAge = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new GeoError('unsupported', GEO_MESSAGES.unsupported.message));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new GeoError('insecure', GEO_MESSAGES.insecure.message));
      return;
    }
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GeoError('timeout', GEO_MESSAGES.timeout.message));
    }, timeout + 4000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new GeoError('unavailable', GEO_MESSAGES.unavailable.message));
          return;
        }
        resolve({ lat: latitude, lon: longitude, accuracy });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        const kind = error && error.code === 1 ? 'denied' : error && error.code === 3 ? 'timeout' : 'unavailable';
        reject(new GeoError(kind, GEO_MESSAGES[kind].message));
      },
      { enableHighAccuracy: false, timeout, maximumAge },
    );
  });
}
