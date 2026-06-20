import "./booking.css";
import { formatDate, formatTime } from "../../utils/serviceHelper.js";

export default function EventDetail({ event }) {
  if (!event) {
    return <div className="event-detail">Loading event...</div>;
  }

  return (
    <div className="booking-left">
      <span className="kc-eyebrow">Booking Review</span>
      <h2>{event.title}</h2>

      <ul className="booking-meta-list">
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
      </ul>

      {event.description && (
        <p className="description">{event.description}</p>
      )}

      <div className="terms">
        <strong>
          <span className="material-symbols-outlined">verified</span>
          Terms &amp; Conditions
        </strong>
        <ul>
          <li>Tickets once booked cannot be cancelled.</li>
          <li>Valid ID required at entry.</li>
          <li>Event timings subject to change.</li>
        </ul>
      </div>
    </div>
  );
}
