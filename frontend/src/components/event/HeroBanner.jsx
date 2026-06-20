import { resolveImageUrl } from "../../utils/imageUrl";

export default function HeroBanner({ event, isbutton = true }) {
  const scrollToTickets = () => {
    document.getElementById("tickets").scrollIntoView({ behavior: "smooth" });
  };

  const bg = event?.cart_url
    ? { backgroundImage: `linear-gradient(180deg, rgba(22,5,42,0.35) 0%, rgba(22,5,42,0.85) 100%), url(${resolveImageUrl(event.banner_url)})`,
        backgroundSize: "cover",
        backgroundPosition: "center" }
    : undefined;

  return (
    <section className="hero event-hero" style={bg}>
      <div>
        <span className="kc-pill kc-pill-secondary" style={{ marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
          Live Experience
        </span>
        <h1>{event.title}</h1>
        {event.description && <p>{event.description}</p>}

        {isbutton && (
          <button onClick={scrollToTickets} type="button">
            <span className="material-symbols-outlined">confirmation_number</span>
            Book Tickets
          </button>
        )}
      </div>
    </section>
  );
}
