import { resolveImageUrl } from "../../utils/imageUrl";
import "../Home/Home.css";

export default function EventCard({ event, navigate }) {
  const date = new Date(event.start_datetime);

  const day     = date.toLocaleDateString("en-IN", { day: "2-digit" });
  const month   = date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
  const weekday = date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();
  const time    = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const now      = new Date();
  const msInDay  = 1000 * 60 * 60 * 24;
  const daysToGo = Math.ceil((date - now) / msInDay);

  const isThisWeek  = daysToGo >= 0 && daysToGo <= 7;
  const isLive      = date <= now && new Date(event.end_datetime) >= now;
  const isUpcoming  = daysToGo >= 0;
  // completed events still show but are not clickable
  const isCompleted =
    event.is_completed === 1 ||
    event.is_completed === true ||
    new Date(event.end_datetime) < now;

  const open = () => {
    if (isCompleted) return;
    navigate(`/event/${event.eventId}`);
  };

  return (
    <article
      className={`home-event-card${isCompleted ? " home-event-card-completed" : ""}`}
      onClick={open}
      role={isCompleted ? undefined : "button"}
      tabIndex={isCompleted ? -1 : 0}
      aria-disabled={isCompleted || undefined}
      onKeyDown={(e) => {
        if (!isCompleted && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="home-card-media">
        <img src={resolveImageUrl(event.card_url || event.cart_url)} alt={event.title} loading="lazy" />
        <div className="home-card-gradient" aria-hidden="true" />

        <div className="home-card-datechip">
          <span className="home-card-weekday">{weekday}</span>
          <strong>{day}</strong>
          <span>{month}</span>
        </div>

        {isCompleted && (
          <span className="home-card-status home-card-status-ended">
            <span className="material-symbols-outlined">event_busy</span>
            Completed
          </span>
        )}
        {!isCompleted && isLive && (
          <span className="home-card-status home-card-status-live">
            <span className="home-card-status-dot" />
            Happening Now
          </span>
        )}
        {!isCompleted && !isLive && isThisWeek && (
          <span className="home-card-status home-card-status-week">
            <span className="material-symbols-outlined">whatshot</span>
            This Week
          </span>
        )}
        {!isLive && !isThisWeek && isUpcoming && daysToGo <= 30 && (
          <span className="home-card-status home-card-status-soon">
            <span className="material-symbols-outlined">calendar_clock</span>
            In {daysToGo} day{daysToGo === 1 ? "" : "s"}
          </span>
        )}

        {!isCompleted && (
          <div className="home-card-hover-cta">
            <span>View Detail</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </div>
        )}
      </div>

      <div className="home-card-body">
        <h3 className="home-card-title">{event.title}</h3>

        <div className="home-card-meta">
          <span>
            <span className="material-symbols-outlined">schedule</span>
            {time}
          </span>
          <span>
            <span className="material-symbols-outlined">location_on</span>
            {event.location || event.venue || "Location TBA"}
          </span>
        </div>

        <div className="home-card-foot">
          {isCompleted ? (
            <span className="home-card-cta home-card-cta-ended">
              <span className="material-symbols-outlined">event_busy</span>
              <span>Event ended</span>
            </span>
          ) : (
            <>
              <span className="home-card-cta">
                <span>Book Now</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </span>
              <span className="home-card-foot-dot" aria-hidden="true" />
              <span className="home-card-foot-meta">
                <span className="material-symbols-outlined">bolt</span>
                Instant
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
