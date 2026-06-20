import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/axios";
import { useCartStore } from "../../store/store";

/**
 * Reserved-seat picker for a SEATED ticket type. Fetches the live seat map
 * (each seat flagged available/taken), lets the user toggle a selection on a
 * stage-fronted grid, and writes the chosen seats back to the cart on confirm.
 *
 * Props: { ticketType: { id, name, price, max_per_user }, eventId, onClose }
 */
export default function SeatMapModal({ ticketType, eventId, onClose }) {
  const setSeats = useCartStore((s) => s.setSeats);
  const existing = useCartStore((s) => s.cart[ticketType.id]);

  const [seats, setSeats_] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // start from whatever is already in the cart for this type
  const [selected, setSelected] = useState(() => existing?.seatIds || []);

  const limit =
    ticketType.max_per_user != null && Number(ticketType.max_per_user) > 0
      ? Number(ticketType.max_per_user)
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/event/seats/${ticketType.id}`)
      .then((res) => {
        if (cancelled) return;
        setSeats_(res.data?.data?.seats || []);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e.response?.data?.message || "Could not load the seat map");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ticketType.id]);

  const byRow = useMemo(() => {
    const map = {};
    for (const s of seats) (map[s.row_label] ||= []).push(s);
    return map;
  }, [seats]);
  const rowKeys = Object.keys(byRow);

  const labelOf = (id) => seats.find((s) => s.id === id)?.seat_label;

  const toggle = (seat) => {
    if (seat.taken) return;
    setSelected((prev) => {
      if (prev.includes(seat.id)) return prev.filter((x) => x !== seat.id);
      if (limit != null && prev.length >= limit) return prev; // cap reached
      return [...prev, seat.id];
    });
  };

  const confirm = () => {
    const labels = selected.map(labelOf).filter(Boolean);
    setSeats(
      { id: ticketType.id, eventId, title: ticketType.name, price: ticketType.price, maxPerUser: limit },
      selected,
      labels
    );
    onClose();
  };

  // Rendered through a portal to <body> so the fixed overlay is positioned
  // relative to the viewport — NOT the ticket card, whose :hover transform would
  // otherwise become the containing block and make the modal jump/flicker.
  return createPortal(
    <div className="seatmap-overlay" onClick={onClose}>
      <div className="seatmap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="seatmap-head">
          <div>
            <span className="kc-eyebrow">{ticketType.name}</span>
            <h3>Select your seats</h3>
          </div>
          <button className="seatmap-close" onClick={onClose} type="button" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading && <div className="seatmap-loading">Loading seats…</div>}
        {err && <div className="seatmap-error">{err}</div>}

        {!loading && !err && rowKeys.length === 0 && (
          <div className="seatmap-loading">No seats configured for this ticket.</div>
        )}

        {!loading && !err && rowKeys.length > 0 && (
          <>
            <div className="seatmap-stage">STAGE</div>

            <div className="seatmap-grid">
              <div className="seatmap-track">
              {rowKeys.map((rk) => (
                <div className="seatmap-row" key={rk}>
                  <span className="seatmap-rowlabel">{rk}</span>
                  {(() => {
                    // render by physical column so col_number gaps become aisles
                    const byCol = new Map(byRow[rk].map((s) => [s.col_number, s]));
                    const maxCol = byRow[rk][byRow[rk].length - 1].col_number;
                    return Array.from({ length: maxCol }, (_, i) => i + 1).map((p) => {
                      const s = byCol.get(p);
                      if (!s) return <span key={`g${p}`} className="seatmap-gap" aria-hidden="true" />;
                      const isSel = selected.includes(s.id);
                      const cls = s.taken ? "is-taken" : isSel ? "is-selected" : "is-free";
                      const seatNo = String(s.seat_label).replace(/[^\d]/g, "") || s.col_number;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`seatmap-seat ${cls}`}
                          disabled={s.taken}
                          onClick={() => toggle(s)}
                          title={s.seat_label}
                        >
                          {seatNo}
                        </button>
                      );
                    });
                  })()}
                </div>
              ))}
              </div>
            </div>

            <div className="seatmap-legend">
              <span><i className="seat-dot free" /> Available</span>
              <span><i className="seat-dot selected" /> Selected</span>
              <span><i className="seat-dot taken" /> Booked</span>
            </div>

            <div className="seatmap-footer">
              <div className="seatmap-summary">
                {selected.length > 0 ? (
                  <>
                    <strong>{selected.map(labelOf).filter(Boolean).join(", ")}</strong>
                    <span>· ₹{Number(ticketType.price) * selected.length}</span>
                  </>
                ) : (
                  <span>No seats selected{limit ? ` · max ${limit}` : ""}</span>
                )}
              </div>
              <button className="btn btn-primary" type="button" onClick={confirm}>
                {selected.length > 0 ? `Confirm ${selected.length} seat${selected.length > 1 ? "s" : ""}` : "Clear seats"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
