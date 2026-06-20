import "./loginModal.css";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import axios from "axios";

/* Indian mobile: exactly 10 digits, starting with 6-9. */
const MOBILE_REGEX = /^[6-9]\d{9}$/;

const LoginModal = () => {
    const { showLogin, loginMobile, login, closeLogin, sessionExpired } = useAuth();
    const toast = useToast();

    const BASEURL = import.meta.env.VITE_BASEURL
    const [step, setStep] = useState("mobile");
    const [mobile, setMobile] = useState("");
    const [timer, setTimer] = useState(30);
    const [otp, setOtp] = useState(["", "", "", ""]);
    const [ loading, setLoading ] =useState(false)
    const [error, setError] = useState("");

    const otpRefs = useRef([]);

    /* PREFILL mobile when the modal opens (e.g. from the cart contact form) */
    useEffect(() => {
        if (showLogin) {
            setStep("mobile");
            setMobile((loginMobile || "").replace(/\D/g, "").slice(0, 10));
            setError("");
        }
    }, [showLogin, loginMobile]);

    /* TIMER */
    useEffect(() => {
        if (step === "otp" && timer > 0) {
            const t = setTimeout(() => setTimer((prev) => prev - 1), 1000);
            return () => clearTimeout(t);
        }
    }, [timer, step]);

    /* AUTO FOCUS FIRST OTP */
    useEffect(() => {
        if (step === "otp") {
            setTimeout(() => {
                otpRefs.current[0]?.focus();
            }, 100);
        }
    }, [step]);

    if (!showLogin) return null;

    const isMobileValid = MOBILE_REGEX.test(mobile);

    /* SEND OTP */
    const sendOTP = async () => {
        if (!isMobileValid) {
            toast?.error("Enter a valid 10-digit mobile number starting with 6-9");
            return;
        }

        try {
            setLoading(true)
            setError("");
            const res = await axios.post(`${BASEURL}/auth/send-otp`, {
                mobile: mobile
            });
            if (!res.data.success) {
                setError(res.data?.message || "Failed to send OTP. Please try again.");
                return;
            }

            setStep("otp");
            setTimer(30);
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to send OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    /* VERIFY OTP */
    const verifyOTP = async () => {
        if (otp.join("").length !== 4) {
            setError("Please enter the 4-digit OTP.");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const res = await axios.post(`${BASEURL}/auth/verify-otp`, {
                mobile,
                otp: otp.join(""),
                deviceId: "lll",
                deviceName: "kjjj",
            });

            if (!res.data.success) {
                setError(res.data?.message || "OTP verification failed. Please try again.");
                return;
            }

            /* STORE USER LOGIN */
            const userData = { ...res.data.data, mobile };
            login(userData, res.data.data.accessToken);
            toast?.success(`Welcome back${userData?.name ? `, ${userData.name}` : ""}! 👋`);

            setStep("mobile");
            setMobile("");
            setOtp(["", "", "", ""]);
            setError("");
        } catch (err) {
            setError(err?.response?.data?.message || "Incorrect or expired OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-backdrop" onClick={closeLogin}>
            <div className="login-modal" onClick={(e) => e.stopPropagation()}>

                <button className="close-btn" onClick={closeLogin} aria-label="Close" type="button">
                    <span className="material-symbols-outlined">close</span>
                </button>

                <div className="login-hero">
                    <div className="login-hero-glow" aria-hidden="true" />
                    <div className="login-image">
                        <img
                            src=" https://ep.sanskargroup.in/img/newlogo.png"
                            alt="Sanskar Events"
                        />
                    </div>
                    <div className="login-hero-tag">Sanskar · Premium Access</div>
                </div>

                {/* MOBILE STEP */}
                {step === "mobile" && (
                    <div className="step">
                        <h3 className="login-title">Login or Sign up</h3>
                        {sessionExpired ? (
                            <p className="login-sub login-session-note">
                                Your session expired. Please log in again to continue.
                            </p>
                        ) : (
                            <p className="login-sub">Enter your mobile number to continue</p>
                        )}

                        <div className="mobile-input">
                            <span className="country-code">🇮🇳 +91</span>
                            <input
                                value={mobile}
                                onChange={(e) => {
                                    setMobile(e.target.value.replace(/\D/g, ""));
                                    if (error) setError("");
                                }}
                                maxLength={10}
                                placeholder="98765 43210"
                                inputMode="numeric"
                            />
                        </div>

                        {mobile.length > 0 && !isMobileValid && (
                            <p className="login-error">Enter a valid 10-digit number starting with 6-9.</p>
                        )}
                        {error && isMobileValid && <p className="login-error" role="alert">{error}</p>}

                        <button className="primary-btn" onClick={sendOTP} disabled={loading || !isMobileValid} type="button">
                            {loading ? (
                                <span className="kc-btn-loading">
                                    <span className="kc-btn-spinner" /> Sending OTP
                                </span>
                            ) : (
                                <>
                                    Continue
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </>
                            )}
                        </button>

                        <p className="login-legal">
                            By continuing, you agree to our Terms &amp; Privacy Policy.
                        </p>
                    </div>
                )}

                {/* OTP STEP */}
                {step === "otp" && (
                    <div className="step">
                        <h3 className="login-title">Verify OTP</h3>
                        <p className="otp-mobile-info">
                            OTP sent to <strong>+91 {mobile}</strong>{" "}
                            <span
                                className="edit-number"
                                onClick={() => {
                                    setStep("mobile");
                                    setOtp(["", "", "", ""]);
                                    setError("");
                                }}
                            >
                                Edit
                            </span>
                        </p>
                        <p className="login-sub">Enter the 4-digit code</p>

                        <div className="otp-inputs">
                            {otp.map((v, i) => (
                                <input
                                    key={i}
                                    ref={(el) => (otpRefs.current[i] = el)}
                                    maxLength="1"
                                    inputMode="numeric"
                                    value={v}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "");
                                        const newOtp = [...otp];
                                        newOtp[i] = val;
                                        setOtp(newOtp);
                                        if (error) setError("");

                                        if (val && otpRefs.current[i + 1]) {
                                            otpRefs.current[i + 1].focus();
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Backspace" &&
                                            !otp[i] &&
                                            otpRefs.current[i - 1]
                                        ) {
                                            otpRefs.current[i - 1].focus();
                                        }
                                    }}
                                />
                            ))}
                        </div>

                        {error && <p className="login-error otp-error" role="alert">{error}</p>}

                        <p className="resend-box">
                            {timer > 0
                                ? <>Resend OTP in <strong>{timer}s</strong></>
                                : "Didn’t receive OTP?"}
                        </p>

                        <button className="primary-btn" onClick={verifyOTP} disabled={loading} type="button">
                            {loading ? (
                                <span className="kc-btn-loading">
                                    <span className="kc-btn-spinner" /> Verifying
                                </span>
                            ) : (
                                <>
                                    Verify &amp; Continue
                                    <span className="material-symbols-outlined">check_circle</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoginModal;
