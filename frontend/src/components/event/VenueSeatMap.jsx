import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { useCartStore } from "../../store/store";
import { useToast } from "../../context/ToastContext";

/* One colour per ticket type/section (cycles if there are more than 7). */
const PALETTE = ["#7c3aed", "#2563eb", "#0d9488", "#d4a017", "#b45309", "#db2777", "#475569"];
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const MAX_SEATS_PER_ORDER = 100; // mirrors the server cap
const POLL_MS = 20000;          // live availability refresh

/**
 * Whole-venue seating chart: every SEATED ticket type's rows drawn together as
 * a single layout (A → U), colour-coded by section. Selecting writes that
 * section's seats straight into the cart. Adds live availability polling,
 * best-available auto-pick, and zoom for big/mobile layouts.
 */
export default function VenueSeatMap({ eventId }) {
  const setSeats = useCartStore((s) => s.setSeats);
  const cart = useCartStore((s) => s.cart);
  const toast = useToast();

  const [data, setData] = useState({ ticketTypes: [], seats: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);
  const [apType, setApType] = useState("");
  const [apCount, setApCount] = useState(2);
  const [fitSize, setFitSize] = useState(26); // seat px that fits the widest row
  const cancelledRef = useRef(false);
  const scrollRef = useRef(null);

  const fetchMap = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await api.get(`/event/seatmap/${eventId}`);
        if (cancelledRef.current) return;
        setData(res.data?.data || { ticketTypes: [], seats: [] });
      } catch (e) {
        if (!cancelledRef.current && !silent) {
          setErr(e.response?.data?.message || "Could not load the seat map");
        }
      } finally {
        if (!cancelledRef.current && !silent) setLoading(false);
      }
    },
    [eventId]
  );

  // initial load
  useEffect(() => {
    cancelledRef.current = false;
    fetchMap(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchMap]);

  // #7 live availability — silently refresh "taken" flags while the tab is visible
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) fetchMap(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchMap]);

  const typeMeta = useMemo(() => {
    const m = {};
    data.ticketTypes.forEach((t, i) => {
      m[t.id] = { ...t, color: PALETTE[i % PALETTE.length] };
    });
    return m;
  }, [data.ticketTypes]);

  const seatById = useMemo(() => {
    const m = {};
    data.seats.forEach((s) => (m[s.id] = s));
    return m;
  }, [data.seats]);

  // group seats into rows (A..U), each row belongs to one section
  const rows = useMemo(() => {
    const m = {};
    data.seats.forEach((s) => (m[s.row_label] ||= []).push(s));
    return Object.keys(m)
      .sort()
      .map((rk) => ({
        row: rk,
        typeId: m[rk][0].ticket_type_id,
        seats: m[rk].sort((a, b) => a.col_number - b.col_number),
      }));
  }, [data.seats]);

  // Group contiguous rows of the same ticket type into one section, so each
  // section can show a single "A-B Platinum (₹1,999)" header.
  const sections = useMemo(() => {
    const out = [];
    rows.forEach((r) => {
      const last = out[out.length - 1];
      if (last && last.typeId === r.typeId) last.rows.push(r);
      else out.push({ typeId: r.typeId, rows: [r] });
    });
    return out.map((sec) => {
      const labels = sec.rows.map((r) => r.row);
      const first = labels[0];
      const lastL = labels[labels.length - 1];
      return { ...sec, range: first === lastL ? first : `${first}-${lastL}` };
    });
  }, [rows]);

  // Widest row (highest column number) — drives the auto-fit seat size.
  const maxCols = useMemo(
    () =>
      rows.reduce(
        (mx, r) => Math.max(mx, r.seats.length ? r.seats[r.seats.length - 1].col_number : 0),
        0
      ),
    [rows]
  );

  // Auto-fit: pick the largest seat size that lets the widest row fit the
  // container, so there's no horizontal scroll until the user zooms in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !maxCols) return;
    const compute = () => {
      const ROW_LABELS = 2 * 24; // a row label on each side
      const GAP = 5;             // matches .venue-row gap
      const PADDING = 28;        // .venue-scroll horizontal padding
      const avail = el.clientWidth - PADDING - ROW_LABELS - (maxCols + 1) * GAP;
      const size = Math.floor(avail / maxCols);
      setFitSize(Math.max(18, Math.min(38, size)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxCols]);

  // Selected seats derived from the cart (the source of truth).
  const selected = useMemo(() => {
    const set = new Set();
    for (const tt of data.ticketTypes) {
      (cart[tt.id]?.seatIds || []).forEach((id) => set.add(Number(id)));
    }
    return set;
  }, [cart, data.ticketTypes]);

  const capFor = (tt) =>
    tt?.max_per_user != null && Number(tt.max_per_user) > 0
      ? Math.min(Number(tt.max_per_user), MAX_SEATS_PER_ORDER)
      : MAX_SEATS_PER_ORDER;

  const commit = (tt, ids) => {
    const labels = ids.map((id) => seatById[id]?.seat_label).filter(Boolean);
    setSeats(
      { id: tt.id, eventId, title: tt.name, price: tt.price, maxPerUser: tt.max_per_user ?? null },
      ids,
      labels
    );
  };

  const toggle = (seat) => {
    if (seat.taken) return;
    const tt = typeMeta[seat.ticket_type_id];
    if (!tt) return;
    const current = new Set((cart[tt.id]?.seatIds || []).map(Number));
    if (current.has(seat.id)) current.delete(seat.id);
    else {
      if (current.size >= capFor(tt)) {
        toast?.info(`Up to ${capFor(tt)} seats for ${tt.name}`);
        return;
      }
      current.add(seat.id);
    }
    commit(tt, [...current]);
  };

  // #8 best-available — pick N seats together (consecutive col_numbers, same row)
  const autoPick = (rawType, rawCount) => {
    const typeId = Number(rawType) || data.ticketTypes[0]?.id;
    const tt = typeMeta[typeId];
    if (!tt) return;
    const n = Math.max(1, Math.min(parseInt(rawCount, 10) || 1, capFor(tt)));

    const sectionRows = rows.filter((r) => r.typeId === typeId);
    for (const r of sectionRows) {
      const free = r.seats.filter((s) => !s.taken);
      // find first run of n seats with consecutive col_numbers
      let run = [];
      for (let i = 0; i < free.length; i++) {
        if (run.length && free[i].col_number !== run[run.length - 1].col_number + 1) run = [];
        run.push(free[i]);
        if (run.length === n) {
          commit(tt, run.map((s) => s.id));
          toast?.success(`Picked ${tt.name} ${run.map((s) => s.seat_label).join(", ")}`);
          return;
        }
      }
    }
    toast?.error(`No ${n} ${tt.name} seats together — try fewer or pick manually`);
  };

  // Quick pick is now instant: choosing a section tab or changing the seat
  // count immediately auto-picks that many seats together (no button needed).
  const activeType = apType || data.ticketTypes[0]?.id;
  const pickType = (typeId) => {
    setApType(String(typeId));
    autoPick(typeId, apCount);
  };
  const changeCount = (value) => {
    setApCount(value);
    autoPick(activeType, value);
  };

  if (loading) return <div className="venue-state">Loading seat map…</div>;
  if (err) return <div className="venue-state venue-error">{err}</div>;
  if (!rows.length) return <div className="venue-state">No seat layout configured for this event.</div>;

  const totalSel = selected.size;

  return (
    <div id="tickets" className="venue-wrap">
      <span className="kc-eyebrow">Choose Your Seats</span>
      <h2 className="ticket-heading">Seating Layout</h2>

      <div className="venue-legend">
        {data.ticketTypes.map((t) => (
          <span className="venue-legend-item" key={t.id}>
            <i style={{ background: typeMeta[t.id].color }} /> {t.name} · {inr(t.price)}
          </span>
        ))}
        <span className="venue-legend-item">
          <i className="seat-dot taken" /> Booked
        </span>
      </div>

      {/* toolbar: best-available + zoom */}
      <div className="venue-toolbar">
        <div className="venue-autopick">
          <span className="venue-tool-label">Quick pick</span>
          <div className="venue-typetabs" role="tablist" aria-label="Quick pick section">
            {data.ticketTypes.map((t) => {
              const active = String(activeType) === String(t.id);
              const color = typeMeta[t.id]?.color || "#4647d3";
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`venue-typetab${active ? " is-active" : ""}`}
                  style={
                    active
                      ? { background: color, borderColor: color, color: "#fff" }
                      : { borderColor: color, color }
                  }
                  onClick={() => pickType(t.id)}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <input
            type="number"
            min="1"
            max={MAX_SEATS_PER_ORDER}
            value={apCount}
            onChange={(e) => changeCount(e.target.value)}
            aria-label="Number of seats"
          />
        </div>
        <div className="venue-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">+</button>
        </div>
      </div>

      <div className="venue-scroll" ref={scrollRef}>
        <div className="venue-stage">STAGE</div>
        <div className="venue-track" style={{ "--seat-size": `${Math.round(fitSize * zoom)}px` }}>
          {sections.map((sec) => {
            const tt = typeMeta[sec.typeId];
            const color = tt?.color || "#7c3aed";
            return (
              <div className="venue-section" key={`${sec.typeId}-${sec.range}`}>
                <div className="venue-section-head" style={{ color }}>
                  <i className="venue-section-dot" style={{ background: color }} />
                  {sec.range} {tt?.name} ({inr(tt?.price)})
                </div>
                {sec.rows.map(({ row, seats }) => {
                  const byCol = new Map(seats.map((s) => [s.col_number, s]));
                  const maxCol = seats.length ? seats[seats.length - 1].col_number : 0;
                  const cols = Array.from({ length: maxCol }, (_, i) => i + 1);
                  return (
                    <div className="venue-row" key={row}>
                      <span className="venue-rowlabel" style={{ color }}>{row}</span>
                      {cols.map((p) => {
                        const s = byCol.get(p);
                        if (!s) return <span key={`g${p}`} className="venue-gap" aria-hidden="true" />;
                        const sel = selected.has(s.id);
                        const sColor = typeMeta[s.ticket_type_id]?.color || "#7c3aed";
                        const seatNo = String(s.seat_label).replace(/[^\d]/g, "") || s.col_number;
                        const style = s.taken
                          ? undefined
                          : sel
                          ? { background: sColor, borderColor: sColor, color: "#fff" }
                          : { borderColor: sColor, color: sColor };
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`venue-seat ${s.taken ? "is-taken" : sel ? "is-selected" : "is-free"}`}
                            style={style}
                            disabled={s.taken}
                            onClick={() => toggle(s)}
                            title={`${s.seat_label} · ${typeMeta[s.ticket_type_id]?.name} · ${inr(typeMeta[s.ticket_type_id]?.price)}`}
                          >
                            {seatNo}
                          </button>
                        );
                      })}
                      <span className="venue-rowlabel" style={{ color }}>{row}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="venue-hint">
        {totalSel > 0
          ? `${totalSel} seat${totalSel > 1 ? "s" : ""} selected — review & checkout in your cart →`
          : "Tap a seat to select, or use Quick pick. Each colour is a section (see legend)."}
      </p>
    </div>
  );
}
