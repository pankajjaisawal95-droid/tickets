import { useEffect, useState, useRef } from "react";
import { resolveImageUrl } from "../../utils/imageUrl";
import "../Home/Home.css";

export default function HeroCarousel({ events = [], navigate }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  const startAutoSlide = () => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setIndex((prev) =>
        prev === events.length - 1 ? 0 : prev + 1
      );
    }, 5500);
  };

  useEffect(() => {
    if (events.length <= 1) return;

    startAutoSlide();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [events.length]);

  const goTo = (slideIndex) => {
    setIndex(slideIndex);

    if (events.length > 1) {
      startAutoSlide();
    }
  };

  const getCountdownLabel = (startDatetime) => {
    const start = new Date(startDatetime);

    if (isNaN(start.getTime())) return null;

    const now = new Date();

    const startDay = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate()
    );

    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const dayDiff = Math.round(
      (startDay - today) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff < 0) return null;
    if (dayDiff === 0) return "Today";
    if (dayDiff === 1) return "Tomorrow";
    if (dayDiff <= 30) return `In ${dayDiff} days`;

    return "Coming Soon";
  };

  if (!events || events.length === 0) return null;

  return (
    <section className="hero-carousel" aria-label="Featured Events">
      <div
        className="hero-track"
        style={{
          transform: `translateX(-${index * 100}%)`,
        }}
      >
        {events.map((event) => {
          const eventDate = new Date(event.start_datetime);

          const dateLabel = !isNaN(eventDate)
            ? eventDate.toLocaleString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "numeric",
              })
            : "Date TBA";

          const countdownLabel = getCountdownLabel(
            event.start_datetime
          );

          const mobileBanner = event.banner_url_mobile ?
            resolveImageUrl(event.banner_url_mobile) :
            event.banner_url;

          
          const desktopBanner = resolveImageUrl(event.banner_url);

          return (
            <article
              key={event.eventId}
              className="hero-slide"
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate(`/event/${event.eventId}`)
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" ||
                  e.key === " "
                ) {
                  navigate(`/event/${event.eventId}`);
                }
              }}
            >
              {/* Desktop Banner */}
              <div
                className="hero-bg"
                style={{
                  backgroundImage: `url(${desktopBanner})`,
                }}
                aria-hidden="true"
              />

              {/* Mobile Banner */}
              <div
                className="hero-bg-mobile"
                style={{
                  backgroundImage: `url(${mobileBanner})`,
                }}
                aria-hidden="true"
              />

              <div
                className="hero-overlay"
                aria-hidden="true"
              />

              <div className="hero-content">
                <div className="hero-pill-row">
                  <span className="hero-pill">
                    <span className="hero-pill-dot" />
                    Featured Experience
                  </span>

                  {countdownLabel && (
                    <span className="hero-countdown">
                      <span className="material-symbols-outlined">
                        schedule
                      </span>
                      {countdownLabel}
                    </span>
                  )}
                </div>

                <h1 className="hero-title">
                  {event.title}
                </h1>

                <div className="hero-meta">
                  <span className="hero-meta-item">
                    <span className="material-symbols-outlined">
                      calendar_month
                    </span>
                    {dateLabel}
                  </span>

                  <span className="hero-meta-item">
                    <span className="material-symbols-outlined">
                      location_on
                    </span>
                    {event.location ||
                      event.venue ||
                      "Location TBA"}
                  </span>
                </div>

                <div className="hero-actions">
                  <button
                    type="button"
                    className="hero-btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/event/${event.eventId}`
                      );
                    }}
                  >
                    Book Now
                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </button>

                  <button
                    type="button"
                    className="hero-btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/event/${event.eventId}`
                      );
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {events.length > 1 && (
        <div
          className="hero-dots"
          role="tablist"
        >
          {events.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`hero-dot ${
                i === index ? "active" : ""
              }`}
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}