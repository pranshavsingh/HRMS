import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showForgot, setShowForgot] = useState(false);
  const [step, setStep] = useState(1);
  const [mail, setMail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  const handleLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;

    const username = form.username.trim();
    const password = form.password;

    if (!username && !password) {
      setError("Please enter your username and password.");
      return;
    }
    if (!username) {
      setError("Please enter your username or email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setError("");
    try {
      setLoading(true);
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    try {
      setForgotLoading(true);
      setForgotMsg("");
      await API.post("/auth/forgot-password/request-otp/", { email: mail });
      setStep(2);
      setForgotMsg("OTP sent to your email.");
    } catch (err) {
      setForgotMsg(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setForgotLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setForgotLoading(true);
      setForgotMsg("");
      const res = await API.post("/auth/forgot-password/verify-otp/", { email: mail, otp });
      if (res.data?.reset_token) {
        setResetToken(res.data.reset_token);
      }
      setStep(3);
      setForgotMsg("OTP verified. Set your new password.");
    } catch (err) {
      setForgotMsg(err.response?.data?.error || "Invalid OTP");
    } finally {
      setForgotLoading(false);
    }
  };

  const resetPassword = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setForgotMsg("Password must be at least 8 characters long.");
      return;
    }
    try {
      setForgotLoading(true);
      setForgotMsg("");
      await API.post("/auth/forgot-password/reset/", {
        email: mail,
        otp,
        reset_token: resetToken,
        new_password: newPassword,
      });
      // M02: Reset all state and close forgot panel on success
      setMail("");
      setOtp("");
      setResetToken("");
      setNewPassword("");
      setStep(1);
      setShowForgot(false);
      setError("Password reset successful! Please log in with your new password.");
    } catch (err) {
      setForgotMsg(err.response?.data?.error || "Reset failed");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
        <div className="bg-gradient-to-br from-cyan-600 via-blue-700 to-indigo-900 p-10 hidden md:flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/80">HRMS Portal</p>
            <h1 className="text-4xl font-black leading-tight mt-4">Secure Workforce Access</h1>
            <p className="mt-4 text-cyan-100/90">Attendance, leave and team operations in one place.</p>
          </div>
          <p className="text-sm text-cyan-100/80">Use your employee credentials to continue</p>
        </div>

        <div className="bg-white text-slate-900 p-8 md:p-10">
          <h2 className="text-3xl font-bold">Welcome back</h2>
          <p className="text-slate-500 mt-1">Login to continue to your dashboard</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input
              type="text"
              placeholder="Username or Email"
              className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-60 font-semibold"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForgot(true);
                setForgotMsg("");
              }}
              className="text-sm text-blue-700 hover:text-blue-800 font-semibold"
            >
              Forgot password?
            </button>
          </form>

          {showForgot && (
            <div className="mt-8 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Reset Password</h3>
                <button
                  className="text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => {
                    setShowForgot(false);
                    setStep(1);
                    setForgotMsg("");
                  }}
                >
                  Close
                </button>
              </div>

              {step === 1 && (
                <>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="w-full p-3 border border-slate-300 rounded-xl"
                    value={mail}
                    onChange={(e) => setMail(e.target.value)}
                  />
                  <button
                    onClick={requestOtp}
                    disabled={forgotLoading}
                    className="w-full bg-slate-900 text-white p-3 rounded-xl"
                  >
                    {forgotLoading ? "Sending OTP..." : "Send OTP"}
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <input
                    type="text"
                    placeholder="Enter OTP"
                    className="w-full p-3 border border-slate-300 rounded-xl"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <button
                    onClick={verifyOtp}
                    disabled={forgotLoading}
                    className="w-full bg-slate-900 text-white p-3 rounded-xl"
                  >
                    {forgotLoading ? "Verifying..." : "Verify OTP"}
                  </button>
                </>
              )}

              {step === 3 && (
                <>
                  <input
                    type="password"
                    placeholder="New password"
                    className="w-full p-3 border border-slate-300 rounded-xl"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    onClick={resetPassword}
                    disabled={forgotLoading}
                    className="w-full bg-emerald-600 text-white p-3 rounded-xl"
                  >
                    {forgotLoading ? "Resetting..." : "Reset Password"}
                  </button>
                </>
              )}

              {forgotMsg && <p className="text-sm text-slate-700">{forgotMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}