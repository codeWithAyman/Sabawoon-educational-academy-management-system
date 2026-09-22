import { useEffect, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import api from "../lib/api";

export default function PasswordConfirmModal({
  open,
  title = "Confirm your password",
  description = "Enter your password to continue.",
  confirmLabel = "Verify & Continue",
  onVerified,
  onCancel,
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setShowPassword(false);
      setLoading(false);
      setError("");
      return;
    }

    setPassword("");
    setShowPassword(false);
    setLoading(false);
    setError("");

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !loading) {
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, loading, onCancel]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedPassword = password;

    if (!trimmedPassword) {
      setError("Enter your password to continue.");
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/verify-password", {
        password: trimmedPassword,
      });

      setPassword("");
      setShowPassword(false);
      setLoading(false);

      onVerified?.(response.data);
    } catch (error) {
      setLoading(false);

      const status = error?.response?.status;
      const code = error?.response?.data?.code;

      if (status === 401 || code === "PASSWORD_INCORRECT") {
        setError("Incorrect password. Please try again.");
      } else {
        setError(
          error?.response?.data?.error ||
            "Unable to verify your password. Please try again.",
        );
      }

      setPassword("");
      inputRef.current?.focus();
    }
  };

  const handleCancel = () => {
    if (loading) return;

    setPassword("");
    setShowPassword(false);
    setError("");

    onCancel?.();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          handleCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121519] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-confirm-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2bd19]/10 text-[#f2bd19]">
              <KeyRound size={20} />
            </div>

            <div className="min-w-0">
              <h2
                id="password-confirm-title"
                className="text-base font-semibold text-white"
              >
                {title}
              </h2>

              <p className="mt-1 text-sm leading-5 text-slate-400">
                {description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-sm text-red-300">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="password-confirm-input"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  id="password-confirm-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  disabled={loading}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-[#0b0d10] px-4 py-3 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#f2bd19]/60 focus:ring-2 focus:ring-[#f2bd19]/10 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !password}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#f2bd19] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#dcae16] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <KeyRound size={17} />
                  {confirmLabel}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
