import axios from "axios";
import { useState, useEffect, useRef } from "react";
import { freeRegistrationStore } from "../../store/freeRegistrationStore";
import "../../components/freeregistration/freeregistration.css";
import { formatRange } from "../../utils/serviceHelper";
import { resolveImageUrl } from "../../utils/imageUrl";
import { useParams } from "react-router-dom";

const FreeRagistrationEvents = () => {
  const { name, email, phone, event, setField, resetForm } =
    freeRegistrationStore();

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verifiedMobile, setVerifiedMobile] = useState("");
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);

  const { eventId, ticketTypeId } = useParams();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [timer, setTimer] = useState(30);
  const [loading, setLoading] = useState(false);

  const [eventInfo, setEventInfo] = useState(null);

  const otpRefs = useRef([]);
  const BASEURL = import.meta.env.VITE_BASEURL;

  const maskMobile = (num) =>
    num ? num.replace(/^(\d{2})\d{6}(\d{2})$/, "$1******$2") : "";

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await axios.get(`${BASEURL}/event/getevent?eventId=${eventId}`);
        if (res.data?.success) {
          const events = res.data?.data?.events || [];
          if (events.length > 0) {
            setEventInfo(events[0]);
            setField("event", events[0].title);
          }
        }
      } catch (err) {
        console.error("Failed to load event");
      }
    };
    fetchEvent();
  }, []);

  useEffect(() => {
    const storedMobile = localStorage.getItem("verifiedMobile");
    const storedVerified = localStorage.getItem("isPhoneVerified");

    if (storedMobile && storedVerified === "true") {
      setMobile(storedMobile);
      setVerifiedMobile(storedMobile);
      setIsPhoneVerified(true);
      setField("phone", storedMobile);
    }
  }, []);

  useEffect(() => {
    if (showOtpModal && timer > 0) {
      const t = setTimeout(() => setTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [timer, showOtpModal]);

  const sendOTP = async (isResend = false) => {
    if (mobile.length !== 10) {
      alert("Enter valid 10 digit mobile number");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${BASEURL}/auth/send-otp`, { mobile });
      setShowOtpModal(true);
      setTimer(30);
      if (isResend) alert("OTP resent successfully");
    } catch {
      alert("OTP send failed");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    const otpValue = otp.join("");
    if (otpValue.length !== 4) {
      alert("Invalid OTP");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${BASEURL}/auth/verify-otp`, {
        mobile,
        otp: otpValue,
        deviceId: "deviceId",
        deviceName: "deviceName",
      });

      if (!res.data.success) {
        alert("OTP verification failed");
        return;
      }

      setIsPhoneVerified(true);
      setVerifiedMobile(mobile);
      setField("phone", mobile);
      localStorage.setItem("accessToken", res.data.data.accessToken);
      localStorage.setItem("verifiedMobile", mobile);
      localStorage.setItem("isPhoneVerified", "true");

      setShowOtpModal(false);
      setOtp(["", "", "", ""]);
    } catch {
      alert("OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("accessToken");
    if (!isPhoneVerified) {
      alert("Please verify mobile number first");
      return;
    }

    try {
      await axios.post(`${BASEURL}/auth/edit-profile`, {
        name,
        email,
        phone,
        eventId,
        ticketTypeId
      },
        {
          headers: {
            "Content-Type": "application/json",
            "x-access-token": token,
          },
        });

      alert("🙏 Registration Successful!");
      resetForm();
      setMobile("");
      setVerifiedMobile("");
      setIsPhoneVerified(false);

      localStorage.removeItem("verifiedMobile");
      localStorage.removeItem("isPhoneVerified");
    } catch {
      alert("Registration failed again number Verify");
    }
  };

  return (
    <main>
      <section className="top-from-info">
        <div className="top-from-glow" aria-hidden="true" />

        {eventInfo && (
          <div className="form-container">
            <div className="form-event-media">
              <img
                src={resolveImageUrl(eventInfo.banner_url)}
                alt="event"
                className="krishna-icon"
              />
              <span className="form-event-badge">Free Registration</span>
            </div>

            <h3>
              Register For {eventInfo.title}
              <span className="form-event-sub">
                {formatRange(eventInfo.start_datetime, eventInfo.end_datetime)} · {eventInfo.city}
              </span>
            </h3>

            <form onSubmit={handleSubmit}>
              <label>Phone</label>
              <div className="phone-row">
                <span className="Free-country-code">🇮🇳 +91</span>
                <input
                  value={mobile}
                  maxLength={10}
                  inputMode="numeric"
                  placeholder="Mobile number"
                  onChange={(e) => {
                    const newMobile = e.target.value.replace(/\D/g, "");

                    if (isPhoneVerified && newMobile !== verifiedMobile) {
                      setShowChangeConfirm(true);
                      return;
                    }

                    setMobile(newMobile);

                    if (newMobile !== verifiedMobile) {
                      setIsPhoneVerified(false);
                      localStorage.removeItem("verifiedMobile");
                      localStorage.removeItem("isPhoneVerified");
                    }
                  }}
                />

                {!isPhoneVerified && (
                  <button
                    className="registerNow verify-cta"
                    type="button"
                    disabled={loading}
                    onClick={() => sendOTP(false)}
                  >
                    {loading ? "Sending..." : "Verify"}
                  </button>
                )}

                {isPhoneVerified && (
                  <span className="verified-chip">
                    <span className="material-symbols-outlined">verified</span>
                    Verified · {maskMobile(verifiedMobile)}
                  </span>
                )}
              </div>

              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={!isPhoneVerified}
                required
                placeholder="Your full name"
              />

              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setField("email", e.target.value)}
                disabled={!isPhoneVerified}
                required
                placeholder="you@example.com"
              />

              <label>Event</label>
              <input type="text" value={event} readOnly />

              <button
                className="registerNow"
                type="submit"
                disabled={!isPhoneVerified}
                style={{
                  marginTop: "18px",
                  opacity: !isPhoneVerified ? 0.6 : 1,
                }}
              >
                <span className="material-symbols-outlined">how_to_reg</span>
                Register Now
              </button>

              {!isPhoneVerified && (
                <p className="form-helper">
                  <span className="material-symbols-outlined">info</span>
                  Verify your mobile number to fill the rest of the form.
                </p>
              )}
            </form>
          </div>
        )}
      </section>

      {/* CHANGE NUMBER CONFIRM */}
      {showChangeConfirm && (
        <div className="login-backdrop" onClick={() => setShowChangeConfirm(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-modal-icon" style={{ background: "rgba(168, 49, 0, 0.10)", color: "var(--secondary)" }}>
              <span className="material-symbols-outlined">cached</span>
            </div>
            <h3 className="login-title">Change Mobile Number?</h3>
            <p className="login-sub">Your verified number will be unverified and you'll need to verify again.</p>

            <div className="change-confirm-actions">
              <button
                className="CancelBtn"
                onClick={() => setShowChangeConfirm(false)}
                type="button"
              >
                Cancel
              </button>

              <button
                className="yesChangeBtn"
                onClick={() => {
                  setIsPhoneVerified(false);
                  setVerifiedMobile("");
                  setMobile("");
                  localStorage.removeItem("verifiedMobile");
                  localStorage.removeItem("isPhoneVerified");
                  setShowChangeConfirm(false);
                }}
                type="button"
              >
                Yes, Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="login-backdrop">
          <div className="login-modal">
            <button
              className="crossbtn"
              onClick={() => {
                setShowOtpModal(false);
                setOtp(["", "", "", ""]);
                setTimer(30);
              }}
              type="button"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <h3 className="login-title">Verify OTP</h3>
            <p className="login-sub">Enter the 4-digit code sent to +91 {maskMobile(mobile)}</p>

            <div className="otp-inputs">
              {otp.map((v, i) => (
                <input
                  key={i}
                  maxLength={1}
                  inputMode="numeric"
                  value={v}
                  ref={(el) => (otpRefs.current[i] = el)}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    const newOtp = [...otp];
                    newOtp[i] = val;
                    setOtp(newOtp);
                    if (val && otpRefs.current[i + 1]) {
                      otpRefs.current[i + 1].focus();
                    }
                  }}
                />
              ))}
            </div>

            <button
              onClick={verifyOTP}
              className="verifyOtpBtn"
              type="button"
              disabled={loading}
            >
              <span className="material-symbols-outlined">check_circle</span>
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            {timer > 0 ? (
              <p className="resend-box">Resend OTP in <strong>{timer}s</strong></p>
            ) : (
              <button className="ResendOtpBtn" onClick={() => sendOTP(true)} type="button">
                Resend OTP
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
};

export default FreeRagistrationEvents;
