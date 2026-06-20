export default function PrivacyPolicy() {
  return (
    <main className="content-page">
      <header className="content-hero">
        <div className="content-hero-glow" aria-hidden="true" />
        <div className="content-hero-inner">
          <span className="kc-eyebrow" style={{ color: "rgba(255,255,255,0.92)" }}>
            Trust &amp; Transparency
          </span>
          <h1>Privacy Policy</h1>
          <p>Your privacy is important to us — here's exactly what we do with your data.</p>
        </div>
      </header>

      <section className="content-shell">
        <article className="content-card">
          <Section
            title="1. Information We Collect"
            content="We collect personal information such as name, email address, mobile number, and booking details when you register or purchase tickets."
          />

          <Section
            title="2. How We Use Your Information"
            list={[
              "To process ticket bookings",
              "To send event updates",
              "To improve user experience",
              "For customer support",
            ]}
          />

          <Section
            title="3. Payment Information"
            content="Payments are processed securely through trusted payment gateways. We do not store your card details."
          />

          <Section
            title="4. Data Security"
            content="We implement strong security measures to protect your personal data from unauthorized access."
          />

          <Section
            title="5. Cookies"
            content="Our website may use cookies to enhance your browsing experience."
          />

          <Section
            title="6. Contact Us"
            content="If you have any questions about this Privacy Policy, please contact us at info@sanskargroup.in."
          />
        </article>
      </section>
    </main>
  );
}

function Section({ title, content, list }) {
  return (
    <div className="content-section">
      <h4>{title}</h4>

      {content && <p>{content}</p>}

      {list && (
        <ul>
          {list.map((item, index) => (
            <li key={index}>
              <span className="material-symbols-outlined">check_circle</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
