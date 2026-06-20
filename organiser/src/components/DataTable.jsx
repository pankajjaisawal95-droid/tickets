import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Server-driven table. The `fetcher` receives
 * `{ limit, offset, search, ...filters }` and must resolve to
 * `{ rows, total, limit, offset }`.
 *
 * Props:
 *  - columns: [{ key, header, render?(row, index), className? }]  // index is the absolute row number (offset + position)
 *  - fetcher: (params) => Promise<{rows,total,limit,offset}>
 *  - filters: [{ key, label, options: [{value,label}] }]
 *  - searchPlaceholder, defaultLimit, rowKey, onRowClick, refreshKey, emptyText
 */
export default function DataTable({
  columns,
  fetcher,
  filters = [],
  searchPlaceholder = 'Search…',
  defaultLimit = 20,
  rowKey = 'id',
  onRowClick,
  refreshKey = 0,
  emptyText = 'No records found'
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(defaultLimit);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterVals, setFilterVals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  /* debounce the search box */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* reset to first page when query inputs change */
  useEffect(() => {
    setOffset(0);
  }, [debounced, filterVals, refreshKey]);

  const params = useMemo(
    () => ({ limit, offset, search: debounced || undefined, ...cleanFilters(filterVals) }),
    [limit, offset, debounced, filterVals]
  );

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    fetcher(params)
      .then((data) => {
        if (id !== reqId.current) return;
        setRows(data?.rows || []);
        setTotal(data?.total || 0);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(e.message || 'Failed to load');
        setRows([]);
        setTotal(0);
      })
      .finally(() => id === reqId.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, refreshKey]);

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="dt">
      <div className="dt-toolbar">
        <input
          className="input dt-search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters.map((f) => (
          <select
            key={f.key}
            className="input"
            value={filterVals[f.key] ?? ''}
            onChange={(e) =>
              setFilterVals((v) => ({ ...v, [f.key]: e.target.value }))
            }
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        <span className="dt-total">{loading ? '…' : `${total} record${total === 1 ? '' : 's'}`}</span>
      </div>

      <div className="dt-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length} className="dt-msg">Loading…</td></tr>
            )}
            {!loading && error && (
              <tr><td colSpan={columns.length} className="dt-msg dt-err">{error}</td></tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={columns.length} className="dt-msg">{emptyText}</td></tr>
            )}
            {!loading && !error && rows.map((row, i) => (
              <tr
                key={row[rowKey]}
                className={onRowClick ? 'row-click' : ''}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(row, offset + i) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dt-pager">
        <button className="btn" disabled={page <= 1 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>
          ← Prev
        </button>
        <span>Page {page} / {pages}</span>
        <button className="btn" disabled={page >= pages || loading} onClick={() => setOffset(offset + limit)}>
          Next →
        </button>
      </div>
    </div>
  );
}

function cleanFilters(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}
