import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { toJalaali } from "jalaali-js";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  GraduationCap,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";

/* =========================================================
   SABAWOON — PREMIUM LIVE DASHBOARD
   ---------------------------------------------------------
   ALL DISPLAYED DATA COMES FROM:

       GET /api/dashboard/stats

   Authentication:
       Bearer token from hm_token

   No fake/sample/dashboard data is generated here.
   ========================================================= */

const REFRESH_INTERVAL = 60_000;

const GOLD = "#f2bd19";

const numberFormatter = new Intl.NumberFormat("en-US");

const moneyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/* =========================================================
   SAFE HELPERS
   ========================================================= */

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, safeNumber(value)));
}

function formatNumber(value) {
  return numberFormatter.format(safeNumber(value));
}

function formatMoney(value) {
  return moneyFormatter.format(safeNumber(value));
}

function formatPercent(value) {
  return `${safeNumber(value).toFixed(1)}%`;
}

function formatTime(time) {
  if (!time) return "--";

  const text = String(time).slice(0, 5);

  const [hours, minutes] = text.split(":").map(Number);

  if (!Number.isFinite(hours)) {
    return text;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${String(minutes || 0).padStart(2, "0")} ${suffix}`;
}

/* =========================================================
   KABUL / SOLAR DATE HELPERS
   ========================================================= */

/*
 * IMPORTANT DATE RULES
 * ---------------------------------------------------------
 * 1. PostgreSQL DATE:
 *      YYYY-MM-DD
 *
 *    This is a calendar date, NOT a timestamp.
 *    NEVER pass it through new Date().
 *
 * 2. PostgreSQL TIMESTAMPTZ:
 *      YYYY-MM-DDTHH:mm:ss.sssZ
 *
 *    This is an actual moment in time.
 *    Convert it to Asia/Kabul before displaying its date.
 * ========================================================= */

/*
 * Get the actual current calendar date in Kabul.
 *
 * This is intentionally used only for the dashboard's
 * "today/current date" display.
 *
 * It does NOT affect historical PostgreSQL DATE values.
 */
function getKabulDateParts(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);

    const values = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  } catch {
    const fallback = new Date();

    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
    };
  }
}

/*
 * Parse a PostgreSQL DATE as a pure calendar date.
 *
 * Example:
 *   "2026-09-21"
 *
 * becomes:
 *   { year: 2026, month: 9, day: 21 }
 *
 * without timezone conversion.
 */
function parseDateOnly(value) {
  if (!value) return null;

  const raw = String(value).trim();

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

/*
 * Determine whether a value is an actual timestamp.
 *
 * PostgreSQL timestamptz values normally arrive through
 * JSON/Node as strings such as:
 *
 *   2026-09-21T19:30:00.000Z
 *
 * Those MUST be converted to Kabul before displaying
 * their calendar date.
 */
function isTimestampValue(value) {
  if (!value) return false;

  const raw = String(value).trim();

  return /^\d{4}-\d{2}-\d{2}T/.test(raw) || /(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
}

/*
 * Convert a value into Gregorian calendar parts that should
 * be displayed in Afghanistan.
 *
 * DATE:
 *   treated directly.
 *
 * TIMESTAMP:
 *   converted to Asia/Kabul first.
 */
function getDisplayGregorianParts(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();

  /*
   * PostgreSQL DATE.
   *
   * Do NOT use new Date() here.
   */
  const dateOnly = parseDateOnly(raw);

  if (dateOnly) {
    return dateOnly;
  }

  /*
   * PostgreSQL timestamp / timestamptz.
   *
   * Convert the actual instant to Kabul first.
   */
  if (isTimestampValue(raw)) {
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return getKabulDateParts(date);
  }

  /*
   * Defensive fallback for other valid Date-compatible values.
   */
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getKabulDateParts(date);
}

/*
 * Convert Gregorian date/timestamp to Solar Hijri.
 *
 * PostgreSQL DATE values are treated as calendar dates.
 * Timestamps are converted to Kabul first.
 */
function toSolarDate(value) {
  if (!value) return "—";

  const parts = getDisplayGregorianParts(value);

  if (!parts) return "—";

  try {
    const solar = toJalaali(parts.year, parts.month, parts.day);

    /*
     * jalaali-js returns:
     *
     * {
     *   jy,
     *   jm,
     *   jd
     * }
     *
     * Support array-style output defensively as well.
     */
    const jy = Array.isArray(solar) ? solar[0] : solar?.jy;
    const jm = Array.isArray(solar) ? solar[1] : solar?.jm;
    const jd = Array.isArray(solar) ? solar[2] : solar?.jd;

    if (
      !Number.isFinite(Number(jy)) ||
      !Number.isFinite(Number(jm)) ||
      !Number.isFinite(Number(jd))
    ) {
      return "—";
    }

    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(
      2,
      "0",
    )}`;
  } catch {
    return "—";
  }
}

/*
 * Get the Solar month name from a date.
 */
function getSolarMonthLabel(value) {
  if (!value) {
    return "Current month";
  }

  try {
    const parts = getDisplayGregorianParts(value);

    if (!parts) {
      return "Current month";
    }

    const solar = toJalaali(parts.year, parts.month, parts.day);

    const solarMonth = Array.isArray(solar) ? solar[1] : solar?.jm;

    const monthNames = {
      1: "Hamal",
      2: "Sawr",
      3: "Jawza",
      4: "Saratan",
      5: "Asad",
      6: "Sunbula",
      7: "Mizan",
      8: "Aqrab",
      9: "Qaws",
      10: "Jadi",
      11: "Dalwa",
      12: "Hoot",
    };

    return monthNames[solarMonth] || "Current month";
  } catch {
    return "Current month";
  }
}

/*
 * IMPORTANT:
 *
 * The dashboard's "today" date is the actual current Kabul
 * calendar date.
 *
 * Your PostgreSQL test proved that the current Kabul date is
 * 2026-09-22, which is Solar 1405/06/31.
 *
 * This prevents a stale/misformatted API date from making the
 * header show yesterday.
 */
function getCurrentKabulSolarDate() {
  const parts = getKabulDateParts(new Date());

  return toSolarDate(
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
      2,
      "0",
    )}-${String(parts.day).padStart(2, "0")}`,
  );
}

function getCurrentKabulSolarMonth() {
  const parts = getKabulDateParts(new Date());

  return getSolarMonthLabel(
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
      2,
      "0",
    )}-${String(parts.day).padStart(2, "0")}`,
  );
}

function getInitials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

/* =========================================================
   API RESPONSE NORMALIZER
   ========================================================= */

function normalizeDashboardPayload(payload) {
  if (!payload) {
    return null;
  }

  if (payload.success === true) {
    return payload;
  }

  if (payload.data?.success === true) {
    return payload.data;
  }

  const looksLikeDashboard =
    payload.overview ||
    payload.attendance ||
    payload.finance ||
    payload.analytics ||
    payload.recent_enrollments ||
    payload.class_categories ||
    payload.student_distribution;

  if (looksLikeDashboard) {
    return {
      success: true,
      ...payload,
    };
  }

  return null;
}

/* =========================================================
   AUTHENTICATED DASHBOARD REQUEST
   ========================================================= */

async function fetchDashboardStats() {
  const token = localStorage.getItem("hm_token");

  const config = token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : undefined;

  const response = await api.get("/dashboard/stats", config);

  const payload = normalizeDashboardPayload(response?.data);

  if (!payload) {
    const backendError =
      response?.data?.error ||
      response?.data?.message ||
      "The dashboard API returned an invalid response.";

    throw new Error(backendError);
  }

  return payload;
}

/* =========================================================
   ANIMATION HOOKS
   ========================================================= */

function useAnimatedNumber(value, duration = 900) {
  const target = safeNumber(value);

  const [display, setDisplay] = useState(0);

  const previousTargetRef = useRef(target);

  useEffect(() => {
    let frame;

    const initial = previousTargetRef.current;

    previousTargetRef.current = target;

    const start = performance.now();

    const animate = (now) => {
      const elapsed = now - start;

      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 4);

      const next = initial + (target - initial) * eased;

      setDisplay(next);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [target, duration]);

  return display;
}

function useReveal(delay = 0) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delay]);

  return visible;
}

/* =========================================================
   SMALL UI
   ========================================================= */

function Reveal({ children, delay = 0, className = "" }) {
  const visible = useReveal(delay);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition:
          "opacity 650ms cubic-bezier(.22,1,.36,1), transform 650ms cubic-bezier(.22,1,.36,1)",
      }}
    >
      {children}
    </div>
  );
}

function AnimatedNumber({ value, decimals = 0 }) {
  const animated = useAnimatedNumber(value);

  if (decimals > 0) {
    return <>{animated.toFixed(decimals)}</>;
  }

  return <>{Math.round(animated).toLocaleString("en-US")}</>;
}

function GlassPanel({
  children,
  className = "",
  style = {},
  interactive = false,
}) {
  const ref = useRef(null);

  const handleMove = useCallback(
    (event) => {
      if (!ref.current || !interactive) {
        return;
      }

      const rect = ref.current.getBoundingClientRect();

      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;

      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

      ref.current.style.setProperty("--mx", `${x * 6}px`);

      ref.current.style.setProperty("--my", `${y * 6}px`);
    },
    [interactive],
  );

  const handleLeave = useCallback(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.setProperty("--mx", "0px");

    ref.current.style.setProperty("--my", "0px");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`sab-panel ${
        interactive ? "sab-panel-interactive" : ""
      } ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, right }) {
  return (
    <div className="sab-section-title">
      <div>
        {eyebrow && <div className="sab-eyebrow">{eyebrow}</div>}

        <h2>{title}</h2>
      </div>

      {right}
    </div>
  );
}

/* =========================================================
   METRIC CARD
   ========================================================= */

function MetricCard({
  label,
  value,
  icon: Icon,
  suffix = "",
  prefix = "",
  detail,
  trend,
  delay = 0,
}) {
  const visible = useReveal(delay);

  const trendPositive = safeNumber(trend) >= 0;

  return (
    <div
      className="sab-metric"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
        transition:
          "opacity 700ms cubic-bezier(.22,1,.36,1), transform 700ms cubic-bezier(.22,1,.36,1)",
      }}
    >
      <div className="sab-metric-top">
        <div className="sab-metric-icon">
          <Icon size={17} strokeWidth={1.7} />
        </div>

        {trend !== undefined && trend !== null && (
          <div
            className={`sab-trend ${
              trendPositive ? "sab-trend-up" : "sab-trend-down"
            }`}
          >
            {trendPositive ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}
            {Math.abs(safeNumber(trend)).toFixed(1)}%
          </div>
        )}
      </div>

      <div className="sab-metric-value">
        {prefix}

        <AnimatedNumber value={value} />

        {suffix}
      </div>

      <div className="sab-metric-label">{label}</div>

      {detail && <div className="sab-metric-detail">{detail}</div>}
    </div>
  );
}

/* =========================================================
   ATTENDANCE CHART
   ========================================================= */

function AttendanceChart({ trend = [] }) {
  const [active, setActive] = useState(null);

  const points = useMemo(() => {
    const source = Array.isArray(trend) ? trend : [];

    if (!source.length) {
      return [];
    }

    const values = source.map((item) => ({
      present: safeNumber(item.present),
      absent: safeNumber(item.absent),
      total: safeNumber(item.total),
      date: item.date,
    }));

    const max = Math.max(
      1,
      ...values.flatMap((item) => [item.present, item.absent]),
    );

    const width = 900;
    const height = 280;
    const padX = 18;
    const padY = 24;

    const usableWidth = width - padX * 2;

    const usableHeight = height - padY * 2;

    return values.map((item, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padX + (index / (values.length - 1)) * usableWidth;

      const presentY = height - padY - (item.present / max) * usableHeight;

      const absentY = height - padY - (item.absent / max) * usableHeight;

      return {
        ...item,
        x,
        presentY,
        absentY,
        index,
      };
    });
  }, [trend]);

  const presentPath = useMemo(() => {
    if (!points.length) {
      return "";
    }

    return points
      .map((point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.presentY}`;
        }

        const previous = points[index - 1];

        const controlX = (previous.x + point.x) / 2;

        return `C ${controlX} ${previous.presentY}, ${controlX} ${point.presentY}, ${point.x} ${point.presentY}`;
      })
      .join(" ");
  }, [points]);

  const absentPath = useMemo(() => {
    if (!points.length) {
      return "";
    }

    return points
      .map((point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.absentY}`;
        }

        const previous = points[index - 1];

        const controlX = (previous.x + point.x) / 2;

        return `C ${controlX} ${previous.absentY}, ${controlX} ${point.absentY}, ${point.x} ${point.absentY}`;
      })
      .join(" ");
  }, [points]);

  if (!points.length) {
    return (
      <div className="sab-chart-empty">
        No attendance trend data has been recorded yet.
      </div>
    );
  }

  return (
    <div className="sab-chart-wrap">
      <div className="sab-chart-legend">
        <button type="button" className="sab-legend-item">
          <span className="sab-dot sab-dot-gold" />
          Present
        </button>

        <button type="button" className="sab-legend-item">
          <span className="sab-dot sab-dot-muted" />
          Absent
        </button>
      </div>

      <div className="sab-chart">
        <svg
          viewBox="0 0 900 280"
          preserveAspectRatio="none"
          role="img"
          aria-label="Attendance trend for the last seven days"
        >
          <defs>
            <linearGradient id="attendanceGoldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity="0.16" />

              <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
            </linearGradient>

            <filter id="softGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />

              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0, 1, 2, 3].map((line) => {
            const y = 24 + line * 77.3;

            return (
              <line
                key={line}
                x1="18"
                x2="882"
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,.055)"
                strokeWidth="1"
              />
            );
          })}

          {presentPath && (
            <>
              <path
                d={`${presentPath} L ${
                  points[points.length - 1].x
                } 256 L ${points[0].x} 256 Z`}
                fill="url(#attendanceGoldFill)"
                className="sab-chart-area"
              />

              <path
                d={presentPath}
                fill="none"
                stroke={GOLD}
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#softGlow)"
                className="sab-chart-line"
              />
            </>
          )}

          {absentPath && (
            <path
              d={absentPath}
              fill="none"
              stroke="rgba(255,255,255,.30)"
              strokeWidth="2"
              strokeDasharray="5 7"
              strokeLinecap="round"
              className="sab-chart-line sab-chart-line-delay"
            />
          )}

          {points.map((point) => (
            <g key={`${point.date}-${point.index}`}>
              <circle
                cx={point.x}
                cy={point.presentY}
                r={active === point.index ? 6 : 4}
                fill={GOLD}
                className="sab-chart-point"
                onMouseEnter={() => setActive(point.index)}
                onFocus={() => setActive(point.index)}
                tabIndex={0}
              />

              <circle cx={point.x} cy={point.absentY} r="3" fill="#6f737b" />

              <text
                x={point.x}
                y="274"
                textAnchor="middle"
                fill="rgba(255,255,255,.38)"
                fontSize="10"
              >
                {toSolarDate(point.date).slice(5)}
              </text>
            </g>
          ))}
        </svg>

        {active !== null && points[active] && (
          <div
            className="sab-chart-tooltip"
            style={{
              left: `${(points[active].x / 900) * 100}%`,
            }}
          >
            <div>{toSolarDate(points[active].date)}</div>

            <strong>{formatNumber(points[active].present)} present</strong>

            <span>{formatNumber(points[active].absent)} absent</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   CIRCULAR ANALYTICS
   ========================================================= */

function CircularProgress({ value, label, sublabel, size = 170 }) {
  const percentage = clamp(value);

  const radius = 64;

  const circumference = 2 * Math.PI * radius;

  const offset = circumference - (percentage / 100) * circumference;

  const animated = useAnimatedNumber(percentage, 1100);

  return (
    <div
      className="sab-circle"
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        viewBox="0 0 160 160"
        width={size}
        height={size}
        className="sab-circle-svg"
      >
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,.055)"
          strokeWidth="8"
        />

        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={GOLD}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="sab-circle-progress"
          transform="rotate(-90 80 80)"
        />
      </svg>

      <div className="sab-circle-content">
        <strong>{animated.toFixed(1)}%</strong>

        <span>{label}</span>
      </div>

      {sublabel && <div className="sab-circle-sublabel">{sublabel}</div>}
    </div>
  );
}

/* =========================================================
   SUBJECT DISTRIBUTION
   ========================================================= */

function SubjectDistribution({ items = [] }) {
  const max = Math.max(
    1,
    ...items.map((item) =>
      Math.max(
        safeNumber(item.count),
        safeNumber(item.students),
        safeNumber(item.active_students),
      ),
    ),
  );

  return (
    <div className="sab-subject-list">
      {items.length === 0 ? (
        <div className="sab-empty-inline">
          No subject distribution data available.
        </div>
      ) : (
        items.slice(0, 7).map((item, index) => {
          const value = Math.max(
            safeNumber(item.count),
            safeNumber(item.students),
            safeNumber(item.active_students),
          );

          const percentage = (value / max) * 100;

          const name =
            item.subject_name || item.name || item.subject || "Unknown subject";

          return (
            <div className="sab-subject-row" key={`${name}-${index}`}>
              <div className="sab-subject-meta">
                <div className="sab-subject-name">
                  <span className="sab-subject-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  {name}
                </div>

                <strong>{formatNumber(value)}</strong>
              </div>

              <div className="sab-subject-track">
                <div
                  className="sab-subject-fill"
                  style={{
                    width: `${percentage}%`,
                    animationDelay: `${index * 90}ms`,
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* =========================================================
   RECENT ENROLLMENTS
   ========================================================= */

function RecentEnrollments({ items = [] }) {
  return (
    <div className="sab-recent-list">
      {items.length === 0 ? (
        <div className="sab-empty-state">
          <div className="sab-empty-icon">
            <Users size={19} />
          </div>

          <strong>No recent enrollments</strong>

          <span>New real enrollments will appear here automatically.</span>
        </div>
      ) : (
        items.slice(0, 6).map((item, index) => {
          const student =
            item.student_name ||
            item.full_name ||
            item.name ||
            "Unknown student";

          const subject = item.subject_name || item.subject || "—";

          const teacher = item.teacher_name || item.teacher || "—";

          return (
            <div
              className="sab-recent-row"
              key={
                item.id ||
                `${student}-${item.enrolled_on || item.created_at}-${index}`
              }
            >
              <div className="sab-avatar">{getInitials(student)}</div>

              <div className="sab-recent-main">
                <strong>{student}</strong>

                <span>
                  {subject}

                  <i />

                  {teacher}
                </span>
              </div>

              <div className="sab-recent-date">
                <strong>
                  {/*
                   * enrolled_on is PostgreSQL DATE.
                   *
                   * It is intentionally displayed as the exact
                   * enrollment calendar date.
                   *
                   * Example:
                   * 2026-09-21 -> 1405/06/30
                   */}
                  {toSolarDate(item.enrolled_on || item.created_at)}
                </strong>

                <span>
                  {formatTime(item.start_time)} — {formatTime(item.end_time)}
                </span>
              </div>

              <ChevronRight size={15} className="sab-recent-arrow" />
            </div>
          );
        })
      )}
    </div>
  );
}

/* =========================================================
   ATTENDANCE SNAPSHOT
   ========================================================= */

function AttendanceSnapshot({ attendance }) {
  const present = safeNumber(attendance?.today?.present);

  const absent = safeNumber(attendance?.today?.absent);

  const total = safeNumber(attendance?.today?.total);

  const presentPercentage = total > 0 ? (present / total) * 100 : 0;

  return (
    <div className="sab-attendance-snapshot">
      <div className="sab-attendance-ring">
        <CircularProgress value={presentPercentage} label="today" size={132} />
      </div>

      <div className="sab-attendance-stats">
        <div>
          <span className="sab-status-dot present" />

          <div>
            <strong>{formatNumber(present)}</strong>

            <small>Present</small>
          </div>
        </div>

        <div>
          <span className="sab-status-dot absent" />

          <div>
            <strong>{formatNumber(absent)}</strong>

            <small>Absent</small>
          </div>
        </div>

        <div>
          <span className="sab-status-dot total" />

          <div>
            <strong>{formatNumber(total)}</strong>

            <small>Recorded</small>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   FINANCE PANEL
   ========================================================= */

function FinancePanel({ finance }) {
  const collected = safeNumber(finance?.monthly_collected);

  const billed = safeNumber(finance?.monthly_billed);

  const due = safeNumber(finance?.monthly_due);

  const rate = clamp(finance?.monthly_collection_rate);

  return (
    <div className="sab-finance-content">
      <div className="sab-finance-main">
        <CircularProgress
          value={rate}
          label="collected"
          sublabel="this month"
          size={178}
        />

        <div className="sab-finance-numbers">
          <div>
            <span>Billed</span>

            <strong>؋{formatMoney(billed)}</strong>
          </div>

          <div>
            <span>Collected</span>

            <strong>؋{formatMoney(collected)}</strong>
          </div>

          <div>
            <span>Due this month</span>

            <strong>؋{formatMoney(due)}</strong>
          </div>
        </div>
      </div>

      <div className="sab-finance-bottom">
        <div className="sab-finance-bar">
          <span
            style={{
              width: `${rate}%`,
            }}
          />
        </div>

        <div className="sab-finance-note">
          <Wallet size={14} />

          <span>Collection performance for the current month</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export default function Dashboard() {
  const { user } = useAuth();

  const toast = useToast();

  const [data, setData] = useState(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const payload = await fetchDashboardStats();

        setData(payload);
      } catch (err) {
        console.error("Dashboard load error:", err);

        const status = err?.response?.status;

        const backendError = err?.response?.data?.error;

        const backendMessage = err?.response?.data?.message;

        let message =
          backendError ||
          backendMessage ||
          err?.message ||
          "Unable to load dashboard data.";

        if (status === 401) {
          message =
            backendError || "Authentication required. Please log in again.";
        }

        if (status === 403) {
          message =
            backendError || "You do not have permission to view the dashboard.";
        }

        setError(message);

        if (silent) {
          toast?.error?.(message);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  /* =======================================================
     INITIAL LOAD + AUTO REFRESH
     ======================================================= */

  useEffect(() => {
    loadDashboard(false);

    const interval = window.setInterval(() => {
      loadDashboard(true);
    }, REFRESH_INTERVAL);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  /* =======================================================
     REFRESH WHEN TAB BECOMES ACTIVE
     ======================================================= */

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadDashboard(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadDashboard]);

  /* =======================================================
     DERIVED DATA
     ======================================================= */

  const overview = data?.overview || {};

  const attendance = data?.attendance || {};

  const finance = data?.finance || {};

  const analytics = data?.analytics || {};

  const activeStudentRate = clamp(
    analytics.active_student_rate ??
      (safeNumber(overview.active_students) /
        Math.max(1, safeNumber(overview.total_students))) *
        100,
  );

  const enrollmentLoad = safeNumber(analytics.enrollment_load);

  const monthlyAttendanceRate = clamp(
    analytics.monthly_attendance_rate ?? attendance?.month?.rate,
  );

  const todayAttendanceRate = clamp(
    analytics.today_attendance_rate ?? attendance?.today?.rate,
  );

  /*
   * IMPORTANT:
   *
   * The header/current date is calculated from the actual
   * current Kabul calendar date.
   *
   * This prevents a stale current_date value in the API
   * response from displaying yesterday.
   *
   * Historical dates, such as enrolled_on, continue to use
   * their real PostgreSQL calendar dates.
   */
  const currentSolarDate = useMemo(() => getCurrentKabulSolarDate(), []);

  const monthLabel = useMemo(() => getCurrentKabulSolarMonth(), []);

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading && !data) {
    return (
      <>
        <style>{styles}</style>

        <div className="sab-dashboard">
          <div className="sab-loading-screen">
            <div className="sab-loading-orbit">
              <div />
            </div>

            <div className="sab-loading-title">
              Preparing your academy overview
            </div>

            <div className="sab-loading-subtitle">
              Connecting to live academy data
            </div>
          </div>
        </div>
      </>
    );
  }

  /* =======================================================
     ERROR
     ======================================================= */

  if (error && !data) {
    return (
      <>
        <style>{styles}</style>

        <div className="sab-dashboard">
          <div className="sab-error-screen">
            <div className="sab-error-icon">
              <X size={23} />
            </div>

            <h2>Dashboard unavailable</h2>

            <p>{error}</p>

            <button
              type="button"
              className="sab-primary-button"
              onClick={() => loadDashboard(false)}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>

      <div className="sab-dashboard">
        <div className="sab-ambient sab-ambient-one" />

        <div className="sab-ambient sab-ambient-two" />

        <div className="sab-grid" />

        <div className="sab-dashboard-inner">
          <Reveal>
            <header className="sab-header">
              <div className="sab-header-copy">
                <div className="sab-kicker">
                  <span className="sab-live-dot" />
                  SABAWOON ACADEMY
                </div>

                <h1>Welcome</h1>

                <p>
                  A quiet overview of everything happening across the academy.
                </p>
              </div>

              <div className="sab-header-actions">
                <div className="sab-date">
                  <CalendarDays size={15} />

                  <span>{currentSolarDate}</span>
                </div>

                <button
                  type="button"
                  className="sab-refresh"
                  onClick={() => loadDashboard(true)}
                  disabled={refreshing}
                  aria-label="Refresh dashboard"
                >
                  <RefreshCw
                    size={16}
                    className={refreshing ? "sab-spin" : ""}
                  />
                </button>
              </div>
            </header>
          </Reveal>

          <Reveal delay={80}>
            <section className="sab-metrics">
              <MetricCard
                label="Total students"
                value={overview.total_students}
                icon={GraduationCap}
                detail="Lifetime registrations"
                delay={120}
              />

              <MetricCard
                label="Active students"
                value={overview.active_students}
                icon={Users}
                detail={`${activeStudentRate.toFixed(1)}% of all students`}
                delay={180}
              />

              <MetricCard
                label="Active classes"
                value={overview.total_classes}
                icon={BookOpen}
                detail={`${formatNumber(overview.total_subjects)} subjects`}
                delay={240}
              />

              <MetricCard
                label="Collected this month"
                value={finance.monthly_collected}
                icon={Wallet}
                prefix="؋"
                detail={monthLabel}
                delay={300}
              />
            </section>
          </Reveal>

          <div className="sab-main-grid">
            <Reveal delay={180} className="sab-chart-panel">
              <GlassPanel className="sab-large-panel">
                <SectionTitle
                  eyebrow="ACADEMIC PULSE"
                  title="Attendance activity"
                  right={
                    <div className="sab-panel-status">
                      <Activity size={14} />
                      Last 7 days
                    </div>
                  }
                />

                <div className="sab-chart-summary">
                  <div>
                    <strong>
                      <AnimatedNumber value={attendance?.today?.present || 0} />
                    </strong>

                    <span>students present today</span>
                  </div>

                  <div className="sab-summary-divider" />

                  <div>
                    <strong>{formatPercent(todayAttendanceRate)}</strong>

                    <span>today attendance</span>
                  </div>

                  <div className="sab-summary-change">
                    <TrendingUp size={14} />

                    <span>{formatPercent(monthlyAttendanceRate)} monthly</span>
                  </div>
                </div>

                <AttendanceChart trend={attendance?.trend || []} />
              </GlassPanel>
            </Reveal>

            <Reveal delay={240}>
              <GlassPanel className="sab-large-panel sab-attendance-panel">
                <SectionTitle
                  eyebrow="TODAY"
                  title="Attendance"
                  right={
                    <div className="sab-mini-date">{currentSolarDate}</div>
                  }
                />

                <AttendanceSnapshot attendance={attendance} />

                <div className="sab-attendance-footer">
                  <span>
                    <Clock3 size={13} />
                    Live academy record
                  </span>

                  <span className="sab-operational">
                    <Check size={12} />
                    Operational
                  </span>
                </div>
              </GlassPanel>
            </Reveal>
          </div>

          <div className="sab-secondary-grid">
            <Reveal delay={300}>
              <GlassPanel className="sab-panel-medium" interactive>
                <SectionTitle
                  eyebrow="ACADEMIC STRUCTURE"
                  title="Active students by subject"
                />

                <SubjectDistribution items={data?.student_distribution || []} />
              </GlassPanel>
            </Reveal>

            <Reveal delay={360}>
              <GlassPanel className="sab-panel-medium" interactive>
                <SectionTitle
                  eyebrow="FINANCIAL PERFORMANCE"
                  title="Collection"
                  right={
                    <div className="sab-panel-status">
                      <Wallet size={14} />

                      {monthLabel}
                    </div>
                  }
                />

                <FinancePanel finance={finance} />
              </GlassPanel>
            </Reveal>

            <Reveal delay={420}>
              <GlassPanel
                className="sab-panel-medium sab-health-panel"
                interactive
              >
                <SectionTitle
                  eyebrow="SYSTEM ANALYTICS"
                  title="Academy health"
                />

                <div className="sab-health-list">
                  <HealthRow
                    label="Active student rate"
                    value={activeStudentRate}
                    icon={Users}
                  />

                  <HealthRow
                    label="Attendance today"
                    value={todayAttendanceRate}
                    icon={Check}
                  />

                  <HealthRow
                    label="Monthly attendance"
                    value={monthlyAttendanceRate}
                    icon={CalendarDays}
                  />

                  <HealthRow
                    label="Collection rate"
                    value={clamp(finance.monthly_collection_rate)}
                    icon={Wallet}
                  />
                </div>

                <div className="sab-load">
                  <div>
                    <span>Enrollment load</span>

                    <strong>{formatNumber(enrollmentLoad)}</strong>
                  </div>

                  <div className="sab-load-track">
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(3, enrollmentLoad))}%`,
                      }}
                    />
                  </div>
                </div>
              </GlassPanel>
            </Reveal>
          </div>

          {/* <Reveal delay={460}>
            <GlassPanel className="sab-wide-panel">
              <SectionTitle
                eyebrow="ACADEMIC OVERVIEW"
                title="Class distribution"
                right={
                  <div className="sab-class-total">
                    <BarChart3 size={15} />

                    <span>
                      {formatNumber(overview.total_classes)} active classes
                    </span>
                  </div>
                }
              />

              <SubjectDistribution items={data?.class_categories || []} />
            </GlassPanel>
          </R eveal> */}

          <Reveal delay={520}>
            <GlassPanel className="sab-wide-panel">
              <SectionTitle
                eyebrow="RECENT ACTIVITY"
                title="Latest enrollments"
                right={
                  <div className="sab-live-label">
                    <span />
                    Live data
                  </div>
                }
              />

              <RecentEnrollments items={data?.recent_enrollments || []} />
            </GlassPanel>
          </Reveal>

          <footer className="sab-footer">
            <div>
              <Sparkles size={13} />

              <span>Quest for Excellence</span>
            </div>

            <span>Sabawoon Educational Academy Management System</span>
          </footer>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   HEALTH ROW
   ========================================================= */

function HealthRow({ label, value, icon: Icon }) {
  const percentage = clamp(value);

  return (
    <div className="sab-health-row">
      <div className="sab-health-label">
        <div className="sab-health-icon">
          <Icon size={14} />
        </div>

        <span>{label}</span>
      </div>

      <strong>{percentage.toFixed(1)}%</strong>

      <div className="sab-health-track">
        <div
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

/* =========================================================
   PREMIUM STYLES
   ========================================================= */

const styles = `
  :root {
    --sab-bg: #090b0e;
    --sab-panel: rgba(17, 20, 24, .72);
    --sab-panel-solid: #111419;
    --sab-border: rgba(255,255,255,.065);
    --sab-border-strong: rgba(255,255,255,.105);
    --sab-text: #f3f3f1;
    --sab-muted: #858a93;
    --sab-subtle: #565b64;
    --sab-gold: #f2bd19;
    --sab-gold-soft: rgba(242,189,25,.12);
  }

  * {
    box-sizing: border-box;
  }

  .sab-dashboard {
    position: relative;
    min-height: 100%;
    width: 100%;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 78% -10%,
        rgba(242,189,25,.055),
        transparent 34%
      ),
      radial-gradient(
        circle at -10% 45%,
        rgba(255,255,255,.018),
        transparent 28%
      ),
      var(--sab-bg);
    color: var(--sab-text);
  }

  .sab-dashboard button {
    font: inherit;
  }

  .sab-dashboard-inner {
    position: relative;
    z-index: 2;
    width: min(1540px, calc(100% - 48px));
    margin: 0 auto;
    padding: 34px 0 45px;
  }

  .sab-ambient {
    position: absolute;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(90px);
    opacity: .22;
  }

  .sab-ambient-one {
    width: 280px;
    height: 280px;
    top: 120px;
    right: -130px;
    background: rgba(242,189,25,.09);
    animation: sabFloat 12s ease-in-out infinite;
  }

  .sab-ambient-two {
    width: 220px;
    height: 220px;
    bottom: 10%;
    left: -140px;
    background: rgba(255,255,255,.025);
    animation: sabFloat 16s ease-in-out infinite reverse;
  }

  .sab-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .018;
    background-image:
      linear-gradient(
        rgba(255,255,255,.35) 1px,
        transparent 1px
      ),
      linear-gradient(
        90deg,
        rgba(255,255,255,.35) 1px,
        transparent 1px
      );
    background-size: 42px 42px;
    mask-image: linear-gradient(
      to bottom,
      black,
      transparent 80%
    );
  }

  .sab-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 31px;
  }

  .sab-kicker {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 13px;
    color: #737882;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .17em;
  }

  .sab-live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sab-gold);
    box-shadow: 0 0 0 4px rgba(242,189,25,.07);
    animation: sabPulse 2.4s ease-in-out infinite;
  }

  .sab-header h1 {
    margin: 0;
    font-size: clamp(31px, 3.1vw, 47px);
    line-height: 1.04;
    letter-spacing: -.045em;
    font-weight: 650;
  }

  .sab-header h1 span {
    color: #777c84;
    font-weight: 430;
  }

  .sab-header p {
    margin: 13px 0 0;
    color: #70757e;
    font-size: 13px;
    line-height: 1.6;
  }

  .sab-header-actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .sab-date,
  .sab-refresh {
    height: 40px;
    border: 1px solid var(--sab-border);
    background: rgba(255,255,255,.025);
    color: #777c84;
    border-radius: 10px;
  }

  .sab-date {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 13px;
    font-size: 11px;
  }

  .sab-refresh {
    width: 40px;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      border-color .2s ease,
      background .2s ease,
      color .2s ease,
      transform .2s ease;
  }

  .sab-refresh:hover {
    color: var(--sab-gold);
    border-color: rgba(242,189,25,.24);
    background: rgba(242,189,25,.055);
    transform: translateY(-1px);
  }

  .sab-refresh:disabled {
    opacity: .55;
    cursor: default;
  }

  .sab-spin {
    animation: sabSpin .8s linear infinite;
  }

  .sab-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--sab-border);
    border-bottom: 1px solid var(--sab-border);
    margin-bottom: 25px;
  }

  .sab-metric {
    position: relative;
    min-height: 162px;
    padding: 23px 25px 22px;
    border-right: 1px solid var(--sab-border);
    overflow: hidden;
  }

  .sab-metric:first-child {
    border-left: 1px solid var(--sab-border);
  }

  .sab-metric::after {
    content: "";
    position: absolute;
    width: 100px;
    height: 100px;
    right: -50px;
    top: -50px;
    border-radius: 50%;
    background: rgba(242,189,25,.055);
    filter: blur(20px);
    pointer-events: none;
  }

  .sab-metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sab-metric-icon {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    border: 1px solid rgba(255,255,255,.065);
    border-radius: 8px;
    color: #81868f;
    background: rgba(255,255,255,.018);
  }

  .sab-metric-value {
    margin-top: 19px;
    color: #f4f4f1;
    font-size: clamp(25px, 2.1vw, 34px);
    font-weight: 620;
    letter-spacing: -.045em;
  }

  .sab-metric-label {
    margin-top: 5px;
    color: #777c85;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .sab-metric-detail {
    margin-top: 8px;
    color: #484d55;
    font-size: 10px;
  }

  .sab-trend {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    font-weight: 700;
  }

  .sab-trend-up {
    color: #b9c79b;
  }

  .sab-trend-down {
    color: #b57e7e;
  }

  .sab-panel {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--sab-border);
    border-radius: 14px;
    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,.026),
        rgba(255,255,255,.008)
      ),
      var(--sab-panel);
    box-shadow:
      0 20px 60px rgba(0,0,0,.12),
      inset 0 1px 0 rgba(255,255,255,.018);
  }

  .sab-panel-interactive {
    transform:
      translate3d(
        var(--mx, 0px),
        var(--my, 0px),
        0
      );
    transition:
      transform .5s cubic-bezier(.22,1,.36,1),
      border-color .3s ease;
  }

  .sab-panel-interactive:hover {
    border-color: rgba(242,189,25,.12);
  }

  .sab-large-panel {
    min-height: 455px;
    padding: 25px;
  }

  .sab-panel-medium {
    min-height: 390px;
    padding: 24px;
  }

  .sab-wide-panel {
    padding: 25px;
    margin-top: 20px;
  }

  .sab-section-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .sab-eyebrow {
    margin-bottom: 7px;
    color: #555a63;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: .17em;
  }

  .sab-section-title h2 {
    margin: 0;
    color: #e7e7e4;
    font-size: 16px;
    font-weight: 570;
    letter-spacing: -.02em;
  }

  .sab-panel-status,
  .sab-class-total,
  .sab-live-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #555a62;
    font-size: 10px;
  }

  .sab-live-label span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sab-gold);
    box-shadow: 0 0 8px rgba(242,189,25,.55);
  }

  .sab-mini-date {
    color: #525760;
    font-size: 10px;
  }

  .sab-main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(310px, .8fr);
    gap: 20px;
  }

  .sab-chart-summary {
    display: flex;
    align-items: center;
    gap: 25px;
    margin-top: 26px;
  }

  .sab-chart-summary > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .sab-chart-summary strong {
    color: #efefeb;
    font-size: 25px;
    font-weight: 610;
    letter-spacing: -.04em;
  }

  .sab-chart-summary span {
    color: #626770;
    font-size: 10px;
  }

  .sab-summary-divider {
    height: 23px;
    width: 1px;
    background: var(--sab-border);
  }

  .sab-summary-change {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #8c947d !important;
  }

  .sab-chart-wrap {
    position: relative;
    margin-top: 20px;
  }

  .sab-chart-legend {
    display: flex;
    gap: 15px;
    margin-bottom: 3px;
  }

  .sab-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #565b64;
    font-size: 9px;
    cursor: default;
  }

  .sab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .sab-dot-gold {
    background: var(--sab-gold);
  }

  .sab-dot-muted {
    background: #626771;
  }

  .sab-chart {
    position: relative;
    width: 100%;
    height: 285px;
  }

  .sab-chart svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .sab-chart-line {
    stroke-dasharray: 1800;
    stroke-dashoffset: 1800;
    animation:
      sabDrawChart 1.5s cubic-bezier(.22,1,.36,1) forwards;
  }

  .sab-chart-line-delay {
    animation-delay: .22s;
  }

  .sab-chart-area {
    opacity: 0;
    animation: sabFadeIn .9s .45s ease forwards;
  }

  .sab-chart-point {
    cursor: pointer;
    transition:
      r .2s ease,
      filter .2s ease;
  }

  .sab-chart-point:hover,
  .sab-chart-point:focus {
    filter: drop-shadow(
      0 0 6px rgba(242,189,25,.7)
    );
    outline: none;
  }

  .sab-chart-tooltip {
    position: absolute;
    top: 25px;
    transform: translateX(-50%);
    min-width: 105px;
    padding: 9px 10px;
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 8px;
    background: rgba(12,14,17,.95);
    box-shadow: 0 12px 35px rgba(0,0,0,.4);
    pointer-events: none;
    z-index: 4;
  }

  .sab-chart-tooltip div {
    color: #626771;
    font-size: 8px;
    margin-bottom: 5px;
  }

  .sab-chart-tooltip strong,
  .sab-chart-tooltip span {
    display: block;
    font-size: 9px;
  }

  .sab-chart-tooltip strong {
    color: var(--sab-gold);
  }

  .sab-chart-tooltip span {
    margin-top: 3px;
    color: #767b84;
  }

  .sab-chart-empty {
    min-height: 285px;
    display: grid;
    place-items: center;
    color: #4c5159;
    font-size: 10px;
  }

  .sab-attendance-panel {
    display: flex;
    flex-direction: column;
  }

  .sab-attendance-snapshot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 25px;
    flex: 1;
    padding: 20px 0;
  }

  .sab-attendance-ring {
    position: relative;
  }

  .sab-circle {
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }

  .sab-circle-svg {
    overflow: visible;
  }

  .sab-circle-progress {
    filter: drop-shadow(
      0 0 5px rgba(242,189,25,.18)
    );
    transition: stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1);
  }

  .sab-circle-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .sab-circle-content strong {
    color: #eeeeea;
    font-size: 23px;
    font-weight: 620;
    letter-spacing: -.045em;
  }

  .sab-circle-content span {
    margin-top: 3px;
    color: #555a62;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .12em;
  }

  .sab-circle-sublabel {
    position: absolute;
    bottom: 14px;
    color: #41464d;
    font-size: 8px;
  }

  .sab-attendance-stats {
    display: flex;
    flex-direction: column;
    gap: 17px;
  }

  .sab-attendance-stats > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sab-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .sab-status-dot.present {
    background: var(--sab-gold);
  }

  .sab-status-dot.absent {
    background: #676c75;
  }

  .sab-status-dot.total {
    background: #373b42;
  }

  .sab-attendance-stats strong,
  .sab-attendance-stats small {
    display: block;
  }

  .sab-attendance-stats strong {
    color: #dededb;
    font-size: 14px;
    font-weight: 580;
  }

  .sab-attendance-stats small {
    margin-top: 2px;
    color: #535861;
    font-size: 9px;
  }

  .sab-attendance-footer {
    display: flex;
    justify-content: space-between;
    padding-top: 15px;
    border-top: 1px solid var(--sab-border);
    color: #4e535b;
    font-size: 9px;
  }

  .sab-attendance-footer span {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .sab-operational {
    color: #7e876f !important;
  }

  .sab-secondary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
    margin-top: 20px;
  }

  .sab-subject-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 29px;
  }

  .sab-subject-row {
    animation: sabFadeSlide .7s both;
  }

  .sab-subject-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 8px;
  }

  .sab-subject-name {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #a8abb0;
    font-size: 11px;
  }

  .sab-subject-index {
    color: #454a51;
    font-size: 8px;
    font-variant-numeric: tabular-nums;
  }

  .sab-subject-meta strong {
    color: #777c84;
    font-size: 10px;
    font-weight: 600;
  }

  .sab-subject-track {
    height: 3px;
    width: 100%;
    overflow: hidden;
    border-radius: 20px;
    background: rgba(255,255,255,.045);
  }

  .sab-subject-fill {
    height: 100%;
    min-width: 3px;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      rgba(242,189,25,.42),
      var(--sab-gold)
    );
    box-shadow: 0 0 10px rgba(242,189,25,.13);
    transform-origin: left;
    animation: sabBarGrow .9s cubic-bezier(.22,1,.36,1) both;
  }

  .sab-finance-content {
    margin-top: 17px;
  }

  .sab-finance-main {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 20px;
    min-height: 220px;
  }

  .sab-finance-numbers {
    display: flex;
    flex-direction: column;
    gap: 17px;
  }

  .sab-finance-numbers div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .sab-finance-numbers span {
    color: #50555d;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .sab-finance-numbers strong {
    color: #d9d9d5;
    font-size: 14px;
    font-weight: 560;
  }

  .sab-finance-bottom {
    padding-top: 14px;
    border-top: 1px solid var(--sab-border);
  }

  .sab-finance-bar {
    height: 3px;
    overflow: hidden;
    border-radius: 20px;
    background: rgba(255,255,255,.04);
  }

  .sab-finance-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--sab-gold);
    box-shadow: 0 0 12px rgba(242,189,25,.2);
    transition: width 1.1s cubic-bezier(.22,1,.36,1);
  }

  .sab-finance-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 9px;
    color: #4f545c;
    font-size: 8px;
  }

  .sab-health-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-top: 28px;
  }

  .sab-health-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px 12px;
    align-items: center;
  }

  .sab-health-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #858991;
    font-size: 10px;
  }

  .sab-health-icon {
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    border-radius: 7px;
    background: rgba(255,255,255,.022);
    color: #626771;
  }

  .sab-health-row > strong {
    color: #a5a7a6;
    font-size: 10px;
    font-weight: 600;
  }

  .sab-health-track {
    grid-column: 1 / -1;
    height: 2px;
    overflow: hidden;
    border-radius: 10px;
    background: rgba(255,255,255,.045);
  }

  .sab-health-track div {
    height: 100%;
    min-width: 2px;
    border-radius: inherit;
    background: var(--sab-gold);
    transition: width 1.1s cubic-bezier(.22,1,.36,1);
  }

  .sab-load {
    margin-top: 25px;
    padding-top: 15px;
    border-top: 1px solid var(--sab-border);
  }

  .sab-load > div:first-child {
    display: flex;
    justify-content: space-between;
    color: #50555d;
    font-size: 9px;
  }

  .sab-load strong {
    color: #92969c;
  }

  .sab-load-track {
    height: 2px;
    margin-top: 9px;
    overflow: hidden;
    border-radius: 10px;
    background: rgba(255,255,255,.04);
  }

  .sab-load-track div {
    height: 100%;
    border-radius: inherit;
    background: rgba(242,189,25,.5);
    transition: width 1.2s cubic-bezier(.22,1,.36,1);
  }

  .sab-recent-list {
    margin-top: 21px;
  }

  .sab-recent-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto 15px;
    align-items: center;
    gap: 12px;
    min-height: 63px;
    border-top: 1px solid var(--sab-border);
    animation: sabFadeSlide .55s both;
    transition: background .2s ease;
  }

  .sab-recent-row:hover {
    background: linear-gradient(
      90deg,
      rgba(255,255,255,.018),
      transparent
    );
  }

  .sab-avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(242,189,25,.12);
    border-radius: 9px;
    color: #b8a35e;
    background: rgba(242,189,25,.035);
    font-size: 9px;
    font-weight: 700;
  }

  .sab-recent-main {
    min-width: 0;
  }

  .sab-recent-main strong {
    display: block;
    overflow: hidden;
    color: #bfc1c2;
    font-size: 11px;
    font-weight: 570;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sab-recent-main span {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 4px;
    overflow: hidden;
    color: #4f545c;
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sab-recent-main i {
    width: 3px;
    height: 3px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #3f444a;
  }

  .sab-recent-date {
    text-align: right;
  }

  .sab-recent-date strong,
  .sab-recent-date span {
    display: block;
  }

  .sab-recent-date strong {
    color: #676c74;
    font-size: 9px;
    font-weight: 550;
  }

  .sab-recent-date span {
    margin-top: 4px;
    color: #41464d;
    font-size: 8px;
  }

  .sab-recent-arrow {
    color: #383d44;
    transition:
      color .2s ease,
      transform .2s ease;
  }

  .sab-recent-row:hover .sab-recent-arrow {
    color: #777c84;
    transform: translateX(2px);
  }

  .sab-empty-inline {
    padding: 35px 0;
    color: #4c5159;
    font-size: 10px;
  }

  .sab-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    text-align: center;
  }

  .sab-empty-icon,
  .sab-error-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    margin-bottom: 12px;
    border: 1px solid var(--sab-border);
    border-radius: 12px;
    color: #646970;
    background: rgba(255,255,255,.02);
  }

  .sab-empty-state strong {
    color: #858990;
    font-size: 11px;
    font-weight: 560;
  }

  .sab-empty-state span {
    max-width: 250px;
    margin-top: 6px;
    color: #484d54;
    font-size: 9px;
    line-height: 1.5;
  }

  .sab-loading-screen,
  .sab-error-screen {
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }

  .sab-loading-orbit {
    position: relative;
    width: 54px;
    height: 54px;
    margin-bottom: 22px;
    border: 1px solid rgba(242,189,25,.1);
    border-radius: 50%;
  }

  .sab-loading-orbit::before {
    content: "";
    position: absolute;
    inset: 7px;
    border: 1px dashed rgba(242,189,25,.2);
    border-radius: 50%;
    animation: sabSpin 4s linear infinite;
  }

  .sab-loading-orbit div {
    position: absolute;
    top: -2px;
    left: 50%;
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
    border-radius: 50%;
    background: var(--sab-gold);
    box-shadow: 0 0 15px rgba(242,189,25,.55);
    animation: sabSpin 1.7s linear infinite;
    transform-origin: 2.5px 29px;
  }

  .sab-loading-title {
    color: #aaa;
    font-size: 13px;
  }

  .sab-loading-subtitle {
    margin-top: 7px;
    color: #4e535b;
    font-size: 10px;
  }

  .sab-error-screen h2 {
    margin: 0;
    color: #d8d8d5;
    font-size: 18px;
  }

  .sab-error-screen p {
    max-width: 420px;
    margin: 9px 0 18px;
    color: #62666e;
    font-size: 11px;
    text-align: center;
  }

  .sab-primary-button {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 14px;
    border: 1px solid rgba(242,189,25,.2);
    border-radius: 9px;
    color: #151515;
    background: var(--sab-gold);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform .2s ease,
      box-shadow .2s ease;
  }

  .sab-primary-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 25px rgba(242,189,25,.15);
  }

  .sab-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 27px 3px 0;
    color: #353a41;
    font-size: 8px;
  }

  .sab-footer div {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sab-footer div svg {
    color: #5e552e;
  }

  @keyframes sabDrawChart {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes sabFadeIn {
    to {
      opacity: 1;
    }
  }

  @keyframes sabFadeSlide {
    from {
      opacity: 0;
      transform: translateY(7px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes sabBarGrow {
    from {
      transform: scaleX(0);
    }

    to {
      transform: scaleX(1);
    }
  }

  @keyframes sabPulse {
    0%, 100% {
      opacity: .65;
      box-shadow: 0 0 0 4px rgba(242,189,25,.06);
    }

    50% {
      opacity: 1;
      box-shadow: 0 0 0 7px rgba(242,189,25,.015);
    }
  }

  @keyframes sabFloat {
    0%, 100% {
      transform: translate3d(0,0,0);
    }

    50% {
      transform: translate3d(0,18px,0);
    }
  }

  @keyframes sabSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1150px) {
    .sab-dashboard-inner {
      width: min(100% - 32px, 1000px);
    }

    .sab-metrics {
      grid-template-columns: repeat(2, 1fr);
    }

    .sab-metric:nth-child(2) {
      border-right: 0;
    }

    .sab-metric:nth-child(3),
    .sab-metric:nth-child(4) {
      border-top: 1px solid var(--sab-border);
    }

    .sab-main-grid {
      grid-template-columns: 1fr;
    }

    .sab-large-panel {
      min-height: auto;
    }

    .sab-secondary-grid {
      grid-template-columns: 1fr 1fr;
    }

    .sab-health-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 720px) {
    .sab-dashboard-inner {
      width: calc(100% - 24px);
      padding-top: 22px;
      padding-bottom: 28px;
    }

    .sab-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 18px;
      margin-bottom: 22px;
    }

    .sab-header h1 {
      font-size: 30px;
    }

    .sab-header-actions {
      width: 100%;
    }

    .sab-date {
      flex: 1;
    }

    .sab-refresh {
      flex: 0 0 40px;
    }

    .sab-metrics {
      grid-template-columns: 1fr 1fr;
    }

    .sab-metric {
      min-height: 137px;
      padding: 17px 15px;
    }

    .sab-metric:nth-child(odd) {
      border-left: 1px solid var(--sab-border);
    }

    .sab-metric:nth-child(even) {
      border-right: 0;
    }

    .sab-metric:nth-child(3),
    .sab-metric:nth-child(4) {
      border-top: 1px solid var(--sab-border);
    }

    .sab-metric-value {
      font-size: 24px;
    }

    .sab-main-grid,
    .sab-secondary-grid {
      grid-template-columns: 1fr;
      gap: 13px;
    }

    .sab-health-panel {
      grid-column: auto;
    }

    .sab-large-panel,
    .sab-panel-medium,
    .sab-wide-panel {
      padding: 17px;
      border-radius: 12px;
    }

    .sab-chart-summary {
      gap: 12px;
      flex-wrap: wrap;
    }

    .sab-chart-summary > div:first-child {
      flex-basis: 100%;
    }

    .sab-summary-change {
      margin-left: 0;
    }

    .sab-chart {
      height: 230px;
    }

    .sab-chart-empty {
      min-height: 230px;
    }

    .sab-attendance-snapshot {
      justify-content: space-around;
      gap: 10px;
    }

    .sab-attendance-stats {
      gap: 13px;
    }

    .sab-finance-main {
      justify-content: space-between;
      gap: 8px;
    }

    .sab-finance-numbers {
      gap: 13px;
    }

    .sab-recent-row {
      grid-template-columns: 32px minmax(0,1fr) 15px;
      gap: 9px;
      min-height: 59px;
    }

    .sab-recent-date {
      display: none;
    }

    .sab-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 7px;
    }
  }

  @media (max-width: 410px) {
    .sab-metrics {
      grid-template-columns: 1fr;
    }

    .sab-metric,
    .sab-metric:nth-child(3),
    .sab-metric:nth-child(4) {
      border-left: 1px solid var(--sab-border);
      border-right: 1px solid var(--sab-border);
      border-top: 0;
    }

    .sab-metric + .sab-metric {
      border-top: 1px solid var(--sab-border);
    }

    .sab-attendance-snapshot {
      flex-direction: column;
      padding: 22px 0;
    }

    .sab-attendance-stats {
      flex-direction: row;
      width: 100%;
      justify-content: space-around;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: .01ms !important;
    }
  }
`;
