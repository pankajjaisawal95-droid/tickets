import { useEffect, useRef } from "react";
import { useCartStore } from "../../store/store";
import TicketCard from "./TicketCard";

export default function TicketTypes({ ticketTypes = [], eventId }) {
  const addTicket = useCartStore((s) => s.addTicket);
  const didAutoAdd = useRef(false);

  // When an event has exactly ONE ticket type, pre-select it with qty 1 so the
  // user can head straight to checkout. Runs only once (guarded by the ref) so
  // it doesn't fight the user if they later remove the ticket, and it skips a
  // ticket that's already in the cart or sold out.
  useEffect(() => {
    if (didAutoAdd.current) return;
    if (ticketTypes.length !== 1) return; // wait for data / skip multi-type events

    const only = ticketTypes[0];
    if (!only) return;
    if (only.seating_mode === "SEATED") return; // seated types need explicit seat picks
    didAutoAdd.current = true;

    const inCart = useCartStore.getState().cart[only.id];
    if (inCart) return; // already added (e.g. persisted cart)
    if (Number(only.available_quantity) <= 0) return; // sold out

    // Don't auto-add if the user has already used up their per-user allowance
    // in earlier orders — they'd just hit the cap at checkout.
    const cap = Number(only.max_per_user) || 0;
    if (cap > 0 && Number(only.user_held) >= cap) return;

    addTicket({
      id: only.id,
      eventId,
      title: only.name,
      price: only.price,
      seats: only.available_quantity,
      maxPerUser: only.max_per_user,
    });
  }, [ticketTypes, eventId, addTicket]);

  return (
    <div id="tickets">
      <span className="kc-eyebrow">Choose Your Pass</span>
      <h2 className="ticket-heading">Types of Tickets</h2>

      {ticketTypes.length === 0 && (
        <div className="tickets-empty">
          <span className="material-symbols-outlined">confirmation_number</span>
          <p>No ticket types available yet.</p>
        </div>
      )}

      <div className="event-grid">
        {ticketTypes.map((type) => (
          <TicketCard
            key={type.id}
            id={type.id}
            eventId={eventId}
            title={type.name}
            price={type.price}
            seats={type.available_quantity}
            totalSeats={type.total_quantity}
            maxPerUser={type.max_per_user}
            userHeld={type.user_held}
            seatingMode={type.seating_mode}
            description={type.description}
            image={
              type.image ||
              "https://images.unsplash.com/photo-1514525253161-7a46d19cd819"
            }
          />
        ))}
      </div>
    </div>
  );
}
