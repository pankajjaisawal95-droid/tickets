import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useState, useEffect, useRef } from "react";
import ProfileModal from "../auth/ProfileModal";
import "./header.css";

const Header = () => {
  const { openLogin, isLoggedIn, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const floatingRef = useRef(null);

  /* CLOSE FLOATING BOX ON OUTSIDE CLICK */
  useEffect(() => {
    const handleClick = (e) => {
      if (floatingRef.current && !floatingRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleUserClick = () => {
    if (!isLoggedIn) {
      openLogin();
    } else {
      setOpen((prev) => !prev);
    }
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className={`app-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="app-header-inner">
          <NavLink to="/" className="brand" onClick={closeMobile}>
            <span className="brand-mark" aria-hidden="true">
              <span className="material-symbols-outlined msym-fill">festival</span>
            </span>
            <span className="brand-text">
              <span className="brand-name">Sanskar Event</span>
              <span className="brand-tag">Curated Experiences</span>
            </span>
          </NavLink>

          <nav className={`primary-nav ${mobileOpen ? "is-open" : ""}`}>
            <NavLink to="/" end onClick={closeMobile}>Events</NavLink>
            {isLoggedIn &&
              <NavLink to="/my-tickets" onClick={closeMobile}>My Tickets</NavLink>
            }
            <NavLink to="/privacy-policy" end onClick={closeMobile}>Privacy</NavLink>
            <NavLink to="/terms" end onClick={closeMobile}>Terms</NavLink>
            <NavLink to="/contact" end onClick={closeMobile}>Contact</NavLink>
          </nav>

          <div className="auth-section">
            <button
              className="nav-icon-btn nav-mobile-toggle"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu"
              type="button"
            >
              <span className="material-symbols-outlined">
                {mobileOpen ? "close" : "menu"}
              </span>
            </button>

            {!isLoggedIn ? (
              <button
                className="signin-btn"
                onClick={handleUserClick}
                type="button"
              >
                <span className="material-symbols-outlined">login</span>
                <span>Sign In</span>
              </button>
            ) : (
              <button
                className="user-trigger"
                onClick={handleUserClick}
                type="button"
                aria-label="Account"
              >
                <span className="user-avatar">
                  {(user?.name || "U").trim().charAt(0).toUpperCase()}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FLOATING USER BOX */}
      {isLoggedIn && open && (
        <div className="user-floating-box" ref={floatingRef}>
          <div className="user-info">
            <div className="user-info-avatar">
              {(user?.name || "U").trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="user-info-hi">Welcome back</div>
              <div className="user-info-name">
                {user?.mobile ? `+91 ${user.mobile}` : (user?.name || "User")}
              </div>
            </div>
          </div>
          <div className="user-menu-divider" />
          <NavLink
            to="/my-tickets"
            className="user-menu-link"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined">confirmation_number</span>
            My Tickets
          </NavLink>
          <button
            type="button"
            className="user-menu-link"
            onClick={() => { setProfileOpen(true); setOpen(false); }}
            style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
          >
            <span className="material-symbols-outlined">person</span>
            My Profile
          </button>
          <div className="logoutdiv">
            <button className="logout-btn" onClick={logout} type="button">
              <span className="material-symbols-outlined">logout</span>
              Logout
            </button>
          </div>
        </div>
      )}

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
};

export default Header;
