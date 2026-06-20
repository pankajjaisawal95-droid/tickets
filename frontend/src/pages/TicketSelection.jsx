import { useEffect, useState } from "react";
import api from "../components/api/axios";
import { useParams, useNavigate } from "react-router-dom";
import { formatDate, formatTime } from "../utils/serviceHelper";
import { resolveImageUrl } from "../utils/imageUrl";
import { getUserLocation } from "../utils/geolocation";
import { useAuth } from "../context/AuthContext";
import TicketTypes from "../components/event/TicketTypes";
import VenueSeatMap from "../components/event/VenueSeatMap";
import Cart from "../components/event/Cart";
import "../components/event/preview.css";

export default function TicketSelection() {
  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  /**
   * Capture the signed-in visitor's real location on this page.
   * Asks the browser for precise latitude/longitude, reverse-geocodes them into
   * an address, then records the visit. Only runs when logged in.
   * Fire-and-forget: a denied prompt or failed lookup must never break the page.
   */
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;
    (async () => {
      try {
        const loc = await getUserLocation();
        if (cancelled) return;
        setUserLocation(loc);
        await api.post("/track/visit", {
          path: `/event/${eventId}/tickets`,
          ...loc,
        });
      } catch {
        /* location unavailable / denied — ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, eventId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        /* 1️⃣ Fetch events */
        const eventRes = await api.get(`/event/getevent?eventId=${eventId}`);

        const events = eventRes.data?.data?.events || [];
        if (!events.length) {
          setLoading(false);
          return;
        }

        const eventData = events[0];
        setEvent(eventData);

        /* 2️⃣ Fetch ticket types for event */
        const ticketRes = await api.get(
          `/event/ticket-types/${eventData.id}`
        );

        setTicketTypes(
          ticketRes.data?.data?.ticketTypes || []
        );
      } catch (err) {
        console.error("Failed to load tickets data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <main>
        <div className="kc-loading">Loading tickets…</div>
      </main>
    );
  }

  if (!event) {
    return (
      <main>
        <div className="event-empty">
          <span className="material-symbols-outlined">event_busy</span>
          <h2>No active events found</h2>
          <p>Please check back later for upcoming experiences.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      {/* SLIM EVENT RECAP HEADER */}
      <header className="select-header">
        <div className="select-header-inner">
          <button
            className="select-back"
            onClick={() => navigate(`/event/${eventId}`)}
            type="button"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span>Back to details</span>
          </button>

          <div className="select-stepper">
            <span className="select-step is-done">
              <span className="material-symbols-outlined">check</span>
              Details
            </span>
            <span className="select-step-bar" />
            <span className="select-step is-active">
              <span>2</span>
              Book &amp; Pay
            </span>
          </div>
        </div>

        <div className="select-header-event">
          <img src={resolveImageUrl(event.cart_url)} alt={event.title} className="select-header-img" />
          <div className="select-header-meta">
            <span className="kc-eyebrow">Step 2 · Select &amp; pay</span>
            <h1>{event.title}</h1>
            <div className="select-header-info">
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

      <section className="section">
        <div className="ticket-layout">
          <div className="ticket-left-col">
            {/* Seated types are picked on one whole-venue chart; GA types keep
                the quantity cards. */}
            {ticketTypes.some((t) => t.seating_mode === "SEATED") && (
              <VenueSeatMap eventId={eventId} />
            )}
            {ticketTypes.some((t) => t.seating_mode !== "SEATED") && (
              <TicketTypes
                ticketTypes={ticketTypes.filter((t) => t.seating_mode !== "SEATED")}
                eventId={eventId}
              />
            )}
          </div>
          <Cart event={event} eventId={eventId} userLocation={userLocation} />
        </div>
      </section>
    </main>
  );
}
