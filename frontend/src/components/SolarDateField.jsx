import { useEffect, useState } from "react";
import { toJalaali, toGregorian, isValidJalaaliDate } from "jalaali-js";

/* ============================================================
   SOLAR HIJRI <-> GREGORIAN HELPERS
   The API and database always store plain Gregorian ISO dates
   such as "2026-09-21". Only the input and display layers work
   with Solar Hijri dates such as "1405/06/30".
============================================================ */

/* ============================================================
   API DATE NORMALIZATION

   PostgreSQL DATE columns arrive from the API as real Date
   objects, while everything the app sends back is a plain
   "YYYY-MM-DD" string. Both shapes are accepted so a date always
   resolves to the calendar day that was actually stored.
============================================================ */

export function toIsoDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const raw = String(value).slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export function gregorianToSolarInput(value) {
  const raw = toIsoDate(value);

  if (!raw) {
    return "";
  }

  const [gy, gm, gd] = raw.split("-").map(Number);

  try {
    const result = toJalaali(gy, gm, gd);

    return `${String(result.jy).padStart(4, "0")}/${String(result.jm).padStart(
      2,
      "0",
    )}/${String(result.jd).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function solarInputToGregorian(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/-/g, "/");

  const match = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (!isValidJalaaliDate(jy, jm, jd)) {
    return null;
  }

  try {
    const result = toGregorian(jy, jm, jd);

    return `${String(result.gy).padStart(4, "0")}-${String(result.gm).padStart(
      2,
      "0",
    )}-${String(result.gd).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/* ============================================================
   SOLAR DATE FIELD
============================================================ */

export default function SolarDateField({
  label,
  value,
  onChange,
  required = false,
  optional = false,
}) {
  const [displayValue, setDisplayValue] = useState(
    gregorianToSolarInput(value),
  );
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayValue(gregorianToSolarInput(value));
  }, [value]);

  function handleChange(event) {
    const nextValue = event.target.value;

    setDisplayValue(nextValue);
    setError("");

    if (!nextValue.trim()) {
      onChange("");
      return;
    }

    const normalized = nextValue.replace(/-/g, "/");

    // While the user is typing, don't show an error prematurely.
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized)) {
      return;
    }

    const gregorianValue = solarInputToGregorian(normalized);

    if (!gregorianValue) {
      setError("Invalid Solar Hijri date.");
      return;
    }

    onChange(gregorianValue);
  }

  function handleBlur() {
    if (!displayValue.trim()) {
      setError("");
      onChange("");
      return;
    }

    const normalized = displayValue.replace(/-/g, "/");
    const gregorianValue = solarInputToGregorian(normalized);

    if (!gregorianValue) {
      setError("Use a valid date such as 1405/06/30.");
      return;
    }

    setError("");

    const [jy, jm, jd] = normalized.split("/").map(Number);

    setDisplayValue(
      `${String(jy).padStart(4, "0")}/${String(jm).padStart(
        2,
        "0",
      )}/${String(jd).padStart(2, "0")}`,
    );

    onChange(gregorianValue);
  }

  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1.5">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}

        {!required && optional && (
          <span className="text-slate-700 ml-1">(optional)</span>
        )}
      </label>

      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="YYYY/MM/DD"
          maxLength={10}
          className={`w-full h-10 px-3 rounded-lg bg-[#0b0d10] border text-sm text-slate-300 outline-none focus:bg-[#0c0f12] placeholder:text-slate-700 transition ${
            error
              ? "border-red-500/40 focus:border-red-500/60"
              : "border-white/10 focus:border-[#f2bd19]/50"
          }`}
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-[9px] text-red-400">{error}</p>
      ) : (
        <p className="mt-1.5 text-[8px] text-slate-700">
          Solar Hijri date • YYYY/MM/DD
        </p>
      )}
    </div>
  );
}