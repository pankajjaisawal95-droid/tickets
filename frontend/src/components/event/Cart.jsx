import { useNavigate } from "react-router-dom";
import { useCartStore } from "../../store/store";
import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { loadRazorpay } from "../../utils/loadRazorpay";
import { getUserLocation } from "../../utils/geolocation";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * Combined cart + checkout sidebar — selection, contact details, coupon, the
 * server-authoritative price quote AND payment all happen here, so booking is a
 * single page (no separate /booking step).
 */
export default function Cart({ event, eventId, userLocation = null }) {
  const cart = useCartStore((state) => state.cart);
  const updateQty = useCartStore((state) => state.updateQty);
  const removeTicket = useCartStore((state) => state.removeTicket);
  const clearCart = useCartStore((state) => state.clearCart);
  const navigate = useNavigate();
  const { isLoggedIn, openLogin, user } = useAuth();
  const toast = useToast();
  const ROZZORPAYKEY = import.meta.env.VITE_RAZORPAY_KEY_ID;

  const [saveDetails, setSaveDetails] = useState(false);
  const [guest, setGuest] = useState({ name: "", city: "", gender: "", mobile: "", email: "" });

  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(true); // T&C pre-checked by default
  const [editContact, setEditContact] = useState(false); // unlock prefilled details

  useEffect(() => {
    if (!isLoggedIn) {
      setGuest({ name: "", city: "", gender: "", mobile: "", email: "" });
      setSaveDetails(false);
      return;
    }

    // 1️⃣ Immediate prefill from local cache + logged-in user
    const savedGuest = localStorage.getItem("guestDetails");
    const parsed = savedGuest ? JSON.parse(savedGuest) : {};

    setGuest({
      name: parsed.name || user?.name || "",
      city: parsed.city || "",
      gender: parsed.gender || "",
      mobile: user?.mobile || parsed.mobile || "",
      email: parsed.email || user?.email || "",
    });

    if (savedGuest) setSaveDetails(true);

    // 2️⃣ Authoritative prefill from DB (details saved for next booking)
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/auth/eventUserDetail");
        const saved = res.data?.data;
        if (cancelled || !saved) return;

        setGuest((prev) => ({
          ...prev,
          name: saved.name || prev.name,
          city: saved.city || prev.city,
          mobile: user?.mobile || saved.whatsapp_no || prev.mobile,
          email: saved.email || prev.email,
        }));
        setSaveDetails(true);
      } catch (err) {
        console.error("Failed to load saved details", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user]);

  // Only the tickets that belong to this event (cart can hold several events').
  const currentEventId = eventId ?? event?.eventId;
  const items = Object.values(cart).filter(
    (i) => String(i.eventId) === String(currentEventId)
  );

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const subtotalEstimate = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const cartEmpty = items.length === 0;

  // Reserved-seat lines hold specific seats; GA lines just hold quantity. The
  // hold-timer copy is worded accordingly ("seats" vs "tickets").
  const hasSeated = items.some((i) => i.seatingMode === "SEATED");

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim());
  const isFormValid =
    guest.name.trim().length > 0 &&
    guest.city.trim().length > 0 &&
    guest.mobile.length === 10 &&
    isEmailValid;

  // SEATED lines carry seatIds; the server derives quantity from them.
  const ticketsPayload = items
    .map((i) => {
      const line = { ticketTypeId: parseInt(i.id, 10), quantity: parseInt(i.qty, 10) };
      if (i.seatingMode === "SEATED" && Array.isArray(i.seatIds)) {
        line.seatIds = i.seatIds.map((s) => parseInt(s, 10));
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
        couponCode: coupon.trim() || null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, event?.id, JSON.stringify(ticketsPayload), coupon]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "mobile" && !/^\d*$/.test(value)) return;
    const updatedGuest = { ...guest, [name]: value };
    setGuest(updatedGuest);
    if (saveDetails) localStorage.setItem("guestDetails", JSON.stringify(updatedGuest));
  };

  const handleSaveToggle = () => {
    const newValue = !saveDetails;
    setSaveDetails(newValue);
    if (newValue) localStorage.setItem("guestDetails", JSON.stringify(guest));
    else localStorage.removeItem("guestDetails");
  };

  const grandTotal = quote ? quote.total : subtotalEstimate;
  const isFreeOrder = isLoggedIn && !!quote && Number(grandTotal) <= 0;
  const canPay =
    !cartEmpty && !loading && (!isLoggedIn || (isFormValid && !!quote && !quoting && agreed));

  const handlePay = async () => {
    if (!isLoggedIn) {
      openLogin(guest.mobile);
      return;
    }
    if (cartEmpty || loading) return;
    if (!isFormValid) {
      toast.error("Enter your name, city, a valid 10-digit mobile and email");
      return;
    }
    if (!agreed) {
      toast.error("Please accept the Terms & Conditions to continue");
      return;
    }

    setLoading(true);
    try {
      /* 1️⃣ Save contact details (needed for the ticket email). Already-registered
            is fine; any other failure aborts before we charge. */
      try {
        const payload = {
          name: guest.name.trim(),
          city: guest.city?.trim() || "",
          email: guest.email?.trim() || "",
          mobile: guest.mobile,
          event_id: String(event.id),
        };
        if (saveDetails) payload.sync_user_data = "1";
        await api.post("/auth/addEventUserDetail", payload);
      } catch (e) {
        const msg = e.response?.data?.message;
        if (!msg?.includes("already registered")) {
          toast.error(msg || "Could not save your details");
          setLoading(false);
          return;
        }
      }

      /* 2️⃣ Create the order (server prices it authoritatively).
            Attach the visitor's address so it's stored against the order. Use
            the location captured on page load; fall back to a fresh lookup
            (best-effort — never blocks checkout). */
      let location = userLocation;
      if (!location) {
        try {
          location = await getUserLocation();
        } catch {
          location = null;
        }
      }

      const eventIdNum = event?.id || event?._id;
      const { data } = await api.post("/order/create-order", {
        eventId: eventIdNum,
        tickets: ticketsPayload,
        couponCode: coupon.trim() || null,
        location,
      });
      const order = data?.data;
      if (!order?.bookingId) throw new Error("Order creation failed");

      /* 3️⃣ FREE booking — skip the gateway */
      if (order.free || Number(order.amount) <= 0) {
        await api.post("/order/confirm-free", { bookingId: order.bookingId });
        clearCart();
        toast.success("Booking confirmed");
        navigate("/my-tickets");
        setLoading(false);
        return;
      }

      /* 4️⃣ PAID booking — Razorpay checkout */
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error("Razorpay SDK failed to load");
      if (!order.orderId) throw new Error("Order creation failed");

      const options = {
        key: ROZZORPAYKEY,
        order_id: order.orderId,
        amount: Math.round(order.amount * 100),
        currency: order.breakdown?.currency || "INR",
        name: "Sanskar Events",
        description: "Event Ticket Booking",
        handler: async (response) => {
          try {
            await api.post("/order/verify-payment", { ...response, bookingId: order.bookingId });
            clearCart();
            toast.success("Booking confirmed");
            navigate("/my-tickets");
          } catch {
            toast.error("Payment verification failed");
          } finally {
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
        theme: { color: "#4647d3" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed");
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="cart card shadow-sm p-3">
      <div className="cart-head">
        <h4>Your Cart</h4>
        {totalQty > 0 && <span className="cart-count">{totalQty}</span>}
      </div>

      {cartEmpty && (
        <div className="cart-empty">
          <span className="material-symbols-outlined">shopping_cart</span>
          <p>No tickets selected yet</p>
          <span>Pick a ticket from the list to begin.</span>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id + item.title + item.price} className="cart-line">
          <div className="cart-line-info">
            <strong>{item.title}</strong>
            <div className="cart-line-meta">
              ₹{item.price} × {item.qty}
            </div>
            {item.seatingMode === "SEATED" && item.seatLabels?.length > 0 && (
              <div className="cart-line-seats">
                <span className="material-symbols-outlined">event_seat</span>
                {item.seatLabels.join(", ")}
              </div>
            )}
          </div>

          {item.seatingMode === "SEATED" ? (
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => removeTicket(item.id)}
              aria-label="Remove"
              type="button"
            >Remove</button>
          ) : (
            <div className="cart-line-qty">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => updateQty(item.id, item.qty - 1)}
                aria-label="Decrease"
                type="button"
              >−</button>
              <span>{item.qty}</span>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => updateQty(item.id, item.qty + 1)}
                aria-label="Increase"
                type="button"
              >+</button>
            </div>
          )}
        </div>
      ))}

      {/* Coupon */}
      {!cartEmpty && isLoggedIn && (
        <div className="mt-2">
          <input
            type="text"
            className="form-control"
            placeholder="Coupon code (optional)"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
          />
        </div>
      )}

      {!cartEmpty && <hr className="cart-divider" />}

      {/* Pricing breakdown — all numbers from the server quote */}
      {!cartEmpty && (
        <>
          <div className="cart-row">
            <span>Subtotal</span>
            <strong>{inr(quote ? quote.subtotal : subtotalEstimate)}</strong>
          </div>

          {quote?.discount_amount > 0 && (
            <div className="cart-row cart-row-discount">
              <span>
                <span className="material-symbols-outlined">local_offer</span>
                Discount{quote.discount_code ? ` (${quote.discount_code})` : ""}
              </span>
              <strong>−{inr(quote.discount_amount)}</strong>
            </div>
          )}

          {quote?.convenience_fee > 0 && (
            <div className="cart-row">
              <span>Convenience fee</span>
              <strong>+{inr(quote.convenience_fee)}</strong>
            </div>
          )}

          {quote?.tax_amount > 0 && (
            <div className="cart-row">
              <span>GST{quote.gst_inclusive ? " (incl.)" : ""}</span>
              <strong>{quote.gst_inclusive ? "" : "+"}{inr(quote.tax_amount)}</strong>
            </div>
          )}

          {!quote && isLoggedIn && (
            <div className="cart-row" style={{ opacity: 0.7 }}>
              <span>{quoting ? "Calculating taxes…" : "Taxes calculated at checkout"}</span>
            </div>
          )}

          <div className="cart-row cart-row-total">
            <span>Total Amount</span>
            <strong>{inr(grandTotal)}</strong>
          </div>
        </>
      )}

      {quoteError && (
        <div style={{ color: "#c0392b", fontSize: 13, margin: "6px 0" }}>{quoteError}</div>
      )}

      {/* RECEIVE YOUR TICKET */}
      <div className="guest-event-form mt-3">
        <h5 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined">person</span>
            Receive Your Ticket
          </span>
          {isLoggedIn && (guest.mobile || guest.email) && (
            <button
              type="button"
              className="contact-edit-btn"
              onClick={() => setEditContact((v) => !v)}
            >
              <span className="material-symbols-outlined">{editContact ? "check" : "edit"}</span>
              {editContact ? "Done" : "Edit"}
            </button>
          )}
        </h5>

        <div>
          <input
            type="text"
            className="form-control"
            placeholder="Full Name *"
            name="name"
            value={guest.name}
            onChange={handleChange}
            readOnly={isLoggedIn && !editContact && !!guest.name}
          />
        </div>

        <div className="mt-2">
          <input
            type="text"
            className="form-control"
            placeholder="City *"
            name="city"
            value={guest.city}
            onChange={handleChange}
            readOnly={isLoggedIn && !editContact && !!guest.city}
          />
        </div>

        <div className="mt-2">
          <input
            type="tel"
            className="form-control"
            placeholder="WhatsApp Mobile Number *"
            name="mobile"
            maxLength="10"
            value={guest.mobile}
            onChange={handleChange}
            readOnly={isLoggedIn && !editContact && !!guest.mobile}
          />
        </div>

        <div className="mt-2">
          <input
            type="email"
            className="form-control"
            placeholder="Email *"
            name="email"
            value={guest.email}
            onChange={handleChange}
            readOnly={isLoggedIn && !editContact && !!guest.email}
            required
          />
        </div>

        <div className="form-check mt-3 save-details-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={saveDetails}
            onChange={handleSaveToggle}
            id="saveDetails"
          />
          <label className="form-check-label" htmlFor="saveDetails">
            Save details for next booking
          </label>
        </div>
      </div>

      {!cartEmpty && isLoggedIn && (
        <div className="form-check mt-3 save-details-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            id="agreeTerms"
          />
          <label className="form-check-label" htmlFor="agreeTerms">
            I agree to the{" "}
            <a href="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</a>
          </label>
        </div>
      )}

      <button
        className="btn btn-primary w-100 mt-3 cart-checkout-btn"
        disabled={!canPay}
        onClick={handlePay}
        type="button"
      >
        {loading ? (
          <>Processing…</>
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

      {!cartEmpty && (
        <div className="cart-trust" style={{ marginTop: 10, fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#b45309" }}>schedule</span>
          {hasSeated
            ? `Your seats are reserved for 5 minutes once you proceed to ${Number(grandTotal) <= 0 ? "book" : "pay"}.`
            : `Your tickets are held for 5 minutes once you proceed to ${Number(grandTotal) <= 0 ? "book" : "pay"}.`}
        </div>
      )}

      {!cartEmpty && (
        <div className="cart-trust" style={{ marginTop: 8, fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#0f7e3b" }}>verified_user</span>
          {isFreeOrder ? "No payment required · instant confirmation" : "Secure payment via Razorpay · 256-bit SSL"}
        </div>
      )}
    </div>
  );
}
