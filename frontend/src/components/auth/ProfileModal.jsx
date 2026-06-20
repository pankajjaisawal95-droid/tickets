import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

/**
 * Lets a logged-in user update their name + email (POST /auth/edit-profile).
 * Mobile is the login identity, so it's shown read-only.
 */
export default function ProfileModal({ open, onClose }) {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "error" | "success", text }

  // Prefill every time the modal opens. The login/OTP response only carries
  // tokens (no name/email), so we fetch the saved profile from the server and
  // fall back to whatever is cached on the user object.
  useEffect(() => {
    if (!open) return;
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMsg(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/auth/profile");
        const profile = res.data?.data;
        if (cancelled || !profile) return;
        setName(profile.name || "");
        setEmail(profile.email || "");
        // keep the cached user in sync for the rest of the app
        updateUser({ name: profile.name || "", email: profile.email || "" });
      } catch {
        /* keep the cached values already set above */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const save = async () => {
    if (!name.trim() && !email.trim()) {
      setMsg({ type: "error", text: "Enter a name or email to update" });
      return;
    }
    if (!emailOk) {
      setMsg({ type: "error", text: "Enter a valid email" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.post("/auth/edit-profile", { name: name.trim(), email: email.trim() });
      updateUser({ name: name.trim(), email: email.trim() });
      const okText = res.data?.message || "Profile updated successfully";
      setMsg({ type: "success", text: okText });
      toast?.success(okText);
      // let the success message show briefly before closing
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      const errText = err.response?.data?.message || "Could not update profile";
      setMsg({ type: "error", text: errText });
      toast?.error(errText);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <h3>My Profile</h3>
        <p className="profile-sub">Update your name and email.</p>

        <div className="profile-field">
          <label>Name</label>
          <input
            className="form-control"
            value={name}
            onChange={(e) => { setName(e.target.value); if (msg) setMsg(null); }}
            placeholder="Your name"
          />
        </div>

        <div className="profile-field">
          <label>Email</label>
          <input
            className="form-control"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (msg) setMsg(null); }}
            placeholder="you@example.com"
          />
        </div>

        <div className="profile-field">
          <label>Mobile (login)</label>
          <input className="form-control" value={user?.mobile || ""} readOnly />
        </div>

        {msg && (
          <p className={`profile-msg profile-msg-${msg.type}`} role="alert">
            {msg.text}
          </p>
        )}

        <div className="profile-actions">
          <button className="btn btn-light" onClick={onClose} disabled={saving} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} type="button">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
