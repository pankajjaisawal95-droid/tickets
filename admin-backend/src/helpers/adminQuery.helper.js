/**
 * Shared helpers for admin list endpoints.
 *
 * Every admin list takes `?limit&offset&search&status&from&to` and returns
 * `{ rows, total, limit, offset }`. These helpers centralise the clamping and
 * the (parameterised) WHERE assembly so each service stays thin.
 */

/** Clamp pagination to safe bounds. */
export const parsePaging = ({ limit, offset } = {}, { def = 50, max = 200 } = {}) => ({
  limit: Math.min(Math.max(parseInt(limit, 10) || def, 1), max),
  offset: Math.max(parseInt(offset, 10) || 0, 0)
});

/**
 * Builds a parameterised WHERE clause from a list of conditions. A condition is:
 *  - { sql: 'col = ?', value: x }            — included only when value is a
 *    non-empty, defined value (single placeholder).
 *  - { sql: '(a LIKE ? OR b LIKE ?)', params: [...] } — a multi-placeholder
 *    condition that carries its own params (e.g. a multi-column search). Always
 *    included; callers gate it themselves (e.g. `q.search ? {...} : null`).
 *  - { sql: '...', raw: true }               — a condition with no params.
 *
 * Falsy entries (null/undefined) are skipped, so `cond ? {...} : null` works.
 *
 * @returns {{ whereSql: string, params: any[] }}
 */
export const buildWhere = (conditions = []) => {
  const where = [];
  const params = [];
  for (const c of conditions) {
    if (!c) continue;
    if (c.raw) {
      where.push(c.sql);
      continue;
    }
    // Condition that supplies its own params array (e.g. multi-column search).
    if (Array.isArray(c.params)) {
      where.push(c.sql);
      params.push(...c.params);
      continue;
    }
    if (c.value === undefined || c.value === null || c.value === "") continue;
    where.push(c.sql);
    params.push(c.value);
  }
  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};
