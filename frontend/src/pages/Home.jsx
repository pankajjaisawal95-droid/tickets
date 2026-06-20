import { useEffect, useRef, useState } from "react";
import api from "../components/api/axios";
import { useNavigate } from "react-router-dom";

import HeroCarousel from "../components/Home/HeroCarousel";
import EventCard from "../components/Home/EventCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

import "../components/home/Home.css";

/* Frontend-only display overrides for the first N unique events (by display order).
   Each entry merges onto the real API event, so omit a field to keep the API value.
   banner_url = hero carousel image, card_url = grid card image.
   Empty = show real API data as-is. */
const FEATURED_OVERRIDES = [];

const STATS = [
  { value: "500+",  label: "Events Curated",  icon: "auto_awesome" },
  { value: "40+",   label: "Cities Covered",  icon: "location_city" },
  { value: "150K",  label: "Happy Bookers",   icon: "groups" },
  { value: "4.9",   label: "Avg Rating",      icon: "star" },
];

const TESTIMONIALS = [
  {
    name: "Aanya Mehra",
    role: "Founder, Studio North",
    quote: "Booked tickets in literally under a minute. The seat-map, the QR delivery, the whole flow — it just feels premium. Sanskar has set a new bar.",
    avatar: "A",
    rating: 5
  },
  {
    name: "Rohan Sharma",
    role: "Music Curator",
    quote: "I'd been hunting for a platform that gets the cultural scene right. The curation here is unreal — I keep finding shows I'd never have stumbled on otherwise.",
    avatar: "R",
    rating: 5
  },
  {
    name: "Devika Iyer",
    role: "Festival Producer",
    quote: "We listed our last festival here and sold out in 48 hours. The audience that came through Sanskar felt genuinely tuned in to what we were doing.",
    avatar: "D",
    rating: 5
  },
];

const FAQS = [
  {
    q: "How do I receive my tickets after booking?",
    a: "Tickets are sent instantly to your registered mobile number and are also available under My Tickets. Each ticket includes a unique QR code you'll scan at entry."
  },
  {
    q: "Can I cancel or refund a ticket?",
    a: "Tickets are non-transferable and non-refundable once booked, unless the event is officially cancelled by the organizer. In that case, refunds are auto-initiated within 5–7 working days."
  },
  {
    q: "Is the payment process secure?",
    a: "All payments are processed through Razorpay over 256-bit SSL encryption. We never store your card details on our servers."
  },
  {
    q: "Do I get a discount for booking multiple tickets?",
    a: "If any discount or promotional offer is available for the event, it will be automatically applied and displayed on the checkout page before you complete your payment."
  },
  {
    q: "I haven't received my OTP. What should I do?",
    a: "Wait for the 30s timer to complete and use the Resend OTP option. If it still doesn't arrive, double-check that the mobile number is correct and reachable on WhatsApp/SMS."
  }
];

/* The hero carousel is driven by the section's admin layout. The admin panel
   labels this layout "carousel"; "slider" is kept for backward compatibility. */
const isHeroLayout = (layout) => layout === "carousel" || layout === "slider";

const DATE_FILTERS = [
  { value: "all",   label: "All Time"    },
  { value: "week",  label: "This Week"   },
  { value: "month", label: "This Month"  },
  { value: "year",  label: "This Year"   },
];

function StatCounter({ value, label, icon }) {
  return (
    <div className="home-stat">
      <span className="material-symbols-outlined">{icon}</span>
      <div className="home-stat-meta">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function TestimonialCard({ t }) {
  return (
    <article className="home-testimonial">
      <div className="home-testimonial-quote">
        <span className="material-symbols-outlined">format_quote</span>
      </div>
      <div className="home-testimonial-stars" aria-label={`${t.rating} stars`}>
        {Array.from({ length: t.rating }).map((_, i) => (
          <span key={i} className="material-symbols-outlined msym-fill">star</span>
        ))}
      </div>
      <p>{t.quote}</p>
      <footer>
        <span className="home-testimonial-avatar">{t.avatar}</span>
        <div>
          <strong>{t.name}</strong>
          <span>{t.role}</span>
        </div>
      </footer>
    </article>
  );
}

/* Lets a logged-in user share a rating + comment. Submissions are held for admin
   approval before they appear in the grid above, so we only confirm receipt. */
function ReviewForm() {
  const { isLoggedIn, openLogin } = useAuth();
  const toast = useToast();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [role, setRole] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="home-review-cta">
        <div>
          <strong>Been to an event through Sanskar?</strong>
          <span>Log in to share your experience and rate us.</span>
        </div>
        <button type="button" className="kc-btn kc-btn-primary" onClick={() => openLogin()}>
          <span className="material-symbols-outlined">rate_review</span>
          Log in to review
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="home-review-cta home-review-thanks">
        <span className="material-symbols-outlined">task_alt</span>
        <div>
          <strong>Thanks for the review!</strong>
          <span>It'll show up here once our team approves it.</span>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (rating < 1) return toast.error("Please pick a star rating first");
    if (comment.trim().length < 10) return toast.error("Tell us a little more — at least a few words");

    setSubmitting(true);
    try {
      const res = await api.post("/review", { rating, role: role.trim(), comment: comment.trim() });
      toast.success(res.data?.message || "Thanks! Your review is awaiting approval.");
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="home-review-form" onSubmit={submit}>
      <h3>Share your experience</h3>
      <p className="home-review-form-sub">Your review is published after a quick review by our team.</p>

      <div className="home-review-stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`home-review-star ${(hover || rating) >= n ? "is-on" : ""}`}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={rating === n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            <span className="material-symbols-outlined msym-fill">star</span>
          </button>
        ))}
      </div>

      <input
        type="text"
        className="home-review-input"
        placeholder="What you do (optional) — e.g. Music Curator"
        value={role}
        maxLength={120}
        onChange={(e) => setRole(e.target.value)}
      />
      <textarea
        className="home-review-input home-review-textarea"
        placeholder="Tell others what your experience with Sanskar was like…"
        value={comment}
        maxLength={1000}
        rows={4}
        onChange={(e) => setComment(e.target.value)}
      />

      <button type="submit" className="kc-btn kc-btn-primary" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`home-faq-item ${open ? "is-open" : ""}`}>
      <button className="home-faq-trigger" onClick={onToggle} type="button">
        <span>{item.q}</span>
        <span className="material-symbols-outlined home-faq-chev">expand_more</span>
      </button>
      <div className="home-faq-panel">
        <p>{item.a}</p>
      </div>
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="home-event-card home-event-card-skeleton" aria-hidden="true">
      <div className="kc-skeleton home-card-media-skel" />
      <div className="home-card-body">
        <div className="kc-skeleton skel-line skel-line-lg" />
        <div className="kc-skeleton skel-line skel-line-sm" />
        <div className="kc-skeleton skel-line skel-line-md" />
      </div>
    </div>
  );
}

export default function Home() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateOpen, setDateOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const dateFilterRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!dateOpen) return;
    const handleClick = (e) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target)) {
        setDateOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dateOpen]);

  useEffect(() => {
    const fetchHome = async () => {
      try {
        const res = await api.get("/home/home-data");
        setSections(res.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHome();
  }, []);

  // Approved user reviews for the "What people are saying" section. Non-blocking:
  // if it fails (or none are approved yet) we fall back to the seed testimonials.
  useEffect(() => {
    api
      .get("/review")
      .then((res) => setReviews(res.data?.data || []))
      .catch(() => setReviews([]));
  }, []);

  if (loading) {
    return (
      <main>
        <div className="home-container">
          <div className="home-loading-shell">
            <div className="kc-skeleton home-loading-hero" />
            <div className="home-event-grid">
              {Array.from({ length: 4 }).map((_, i) => <EventSkeleton key={i} />)}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* Apply frontend-only overrides to the first N unique events — everywhere they appear */
  const uniqueOrderIds = sections
    .flatMap(s => s.events || [])
    .reduce((acc, e) => {
      if (e?.eventId != null && !acc.includes(e.eventId)) acc.push(e.eventId);
      return acc;
    }, []);
  const overrideByEventId = uniqueOrderIds.slice(0, FEATURED_OVERRIDES.length).reduce(
    (acc, id, i) => ({ ...acc, [id]: FEATURED_OVERRIDES[i] }),
    {}
  );
  const patchEvent = (e) =>
    overrideByEventId[e.eventId] ? { ...e, ...overrideByEventId[e.eventId] } : e;
  const patchedSections = sections.map(s => ({
    ...s,
    events: (s.events || []).map(patchEvent),
  }));

  const allEvents = Array.from(
    new Map(
      patchedSections.flatMap(s => s.events || []).map(e => [e.eventId, e])
    ).values()
  );

  const now = new Date();

  /* Filter logic — preserved */
  const filteredEvents = allEvents.filter(event => {
    const text = (event.title || "").toLowerCase();
    const matchSearch = text.includes(search.toLowerCase());

    const eventDate = new Date(event.start_datetime);
    let matchDate = true;

    if (dateFilter === "week") {
      const oneWeek = new Date();
      oneWeek.setDate(now.getDate() + 7);
      matchDate = eventDate >= now && eventDate <= oneWeek;
    }

    if (dateFilter === "month") {
      matchDate =
        eventDate.getMonth() === now.getMonth() &&
        eventDate.getFullYear() === now.getFullYear();
    }

    if (dateFilter === "year") {
      matchDate = eventDate.getFullYear() === now.getFullYear();
    }

    return matchSearch && matchDate;
  });

  const activeFilterLabel = DATE_FILTERS.find(d => d.value === dateFilter)?.label;
  const isFiltered = !!search || dateFilter !== "all";

  // Merged "All Events" discovery grid is intentionally hidden — the homepage
  // shows each section from the API as its own card row instead.
  const showDiscovery = false;

  return (
    <main>
      {/* HERO — admin layout "carousel" (legacy "slider") renders the hero slider */}
      {patchedSections.map(section =>
        isHeroLayout(section.layout) ? (
          <HeroCarousel
            key={section.sectionId}
            events={section.events}
            navigate={navigate}
          />
        ) : null
      )}

      <div className="home-container">
        {/* CURATED SECTIONS */}
        {patchedSections.map(section =>
          !isHeroLayout(section.layout) && section.events?.length ? (
            <section key={section.sectionId} className="home-section kc-fade-up">
              <div className="home-section-header">
                <div>
                  <span className="kc-eyebrow">Curated Selection</span>
                  <h2 className="section-title">{section.title}</h2>
                </div>
              </div>

              <div className="home-event-grid">
                {section.events.map(event => (
                  <EventCard
                    key={event.eventId}
                    event={event}
                    navigate={navigate}
                  />
                ))}
              </div>
            </section>
          ) : null
        )}

        {/* Merged discovery grid disabled — each API section renders as its own card row above */}
        {showDiscovery && allEvents.length > 0 && (
          <section className="home-section home-all-events kc-fade-up">

            <div className="all-events-pro">
              <div className="all-events-pro-head">
                <div>
                  <span className="kc-eyebrow">Discovery Portal</span>
                  <h2>All Events</h2>
                  <p className="all-events-count">
                    <span className="all-events-dot" />
                    Showing <strong>{filteredEvents.length}</strong> of <strong>{allEvents.length}</strong> experiences
                    {isFiltered && (
                      <>
                        <span className="all-events-count-sep">·</span>
                        <span className="all-events-active-filter">
                          {activeFilterLabel}
                          {search && <> · "{search}"</>}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="all-events-controls">
                  <div className="search-field">
                    <span className="material-symbols-outlined">search</span>
                    <input
                      type="text"
                      placeholder="Search experiences…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="search-clear"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        type="button"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    )}
                  </div>

                  <div
                    className={`custom-filter${dateOpen ? " is-open" : ""}`}
                    ref={dateFilterRef}
                  >
                    <button
                      type="button"
                      className="custom-filter-trigger"
                      onClick={() => setDateOpen(v => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={dateOpen}
                    >
                      <span className="material-symbols-outlined">calendar_month</span>
                      <span className="custom-filter-label">{activeFilterLabel}</span>
                      <span className="material-symbols-outlined chev">expand_more</span>
                    </button>

                    {dateOpen && (
                      <ul className="custom-filter-menu" role="listbox">
                        {DATE_FILTERS.map(d => (
                          <li
                            key={d.value}
                            role="option"
                            aria-selected={dateFilter === d.value}
                            className={`custom-filter-option${dateFilter === d.value ? " is-active" : ""}`}
                            onClick={() => {
                              setDateFilter(d.value);
                              setDateOpen(false);
                            }}
                          >
                            <span>{d.label}</span>
                            {dateFilter === d.value && (
                              <span className="material-symbols-outlined">check</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {isFiltered && (
                    <button
                      className="reset-filters-btn"
                      onClick={() => { setSearch(""); setDateFilter("all"); }}
                      type="button"
                    >
                      <span className="material-symbols-outlined">restart_alt</span>
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="home-event-grid">
              {filteredEvents.length ? (
                filteredEvents.map(event => (
                  <EventCard
                    key={`all-${event.eventId}`}
                    event={event}
                    navigate={navigate}
                  />
                ))
              ) : (
                <div className="home-empty">
                  <span className="material-symbols-outlined">search_off</span>
                  <p>No events match your filters</p>
                  <span className="home-empty-sub">Try clearing some filters to widen the search.</span>
                  <button
                    className="kc-btn kc-btn-ghost"
                    onClick={() => { setSearch(""); setDateFilter("all"); }}
                    type="button"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* EMPTY STATE — no active sections/events */}
        {allEvents.length === 0 && (
          <section className="home-section kc-fade-up">
            <div className="home-empty">
              <span className="material-symbols-outlined">event_busy</span>
              <p>No events available right now</p>
              <span className="home-empty-sub">Please check back soon for upcoming experiences.</span>
            </div>
          </section>
        )}

        {/* STATS ROW */}
        <section className="home-stats-band kc-fade-up">
          <div className="home-stats-glow" aria-hidden="true" />
          {STATS.map(s => <StatCounter key={s.label} {...s} />)}
        </section>

        {/* PROMISE SECTION */}
        <section className="home-promise kc-fade-up">
          <div className="home-promise-glow" aria-hidden="true" />
          <div className="home-promise-inner">
            <span className="kc-eyebrow" style={{ color: "#fff", opacity: 0.85 }}>
              Why Sanskar
            </span>
            <h2>Not just tickets.<br/>Memories curated.</h2>
            <p>
              We don't sell seats. We craft access to the most electrifying
              cultural moments — across concerts, festivals, workshops and
              gatherings. Discover, book and experience without compromise.
            </p>
            <div className="home-promise-grid">
              <div className="promise-card">
                <span className="material-symbols-outlined msym-fill">verified_user</span>
                <div>
                  <strong>Authentic Access</strong>
                  <span>100% genuine, verified tickets only.</span>
                </div>
              </div>
              <div className="promise-card">
                <span className="material-symbols-outlined msym-fill">bolt</span>
                <div>
                  <strong>Instant Booking</strong>
                  <span>Seamless checkout in under 60 seconds.</span>
                </div>
              </div>
              <div className="promise-card">
                <span className="material-symbols-outlined msym-fill">support_agent</span>
                <div>
                  <strong>24×7 Support</strong>
                  <span>We've got your back, every step of the way.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="home-section home-testimonials kc-fade-up">
          <div className="home-section-header">
            <div>
              <span className="kc-eyebrow">Loved by curators</span>
              <h2 className="section-title">What people are saying</h2>
              <p className="kc-section-sub">Real words from people who've used Sanskar to find their next favourite night out.</p>
            </div>
          </div>
          <div className="home-testimonial-grid">
            {(reviews.length
              ? reviews.map(r => ({
                  name: r.name,
                  role: r.role || "Verified booker",
                  quote: r.comment,
                  avatar: (r.name || "?").trim().charAt(0).toUpperCase(),
                  rating: r.rating,
                }))
              : TESTIMONIALS
            ).map((t, i) => <TestimonialCard key={t.id ?? `${t.name}-${i}`} t={t} />)}
          </div>
          <ReviewForm />
        </section>

        {/* FAQ */}
        <section className="home-section home-faq kc-fade-up">
          <div className="home-faq-grid">
            <div>
              <span className="kc-eyebrow">FAQ</span>
              <h2 className="section-title">Questions, answered.</h2>
              <p className="kc-section-sub">Everything you need to know about bookings, refunds and OTP — in one place.</p>
              <a className="kc-btn kc-btn-ghost home-faq-cta" href="/contact">
                <span className="material-symbols-outlined">mail</span>
                Still stuck? Contact us
              </a>
            </div>
            <div className="home-faq-list">
              {FAQS.map((item, i) => (
                <FaqItem
                  key={item.q}
                  item={item}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* NEWSLETTER */}
        <section className="home-newsletter kc-fade-up">
          <div className="home-newsletter-inner">
            <div>
              <span className="kc-eyebrow">Stay in the loop</span>
              <h2>Get the best experiences in your inbox.</h2>
              <p>Early-bird access to drops, festivals and workshops — once a week, never spammy.</p>
            </div>
            <form
              className="home-newsletter-form"
              onSubmit={(e) => { e.preventDefault(); alert("Thanks! We'll be in touch."); }}
            >
              <div className="home-newsletter-field">
                <span className="material-symbols-outlined">mail</span>
                <input
                  type="email"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <button type="submit" className="home-newsletter-btn">
                Subscribe
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
