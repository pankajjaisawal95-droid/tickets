import TicketSummary from "../components/Booking/TicketSummary";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { formatDate, formatTime } from "../utils/serviceHelper";
import { resolveImageUrl } from "../utils/imageUrl";
import "../components/event/preview.css";

export default function Booking() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const event = state?.event;

  if (!event) {
    return (
      <main>
        <div className="event-empty">
          <span className="material-symbols-outlined">receipt_long</span>
          <h2>No order in progress</h2>
          <p>Pick an event first, then your tickets, then return here to checkout.</p>
          <Link to="/" className="kc-btn kc-btn-primary" style={{ marginTop: 12 }}>
            <span className="material-symbols-outlined">storefront</span>
            Explore events
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      {/* SLIM RECAP HEADER */}
      <header className="checkout-header">
        <div className="checkout-header-inner">
          <button
            className="select-back"
            onClick={() => navigate(-1)}
            type="button"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span>Back to tickets</span>
          </button>

          <div className="select-stepper">
            <span className="select-step is-done">
              <span className="material-symbols-outlined">check</span>
              Details
            </span>
            <span className="select-step-bar" />
            <span className="select-step is-done">
              <span className="material-symbols-outlined">check</span>
              Tickets
            </span>
            <span className="select-step-bar" />
            <span className="select-step is-active">
              <span>3</span>
              Payment
            </span>
          </div>
        </div>

        <div className="checkout-header-event">
          <img src={resolveImageUrl(event.banner_url)} alt={event.title} className="checkout-header-img" />
          <div className="checkout-header-meta">
            <span className="kc-eyebrow">Step 3 · Final review</span>
            <h1>{event.title}</h1>
            <div className="checkout-header-info">
              <span>
                <span className="material-symbols-outlined">calendar_month</span>
                {formatDate(event.start_datetime)}
              </span>
              <span>
                <span className="material-symbols-outlined">schedule</span>
                {formatTime(event.start_datetime)}
              </span>
              <span>
                <span className="material-symbols-outlined">location_on</span>
                {event.venue}{event.city && `, ${event.city}`}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="booking-layout">
        <div className="checkout-left">

          <article className="checkout-card">
            <span className="kc-eyebrow">Your order</span>
            <h2>Event details</h2>

            <ul className="booking-meta-list checkout-meta-list">
              <li>
                <span className="material-symbols-outlined">calendar_month</span>
                <div>
                  <span className="meta-label">Date</span>
                  <strong>{formatDate(event.start_datetime)}</strong>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined">schedule</span>
                <div>
                  <span className="meta-label">Time</span>
                  <strong>{formatTime(event.start_datetime)} to {formatTime(event.end_datetime)}</strong>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined">location_on</span>
                <div>
                  <span className="meta-label">Venue</span>
                  <strong>{event.venue} {event.city ? `(${event.city})` : ""}</strong>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined">confirmation_number</span>
                <div>
                  <span className="meta-label">Delivery</span>
                  <strong>Instant e-tickets via SMS &amp; My Tickets</strong>
                </div>
              </li>
            </ul>

            {event.description && (
              <p className="description checkout-desc">{event.description}</p>
            )}
          </article>

          <article className="checkout-card terms checkout-terms">
            <strong>
              <span className="material-symbols-outlined">verified</span>
              Terms &amp; Conditions
            </strong>
            <ul>
              <li>Tickets once booked cannot be cancelled.</li>
              <li>A valid government-issued ID is required at entry.</li>
              <li>Event timings are subject to change.</li>
              <li>Outside food, drinks and recording devices are not allowed.</li>
            </ul>
          </article>
        </div>

        <TicketSummary event={event}/>
      </section>
    </main>
  );
}
