import Logo from '../ui/Logo'
import Icon from '../ui/Icon'

const FEATURES = [
  { icon: 'bolt', title: 'Quick & Easy Registration', desc: 'Get started in minutes with a guided, step-by-step onboarding built for non-technical organizers.' },
  { icon: 'card', title: 'Just PAN Card & Bank Details', desc: 'Complete your registration with only your PAN Card and Bank account — no paperwork, no waiting.' },
  { icon: 'rocket', title: 'Take Your Events Live Superfast!', desc: 'Configure tickets, seat maps and venues, then publish your event to the world in record time.' },
  { icon: 'chart', title: 'Monitor Analytics & Insights', desc: 'Track sales, attendance and revenue with a real-time dashboard that keeps you in control.' },
]

/** Split-screen auth shell: marketing panel (left) + auth content (right). */
export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      {/* Marketing panel */}
      <aside className="auth__panel">
        <div className="auth__panel-bg" aria-hidden>
          <span className="blob blob--1" />
          <span className="blob blob--2" />
          <span className="grid-overlay" />
        </div>

        <div className="auth__panel-inner">
          <Logo inverted />

          <div className="auth__panel-head">
            <span className="auth__eyebrow"><Icon name="sparkle" size={14} /> Do It Yourself · Event Management</span>
            <h1 className="auth__headline">
              Benefits of using <span className="auth__headline-accent">Do It Yourself</span> — our new event management tool
            </h1>
            <p className="auth__sub">
              Everything you need to launch, manage and scale unforgettable events — beautifully simple, seriously powerful.
            </p>
          </div>

          <ul className="auth__features">
            {FEATURES.map((f, i) => (
              <li className="auth__feature" key={f.title} style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
                <span className="auth__feature-icon"><Icon name={f.icon} size={22} /></span>
                <span className="auth__feature-text">
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="auth__panel-foot">
            <div className="auth__stats">
              <div><b>12k+</b><span>Events launched</span></div>
              <div><b>4.9★</b><span>Organizer rating</span></div>
              <div><b>98%</b><span>Go-live success</span></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Auth content */}
      <main className="auth__content">
        <div className="auth__content-inner">{children}</div>
      </main>
    </div>
  )
}
