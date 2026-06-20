import { resolveImageUrl } from "../../utils/imageUrl";

export default function EventDetail({ event }) {
  if (!event) {
    return <div className="event-detail">Loading event...</div>;
  }

  const formatDate = (datetime) => {
    const d = new Date(datetime);
    return d.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (datetime) => {
    const d = new Date(datetime);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="event-detail">
      <img
        src={
          resolveImageUrl(event.banner_url) ||
          "https://images.unsplash.com/photo-1507874457470-272b3c8d8ee2"
        }
        alt="Event Banner"
      />

      <div className="event-info">
        <span className="kc-eyebrow">Event Overview</span>
        <h2>{event.title}</h2>

        <ul className="event-info-list">
          <li>
            <span className="material-symbols-outlined">location_on</span>
            <span>{event.venue} {event.city ? `(${event.city})` : ""}</span>
          </li>
          <li>
            <span className="material-symbols-outlined">calendar_month</span>
            <span>{formatDate(event.start_datetime)}</span>
          </li>
          <li>
            <span className="material-symbols-outlined">schedule</span>
            <span>{formatTime(event.start_datetime)} to {formatTime(event.end_datetime)}</span>
          </li>
        </ul>

        {event.ticketTypes?.length > 0 && (
          <div className="badges">
            {event.ticketTypes.map((type) => (
              <span key={type.id} className="badge">
                {type.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
