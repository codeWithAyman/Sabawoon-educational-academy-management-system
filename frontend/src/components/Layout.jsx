import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  BookOpen,
  UserPlus,
  Wallet,
  Banknote,
  CalendarCheck,
  GraduationCap,
  Award,
  Settings,
  LogOut,
  X,
  PanelLeft,
  CalendarDays,
  Menu,
  Sun,
  Moon,
  DatabaseBackup,
} from "lucide-react";
import logo from "../assets/sabawoon-logo.png";

const NAV = [
  {
    to: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "teacher", "staff"],
  },
  {
    to: "/app/students",
    label: "Students",
    icon: UserPlus,
    roles: ["admin", "teacher", "staff"],
  },
  {
    to: "/app/classes",
    label: "Classes / Courses",
    icon: BookOpen,
    roles: ["admin", "teacher"],
  },
  {
    to: "/app/fees",
    label: "Payments",
    icon: Wallet,
    roles: ["admin", "staff"],
  },
  {
    to: "/app/finance",
    label: "Finance",
    icon: Banknote,
    roles: ["admin"],
  },
  {
    to: "/app/attendance",
    label: "Attendance",
    icon: CalendarCheck,
    roles: ["admin", "teacher"],
  },
  {
    to: "/app/users",
    label: "Teachers & Staff",
    icon: GraduationCap,
    roles: ["admin"],
  },
  {
    to: "/app/timetable",
    label: "Timetable",
    icon: CalendarDays,
    roles: ["admin", "teacher"],
  },
  {
    to: "/app/reports",
    label: "Reports",
    icon: Award,
    roles: ["admin", "teacher"],
  },
  {
    to: "/app/profile",
    label: "Settings",
    icon: Settings,
    roles: ["admin"],
  },
  {
    to: "/app/updates-backup",
    label: "Database Backups",
    icon: DatabaseBackup,
    roles: ["admin"],
  },
];

function roleLabel(role) {
  switch (role) {
    case "admin":
      return "ADMINISTRATOR";
    case "teacher":
      return "TEACHER";
    case "staff":
      return "STAFF";
    default:
      return "USER";
  }
}

function Sidebar({
  user,
  items,
  open,
  setOpen,
  doLogout,
  collapsed,
  setCollapsed,
  isLight,
  setIsLight,
}) {
  const displayName = user?.full_name || user?.name || user?.email || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <aside
        className={`
          fixed lg:sticky
          top-0 left-0
          z-50
          ${collapsed ? "lg:w-[78px]" : "lg:w-[268px]"}
          w-[268px]
          h-screen
          bg-[#0b0d10]
          text-white
          flex flex-col
          border-r border-white/[0.07]
          shadow-[20px_0_60px_rgba(0,0,0,0.18)]
          transition-[width,transform] duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* SIDEBAR GLOW */}
        <div className="absolute top-[-180px] left-[-160px] w-[420px] h-[420px] rounded-full bg-[#f2bd19]/[0.035] blur-[110px] pointer-events-none" />

        {/* DESKTOP COLLAPSE BUTTON */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="
            hidden lg:flex
            absolute
            top-5
            -right-3
            z-50
            w-6 h-6
            rounded-full
            bg-[#121519]
            border border-white/[0.10]
            items-center justify-center
            text-slate-500
            hover:text-[#f2bd19]
            hover:border-[#f2bd19]/30
            shadow-[0_5px_15px_rgba(0,0,0,0.3)]
            transition-all duration-200
          "
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft
            className={`
              w-[13px]
              h-[13px]
              transition-transform
              duration-300
              ${collapsed ? "rotate-180" : ""}
            `}
          />
        </button>

        {/* BRAND */}
        <div
          className={`
            relative
            ${collapsed ? "lg:px-3" : "px-5"}
            pt-5
            pb-5
            border-b border-white/[0.07]
            transition-all duration-300
          `}
        >
          <div
            className={`
              flex items-center gap-3
              ${collapsed ? "lg:justify-center" : ""}
            `}
          >
            <div className="relative shrink-0">
              <div className="absolute inset-[-5px] rounded-[15px] border border-[#f2bd19]/20" />

              <div className="relative w-[58px] h-[58px] rounded-[15px] bg-white border border-white/10 flex items-center justify-center p-2.5 shadow-[0_12px_35px_rgba(0,0,0,0.3)]">
                <img
                  src={logo}
                  alt="Sabawoon Educational Academy"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>

            <div
              className={`
                min-w-0
                overflow-hidden
                transition-all duration-300
                ${
                  collapsed ? "lg:w-0 lg:opacity-0" : "lg:w-auto lg:opacity-100"
                }
              `}
            >
              <div className="text-[12px] font-bold tracking-[0.08em] text-white truncate">
                {roleLabel(user?.role)}
              </div>

              <div className="text-[10px] text-slate-500 mt-1 tracking-[0.12em] uppercase whitespace-nowrap">
                Management Workspace
              </div>
            </div>
          </div>

          {/* SECURITY LABEL */}
          <div
            className={`
              flex items-center gap-2
              mt-5
              overflow-hidden
              transition-all duration-300
              ${
                collapsed
                  ? "lg:opacity-0 lg:h-0 lg:mt-0"
                  : "lg:opacity-100 lg:h-auto"
              }
            `}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.7)] shrink-0" />

            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500 whitespace-nowrap">
              Secure administration
            </span>
          </div>
        </div>

        {/* MOBILE / TABLET CLOSE BUTTON */}
        <button
          onClick={() => setOpen(false)}
          className="
            lg:hidden
            absolute
            top-4
            right-4
            w-9
            h-9
            rounded-xl
            border border-white/[0.08]
            bg-white/[0.035]
            flex items-center justify-center
            text-slate-400
            hover:text-white
            hover:bg-white/[0.07]
            hover:border-white/[0.14]
            active:scale-95
            transition-all duration-200
          "
          aria-label="Close navigation menu"
        >
          <X className="w-[17px] h-[17px]" />
        </button>

        {/* NAVIGATION */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-5 scrollbar">
          <div
            className={`
              px-3
              mb-3
              overflow-hidden
              transition-all duration-300
              ${
                collapsed
                  ? "lg:opacity-0 lg:h-0 lg:mb-0"
                  : "lg:opacity-100 lg:h-auto"
              }
            `}
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600 whitespace-nowrap">
              Navigation
            </div>
          </div>

          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  end={item.to === "/app"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `
                      group
                      relative
                      flex items-center
                      ${collapsed ? "lg:justify-center lg:px-0" : "gap-3 px-3"}
                      h-[43px]
                      rounded-[9px]
                      border
                      text-[12px]
                      transition-all duration-200
                      ${
                        isActive
                          ? `
                            bg-[#121519]
                            border-[#f2bd19]/20
                            text-white
                            shadow-[0_8px_25px_rgba(0,0,0,0.16)]
                          `
                          : `
                            bg-transparent
                            border-transparent
                            text-slate-400
                            hover:bg-white/[0.035]
                            hover:border-white/[0.05]
                            hover:text-slate-100
                          `
                      }
                    `
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-[9px] bottom-[9px] w-[2px] rounded-full bg-[#f2bd19] shadow-[0_0_9px_rgba(242,189,25,0.7)]" />
                      )}

                      <Icon
                        className={`
                          w-[17px]
                          h-[17px]
                          shrink-0
                          transition-colors
                          ${
                            isActive
                              ? "text-[#f2bd19]"
                              : "text-slate-500 group-hover:text-slate-300"
                          }
                        `}
                      />

                      <span
                        className={`
                          truncate
                          overflow-hidden
                          transition-all duration-300
                          ${
                            collapsed
                              ? "lg:w-0 lg:opacity-0"
                              : "lg:w-auto lg:opacity-100"
                          }
                          ${isActive ? "font-semibold" : "font-medium"}
                        `}
                      >
                        {item.label}
                      </span>

                      {isActive && !collapsed && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f2bd19]/80 shadow-[0_0_8px_rgba(242,189,25,0.65)] shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* BOTTOM CONTROLS */}
        <div className="relative border-t border-white/[0.07] p-3 space-y-2">
          {/* USER / EXIT */}
          <div
            className={`
              rounded-xl
              bg-[#121519]
              border border-white/[0.07]
              ${collapsed ? "lg:p-2" : "p-3"}
              shadow-[0_10px_30px_rgba(0,0,0,0.16)]
              transition-all duration-300
            `}
          >
            <div
              className={`
                flex items-center
                ${collapsed ? "lg:justify-center" : "gap-3"}
              `}
            >
              {/* AVATAR */}
              <div className="relative shrink-0">
                <div className="absolute inset-[-2px] rounded-full border border-[#f2bd19]/25" />

                <div className="w-9 h-9 rounded-full bg-[#f2bd19] text-[#111] flex items-center justify-center font-bold text-[13px]">
                  {initial}
                </div>
              </div>

              {/* USER INFO */}
              <div
                className={`
                  flex-1
                  min-w-0
                  overflow-hidden
                  transition-all duration-300
                  ${
                    collapsed
                      ? "lg:w-0 lg:flex-none lg:opacity-0"
                      : "lg:w-auto lg:opacity-100"
                  }
                `}
              >
                <div className="text-[12px] font-semibold text-slate-100 truncate">
                  {displayName}
                </div>

                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />

                  <span className="text-[9px] text-slate-500 uppercase tracking-[0.08em] truncate">
                    {roleLabel(user?.role)}
                  </span>
                </div>
              </div>

              {/* LOGOUT */}
              <button
                onClick={doLogout}
                title="Log out"
                className={`
                  w-8
                  h-8
                  rounded-lg
                  border border-white/[0.06]
                  flex items-center justify-center
                  text-slate-500
                  hover:text-red-400
                  hover:border-red-400/15
                  hover:bg-red-400/[0.05]
                  transition-all
                  ${collapsed ? "lg:hidden" : ""}
                `}
                data-testid="logout-btn"
              >
                <LogOut className="w-[16px] h-[16px]" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE / TABLET OVERLAY */}
      {open && (
        <div
          className="
            fixed
            inset-0
            bg-black/70
            backdrop-blur-[2px]
            z-40
            lg:hidden
          "
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [isLight, setIsLight] = useState(() => {
    if (typeof window === "undefined") return false;

    return localStorage.getItem("sabawoon-theme") === "light";
  });

  useEffect(() => {
    const root = document.documentElement;

    if (isLight) {
      root.classList.add("light");
      localStorage.setItem("sabawoon-theme", "light");
    } else {
      root.classList.remove("light");
      localStorage.setItem("sabawoon-theme", "dark");
    }
  }, [isLight]);

  function doLogout() {
    logout();
    navigate("/");
  }

  if (!user) {
    navigate("/");
    return null;
  }

  const items = NAV.filter((item) => item.roles.includes(user.role));

  const now = new Date();

  return (
    <div className="min-h-screen bg-[#0b0d10] text-white flex">
      {/* SIDEBAR */}
      <Sidebar
        user={user}
        items={items}
        open={open}
        setOpen={setOpen}
        doLogout={doLogout}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        isLight={isLight}
        setIsLight={setIsLight}
      />

      {/* MOBILE / TABLET MENU BUTTON */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="
            lg:hidden
            fixed
            z-30

            top-[max(14px,env(safe-area-inset-top))]
            left-[max(14px,env(safe-area-inset-left))]

            w-10
            h-10

            sm:w-11
            sm:h-11

            rounded-xl

            bg-[#121519]
            border border-white/[0.08]

            flex items-center justify-center

            text-slate-400
            hover:text-[#f2bd19]
            hover:border-[#f2bd19]/30
            hover:bg-[#161a1f]

            active:scale-95

            shadow-[0_8px_25px_rgba(0,0,0,0.35)]

            transition-all duration-200
          "
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu className="w-[18px] h-[18px] sm:w-[19px] sm:h-[19px]" />
        </button>
      )}

      {/* MAIN APPLICATION */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#0b0d10]">
        <main
          className="
            relative
            flex-1

            p-4
            pt-[70px]

            sm:p-5
            sm:pt-[74px]

            lg:p-6
            lg:pt-6

            overflow-auto
            scrollbar
          "
        >
          {/* CONTENT GRID */}
          <div
            className="
              absolute
              inset-0
              pointer-events-none
              opacity-[0.018]
            "
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          {/* GOLD AMBIENT LIGHT */}
          <div
            className="
              absolute
              top-[-250px]
              right-[-200px]
              w-[550px]
              h-[550px]
              rounded-full
              bg-[#f2bd19]/[0.018]
              blur-[130px]
              pointer-events-none
            "
          />

          <div className="relative z-10">
            <Outlet />
          </div>
        </main>

        {/* FOOTER */}
        <footer
          className="
            border-t border-white/[0.07]
            bg-[#0b0d10]
            px-5 lg:px-7
            py-3.5
            text-[10px]
            flex flex-col sm:flex-row
            items-center justify-between
            gap-2
          "
        >
          <span className="text-slate-600">
            © {now.getFullYear()} — All rights reserved.
          </span>

          <div className="flex items-center gap-2 text-slate-600">
            <span>Made by</span>

            <span className="font-semibold text-slate-500">
              Teacher Ayman Najman
            </span>

            <span className="text-[#f2bd19]/70">‘True Batman’</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
