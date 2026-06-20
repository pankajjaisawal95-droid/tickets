import "./myTickets.css";
import MyTicketCard from "./MyTicketCard";
import { resolveImageUrl } from "../../utils/imageUrl.js";
import api from "../../components/api/axios";
import { useToast } from "../../context/ToastContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function MyTickets() {
  const toast = useToast();
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");

  // Logging out (or visiting without a session) drops you back to the home page.
  useEffect(() => {
    if (!isLoggedIn) navigate("/", { replace: true });
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data } = await api.get("/ticket/my-ticket");
      setTickets(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cancelTicket = async (ticketId) => {
    try {
      const { data } = await api.post("/ticket/cancle-ticket", { ticketId });

      setTickets((prev) =>
        prev.filter((t) => t.ticket_id !== ticketId)
      );

      const refund = data?.data?.refund;
      toast.success(
        refund
          ? `Ticket cancelled. Refund of ₹${Number(refund.amount).toLocaleString("en-IN")} initiated (5–7 business days).`
          : "Ticket cancelled."
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to cancel ticket");
      throw err; // keep modal open on failure
    }
  };

  if (loading) {
    return (
      <main>
        <div className="kc-loading">Loading your tickets…</div>
      </main>
    );
  }

  const now = new Date();

  const active = tickets.filter((t) => t.status !== "CANCELLED");
  const cancelledTickets = tickets.filter((t) => t.status === "CANCELLED");

  const upcomingTickets = active.filter(
    (t) => new Date(t.end_datetime) >= now
  );

  const previousTickets = active.filter(
    (t) => new Date(t.end_datetime) < now
  );

  const visibleTickets =
    activeTab === "upcoming"
      ? upcomingTickets
      : activeTab === "previous"
      ? previousTickets
      : cancelledTickets;

  return (
    <main>
      <header className="mytickets-hero">
        <div className="mytickets-hero-glow" aria-hidden="true" />
        <div className="mytickets-hero-inner">
          <span className="kc-eyebrow" style={{ color: "rgba(255,255,255,0.92)" }}>
            Your Library
          </span>
          <h1>My Tickets</h1>
          <p>Every experience you've collected, in one cinematic shelf.</p>
        </div>
      </header>

      <div className="mytickets-shell">
        <div className="ticket-tabs">
          <button
            className={activeTab === "upcoming" ? "active" : ""}
            onClick={() => setActiveTab("upcoming")}
            type="button"
          >
            <span className="material-symbols-outlined">event_upcoming</span>
            Upcoming
            <span className="ticket-tab-count">{upcomingTickets.length}</span>
          </button>

          <button
            className={activeTab === "previous" ? "active" : ""}
            onClick={() => setActiveTab("previous")}
            type="button"
          >
            <span className="material-symbols-outlined">history</span>
            Previous
            <span className="ticket-tab-count">{previousTickets.length}</span>
          </button>

          <button
            className={activeTab === "cancelled" ? "active" : ""}
            onClick={() => setActiveTab("cancelled")}
            type="button"
          >
            <span className="material-symbols-outlined">cancel</span>
            Cancelled
            <span className="ticket-tab-count">{cancelledTickets.length}</span>
          </button>
        </div>

        {!visibleTickets.length && (
          <div className="tickets-empty mytickets-empty">
            <span className="material-symbols-outlined">confirmation_number</span>
            <p>No {activeTab} tickets yet</p>
            <span className="mytickets-empty-sub">
              {activeTab === "upcoming"
                ? "Book an experience to fill this space."
                : "Tickets you've used will appear here."}
            </span>
          </div>
        )}

        <div className="mytickets-grid">
          {visibleTickets.map((t) => (
            <MyTicketCard
              key={t.ticket_id}
              ticket={{
                id: t.ticket_id,
                ticketNo: t.ticket_no,
                event: t.event_name,
                start_datetime: t.start_datetime,
                end_datetime: t.end_datetime,
                // total tickets in this booking = still-valid + already scanned
                qty: (Number(t.available_ticket) || 0) + (Number(t.used_ticket) || 0),
                scannedCount: Number(t.used_ticket) || 0,
                image: resolveImageUrl(t.image),
                location: t.venue,
                ticketTypes: t.ticketDetail,
                status: t.status,
                cancellable: t.cancellable,
                nonCancellableReason: t.non_cancellable_reason,
                refundAmount: t.refund_amount,
                refundStatus: t.refund_status,
                refundedAmount: t.refunded_amount,
                qr: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${t.qr_hash}`,
              }}
              onCancel={() => cancelTicket(t.ticket_id)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
