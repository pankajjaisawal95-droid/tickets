import geoip from 'geoip-lite';

/**
 * Resolve the real client IP, even behind a proxy / load balancer.
 * Requires `app.set('trust proxy', true)` so Express populates req.ip from
 * the X-Forwarded-For header instead of giving the proxy's own address.
 */
const getClientIp = (req) => {
    // req.ip respects the trust-proxy setting; fall back to the raw socket.
    let ip = req.ip || req.socket?.remoteAddress || '';

    // IPv6-mapped IPv4 looks like "::ffff:1.2.3.4" — strip the prefix.
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);

    // Localhost shows up as ::1 / 127.0.0.1 during local testing.
    if (ip === '::1') ip = '127.0.0.1';

    return ip;
};

/**
 * Attaches req.geo = { ip, country, region, city, timezone, ll } to every
 * request, looked up offline from the bundled geoip-lite database.
 * Never throws — if the IP is private/unknown, geo fields are null.
 */
export const geoLocation = (req, res, next) => {
    const ip = getClientIp(req);
    const geo = geoip.lookup(ip);

    req.geo = {
        ip,
        country: geo?.country || null, // e.g. "IN"
        region: geo?.region || null,   // e.g. "DL"
        city: geo?.city || null,       // e.g. "New Delhi"
        timezone: geo?.timezone || null,
        ll: geo?.ll || null,           // [latitude, longitude]
    };

    next();
};
