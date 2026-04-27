import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";
import api from "../api/client.js";

function validatePhone(raw) {
  const stripped = raw.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  if (!stripped) return "Phone number is required";
  if (!/^\d+$/.test(stripped)) return "Digits only";
  if (stripped.length !== 10) return `Must be 10 digits (you entered ${stripped.length})`;
  if (!/^[6-9]/.test(stripped)) return "Must start with 6, 7, 8, or 9";
  return null;
}

// Step 1: Enter phone → Step 2: Enter OTP → Step 3: Enter name + password
export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifyToken, setVerifyToken] = useState("");
  const [form, setForm] = useState({ name: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [modal, setModal] = useState(null);
  const otpRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setPhone(val);
    setPhoneError(val ? (validatePhone(val) || "") : "");
  };

  // Step 1 → send OTP
  const sendOTP = async (e) => {
    e?.preventDefault();
    const err = validatePhone(phone);
    if (err) { setPhoneError(err); return; }
    setLoading(true);
    try {
      await api.post("/auth/send-otp", { phone });
      setStep(2);
      setResendTimer(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to send OTP";
      setModal({ type: "danger", title: "Error", message: msg, confirmText: "OK", onConfirm: () => setModal(null) });
    } finally {
      setLoading(false);
    }
  };

  // OTP input handling — auto-advance, backspace goes back
  const handleOtpChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  // Step 2 → verify OTP
  const verifyOTP = async (e) => {
    e?.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone, otp: code });
      setVerifyToken(data.verifyToken);
      setStep(3);
    } catch (err) {
      const msg = err.response?.data?.error || "Invalid OTP";
      setModal({ type: "danger", title: "Verification Failed", message: msg, confirmText: "Try Again", onConfirm: () => { setModal(null); setOtp(["","","","","",""]); otpRefs.current[0]?.focus(); } });
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (step === 2 && otp.join("").length === 6) verifyOTP();
  }, [otp]);

  // Step 3 → complete registration
  const register = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { phone, ...form, verifyToken });
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      setModal({
        type: "alert", title: "Welcome! 🎉",
        message: `Account created! Welcome to Speak & Shine, ${data.name}!`,
        confirmText: "Let's Go",
        onConfirm: () => { setModal(null); navigate("/dashboard", { replace: true }); },
      });
    } catch (err) {
      const msg = err.response?.data?.error || "Registration failed";
      setModal({ type: "danger", title: "Error", message: msg, confirmText: "OK", onConfirm: () => setModal(null) });
    } finally {
      setLoading(false);
    }
  };

  const phoneOk = !phoneError && phone.length > 0;

  return (
    <div className="auth-page">
      {modal && <Modal type={modal.type} title={modal.title} message={modal.message} confirmText={modal.confirmText} onConfirm={modal.onConfirm} />}

      <div className="auth-card">
        <div className="auth-logo">🗣️</div>
        <h1 className="auth-title">Create Account</h1>

        {/* Step indicators */}
        <div className="otp-steps">
          {["Phone", "Verify", "Details"].map((label, i) => (
            <div key={i} className={`otp-step ${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}`}>
              <div className="otp-step-dot">{step > i + 1 ? "✓" : i + 1}</div>
              <div className="otp-step-label">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Step 1: Phone ── */}
        {step === 1 && (
          <form onSubmit={sendOTP}>
            <p className="auth-sub" style={{ marginBottom: 16 }}>Enter your WhatsApp number</p>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: "relative" }}>
                <input className={`form-input ${phoneError ? "input-error" : phoneOk ? "input-ok" : ""}`}
                  type="tel" placeholder="9876543210" value={phone}
                  onChange={handlePhoneChange} required maxLength={13} autoFocus />
                {phoneOk && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#22c55e" }}>✓</span>}
              </div>
              {phoneError && <p className="input-error-msg">⚠ {phoneError}</p>}
              {!phoneError && !phoneOk && <p className="input-hint">10-digit number, with or without +91</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading || !!phoneError || !phone}>
              {loading ? "Sending OTP…" : "Send OTP →"}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP ── */}
        {step === 2 && (
          <form onSubmit={verifyOTP}>
            <p className="auth-sub" style={{ marginBottom: 4 }}>OTP sent to</p>
            <p style={{ color: "#a78bfa", fontWeight: 600, marginBottom: 20, textAlign: "center" }}>
              +91 {phone.replace(/^(\+91|91)/, "")}
            </p>
            <div className="otp-boxes">
              {otp.map((digit, i) => (
                <input key={i} ref={(el) => (otpRefs.current[i] = el)}
                  className="otp-box" type="text" inputMode="numeric"
                  maxLength={1} value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)} />
              ))}
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 16 }}
              disabled={loading || otp.join("").length !== 6}>
              {loading ? "Verifying…" : "Verify OTP"}
            </button>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              {resendTimer > 0 ? (
                <span className="input-hint">Resend in {resendTimer}s</span>
              ) : (
                <button type="button" className="auth-link-btn" onClick={sendOTP} disabled={loading}>
                  Resend OTP
                </button>
              )}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button type="button" className="auth-link-btn" onClick={() => { setStep(1); setOtp(["","","","","",""]); }}>
                ← Change number
              </button>
            </div>
          </form>
        )}

        {/* ── Step 3: Name + Password ── */}
        {step === 3 && (
          <form onSubmit={register}>
            <p className="auth-sub" style={{ marginBottom: 16 }}>✅ Phone verified! Complete your profile</p>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" type="text" placeholder="Your name"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Create a password (min 6 chars)"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Creating account…" : "Create Account 🎉"}
            </button>
          </form>
        )}

        <p className="auth-link" style={{ marginTop: 16 }}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
