/**
 * Browser geolocation helpers.
 *
 * Flow: ask the browser for the user's precise latitude/longitude, then
 * reverse-geocode those coordinates into a human-readable address using the
 * free OpenStreetMap Nominatim service (no API key required).
 */

/**
 * Ask the browser for the user's current coordinates.
 * Resolves to { latitude, longitude }; rejects if unsupported, denied, or timed out.
 */
export function getBrowserCoords(options = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options }
    );
  });
}

/**
 * Reverse-geocode coordinates into an address via OpenStreetMap Nominatim.
 * Returns { address, city, region, country }; individual fields may be null.
 */
export async function reverseGeocode(latitude, longitude) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json` +
    `&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}` +
    `&zoom=18&addressdetails=1`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);

  const data = await res.json();
  const a = data.address || {};

  return {
    address: data.display_name || null,
    city: a.city || a.town || a.village || a.suburb || a.county || null,
    region: a.state || a.region || null,
    state: a.state || a.region || null,
    postalCode: a.postcode || null,
    country: a.country_code ? a.country_code.toUpperCase() : null,
  };
}

/**
 * Convenience: get coordinates AND resolve them to an address in one call.
 * Returns { latitude, longitude, address, city, region, country }.
 */
export async function getUserLocation(options = {}) {
  const { latitude, longitude } = await getBrowserCoords(options);
  const place = await reverseGeocode(latitude, longitude);
  return { latitude, longitude, ...place };
}
