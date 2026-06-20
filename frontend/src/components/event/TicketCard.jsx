import { useState } from "react";
import { useCartStore } from "../../store/store";
import { resolveImageUrl } from "../../utils/imageUrl";
import SeatMapModal from "./SeatMapModal";

export default function TicketCard({ id, eventId, title, price, seats, totalSeats, maxPerUser, userHeld, image, description, seatingMode }) {
  const cart = useCartStore((s) => s.cart);
  const addTicket = useCartStore((s) => s.addTicket);
  const updateQty = useCartStore((s) => s.updateQty);

  const isSeated = seatingMode === "SEATED";
  const [seatPicker, setSeatPicker] = useState(false);

  const qty = cart[id]?.qty || 0;
  const seatsLeft = seats - qty;
  const soldOut = seatsLeft <= 0;
  // Free (price === 0) and paid tickets share the SAME cart → checkout flow;
  // payment is skipped server-side when the order total is 0.
  // Per-user cap (NULL/0 = unlimited). The server is authoritative and also
  // counts the user's prior bookings; this just stops over-adding in the cart.
  const limit = maxPerUser != null && Number(maxPerUser) > 0 ? Number(maxPerUser) : null;

  // `held` = tickets of this type the logged-in user already booked in earlier
  // orders (from the server). The cap is cumulative, so what they may still add
  // = limit − held − what's already in the cart. When that hits 0 we disable
  // "add" up front and explain why, instead of letting checkout fail later.
  const held = Math.max(0, Number(userHeld) || 0);
  const canStillAdd = limit != null ? Math.max(0, limit - held - qty) : Infinity;
  const limitReached = limit != null && qty + held >= limit;

  // How FULL this ticket type is (% sold of capacity), based on the server's
  // numbers (available_quantity can arrive as a string). Used only to pick the
  // status copy below — the raw % is never shown. `null` when capacity unknown.
  const totalQty = Number(totalSeats) || 0;
  const availQty = Math.max(0, Number(seats) || 0);
  const fullPct =
    totalQty > 0
      ? Math.min(100, Math.round(((totalQty - availQty) / totalQty) * 100))
      : null;

  // Status copy + colour band. Four tiers (Sold Out is handled separately).
  const fullStatus =
    fullPct == null
      ? null
      : fullPct <= 25
      ? { text: "Be an early bird", level: "low" }
      : fullPct <= 50
      ? { text: "Selling fast", level: "mid" }
      : fullPct <= 75
      ? { text: "Filling up fast", level: "high" }
      : { text: "Almost full — few tickets left", level: "high" };

  return (
    <article className={`event-card ticket-card ${soldOut ? "disabled" : ""}`}>
      <div className="ticket-card-media">
        <img
          src={resolveImageUrl(image) || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819"}
          alt={title}
        />
        <div className="ticket-card-gradient" aria-hidden="true" />
        {soldOut ? (
          <span className="ticket-status-pill ticket-sold">
            <span className="material-symbols-outlined">block</span> Sold Out
          </span>
        ) : seatsLeft <= 5 ? (
          <span className="ticket-status-pill ticket-low">
            <span className="ticket-low-dot" />
            Only {seatsLeft} left
          </span>
        ) : (
          <span className="ticket-status-pill ticket-available">
            <span className="material-symbols-outlined">check_circle</span>
            Available
          </span>
        )}
      </div>

      <div className="event-content ticket-card-body">
        {limit != null && held > 0 && (
          <div
            className={`ticket-held-note ${limitReached ? "is-maxed" : ""}`}
            role="status"
          >
            <span className="material-symbols-outlined">
              {limitReached ? "info" : "confirmation_number"}
            </span>
            {limitReached
              ? `You've reached your limit of ${limit} for this pass — you already booked ${held}.`
              : `You already booked ${held} of ${limit}. You can add ${limit - held} more.`}
          </div>
        )}

        <div className="ticket-card-head">
          <h3>{title}</h3>
          <div className="ticket-card-price">
            {price > 0 ? (
              <>
                <span className="ticket-price-amount">₹{price}</span>
                <span className="ticket-price-unit">per ticket</span>
              </>
            ) : (
              <span className="ticket-price-free">Free</span>
            )}
          </div>
        </div>

        {description && <p className="sub">{description}</p>}

        {!soldOut && fullStatus != null && (
          <div className={`ticket-avail ticket-avail-${fullStatus.level}`}>
            <div className="ticket-avail-head">
              <span className="ticket-avail-label">
                <span className="material-symbols-outlined">local_fire_department</span>
                {fullStatus.text}
              </span>
            </div>
            <div
              className="ticket-avail-track"
              role="progressbar"
              aria-valuenow={fullPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={fullStatus.text}
            >
              <span className="ticket-avail-fill" style={{ width: `${fullPct}%` }} />
            </div>
          </div>
        )}

        <div className="seats">
          {soldOut ? (
            <span className="full">
              <span className="material-symbols-outlined">block</span> SOLD OUT
            </span>
          ) :
          //  (
          //   <>
          //     <span className="material-symbols-outlined">event_seat</span>
          //     Tickets Available: <strong>{seatsLeft}</strong>
          //   </>
          // )
            null
          }
        </div>

        {!soldOut && isSeated && (
          <>
            <button
              className="btn btn-primary w-100 ticket-seat-btn"
              type="button"
              disabled={limitReached && qty === 0}
              onClick={() => setSeatPicker(true)}
            >
              <span className="material-symbols-outlined">event_seat</span>
              {qty > 0
                ? `Seats: ${cart[id]?.seatLabels?.join(", ")}`
                : limitReached
                ? "Limit reached"
                : "Select seats"}
            </button>

            {limit != null && (
              <p className="sub ticket-limit-note">
                {`Up to ${limit} seat${limit > 1 ? "s" : ""} per user`}
              </p>
            )}
          </>
        )}

        {!soldOut && !isSeated && (
          <>
            <div className="qty">
              <button
                disabled={qty === 0}
                onClick={() => updateQty(id, qty - 1)}
                aria-label="Decrease"
                type="button"
              >−</button>

              <span>{qty}</span>

              <button
                disabled={seatsLeft === 0 || limitReached}
                onClick={() =>
                  qty === 0
                    ? addTicket({ id, eventId, title, price, seats, maxPerUser: limit })
                    : updateQty(id, qty + 1)
                }
                aria-label="Increase"
                type="button"
              >+</button>
            </div>

            {limit != null && (
              <p className="sub ticket-limit-note">
                {limitReached
                  ? `Max ${limit} per user reached`
                  : held > 0
                  ? `${canStillAdd} more allowed (limit ${limit} per user)`
                  : `Limit ${limit} per user`}
              </p>
            )}
          </>
        )}
      </div>

      {seatPicker && (
        <SeatMapModal
          ticketType={{ id, name: title, price, max_per_user: maxPerUser }}
          eventId={eventId}
          onClose={() => setSeatPicker(false)}
        />
      )}
    </article>
  );
}
