import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useCartStore = create(
  persist(
    (set) => ({
      cart: {},

      /* ADD TICKET (WITH SEAT + PER-USER LIMIT) */
      addTicket: (ticket) =>
        set((state) => {
          const existing = state.cart[ticket.id];
          const currentQty = existing ? existing.qty : 0;

          // 🔥 SEAT LIMIT CHECK
          if (currentQty >= ticket.seats) {
            return state;
          }

          // 🔥 PER-USER LIMIT CHECK (NULL/0 = unlimited)
          const maxPerUser =
            ticket.maxPerUser != null && Number(ticket.maxPerUser) > 0
              ? Number(ticket.maxPerUser)
              : null;
          if (maxPerUser != null && currentQty >= maxPerUser) {
            return state;
          }

          return {
            cart: {
              ...state.cart,
              [ticket.id]: {
                ...ticket,
                qty: currentQty + 1,
                availableSeats: ticket.seats,
                maxPerUser,
              },
            },
          };
        }),

      /* UPDATE QTY (WITH SEAT + PER-USER LIMIT) */
      updateQty: (ticketId, qty) =>
        set((state) => {
          const cart = { ...state.cart };
          const item = cart[ticketId];

          if (!item) return state;

          // remove item
          if (qty <= 0) {
            delete cart[ticketId];
            return { cart };
          }

          // 🔥 SEAT LIMIT CHECK
          if (qty > item.availableSeats) {
            return state;
          }

          // 🔥 PER-USER LIMIT CHECK
          if (item.maxPerUser != null && qty > item.maxPerUser) {
            return state;
          }

          cart[ticketId] = {
            ...item,
            qty,
          };

          return { cart };
        }),

      /* SET SEATS (reserved-seat ticket types) — qty is the seat count. Passing
         an empty seat list removes the item from the cart. */
      setSeats: (item, seatIds, seatLabels) =>
        set((state) => {
          const cart = { ...state.cart };
          if (!Array.isArray(seatIds) || seatIds.length === 0) {
            delete cart[item.id];
            return { cart };
          }
          cart[item.id] = {
            ...cart[item.id],
            ...item,
            seatingMode: "SEATED",
            seatIds,
            seatLabels,
            qty: seatIds.length,
          };
          return { cart };
        }),

      /* REMOVE TICKET */
      removeTicket: (ticketId) =>
        set((state) => {
          const cart = { ...state.cart };
          delete cart[ticketId];
          return { cart };
        }),

      /* CLEAR CART */
      clearCart: () => set({ cart: {} }),
    }),
    {
      name: "cart-storage", // 🔑 localStorage key
      version: 2,
      // v2: cart items are now tagged with `eventId` so each event's tickets
      // are isolated. Old (untagged) carts can't be scoped, so drop them.
      migrate: () => ({ cart: {} }),
    }
  )
);
