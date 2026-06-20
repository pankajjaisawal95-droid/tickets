import { formatDate, formatTime } from "../../utils/serviceHelper.js";
import { resolveImageUrl } from "../../utils/imageUrl.js";
import { downloadTicket, shareTicket } from "../../utils/ticketImage.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useState } from "react";

export default function MyTicketCard({ ticket, onCancel }) {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const cancellable = ticket.cancellable !== false; // default true if absent
  const refundAmount = Number(ticket.refundAmount || 0);
  const isCancelled = ticket.status === "CANCELLED";

  // Refund status chip for cancelled tickets
  const refundChip = (() => {
    if (!isCancelled) return null;
    const amt = Number(ticket.refundedAmount || 0);
    const amtTxt = amt > 0 ? ` · ₹${amt.toLocaleString("en-IN")}` : "";
    switch (ticket.refundStatus) {
      case "COMPLETED":
        return { cls: "refund-done", icon: "check_circle", text: `Refunded${amtTxt}` };
      case "PROCESSING":
      case "INITIATED":
        return { cls: "refund-pending", icon: "schedule", text: `Refund processing${amtTxt}` };
      case "FAILED":
        return { cls: "refund-failed", icon: "error", text: "Refund failed — contact support" };
      default:
        return { cls: "refund-none", icon: "info", text: "Cancelled" };
    }
  })();

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadTicket(ticket);
    } catch (err) {
      console.error("Ticket download failed", err);
      toast.error("Could not generate the ticket. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await shareTicket(ticket);
      if (res?.downloaded) {
        toast.info("Sharing not supported here — ticket image downloaded so you can attach it.");
      }
    } catch (err) {
      console.error("Ticket share failed", err);
      toast.error("Could not share the ticket. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
      setShowModal(false);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <article className={`ticket-portrait-card${isCancelled ? " ticket-cancelled" : ""}`}>

        <div className="ticket-image-wrap">
          <img src={resolveImageUrl(ticket.image)} className="ticket-image" alt="event" />
          <div className="ticket-image-gradient" aria-hidden="true" />
          {isCancelled && <span className="ticket-cancelled-badge">Cancelled</span>}
          <span className="ticket-stub-left" />
          <span className="ticket-stub-right" />
        </div>

        <div className="ticket-body">
          <div className="ticket-date">
            <span className="material-symbols-outlined">calendar_month</span>
            {formatDate(ticket.start_datetime)} · {formatTime(ticket.start_datetime)}
          </div>

          <h3 className="ticket-title">{ticket.event}</h3>

          {ticket.ticketNo && (
            <div className="ticket-no">
              <span className="material-symbols-outlined">tag</span>
              {ticket.ticketNo}
            </div>
          )}

          <div className="ticket-location">
            <span className="material-symbols-outlined">location_on</span>
            {ticket.location || "Location TBA"}
          </div>

          <div className="ticket-qty">
            <span className="material-symbols-outlined">confirmation_number</span>
            {ticket.qty} {ticket.qty === 1 ? "Ticket" : "Tickets"}
          </div>

          {ticket.qty > 0 && (
            <div className="ticket-attendees">
              <div className="ticket-attendees-icons">
                {Array.from({ length: ticket.qty }).map((_, i) => {
                  const scanned = i < (ticket.scannedCount || 0);
                  return (
                    <span
                      key={i}
                      className={`attendee-icon${scanned ? " is-scanned" : ""}`}
                      title={scanned ? "Entered" : "Not entered yet"}
                    >
                      <span className="material-symbols-outlined">
                        {scanned ? "how_to_reg" : "person"}
                      </span>
                    </span>
                  );
                })}
              </div>
              <span className="ticket-attendees-note">
                {ticket.scannedCount > 0
                  ? `${ticket.scannedCount} of ${ticket.qty} entered`
                  : "Not entered yet"}
              </span>
            </div>
          )}

          {ticket.ticketTypes?.length > 0 && (
            <div className="ticket-types-row">
              {ticket.ticketTypes.map((t, i) => (
                <div key={i} className="ticket-type-pill">
                  <span>{t.name}{t.seats ? ` · ${t.seats}` : ""}</span>
                  <strong>×{t.available_ticket}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="ticket-perforation" aria-hidden="true" />

          {!isCancelled && (
            <div className="ticket-qr">
              <img src={resolveImageUrl(ticket.qr)} alt="QR" />
              <p>Scan at entry</p>
            </div>
          )}

          {isCancelled ? (
            <div className={`ticket-refund-chip ${refundChip.cls}`}>
              <span className="material-symbols-outlined">{refundChip.icon}</span>
              {refundChip.text}
            </div>
          ) : (
            <>
              <div className="ticket-buttons">
                <button onClick={handleDownload} disabled={downloading} type="button">
                  <span className="material-symbols-outlined">
                    {downloading ? "hourglass_top" : "download"}
                  </span>
                  {downloading ? "Generating…" : "Download"}
                </button>

                <button className="share-btn" onClick={handleShare} disabled={sharing} type="button">
                  <span className="material-symbols-outlined">
                    {sharing ? "hourglass_top" : "share"}
                  </span>
                  {sharing ? "Sharing…" : "Share"}
                </button>

                <button
                  className="cancel-btn"
                  onClick={() => setShowModal(true)}
                  disabled={!cancellable}
                  title={!cancellable ? ticket.nonCancellableReason || "Cannot cancel" : "Cancel ticket"}
                  type="button"
                >
                  <span className="material-symbols-outlined">close</span>
                  Cancel
                </button>
              </div>

              {!cancellable && ticket.nonCancellableReason && (
                <p className="ticket-cancel-note">{ticket.nonCancellableReason}</p>
              )}
            </>
          )}
        </div>
      </article>

      {showModal && (
        <div className="ticket-modal-overlay" onClick={() => !cancelling && setShowModal(false)}>
          <div className="ticket-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-modal-icon">
              <span className="material-symbols-outlined">warning</span>
            </div>

            <h4>Cancel Ticket?</h4>
            <p>
              Are you sure you want to cancel your ticket for <strong>{ticket.event}</strong>?
              {refundAmount > 0 ? (
                <> A refund of <strong>₹{refundAmount.toLocaleString("en-IN")}</strong> will be
                initiated to your original payment method (5–7 business days).</>
              ) : (
                <> This action cannot be undone.</>
              )}
            </p>

            <div className="ticket-modal-actions">
              <button onClick={() => setShowModal(false)} disabled={cancelling} type="button">
                No, keep it
              </button>

              <button
                className="modal-yes"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                type="button"
              >
                {cancelling ? "Cancelling…" : refundAmount > 0 ? "Yes, cancel & refund" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
