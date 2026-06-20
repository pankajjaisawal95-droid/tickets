import { useState } from "react";
import Swal from "sweetalert2";
import api from "../components/api/axios.js";

export default function ContactUs() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    message: ""
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      const res = await api.post(`/contact`, form);

      await Swal.fire({
        icon: "success",
        title: "Message sent",
        text: res?.data?.message || "Message sent successfully",
        confirmButtonColor: "#4647d3",
      });
      setForm({ name: "", email: "", mobile: "", message: "" });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Could not send",
        text: err?.response?.data?.message || "Failed to send message. Please try again.",
        confirmButtonColor: "#4647d3",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="content-page">
      <header className="content-hero">
        <div className="content-hero-glow" aria-hidden="true" />
        <div className="content-hero-inner">
          <span className="kc-eyebrow" style={{ color: "rgba(255,255,255,0.92)" }}>
            We're listening
          </span>
          <h1>Contact Us</h1>
          <p>Questions about bookings, refunds or events? Drop us a line.</p>
        </div>
      </header>

      <section className="content-shell">
        <div className="contact-grid">
          <aside className="contact-info-card">
            <h4>Get in touch</h4>
            <p>
              If you have any questions regarding ticket booking, events or
              payments, our team typically replies within a few hours.
            </p>

            <div className="contact-info-list">
              <div className="contact-info-row">
                <span className="material-symbols-outlined">mail</span>
                <div>
                  <span className="contact-info-label">Email</span>
                  <a href="mailto:info@sanskargroup.in">info@sanskargroup.in</a>
                </div>
              </div>
              <div className="contact-info-row">
                <span className="material-symbols-outlined">call</span>
                <div>
                  <span className="contact-info-label">Phone</span>
                  <a href="tel:+911204950000">+91 0120-4950000</a>
                </div>
              </div>
              <div className="contact-info-row">
                <span className="material-symbols-outlined">location_on</span>
                <div>
                  <span className="contact-info-label">Address</span>
                  <strong>Sanskar Info TV Pvt Ltd., FC-16, Sector-16A, Film City, Noida - 201301, U.P., India</strong>
                </div>
              </div>
            </div>
          </aside>

          <div className="contact-form-card">
            <h4>Send us a message</h4>

            <form onSubmit={handleSubmit} className="contact-form">
              <div className="contact-form-row">
                <label>
                  <span>Full Name</span>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    placeholder="Your name"
                  />
                </label>

                <label>
                  <span>Mobile</span>
                  <input
                    type="text"
                    name="mobile"
                    value={form.mobile}
                    onChange={handleChange}
                    required
                    placeholder="10-digit number"
                  />
                </label>
              </div>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="you@example.com"
                />
              </label>

              <label>
                <span>Message</span>
                <textarea
                  name="message"
                  rows="5"
                  value={form.message}
                  onChange={handleChange}
                  required
                  placeholder="How can we help?"
                />
              </label>

              <button
                type="submit"
                className="kc-btn kc-btn-primary contact-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <span className="kc-btn-loading">
                    <span className="kc-btn-spinner" /> Sending…
                  </span>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
