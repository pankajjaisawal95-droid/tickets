export default function TermsConditions() {
  return (
    <main className="content-page">
      <header className="content-hero">
        <div className="content-hero-glow" aria-hidden="true" />
        <div className="content-hero-inner">
          <span className="kc-eyebrow" style={{ color: "rgba(255,255,255,0.92)" }}>
            Booking Conditions
          </span>
          <h1>Terms &amp; Conditions</h1>
          <p>Please read these terms carefully before booking your experience.</p>
        </div>
      </header>

      <section className="content-shell">
        <article className="content-card">
          <Section
            title="1. Ticket Policy"
            content="All tickets are non-transferable and non-refundable unless the event is cancelled."
          />

          <Section
            title="2. Entry Policy"
            content="A valid QR code must be presented at the time of entry."
          />

          <Section
            title="3. Cancellation"
            content="Event organizers reserve the right to cancel or reschedule events due to unforeseen circumstances."
          />

          <Section
            title="4. Liability"
            content="The organizer is not responsible for any personal injury, loss, or damage during the event."
          />
        </article>
      </section>
    </main>
  );
}

function Section({ title, content }) {
  return (
    <div className="content-section">
      <h4>{title}</h4>
      <p>{content}</p>
    </div>
  );
}
