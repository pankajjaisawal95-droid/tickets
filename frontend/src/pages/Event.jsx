import { useEffect, useState } from "react";
import api from "../components/api/axios";
import { useNavigate, useParams } from "react-router-dom";
import { formatDate, formatTime } from "../utils/serviceHelper";
import { resolveImageUrl } from "../utils/imageUrl";
import { useToast } from "../context/ToastContext";
import "../components/event/preview.css";

const ABOUT_TEXT = "Manjeera is a sacred devotional event where the rhythmic sounds of Manjeera, accompanied by bhajans and kirtans, create an atmosphere of divine bliss and devotion. Experience the power of collective worship, heartfelt singing, and spiritual unity as devotees gather to glorify the Almighty through music and prayer.";

const PREVIEW_TERMS = [
  "Tickets once booked cannot be cancelled or refunded.",
  "A valid government-issued ID is required at entry.",
  "Outside food, drinks and recording devices are not allowed.",
  "Event timings and lineup are subject to change without prior notice.",
  "Entry may be denied if you are visibly under the influence.",
  "Children below 5 years require their own ticket and adult supervision.",
];
const TERMS_COLLAPSED_COUNT = 3;

function durationLabel(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function priceLabel(ticketTypes) {
  if (!ticketTypes?.length) return { lead: "Tickets", value: "TBA" };

  const prices = ticketTypes
    .map(t => Number(t.price) || 0)
    .filter(n => !Number.isNaN(n));

  if (!prices.length) return { lead: "Tickets", value: "TBA" };

  const minPaid = prices.filter(p => p > 0).sort((a, b) => a - b)[0];

  if (minPaid == null) {
    return { lead: "Entry", value: "Free", trailing: null };
  }
  return { lead: "Starts from", value: `₹${minPaid}`, trailing: "onwards" };
}

export default function Event() {
  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllTerms, setShowAllTerms] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { eventId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // #10 basic SEO — per-event browser/tab title (helps Google + sharing context)
  useEffect(() => {
    if (event?.title) {
      document.title = `${event.title} · Sanskar Events`;
      const md = document.querySelector('meta[name="description"]');
      if (md && event.description) md.setAttribute("content", String(event.description).slice(0, 160));
    }
    return () => { document.title = "Sanskar Events"; };
  }, [event?.title, event?.description]);

  // Lightbox keyboard controls (Esc to close, ← / → to navigate)
  useEffect(() => {
    if (!lightboxOpen) return;
    const count = (event?.gallery?.length ? event.gallery.length : 1);
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowRight") setActiveImg((i) => (i + 1) % count);
      else if (e.key === "ArrowLeft") setActiveImg((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, event?.gallery?.length]);

  // #10 share the event (Web Share API → WhatsApp/etc; copy-link fallback)
  const shareEvent = async () => {
    const url = window.location.href;
    const data = {
      title: event.title,
      text: `Check out ${event.title}${event.start_datetime ? ` on ${formatDate(event.start_datetime)}` : ""} 🎟️`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast?.success("Event link copied");
    } catch (e) {
      if (e?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast?.success("Event link copied");
      } catch {
        toast?.error("Could not share the event");
      }
    }
  };

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
        const ticketRes = await api.get(`/event/ticket-types/${eventData.id}`);
        setTicketTypes(ticketRes.data?.data?.ticketTypes || []);
      } catch (err) {
        console.error("Failed to load event preview", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <main>
        <div className="kc-loading">Loading event…</div>
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

  const duration  = durationLabel(event.start_datetime, event.end_datetime);
  const priceInfo = priceLabel(ticketTypes);
  const goToTickets = () => navigate(`/event/${eventId}/tickets`);

  // Dynamic gallery (falls back to the banner when none configured)
  const galleryImages = (event.gallery?.length
    ? event.gallery.map((g) => g.image)
    : [event.banner_url]
  ).filter(Boolean).map(resolveImageUrl);
  const mainImg = galleryImages[activeImg] || galleryImages[0];
  const artists = event.artists || [];

  const visibleTerms = showAllTerms
    ? PREVIEW_TERMS
    : PREVIEW_TERMS.slice(0, TERMS_COLLAPSED_COUNT);
  const hasMoreTerms = PREVIEW_TERMS.length > TERMS_COLLAPSED_COUNT;

  return (
    <main className="preview-page">
      {/* ============ CINEMATIC HERO ============ */}
      <section
        className="preview-hero"
        style={{ backgroundImage: `url(${resolveImageUrl(event.banner_url)})` }}
      >
        <div className="preview-hero-overlay" aria-hidden="true" />
        <div className="preview-hero-glow" aria-hidden="true" />

        <div className="preview-hero-inner">
          <div className="preview-hero-top">
            <button
              className="preview-back"
              onClick={() => navigate(-1)}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back
            </button>

            <button className="preview-share" onClick={shareEvent} type="button">
              <span className="material-symbols-outlined">share</span>
              Share
            </button>
          </div>

          <div className="preview-hero-pills">
            <span className="kc-pill kc-pill-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
              Live Experience
            </span>
            {/* <span className="kc-pill kc-pill-soft">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>star</span>
              Editor's Pick
            </span> */}
          </div>

          <h1>{event.title}</h1>
          {event.presented_by && <p style={{marginBottom:'0px'}}>{'Presented by ' + event.presented_by}</p>}
          <div className="preview-hero-meta">
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
            {duration && (
              <span>
                <span className="material-symbols-outlined">timer</span>
                {duration}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ============ CONTENT GRID ============ */}
      <section className="preview-shell">
        <div className="preview-grid">

          {/* LEFT: about, gallery, terms */}
          <div className="preview-left">

            <article className="preview-card preview-card-about">
              <span className="kc-eyebrow">About the event</span>
              <p className="preview-desc preview-desc-only">{event.description?.trim() || ABOUT_TEXT}</p>
            </article>

            <article className="preview-card preview-card-gallery">
              <span className="kc-eyebrow">Gallery</span>
              <h2>Event photos</h2>

              <div className="preview-gallery">
                <button
                  type="button"
                  className="preview-gallery-main"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="Open full-size photo"
                >
                  <img src={mainImg} alt={event.title} />
                  <span className="preview-gallery-zoom">
                    <span className="material-symbols-outlined">zoom_in</span>
                  </span>
                </button>
                {galleryImages.length > 1 && (
                  <div className="preview-gallery-side">
                    {galleryImages.slice(0, 4).map((img, i) => (
                      <button
                        key={i}
                        className={`preview-gallery-thumb${i === activeImg ? " is-active" : ""}`}
                        onClick={() => setActiveImg(i)}
                        type="button"
                        aria-label={`Photo ${i + 1}`}
                      >
                        <img src={img} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            {artists.length > 0 && (
              <article className="preview-card preview-card-artists">
                <span className="kc-eyebrow">Lineup</span>
                <h2>Artists</h2>

                <div className="preview-artists">
                  {artists.map((a, i) => (
                    <div className="preview-artist" key={i}>
                      <div className="preview-artist-avatar">
                        {a.image ? (
                          <img src={resolveImageUrl(a.image)} alt={a.name} />
                        ) : (
                          <span className="material-symbols-outlined">person</span>
                        )}
                      </div>
                      <strong>{a.name}</strong>
                      {a.role && <span>{a.role}</span>}
                    </div>
                  ))}
                </div>
              </article>
            )}

            <article className="preview-card preview-card-terms">
              <span className="kc-eyebrow">Good to know</span>
              <h2>Rules &amp; terms</h2>
              <ul className="preview-terms-list">
                {visibleTerms.map(t => (
                  <li key={t}>
                    <span className="material-symbols-outlined">check_circle</span>
                    {t}
                  </li>
                ))}
              </ul>

              {hasMoreTerms && (
                <button
                  className="preview-show-more"
                  onClick={() => setShowAllTerms(v => !v)}
                  type="button"
                >
                  {showAllTerms ? "Show less" : `Show more (${PREVIEW_TERMS.length - TERMS_COLLAPSED_COUNT})`}
                  <span className="material-symbols-outlined">
                    {showAllTerms ? "expand_less" : "expand_more"}
                  </span>
                </button>
              )}
            </article>
          </div>

          {/* RIGHT: sticky booking summary */}
          <aside className="preview-right">
            <div className="preview-summary preview-summary-no-media">
              <div className="preview-summary-body">
                <h3>{event.title}</h3>

                <div className="preview-summary-list">
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">calendar_month</span>
                    <div>
                      <span>Date</span>
                      <strong>{formatDate(event.start_datetime)}</strong>
                    </div>
                  </div>
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">schedule</span>
                    <div>
                      <span>Time</span>
                      <strong>
                        {formatTime(event.start_datetime)} — {formatTime(event.end_datetime)}
                      </strong>
                    </div>
                  </div>
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">location_on</span>
                    <div>
                      <span>Venue</span>
                      <strong>{event.venue}{event.city && `, ${event.city}`}</strong>
                    </div>
                  </div>
                  {duration && (
                    <div className="preview-summary-row">
                      <span className="material-symbols-outlined">timer</span>
                      <div>
                        <span>Duration</span>
                        <strong>{duration}</strong>
                      </div>
                    </div>
                  )}
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">theater_comedy</span>
                    <div>
                      <span>Category</span>
                      <strong>Live Experience</strong>
                    </div>
                  </div>
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">verified_user</span>
                    <div>
                      <span>Age</span>
                      <strong>All age groups</strong>
                    </div>
                  </div>
                  <div className="preview-summary-row">
                    <span className="material-symbols-outlined">translate</span>
                    <div>
                      <span>Language</span>
                      <strong> Hindi</strong>
                    </div>
                  </div>
                </div>

                <div className="preview-summary-price">
                  <span>{priceInfo.lead}</span>
                  <strong>{priceInfo.value}</strong>
                  {priceInfo.trailing && <em>{priceInfo.trailing}</em>}
                </div>

                <button
                  className="preview-book-btn"
                  onClick={goToTickets}
                  type="button"
                >
                  <span>Book Now</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>

                <p className="preview-summary-trust">
                  <span className="material-symbols-outlined">lock</span>
                  Secure checkout · Instant e-tickets
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Mobile sticky CTA */}
      <div className="preview-mobile-cta">
        <div className="preview-mobile-cta-info">
          <strong>{priceInfo.value}</strong>
          <span>{priceInfo.lead}</span>
        </div>
        <button
          className="preview-book-btn"
          onClick={goToTickets}
          type="button"
        >
          Book Now
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>

      {/* ============ GALLERY LIGHTBOX ============ */}
      {lightboxOpen && (
        <div
          className="preview-lightbox"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <button
            className="preview-lightbox-close"
            onClick={() => setLightboxOpen(false)}
            type="button"
            aria-label="Close preview"
          >
            <span className="material-symbols-outlined">close</span>
          </button>

          {galleryImages.length > 1 && (
            <button
              className="preview-lightbox-nav preview-lightbox-prev"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImg((i) => (i - 1 + galleryImages.length) % galleryImages.length);
              }}
              type="button"
              aria-label="Previous photo"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          )}

          <img
            className="preview-lightbox-img"
            src={mainImg}
            alt={event.title}
            onClick={(e) => e.stopPropagation()}
          />

          {galleryImages.length > 1 && (
            <button
              className="preview-lightbox-nav preview-lightbox-next"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImg((i) => (i + 1) % galleryImages.length);
              }}
              type="button"
              aria-label="Next photo"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          )}
        </div>
      )}
    </main>
  );
}
