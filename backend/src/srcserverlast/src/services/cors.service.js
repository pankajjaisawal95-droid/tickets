import pool from '../config/database.js';

let cachedDomains = [];
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export const getAllowedDomains = async () => {
    const now = Date.now();
    // clearCorsCache();
    // if (cachedDomains.length && now - lastFetchTime < CACHE_TTL) {
    //     return cachedDomains;
    // }

    const [rows] = await pool.query(
        'SELECT domain FROM allowed_domains WHERE status = 1'
    );
    cachedDomains = rows.map(r => r.domain.trim());
    lastFetchTime = now;
    return cachedDomains;
};


export const clearCorsCache = () => {
    cachedDomains = [];
    lastFetchTime = 0;

};
