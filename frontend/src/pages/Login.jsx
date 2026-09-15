import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";

import {
  Loader2,
  Mail,
  Lock,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import logo from "../assets/sabawoon-logo.png";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [email, setEmail] = useState("admin@hmsms.local");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      // Authenticate normally
      await login(email, password);

      // Small success notification
      toast.success("Welcome back!");

      // IMPORTANT:
      // Go to the cinematic welcome screen first.
      // WelcomeScreen will automatically send the user
      // to /app after the animation finishes.
      nav("/welcome", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d10] text-white flex items-center justify-center relative overflow-hidden">
      {/* =========================================================
          BACKGROUND
      ========================================================= */}

      {/* Main ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-280px] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[#f2bd19]/[0.055] blur-[140px]" />

        <div className="absolute bottom-[-350px] right-[-200px] w-[650px] h-[650px] rounded-full bg-[#f2bd19]/[0.025] blur-[130px]" />

        <div className="absolute top-1/2 left-[-300px] w-[500px] h-[500px] rounded-full bg-white/[0.015] blur-[120px]" />
      </div>

      {/* Fine grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}

      <div className="relative z-10 w-full max-w-[430px] px-5 py-8">
        {/* Top brand */}
        <div className="flex flex-col items-center mb-7">
          {/* Logo */}
          <div className="relative">
            {/* Gold ring glow */}
            <div className="absolute inset-[-7px] rounded-[22px] border border-[#f2bd19]/20" />

            <div className="w-[76px] h-[76px] rounded-[18px] bg-white border border-white/10 flex items-center justify-center p-3 shadow-[0_15px_50px_rgba(0,0,0,0.35)]">
              <img
                src={logo}
                alt="Sabawoon Educational Academy"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>

          {/* Portal label */}
          <div className="flex items-center gap-2 mt-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.8)]" />

            <span className="text-[10px] uppercase tracking-[0.24em] font-semibold text-slate-400">
              Administrator Portal
            </span>

            <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.8)]" />
          </div>
        </div>

        {/* =========================================================
            LOGIN CARD
        ========================================================= */}

        <div className="relative">
          {/* Outer gold accent */}
          <div className="absolute -inset-px rounded-[17px] bg-gradient-to-b from-[#f2bd19]/25 via-transparent to-transparent pointer-events-none" />

          <form
            onSubmit={submit}
            className="relative bg-[#121519] border border-white/[0.09] rounded-2xl overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
            data-testid="login-form"
          >
            {/* Top gold line */}
            <div className="h-[2px] w-full bg-[#f2bd19]" />

            <div className="p-7 sm:p-8">
              {/* Header */}
              <div className="mb-7">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-[25px] leading-tight font-semibold tracking-[-0.02em] text-white">
                      Welcome back
                    </h1>

                    <p className="text-[12px] text-slate-400 mt-2">
                      Sign in to continue to your administration workspace.
                    </p>
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/15 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-[19px] h-[19px] text-[#f2bd19]" />
                  </div>
                </div>
              </div>

              {/* =====================================================
                  EMAIL
              ===================================================== */}

              <div className="mb-5">
                <label
                  htmlFor="login-email"
                  className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-2"
                >
                  Email address
                </label>

                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full h-[47px] pl-10 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[13px] text-slate-100 placeholder:text-slate-600 outline-none transition-all focus:border-[#f2bd19]/60 focus:ring-2 focus:ring-[#f2bd19]/10 hover:border-white/[0.15]"
                    placeholder="Administrator email"
                    data-testid="login-email"
                  />
                </div>
              </div>

              {/* =====================================================
                  PASSWORD
              ===================================================== */}

              <div className="mb-7">
                <label
                  htmlFor="login-password"
                  className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-2"
                >
                  Password
                </label>

                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full h-[47px] pl-10 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[13px] text-slate-100 placeholder:text-slate-600 outline-none transition-all focus:border-[#f2bd19]/60 focus:ring-2 focus:ring-[#f2bd19]/10 hover:border-white/[0.15]"
                    placeholder="Enter your password"
                    data-testid="login-password"
                  />
                </div>
              </div>

              {/* =====================================================
                  SIGN IN BUTTON
              ===================================================== */}

              <button
                type="submit"
                disabled={loading}
                className="group w-full h-[48px] rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_25px_rgba(242,189,25,0.14)] hover:shadow-[0_10px_30px_rgba(242,189,25,0.22)]"
                data-testid="login-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-[16px] h-[16px] transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              {/* =====================================================
                  SECURITY NOTE
              ===================================================== */}

              <div className="flex items-center justify-center gap-2 mt-5">
                <Sparkles className="w-[12px] h-[12px] text-[#f2bd19]/70" />

                <span className="text-[10px] text-slate-500">
                  Authorized administration access only
                </span>
              </div>
            </div>
          </form>
        </div>

        {/* =========================================================
            FOOTER
        ========================================================= */}

        <div className="text-center mt-7">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-10 bg-white/[0.07]" />

            <div className="w-1 h-1 rounded-full bg-[#f2bd19]/60" />

            <div className="h-px w-10 bg-white/[0.07]" />
          </div>

          <p className="text-[10px] text-slate-600">
            © 2026 — All rights reserved.
          </p>

          <p className="text-[11px] text-slate-500 mt-1.5">
            Made by{" "}
            <span className="font-semibold text-slate-400">
              Teacher Ayman Najman
            </span>{" "}
            <span className="text-[#f2bd19]/80">“REAL BATMAN"</span>{" "}
            <span className="opacity-80">🦇</span>
          </p>
        </div>
      </div>
    </div>
  );
}
