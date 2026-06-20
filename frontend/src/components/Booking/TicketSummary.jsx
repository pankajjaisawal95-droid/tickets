import { useCartStore } from "../../store/store";
import { useAuth } from "../../context/AuthContext";
import { loadRazorpay } from "../../utils/loadRazorpay";
import api from "../api/axios";
import { useState, useEffect } from "react";
import "./booking.css";
import { useNavigate } from "react-router-dom";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function TicketSummary({ event }) {
  const cart = useCartStore((state) => state.cart);
  const clearCart = useCartStore((state) => state.clearCart);
  const { isLoggedIn, openLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const ROZZORPAYKEY = import.meta.env.VITE_RAZORPAY_KEY_ID;
  // Only price/charge tickets that belong to this event — the cart can hold
  // tickets from other events the user browsed earlier.
  const currentEventId = event?.eventId ?? event?.id;
  const items = Object.entries(cart).filter(
    ([, item]) => String(item.eventId) === String(currentEventId)
  );
  const navigate = useNavigate();

  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);

  // Pre-login / pre-quote estimate (factual: just qty × price). All real totals
  // (discount, GST, fee, grand total) come from the server quote.
  const subtotalEstimate = items.reduce((s, [, i]) => s + i.qty * i.price, 0);

  const ticketsPayload = items
    .map(([ticketTypeId, item]) => {
      const line = {
        ticketTypeId: parseInt(ticketTypeId, 10),
        quantity: parseInt(item.qty, 10)
      };
      // SEATED lines carry their chosen seats; the server derives quantity from them.
      if (item.seatingMode === "SEATED" && Array.isArray(item.seatIds)) {
        line.seatIds = item.seatIds.map((s) => parseInt(s, 10));
      }
      return line;
    })
    .filter((t) => t.quantity > 0);

  /* ---- server-authoritative quote (no client math) ---- */
  useEffect(() => {
    if (!isLoggedIn || !event?.id || ticketsPayload.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError("");

    api
      .post("/order/quote", {
        eventId: event.id,
        tickets: ticketsPayload,
        couponCode: coupon.trim() || null
      })
      .then((res) => {
        if (cancelled) return;
        setQuote(res.data?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(err.response?.data?.message || "Could not price this order");
      })
      .finally(() => !cancelled && setQuoting(false));

    return () => {
      cancelled = true;
    };
    // re-quote when cart contents or coupon change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, event?.id, JSON.stringify(ticketsPayload), coupon]);

  const handlePay = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    if (!items.length || loading) return;

    setLoading(true);
    try {
      const eventId = event?.id || event?._id;
      if (!eventId) throw new Error("Invalid event");

      const { data } = await api.post("/order/create-order", {
        eventId,
        tickets: ticketsPayload,
        couponCode: coupon.trim() || null
      });

      const order = data?.data;
      if (!order?.bookingId) throw new Error("Order creation failed");

      /* FREE booking — nothing to collect, skip the payment gateway entirely */
      if (order.free || Number(order.amount) <= 0) {
        try {
          await api.post("/order/confirm-free", { bookingId: order.bookingId });
          clearCart();
          alert("Booking Confirmed ✅");
          navigate("/my-tickets");
        } catch (e) {
          alert(e.response?.data?.message || "Could not confirm free booking ❌");
        } finally {
          setLoading(false);
        }
        return;
      }

      /* PAID booking — Razorpay checkout */
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error("Razorpay SDK failed to load");
      if (!order.orderId) throw new Error("Order creation failed");

      const options = {
        key: ROZZORPAYKEY,
        order_id: order.orderId,
        amount: Math.round(order.amount * 100), // server total (gateway uses order amount)
        currency: order.breakdown?.currency || "INR",
        name: "Sanskar Events",
        description: "Event Ticket Booking",
        handler: async (response) => {
          try {
            await api.post("/order/verify-payment", {
              ...response,
              bookingId: order.bookingId
            });
            clearCart();
            alert("Booking Confirmed ✅");
            navigate("/my-tickets");
          } catch {
            alert("Payment verification failed ❌");
          } finally {
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
        theme: { color: "#4647d3" }
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        alert("Payment failed ❌");
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const grandTotal = quote ? quote.total : subtotalEstimate;
  const isFreeOrder = isLoggedIn && !!quote && Number(grandTotal) <= 0;
  const canPay = items.length > 0 && !loading && (!isLoggedIn || (!!quote && !quoting));

  return (
    <aside className="booking-right">
      <div className="booking-right-head">
        <span className="kc-eyebrow">Final Step</span>
        <h3>Order Summary</h3>
      </div>

      {!items.length && (
        <div className="booking-summary-empty">
          <span className="material-symbols-outlined">receipt_long</span>
          <p>No tickets selected</p>
        </div>
      )}

      {/* Ticket list */}
      {items.length > 0 && (
        <div className="booking-summary-list">
          {items.map(([ticketTypeId, item]) => (
            <div className="summary-row" key={ticketTypeId}>
              <span className="summary-name">
                <span className="summary-bullet" />
                <span>
                  {item.title}
                  <span className="summary-x">× {item.qty}</span>
                  {item.seatingMode === "SEATED" && item.seatLabels?.length > 0 && (
                    <span className="summary-seats">Seats: {item.seatLabels.join(", ")}</span>
                  )}
                </span>
              </span>
              <span className="summary-amount">{inr(item.qty * item.price)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Coupon */}
      {items.length > 0 && isLoggedIn && (
        <div className="checkout-coupon">
          <input
            type="text"
            className="form-control"
            placeholder="Coupon code (optional)"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
          />
        </div>
      )}

      {/* Pricing breakdown — ALL numbers from the server quote */}
      {items.length > 0 && (
        <div className="checkout-breakdown">
          <div className="breakdown-row">
            <span>Subtotal</span>
            <strong>{inr(quote ? quote.subtotal : subtotalEstimate)}</strong>
          </div>

          {quote?.discount_amount > 0 && (
            <div className="breakdown-row breakdown-discount">
              <span>
                <span className="material-symbols-outlined">local_offer</span>
                Discount{quote.discount_code ? ` (${quote.discount_code})` : ""}
              </span>
              <strong>−{inr(quote.discount_amount)}</strong>
            </div>
          )}

          {quote?.convenience_fee > 0 && (
            <div className="breakdown-row">
              <span>Convenience fee</span>
              <strong>+{inr(quote.convenience_fee)}</strong>
            </div>
          )}

          {quote?.tax_amount > 0 && (
            <div className="breakdown-row">
              <span>GST{quote.gst_inclusive ? " (incl.)" : ""}</span>
              <strong>{quote.gst_inclusive ? "" : "+"}{inr(quote.tax_amount)}</strong>
            </div>
          )}

          {!quote && isLoggedIn && (
            <div className="breakdown-row" style={{ opacity: 0.7 }}>
              <span>{quoting ? "Calculating taxes…" : "Taxes calculated at checkout"}</span>
            </div>
          )}
        </div>
      )}

      {quoteError && (
        <div className="checkout-quote-error" style={{ color: "#c0392b", fontSize: 13, margin: "6px 0" }}>
          {quoteError}
        </div>
      )}

      {/* Grand total */}
      <div className="total-row">
        <span>Total Payable</span>
        <span className="total-amount">{inr(grandTotal)}</span>
      </div>

      <button
        className="pay-btn"
        onClick={handlePay}
        disabled={!canPay}
        type="button"
      >
        {loading ? (
          <span className="kc-btn-loading">
            <span className="kc-btn-spinner" /> Processing…
          </span>
        ) : !isLoggedIn ? (
          <>
            <span className="material-symbols-outlined">login</span>
            Login to Continue
          </>
        ) : isFreeOrder ? (
          <>
            <span className="material-symbols-outlined">how_to_reg</span>
            Confirm Free Booking
          </>
        ) : (
          <>
            <span className="material-symbols-outlined">lock</span>
            Proceed to Pay · {inr(grandTotal)}
          </>
        )}
      </button>

      <div className="booking-trust">
        <span className="material-symbols-outlined">verified_user</span>
        {isFreeOrder
          ? "No payment required · instant confirmation"
          : "Secure payment via Razorpay · 256-bit SSL"}
      </div>

      {!isFreeOrder && (
        <div className="checkout-pay-methods">
          <span>We accept</span>
          <div className="checkout-pay-icons">
            <span>UPI</span>
            <span>Cards</span>
            <span>Netbanking</span>
            <span>Wallets</span>
          </div>
        </div>
      )}
    </aside>
  );
}
