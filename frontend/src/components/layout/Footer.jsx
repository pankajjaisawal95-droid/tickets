import { NavLink } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer-glow" aria-hidden="true" />

      <div className="app-footer-inner">
        <div className="footer-brand-col">
          <div className="footer-brand">
            <span className="footer-brand-mark">
              <span className="material-symbols-outlined msym-fill">festival</span>
            </span>
            <div>
              <div className="footer-brand-name">Sanskar Event</div>
              <div className="footer-brand-tag">Curated cultural moments</div>
            </div>
          </div>

          <p className="footer-blurb">
            We craft access to the most electrifying cultural moments — concerts,
            festivals, workshops and gatherings. Discover, book and experience
            without compromise.
          </p>

          <div className="footer-socials">
            <a href="#" aria-label="Website" className="footer-social-btn">
              <span className="material-symbols-outlined">public</span>
            </a>
            <a href="#" aria-label="Instagram" className="footer-social-btn">
              <span className="material-symbols-outlined">photo_camera</span>
            </a>
            <a href="#" aria-label="Mail" className="footer-social-btn">
              <span className="material-symbols-outlined">alternate_email</span>
            </a>
          </div>
        </div>

        <div className="footer-col">
          <h5>Explore</h5>
          <NavLink to="/">Events</NavLink>
          <NavLink to="/my-tickets">My Tickets</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </div>

        <div className="footer-col">
          <h5>Legal</h5>
          <NavLink to="/privacy-policy">Privacy Policy</NavLink>
          <NavLink to="/terms">Terms of Service</NavLink>
          {/* <a href="mailto:info@sanskargroup.in">Help Center</a> */}
        </div>

        <div className="footer-col footer-contact-col">
          <h5>Get in touch</h5>
          <a href="mailto:info@sanskargroup.in" className="footer-contact-row">
            <span className="material-symbols-outlined">mail</span>
             info@sanskargroup.in
          </a>
          <a href="tel:+911204950000" className="footer-contact-row">
            <span className="material-symbols-outlined">call</span>
            +91 0120-4950000
          </a>
          <div className="footer-contact-row">
            <span className="material-symbols-outlined">location_on</span>
          Sanskar Info TV Pvt Ltd.,
          FC-16, Sector -16A, Film City,
          Noida - 201301,
          U.P.-India
          </div>
        </div>
      </div>

      <div className="app-footer-bottom">
        <span>© {year} Sanskar Event. All rights reserved.</span>
        <span className="footer-bottom-meta">Crafted with care · India</span>
      </div>
    </footer>
  );
}
