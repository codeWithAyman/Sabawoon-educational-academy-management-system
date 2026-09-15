import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Sparkles } from "lucide-react";
import logo from "../assets/sabawoon-logo.png";

export default function WelcomeScreen() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 3500),

      setTimeout(() => {
        navigate("/app", { replace: true });
      }, 4700),
    ];

    return () => timers.forEach(clearTimeout);
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#0b0d10] text-white">
      {/* Ambient lighting */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={`absolute left-1/2 top-1/2 h-[650px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2bd19]/[0.055] blur-[150px] transition-all duration-[1800ms] ${
            phase >= 1 ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        />

        <div
          className={`absolute bottom-[-300px] right-[-200px] h-[550px] w-[550px] rounded-full bg-[#f2bd19]/[0.02] blur-[130px] transition-opacity duration-[2000ms] ${
            phase >= 2 ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {/* Grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Center content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-[650px] text-center">
          {/* Top status */}
          <div
            className={`mb-8 flex items-center justify-center gap-3 transition-all duration-700 ${
              phase >= 1
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
          >
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#f2bd19]/50" />

            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.9)]" />

              <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Secure Access Granted
              </span>

              <span className="h-1.5 w-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.9)]" />
            </div>

            <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#f2bd19]/50" />
          </div>

          {/* Logo */}
          <div
            className={`relative mx-auto mb-8 w-fit transition-all duration-[1000ms] ease-out ${
              phase >= 1
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.65] opacity-0 blur-md"
            }`}
          >
            {/* Outer ring */}
            <div
              className={`absolute -inset-5 rounded-[30px] border border-[#f2bd19]/20 transition-all duration-[1200ms] ${
                phase >= 2 ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            />

            {/* Second ring */}
            <div
              className={`absolute -inset-2 rounded-[23px] border border-[#f2bd19]/10 transition-all duration-[900ms] ${
                phase >= 2 ? "scale-100 opacity-100" : "scale-90 opacity-0"
              }`}
            />

            {/* Logo box */}
            <div className="relative flex h-[94px] w-[94px] items-center justify-center rounded-[22px] border border-white/[0.1] bg-white p-4 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
              <img
                src={logo}
                alt="Sabawoon Educational Academy"
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Gold glow */}
            <div className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[0_0_70px_rgba(242,189,25,0.12)]" />
          </div>

          {/* Welcome */}
          <div
            className={`transition-all duration-[900ms] ease-out ${
              phase >= 2
                ? "translate-y-0 opacity-100"
                : "translate-y-5 opacity-0"
            }`}
          >
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#f2bd19]/70">
              Welcome to
            </p>

            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-white sm:text-[38px]">
              Sabawoon Educational Academy
            </h1>

            <div
              className={`mx-auto mt-5 h-px bg-[#f2bd19] transition-all duration-[1000ms] ${
                phase >= 3 ? "w-24 opacity-100" : "w-0 opacity-0"
              }`}
            />

            <p
              className={`mt-5 text-[12px] font-medium uppercase tracking-[0.28em] text-slate-500 transition-all duration-[900ms] ${
                phase >= 3
                  ? "translate-y-0 opacity-100"
                  : "translate-y-3 opacity-0"
              }`}
            >
              Management System
            </p>
          </div>

          {/* Loading / status */}
          <div
            className={`mx-auto mt-9 flex w-fit items-center gap-2 rounded-full border border-white/[0.07] bg-[#121519]/80 px-4 py-2 transition-all duration-700 ${
              phase >= 4
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#f2bd19]" />

            <span className="text-[9px] font-medium text-slate-500">
              Administrator workspace
            </span>

            <Sparkles className="h-3 w-3 text-[#f2bd19]/60" />
          </div>

          {/* Bottom loading line */}
          <div className="mx-auto mt-7 h-[2px] w-36 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.7)] transition-all duration-[2300ms] ease-out"
              style={{
                width: phase >= 4 ? "100%" : phase >= 1 ? "65%" : "0%",
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom credit */}
      <div
        className={`absolute bottom-7 left-0 right-0 text-center transition-opacity duration-700 ${
          phase >= 2 ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="text-[9px] text-slate-700">
          Made by{" "}
          <span className="font-semibold text-slate-600">
            Teacher Ayman Najman
          </span>{" "}
          <span className="text-[#f2bd19]/50">“Batman”</span>{" "}
          <span className="opacity-60">🦇</span>
        </p>
      </div>
    </div>
  );
}

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { ShieldCheck, Sparkles, Terminal, Code2, Cpu, Zap } from "lucide-react";
// import logo from "../assets/sabawoon-logo.png";

// export default function WelcomeScreen() {
//   const navigate = useNavigate();

//   const [phase, setPhase] = useState(0);
//   const [message, setMessage] = useState("Initializing secure connection...");

//   useEffect(() => {
//     const timers = [
//       setTimeout(() => {
//         setPhase(1);
//         setMessage("Authentication accepted.");
//       }, 500),

//       setTimeout(() => {
//         setPhase(2);
//         setMessage("Checking administrator privileges...");
//       }, 1400),

//       setTimeout(() => {
//         setPhase(3);
//         setMessage("Administrator privileges confirmed.");
//       }, 2400),

//       setTimeout(() => {
//         setPhase(4);
//         setMessage("Locating the developer...");
//       }, 3300),

//       setTimeout(() => {
//         setPhase(5);
//         setMessage("Developer located.");
//       }, 4100),

//       setTimeout(() => {
//         setPhase(6);
//         setMessage("Batman protocol activated.");
//       }, 4800),

//       setTimeout(() => {
//         setPhase(7);
//         setMessage(
//           "Please stand by while Ayman does something unnecessarily complicated.",
//         );
//       }, 5600),

//       setTimeout(() => {
//         navigate("/app", { replace: true });
//       }, 20000),
//     ];

//     return () => timers.forEach(clearTimeout);
//   }, [navigate]);

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#0b0d10] text-white">
//       {/* =========================================================
//           AMBIENT BACKGROUND
//       ========================================================= */}

//       <div className="pointer-events-none absolute inset-0">
//         <div
//           className={`absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2bd19]/[0.055] blur-[160px] transition-all duration-[1800ms] ${
//             phase >= 1 ? "scale-100 opacity-100" : "scale-75 opacity-0"
//           }`}
//         />

//         <div
//           className={`absolute bottom-[-300px] right-[-200px] h-[600px] w-[600px] rounded-full bg-[#f2bd19]/[0.025] blur-[140px] transition-opacity duration-[2200ms] ${
//             phase >= 2 ? "opacity-100" : "opacity-0"
//           }`}
//         />

//         {/* Batman-ish spotlight */}
//         <div
//           className={`absolute left-1/2 top-0 h-[500px] w-[2px] -translate-x-1/2 bg-gradient-to-b from-[#f2bd19]/20 via-[#f2bd19]/5 to-transparent blur-sm transition-all duration-[2500ms] ${
//             phase >= 5 ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
//           }`}
//         />
//       </div>

//       {/* =========================================================
//           GRID
//       ========================================================= */}

//       <div
//         className="pointer-events-none absolute inset-0 opacity-[0.025]"
//         style={{
//           backgroundImage:
//             "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
//           backgroundSize: "48px 48px",
//         }}
//       />

//       {/* =========================================================
//           TOP SYSTEM BAR
//       ========================================================= */}

//       <div className="absolute left-0 right-0 top-0 flex items-center justify-between border-b border-white/[0.05] px-6 py-4">
//         <div className="flex items-center gap-2">
//           <div
//             className={`h-1.5 w-1.5 rounded-full bg-[#f2bd19] transition-all duration-500 ${
//               phase >= 1 ? "shadow-[0_0_12px_rgba(242,189,25,0.9)]" : ""
//             }`}
//           />

//           <span className="text-[8px] font-semibold uppercase tracking-[0.28em] text-slate-700">
//             S.E.A. CORE SYSTEM
//           </span>
//         </div>

//         <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.2em] text-slate-700">
//           <Cpu className="h-3 w-3" />
//           SYSTEM ONLINE
//         </div>
//       </div>

//       {/* =========================================================
//           CENTER
//       ========================================================= */}

//       <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
//         <div className="w-full max-w-[700px] text-center">
//           {/* =====================================================
//               SECURE ACCESS
//           ===================================================== */}

//           <div
//             className={`mb-8 flex items-center justify-center gap-3 transition-all duration-700 ${
//               phase >= 1
//                 ? "translate-y-0 opacity-100"
//                 : "translate-y-3 opacity-0"
//             }`}
//           >
//             <span className="h-px w-14 bg-gradient-to-r from-transparent to-[#f2bd19]/50" />

//             <div className="flex items-center gap-2">
//               <span className="h-1.5 w-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.9)]" />

//               <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-500">
//                 Secure Access Granted
//               </span>

//               <span className="h-1.5 w-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.9)]" />
//             </div>

//             <span className="h-px w-14 bg-gradient-to-l from-transparent to-[#f2bd19]/50" />
//           </div>

//           {/* =====================================================
//               LOGO
//           ===================================================== */}

//           <div
//             className={`relative mx-auto mb-8 w-fit transition-all duration-[1000ms] ease-out ${
//               phase >= 1
//                 ? "scale-100 opacity-100 blur-0"
//                 : "scale-[0.65] opacity-0 blur-md"
//             }`}
//           >
//             <div
//               className={`absolute -inset-6 rounded-[34px] border border-[#f2bd19]/20 transition-all duration-[1200ms] ${
//                 phase >= 2 ? "scale-100 opacity-100" : "scale-75 opacity-0"
//               }`}
//             />

//             <div
//               className={`absolute -inset-2 rounded-[23px] border border-[#f2bd19]/10 transition-all duration-[900ms] ${
//                 phase >= 2 ? "scale-100 opacity-100" : "scale-90 opacity-0"
//               }`}
//             />

//             <div className="relative flex h-[94px] w-[94px] items-center justify-center rounded-[22px] border border-white/[0.1] bg-white p-4 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
//               <img
//                 src={logo}
//                 alt="Sabawoon Educational Academy"
//                 className="max-h-full max-w-full object-contain"
//               />
//             </div>

//             <div className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[0_0_70px_rgba(242,189,25,0.15)]" />
//           </div>

//           {/* =====================================================
//               WELCOME TEXT
//           ===================================================== */}

//           <div
//             className={`transition-all duration-[900ms] ease-out ${
//               phase >= 2
//                 ? "translate-y-0 opacity-100"
//                 : "translate-y-5 opacity-0"
//             }`}
//           >
//             <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#f2bd19]/70">
//               Welcome to
//             </p>

//             <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-white sm:text-[38px]">
//               Sabawoon Educational Academy
//             </h1>

//             <div
//               className={`mx-auto mt-5 h-px bg-[#f2bd19] transition-all duration-[1000ms] ${
//                 phase >= 3 ? "w-24 opacity-100" : "w-0 opacity-0"
//               }`}
//             />

//             <p
//               className={`mt-5 text-[12px] font-medium uppercase tracking-[0.28em] text-slate-500 transition-all duration-[900ms] ${
//                 phase >= 3
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }`}
//             >
//               Management System
//             </p>
//           </div>

//           {/* =====================================================
//               BATMAN DEVELOPER SEQUENCE
//           ===================================================== */}

//           <div
//             className={`mx-auto mt-8 min-h-[70px] transition-all duration-700 ${
//               phase >= 4
//                 ? "translate-y-0 opacity-100"
//                 : "translate-y-3 opacity-0"
//             }`}
//           >
//             {/* Developer detected */}
//             <div
//               className={`transition-all duration-700 ${
//                 phase >= 5 ? "scale-100 opacity-100" : "scale-95 opacity-0"
//               }`}
//             >
//               <div className="mb-2 flex items-center justify-center gap-2">
//                 <Code2 className="h-3.5 w-3.5 text-[#f2bd19]" />

//                 <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#f2bd19]/70">
//                   Developer Detected
//                 </span>

//                 <Code2 className="h-3.5 w-3.5 text-[#f2bd19]" />
//               </div>

//               <p className="text-[11px] text-slate-600">
//                 Ayman has entered the building.
//               </p>
//             </div>

//             {/* Batman */}
//             <div
//               className={`mt-3 transition-all duration-700 ${
//                 phase >= 6
//                   ? "translate-y-0 scale-100 opacity-100"
//                   : "translate-y-3 scale-95 opacity-0"
//               }`}
//             >
//               <div className="flex items-center justify-center gap-2">
//                 <Zap className="h-3.5 w-3.5 text-[#f2bd19]" />

//                 <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white">
//                   BATMAN PROTOCOL: ACTIVE
//                 </span>

//                 <span className="text-[15px]">🦇</span>
//               </div>

//               <p className="mt-2 text-[10px] italic text-slate-700">
//                 The code is probably fine.
//                 <span className="text-slate-600"> Probably.</span>
//               </p>
//             </div>

//             {/* Completely unnecessary warning */}
//             <div
//               className={`mt-3 transition-all duration-700 ${
//                 phase >= 7
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-2 opacity-0"
//               }`}
//             >
//               <p className="text-[9px] uppercase tracking-[0.18em] text-slate-700">
//                 ⚠ Ayman is doing something unnecessarily complicated.
//               </p>
//             </div>
//           </div>

//           {/* =====================================================
//               STATUS PILL
//           ===================================================== */}

//           <div
//             className={`mx-auto mt-7 flex w-fit items-center gap-2 rounded-full border border-white/[0.07] bg-[#121519]/80 px-4 py-2 transition-all duration-700 ${
//               phase >= 4
//                 ? "translate-y-0 opacity-100"
//                 : "translate-y-3 opacity-0"
//             }`}
//           >
//             <ShieldCheck className="h-3.5 w-3.5 text-[#f2bd19]" />

//             <span className="text-[9px] font-medium text-slate-500">
//               {message}
//             </span>

//             <Sparkles className="h-3 w-3 text-[#f2bd19]/60" />
//           </div>

//           {/* =====================================================
//               LOADING BAR
//           ===================================================== */}

//           <div className="mx-auto mt-6 h-[2px] w-52 overflow-hidden rounded-full bg-white/[0.05]">
//             <div
//               className="h-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.7)] transition-all duration-[1800ms] ease-out"
//               style={{
//                 width:
//                   phase >= 7
//                     ? "100%"
//                     : phase >= 6
//                       ? "88%"
//                       : phase >= 5
//                         ? "74%"
//                         : phase >= 4
//                           ? "60%"
//                           : phase >= 3
//                             ? "45%"
//                             : phase >= 2
//                               ? "30%"
//                               : phase >= 1
//                                 ? "15%"
//                                 : "0%",
//               }}
//             />
//           </div>

//           {/* Percentage-ish system text */}
//           <div className="mt-2 flex justify-center gap-2">
//             <Terminal className="h-3 w-3 text-slate-800" />

//             <span className="font-mono text-[8px] text-slate-800">
//               {phase >= 7
//                 ? "SYSTEM READY"
//                 : phase >= 6
//                   ? "BATMAN_MODE=TRUE"
//                   : phase >= 5
//                     ? "DEVELOPER_FOUND"
//                     : phase >= 4
//                       ? "SCANNING..."
//                       : "BOOTING..."}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* =========================================================
//           FOOTER
//       ========================================================= */}

//       <div className="absolute bottom-6 left-0 right-0 text-center">
//         <p className="text-[9px] text-slate-800">
//           Built with questionable amounts of coffee by{" "}
//           <span className="font-semibold text-slate-700">
//             Teacher Ayman Najman
//           </span>{" "}
//           <span className="text-[#f2bd19]/50">“Batman”</span>{" "}
//           <span className="opacity-60">🦇</span>
//         </p>
//       </div>
//     </div>
//   );
// }

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// const scenes = [
//   {
//     text: "Initializing dashboard...",
//     duration: 1100,
//     size: "normal",
//   },
//   {
//     text: "Checking system status...",
//     duration: 1100,
//     size: "normal",
//   },
//   {
//     text: "Preparing everything for you...",
//     duration: 1200,
//     size: "normal",
//   },
//   {
//     text: "Waiting for the process to finish...",
//     duration: 1400,
//     size: "normal",
//   },
//   {
//     text: "Still waiting... ⏳",
//     duration: 1300,
//     size: "normal",
//   },
//   {
//     text: "This is taking a little longer than expected... 🧐",
//     duration: 1500,
//     size: "normal",
//   },
//   {
//     text: "Just kidding. 😂",
//     duration: 1600,
//     size: "big",
//   },
//   {
//     text: "There is no process. 💀",
//     duration: 1700,
//     size: "big",
//   },
//   {
//     text: "It's literally my app. 😭",
//     duration: 1800,
//     size: "big",
//   },
//   {
//     text: "I can keep you waiting as long as I want. 🗿",
//     duration: 2100,
//     size: "big",
//   },
//   {
//     text: "What are you gonna do about it? 😭",
//     duration: 2200,
//     size: "huge",
//   },
//   {
//     text: "Nothing. 🦇",
//     duration: 1500,
//     size: "huge",
//   },
//   {
//     text: "Because I am Batman. 🦇",
//     duration: 1900,
//     size: "huge",
//   },
//   {
//     text: "And Batman does unnecessary things. 🦇",
//     duration: 1900,
//     size: "big",
//   },
//   {
//     text: "Especially when writing JavaScript. 💀",
//     duration: 1900,
//     size: "big",
//   },
//   {
//     text: "Making a simple feature unnecessarily complicated... 🤓",
//     duration: 2200,
//     size: "normal",
//   },
//   {
//     text: "Adding animations nobody asked for... ✨",
//     duration: 1900,
//     size: "normal",
//   },
//   {
//     text: "Writing 400 lines of code to avoid writing 4... 💀",
//     duration: 2300,
//     size: "big",
//   },
//   {
//     text: "Overengineering absolutely everything... 🧠",
//     duration: 1900,
//     size: "big",
//   },
//   {
//     text: "Because apparently we have standards. 🗿",
//     duration: 1900,
//     size: "big",
//   },
//   {
//     text: "Fine. 😐",
//     duration: 1000,
//     size: "normal",
//   },
//   {
//     text: "You may enter. 🦇",
//     duration: 1400,
//     size: "huge",
//   },
//   {
//     text: "Loading dashboard, Sorry I meant BATCAVE...",
//     duration: 1000,
//     size: "normal",
//   },
// ];

// export default function WelcomeScreen() {
//   const navigate = useNavigate();

//   const [sceneIndex, setSceneIndex] = useState(0);
//   const [visible, setVisible] = useState(true);

//   useEffect(() => {
//     let timeout;

//     const playScene = () => {
//       const currentScene = scenes[sceneIndex];

//       timeout = setTimeout(() => {
//         setVisible(false);

//         setTimeout(() => {
//           if (sceneIndex >= scenes.length - 1) {
//             navigate("/app", { replace: true });
//             return;
//           }

//           setSceneIndex((prev) => prev + 1);
//           setVisible(true);
//         }, 400);
//       }, currentScene.duration);
//     };

//     playScene();

//     return () => clearTimeout(timeout);
//   }, [sceneIndex, navigate]);

//   const current = scenes[sceneIndex];

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#0b0d10] text-white">
//       {/* =========================================================
//           BACKGROUND
//       ========================================================= */}

//       <div className="pointer-events-none absolute inset-0">
//         <div className="absolute left-1/2 top-1/2 h-[650px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2bd19]/[0.025] blur-[160px]" />

//         <div
//           className="absolute inset-0 opacity-[0.018]"
//           style={{
//             backgroundImage:
//               "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
//             backgroundSize: "48px 48px",
//           }}
//         />
//       </div>

//       {/* =========================================================
//           TOP SECRET BATMAN SYSTEM LABEL
//       ========================================================= */}

//       <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-5">
//         <div className="flex items-center gap-2">
//           <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.8)]" />

//           <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-slate-700">
//             A.Y.M.A.N // DEVELOPMENT MODE
//           </span>
//         </div>

//         <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-slate-800">
//           🦇 BATMAN SYSTEM
//         </span>
//       </div>

//       {/* =========================================================
//           MAIN
//       ========================================================= */}

//       <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
//         <div className="w-full max-w-[850px] text-center">
//           {/* Tiny status */}
//           <div className="mb-10 flex items-center justify-center gap-3">
//             <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#f2bd19]/30" />

//             <span className="text-[9px] font-semibold uppercase tracking-[0.35em] text-slate-700">
//               Please Wait
//             </span>

//             <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#f2bd19]/30" />
//           </div>

//           {/* =====================================================
//               MAIN MESSAGE
//           ===================================================== */}

//           <div className="relative flex min-h-[170px] items-center justify-center">
//             <div
//               className={`
//                 absolute w-full px-5
//                 transition-all duration-400
//                 ease-out
//                 ${
//                   visible
//                     ? "translate-y-0 scale-100 opacity-100 blur-0"
//                     : "-translate-y-4 scale-[0.98] opacity-0 blur-[4px]"
//                 }
//               `}
//             >
//               <p
//                 className={`
//                   mx-auto leading-tight tracking-[-0.035em]
//                   ${
//                     current.size === "huge"
//                       ? "text-[30px] font-bold text-white sm:text-[46px]"
//                       : current.size === "big"
//                         ? "text-[25px] font-semibold text-white sm:text-[36px]"
//                         : "text-[19px] font-medium text-slate-400 sm:text-[25px]"
//                   }
//                 `}
//               >
//                 {current.text}
//               </p>
//             </div>
//           </div>

//           {/* =====================================================
//               FAKE PROGRESS BAR
//           ===================================================== */}

//           <div className="mx-auto mt-8 h-[2px] w-52 overflow-hidden rounded-full bg-white/[0.05]">
//             <div
//               className="h-full bg-[#f2bd19] shadow-[0_0_14px_rgba(242,189,25,0.7)] transition-all duration-700 ease-out"
//               style={{
//                 width: `${Math.min(
//                   ((sceneIndex + 1) / scenes.length) * 100,
//                   100,
//                 )}%`,
//               }}
//             />
//           </div>

//           {/* Fake technical information */}
//           <div className="mt-3">
//             <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-800">
//               {sceneIndex < 6
//                 ? "PROCESSING..."
//                 : sceneIndex < 12
//                   ? "PROCESS DOES NOT EXIST"
//                   : sceneIndex < 20
//                     ? "BATMAN IS OVERENGINEERING"
//                     : "ACCESS GRANTED"}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* =========================================================
//           FOOTER
//       ========================================================= */}

//       <div className="absolute bottom-7 left-0 right-0 text-center">
//         <p className="text-[9px] text-slate-800">
//           Engineered with{" "}
//           <span className="text-slate-700">
//             absolutely unnecessary complexity
//           </span>{" "}
//           by{" "}
//           <span className="font-semibold text-slate-700">
//             Teacher Ayman Najman
//           </span>{" "}
//           <span className="text-[#f2bd19]/60">“Batman”</span>{" "}
//           <span className="opacity-60">🦇</span>
//         </p>
//       </div>
//     </div>
//   );
// }

//

// import { useEffect, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import aymanPhoto from "../assets/ayman-reference.jfif";

// /*
// |--------------------------------------------------------------------------
// | CINEMATIC BATMAN → AYMAN WELCOME SCREEN
// |--------------------------------------------------------------------------
// |
// | Timeline:
// |
// |  0.0s  — darkness
// |  0.7s  — technical grid appears
// |  1.2s  — bat construction begins
// |  4.8s  — bat is fully drawn
// |  5.8s  — dramatic pause
// |  6.5s  — BATMAN appears
// |  8.0s  — red slash begins
// |  8.8s  — BAT begins dissolving
// |  9.5s  — AYMAN transformation
// | 10.5s  — portrait reveal
// | 12.5s  — final joke
// | 14.0s  — dashboard
// |
// |--------------------------------------------------------------------------
// */

// const TIMINGS = {
//   grid: 500,
//   batStart: 1000,
//   batComplete: 5200,
//   batPause: 6100,
//   batman: 6500,
//   slash: 7900,
//   transform: 8500,
//   portrait: 9700,
//   final: 11600,
//   dashboard: 14000,
// };

// const messages = [
//   [700, "Initializing..."],
//   [1500, "Constructing something important..."],
//   [2300, "Drawing bat... 🦇"],
//   [3200, "Analyzing unnecessary complexity..."],
//   [4100, "This could have been a loading spinner."],
//   [5000, "But apparently we chose violence. 💀"],
//   [6000, "Batman is approaching... 🦇"],
//   [7000, "Please remain calm."],
//   [7700, "This is completely normal."],
//   [8700, "Actually... no it's not. 😭"],
//   [10000, "Rebranding Batman..."],
//   [10800, "Consulting the developer..."],
//   [11700, "Developer identified. 🦇"],
//   [12400, "Unfortunately, he's going to overengineer this too."],
//   [13300, "Fine. You may enter."],
// ];

// export default function WelcomeScreen() {
//   const navigate = useNavigate();

//   const [elapsed, setElapsed] = useState(0);
//   const [message, setMessage] = useState("Initializing...");
//   const [flash, setFlash] = useState(false);

//   /*
//   |--------------------------------------------------------------------------
//   | Main animation clock
//   |--------------------------------------------------------------------------
//   */

//   useEffect(() => {
//     const start = performance.now();

//     let frame;

//     const tick = (now) => {
//       const current = now - start;

//       setElapsed(current);

//       const currentMessage =
//         [...messages].reverse().find(([time]) => current >= time)?.[1] ||
//         "Initializing...";

//       setMessage(currentMessage);

//       frame = requestAnimationFrame(tick);
//     };

//     frame = requestAnimationFrame(tick);

//     const finishTimer = setTimeout(() => {
//       navigate("/app", { replace: true });
//     }, TIMINGS.dashboard);

//     return () => {
//       cancelAnimationFrame(frame);
//       clearTimeout(finishTimer);
//     };
//   }, [navigate]);

//   /*
//   |--------------------------------------------------------------------------
//   | Slash flash
//   |--------------------------------------------------------------------------
//   */

//   useEffect(() => {
//     if (elapsed >= TIMINGS.slash && elapsed < TIMINGS.slash + 250) {
//       setFlash(true);

//       const timer = setTimeout(() => {
//         setFlash(false);
//       }, 180);

//       return () => clearTimeout(timer);
//     }
//   }, [elapsed]);

//   /*
//   |--------------------------------------------------------------------------
//   | Progress
//   |--------------------------------------------------------------------------
//   */

//   const progress = Math.min((elapsed / TIMINGS.dashboard) * 100, 100);

//   /*
//   |--------------------------------------------------------------------------
//   | Animation state
//   |--------------------------------------------------------------------------
//   */

//   const gridVisible = elapsed >= TIMINGS.grid;

//   const batVisible = elapsed >= TIMINGS.batStart;

//   const batFinished = elapsed >= TIMINGS.batComplete;

//   const batmanVisible = elapsed >= TIMINGS.batman;

//   const slashVisible = elapsed >= TIMINGS.slash;

//   const transforming = elapsed >= TIMINGS.transform;

//   const portraitVisible = elapsed >= TIMINGS.portrait;

//   const finalScene = elapsed >= TIMINGS.final;

//   /*
//   |--------------------------------------------------------------------------
//   | Random technical particles
//   |--------------------------------------------------------------------------
//   */

//   const particles = useMemo(() => {
//     return Array.from({ length: 90 }, (_, i) => ({
//       id: i,
//       x: Math.random() * 100,
//       y: Math.random() * 100,
//       delay: Math.random() * 4,
//       duration: 2 + Math.random() * 4,
//       size: 1 + Math.random() * 2,
//     }));
//   }, []);

//   return (
//     <div
//       className={`
//         fixed inset-0 z-[9999] overflow-hidden
//         bg-[#050609] text-white
//         transition-all duration-1000
//         ${flash ? "brightness-150" : ""}
//       `}
//     >
//       {/* ============================================================
//           SVG DEFINITIONS
//       ============================================================ */}

//       <svg
//         className="pointer-events-none absolute inset-0 h-full w-full"
//         viewBox="0 0 1600 900"
//         preserveAspectRatio="xMidYMid slice"
//       >
//         <defs>
//           {/* Blue glow */}
//           <filter id="blueGlow">
//             <feGaussianBlur stdDeviation="4" result="blur" />

//             <feMerge>
//               <feMergeNode in="blur" />
//               <feMergeNode in="SourceGraphic" />
//             </feMerge>
//           </filter>

//           {/* Strong bat glow */}
//           <filter id="batGlow">
//             <feGaussianBlur stdDeviation="7" result="blur" />

//             <feMerge>
//               <feMergeNode in="blur" />
//               <feMergeNode in="SourceGraphic" />
//             </feMerge>
//           </filter>

//           {/* Red slash */}
//           <filter id="redGlow">
//             <feGaussianBlur stdDeviation="5" result="blur" />

//             <feMerge>
//               <feMergeNode in="blur" />
//               <feMergeNode in="SourceGraphic" />
//             </feMerge>
//           </filter>

//           {/* Portrait mask */}
//           <radialGradient id="portraitFade">
//             <stop offset="0%" stopColor="white" stopOpacity="1" />

//             <stop offset="72%" stopColor="white" stopOpacity="0.95" />

//             <stop offset="100%" stopColor="white" stopOpacity="0" />
//           </radialGradient>

//           <mask id="portraitMask">
//             <rect width="1600" height="900" fill="url(#portraitFade)" />
//           </mask>
//         </defs>

//         {/* ==========================================================
//             TECHNICAL GRID
//         ========================================================== */}

//         <g
//           className={`
//             transition-opacity duration-[1500ms]
//             ${gridVisible ? "opacity-100" : "opacity-0"}
//           `}
//         >
//           {Array.from({ length: 34 }).map((_, i) => (
//             <line
//               key={`v-${i}`}
//               x1={i * 50}
//               y1="0"
//               x2={i * 50}
//               y2="900"
//               stroke="#ffffff"
//               strokeOpacity="0.025"
//             />
//           ))}

//           {Array.from({ length: 20 }).map((_, i) => (
//             <line
//               key={`h-${i}`}
//               x1="0"
//               y1={i * 50}
//               x2="1600"
//               y2={i * 50}
//               stroke="#ffffff"
//               strokeOpacity="0.025"
//             />
//           ))}
//         </g>

//         {/* ==========================================================
//             BAT BLUEPRINT
//         ========================================================== */}

//         <g
//           className={`
//             transition-all duration-1000
//             ${batVisible ? "opacity-100" : "opacity-0"}
//           `}
//           filter="url(#batGlow)"
//         >
//           {/* Main bat silhouette */}
//           <path
//             d="
//               M 800 270

//               C 750 245 710 215 670 175
//               C 675 220 660 250 630 280

//               C 570 235 500 205 410 190
//               C 455 250 475 310 455 370

//               C 390 330 320 315 245 325
//               C 315 375 360 430 375 485

//               C 315 465 255 470 195 500
//               C 295 540 380 565 475 565

//               C 540 565 600 545 650 510

//               C 670 555 700 590 750 610

//               L 780 540

//               L 800 650

//               L 820 540

//               L 850 610

//               C 900 590 930 555 950 510

//               C 1000 545 1060 565 1125 565

//               C 1220 565 1305 540 1405 500

//               C 1345 470 1285 465 1225 485

//               C 1240 430 1285 375 1355 325

//               C 1280 315 1210 330 1145 370

//               C 1125 310 1145 250 1190 190

//               C 1100 205 1030 235 970 280

//               C 940 250 925 220 930 175

//               C 890 215 850 245 800 270
//             "
//             fill="none"
//             stroke="#dbeafe"
//             strokeWidth="2.2"
//             strokeLinecap="round"
//             strokeLinejoin="round"
//             pathLength="1000"
//             strokeDasharray="1000"
//             strokeDashoffset={
//               batVisible
//                 ? Math.max(
//                     1000 -
//                       ((elapsed - TIMINGS.batStart) /
//                         (TIMINGS.batComplete - TIMINGS.batStart)) *
//                         1000,
//                     0,
//                   )
//                 : 1000
//             }
//             style={{
//               transition: "stroke-dashoffset 0.05s linear",
//             }}
//           />

//           {/* Secondary construction lines */}

//           <path
//             d="
//               M 800 270
//               L 800 650

//               M 650 510
//               L 590 610

//               M 950 510
//               L 1010 610

//               M 475 565
//               L 430 610

//               M 1125 565
//               L 1170 610

//               M 375 485
//               L 290 590

//               M 1225 485
//               L 1310 590
//             "
//             fill="none"
//             stroke="#60a5fa"
//             strokeWidth="1"
//             strokeOpacity="0.5"
//             strokeDasharray="4 8"
//           />

//           {/* Face construction */}

//           <ellipse
//             cx="800"
//             cy="395"
//             rx="155"
//             ry="125"
//             fill="none"
//             stroke="#60a5fa"
//             strokeWidth="1"
//             strokeOpacity="0.25"
//           />

//           <line
//             x1="645"
//             y1="395"
//             x2="955"
//             y2="395"
//             stroke="#60a5fa"
//             strokeWidth="1"
//             strokeOpacity="0.18"
//           />

//           <line
//             x1="800"
//             y1="270"
//             x2="800"
//             y2="520"
//             stroke="#60a5fa"
//             strokeWidth="1"
//             strokeOpacity="0.18"
//           />

//           {/* Bat eyes */}

//           <path
//             d="M 715 365 L 770 380 L 730 395"
//             fill="none"
//             stroke="#f2bd19"
//             strokeWidth="2"
//             opacity={batFinished ? 1 : 0}
//           />

//           <path
//             d="M 885 380 L 940 365 L 930 395"
//             fill="none"
//             stroke="#f2bd19"
//             strokeWidth="2"
//             opacity={batFinished ? 1 : 0}
//           />

//           {/* Eye glow */}

//           <ellipse
//             cx="740"
//             cy="380"
//             rx="18"
//             ry="5"
//             fill="#f2bd19"
//             opacity={batFinished ? 0.35 + Math.sin(elapsed / 250) * 0.15 : 0}
//           />

//           <ellipse
//             cx="860"
//             cy="380"
//             rx="18"
//             ry="5"
//             fill="#f2bd19"
//             opacity={batFinished ? 0.35 + Math.sin(elapsed / 250) * 0.15 : 0}
//           />
//         </g>

//         {/* ==========================================================
//             FLOATING PARTICLES
//         ========================================================== */}

//         <g
//           className={`
//             transition-opacity duration-1000
//             ${batVisible ? "opacity-100" : "opacity-0"}
//           `}
//         >
//           {particles.map((particle) => (
//             <circle
//               key={particle.id}
//               cx={`${particle.x}%`}
//               cy={`${particle.y}%`}
//               r={particle.size}
//               fill="#60a5fa"
//               opacity="0.35"
//             >
//               <animate
//                 attributeName="opacity"
//                 values="0.05;0.6;0.05"
//                 dur={`${particle.duration}s`}
//                 begin={`${particle.delay}s`}
//                 repeatCount="indefinite"
//               />
//             </circle>
//           ))}
//         </g>

//         {/* ==========================================================
//             PORTRAIT
//         ========================================================== */}

//         <g
//           className={`
//             transition-all duration-[1800ms] ease-out
//             ${portraitVisible ? "opacity-100" : "opacity-0"}
//           `}
//           mask="url(#portraitMask)"
//         >
//           <image
//             href={aymanPhoto}
//             x="500"
//             y="90"
//             width="600"
//             height="700"
//             preserveAspectRatio="xMidYMid slice"
//             opacity={
//               transforming
//                 ? Math.min((elapsed - TIMINGS.portrait) / 1300, 1)
//                 : 0
//             }
//           />
//         </g>
//       </svg>

//       {/* ============================================================
//           BATMAN TITLE
//       ============================================================ */}

//       <div
//         className={`
//           absolute left-1/2 top-[72%]
//           -translate-x-1/2
//           text-center
//           transition-all duration-[1000ms] ease-out
//           ${
//             batmanVisible && !transforming
//               ? "translate-y-0 opacity-100"
//               : transforming
//                 ? "translate-y-2 opacity-0"
//                 : "translate-y-5 opacity-0"
//           }
//         `}
//       >
//         <h1 className="font-black text-[48px] tracking-[0.25em] text-white sm:text-[72px]">
//           BATMAN
//         </h1>

//         <div className="mx-auto mt-2 h-px w-32 bg-[#f2bd19]/50" />

//         <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.35em] text-slate-700">
//           Identity detected
//         </p>
//       </div>

//       {/* ============================================================
//           AYMAN TITLE
//       ============================================================ */}

//       <div
//         className={`
//           absolute left-1/2 top-[72%]
//           -translate-x-1/2
//           text-center
//           transition-all duration-[1200ms] ease-out
//           ${
//             transforming
//               ? "translate-y-0 opacity-100"
//               : "translate-y-5 opacity-0"
//           }
//         `}
//       >
//         <h1
//           className={`
//             font-black text-[48px] tracking-[0.25em]
//             sm:text-[72px]
//             ${finalScene ? "text-[#f2bd19]" : "text-white"}
//           `}
//         >
//           AYMAN
//         </h1>

//         <div className="mx-auto mt-2 h-px w-32 bg-[#f2bd19]" />

//         <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.35em] text-slate-600">
//           Developer identified 🦇
//         </p>
//       </div>

//       {/* ============================================================
//           RED TRANSFORMATION SLASH
//       ============================================================ */}

//       <div
//         className={`
//           pointer-events-none absolute left-0 right-0 top-[72%]
//           h-[2px]
//           bg-red-500
//           shadow-[0_0_25px_rgba(239,68,68,0.9)]
//           transition-all duration-500
//           ${
//             slashVisible
//               ? "translate-x-0 opacity-100"
//               : "-translate-x-full opacity-0"
//           }
//         `}
//       />

//       {/* ============================================================
//           MESSAGE
//       ============================================================ */}

//       <div className="absolute bottom-[15%] left-0 right-0 flex justify-center px-6">
//         <div
//           className="
//             min-h-[30px]
//             text-center
//             transition-all duration-500
//           "
//         >
//           <p
//             key={message}
//             className="
//               animate-[fadeMessage_0.5s_ease-out]
//               text-[11px]
//               font-medium
//               tracking-[0.08em]
//               text-slate-500
//               sm:text-[13px]
//             "
//           >
//             {message}
//           </p>
//         </div>
//       </div>

//       {/* ============================================================
//           PROGRESS
//       ============================================================ */}

//       <div className="absolute bottom-[10%] left-1/2 w-[220px] -translate-x-1/2">
//         <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.04]">
//           <div
//             className="
//               h-full
//               bg-[#f2bd19]
//               shadow-[0_0_15px_rgba(242,189,25,0.7)]
//               transition-[width]
//               duration-200
//             "
//             style={{
//               width: `${progress}%`,
//             }}
//           />
//         </div>

//         <div className="mt-2 flex justify-between">
//           <span className="font-mono text-[7px] text-slate-800">
//             SYS://AYMAN
//           </span>

//           <span className="font-mono text-[7px] text-slate-800">
//             {Math.floor(progress)}%
//           </span>
//         </div>
//       </div>

//       {/* ============================================================
//           TOP SYSTEM INFO
//       ============================================================ */}

//       <div className="absolute left-6 right-6 top-6 flex items-center justify-between">
//         <div className="flex items-center gap-2">
//           <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f2bd19] shadow-[0_0_12px_rgba(242,189,25,0.7)]" />

//           <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-slate-800">
//             DEVELOPMENT ENVIRONMENT
//           </span>
//         </div>

//         <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-slate-800">
//           🦇
//         </span>
//       </div>

//       {/* ============================================================
//           FOOTER
//       ============================================================ */}

//       <div className="absolute bottom-5 left-0 right-0 text-center">
//         <p className="text-[8px] text-slate-800">
//           Built by <span className="font-semibold text-slate-700">Ayman</span>{" "}
//           <span className="text-[#f2bd19]/50">“Batman”</span> 🦇
//         </p>
//       </div>

//       {/* ============================================================
//           GLOBAL ANIMATION STYLES
//       ============================================================ */}

//       <style>{`
//         @keyframes fadeMessage {
//           from {
//             opacity: 0;
//             transform: translateY(8px);
//             filter: blur(4px);
//           }

//           to {
//             opacity: 1;
//             transform: translateY(0);
//             filter: blur(0);
//           }
//         }
//       `}</style>
//     </div>
//   );
// }

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// export default function WelcomeScreen() {
//   const navigate = useNavigate();

//   const [phase, setPhase] = useState(0);

//   /*
//    * ================================================================
//    * TIMELINE
//    * ================================================================
//    *
//    *  0.0s  black screen
//    *  0.6s  scanning grid
//    *  1.1s  laser system starts
//    *  1.8s  shield begins drawing
//    *  3.0s  book begins drawing
//    *  4.0s  central symbol draws
//    *  4.8s  logo becomes complete
//    *  5.5s  gold illumination
//    *  6.3s  SABAWOON appears
//    *  7.0s  EDUCATIONAL ACADEMY
//    *  7.7s  QUEST FOR EXCELLENCE
//    *  9.2s  final hold
//    * 10.0s dashboard
//    */

//   useEffect(() => {
//     const timers = [
//       setTimeout(() => setPhase(1), 600),
//       setTimeout(() => setPhase(2), 1100),
//       setTimeout(() => setPhase(3), 1800),
//       setTimeout(() => setPhase(4), 3000),
//       setTimeout(() => setPhase(5), 4000),
//       setTimeout(() => setPhase(6), 4800),
//       setTimeout(() => setPhase(7), 5500),
//       setTimeout(() => setPhase(8), 6300),
//       setTimeout(() => setPhase(9), 7000),
//       setTimeout(() => setPhase(10), 7700),

//       setTimeout(() => {
//         navigate("/app", { replace: true });
//       }, 10000),
//     ];

//     return () => timers.forEach(clearTimeout);
//   }, [navigate]);

//   const logoVisible = phase >= 6;
//   const textVisible = phase >= 7;
//   const academyVisible = phase >= 8;
//   const taglineVisible = phase >= 9;

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#030405] text-white">
//       {/* ============================================================
//           BACKGROUND
//       ============================================================ */}

//       <div className="pointer-events-none absolute inset-0">
//         {/* Main cinematic glow */}
//         <div
//           className={`
//             absolute left-1/2 top-1/2
//             h-[650px] w-[650px]
//             -translate-x-1/2 -translate-y-1/2
//             rounded-full
//             bg-[#f2bd19]/[0.035]
//             blur-[150px]
//             transition-all duration-[2500ms]
//             ${phase >= 3 ? "scale-100 opacity-100" : "scale-50 opacity-0"}
//           `}
//         />

//         {/* Blue secondary glow */}
//         <div
//           className={`
//             absolute left-1/2 top-1/2
//             h-[450px] w-[450px]
//             -translate-x-1/2 -translate-y-1/2
//             rounded-full
//             bg-blue-500/[0.025]
//             blur-[130px]
//             transition-opacity duration-[2000ms]
//             ${phase >= 2 ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Technical grid */}
//         <div
//           className={`
//             absolute inset-0
//             transition-opacity duration-[1800ms]
//             ${phase >= 1 ? "opacity-100" : "opacity-0"}
//           `}
//           style={{
//             backgroundImage: `
//               linear-gradient(
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               ),
//               linear-gradient(
//                 90deg,
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               )
//             `,
//             backgroundSize: "50px 50px",
//           }}
//         />

//         {/* Vignette */}
//         <div
//           className="
//             absolute inset-0
//             bg-[radial-gradient(
//               ellipse_at_center,
//               transparent_20%,
//               rgba(0,0,0,0.72)_100%
//             )]
//           "
//         />
//       </div>

//       {/* ============================================================
//           TOP SYSTEM HUD
//       ============================================================ */}

//       <div
//         className={`
//           absolute left-6 right-6 top-6
//           flex items-center justify-between
//           transition-opacity duration-1000
//           ${phase >= 1 ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <div className="flex items-center gap-2">
//           <span
//             className="
//               h-1.5 w-1.5 rounded-full
//               bg-[#f2bd19]
//               shadow-[0_0_12px_rgba(242,189,25,0.9)]
//               animate-pulse
//             "
//           />

//           <span
//             className="
//             font-mono
//             text-[8px]
//             uppercase
//             tracking-[0.3em]
//             text-slate-700
//           "
//           >
//             LOGO CONSTRUCTION SYSTEM
//           </span>
//         </div>

//         <span
//           className="
//           font-mono
//           text-[8px]
//           uppercase
//           tracking-[0.3em]
//           text-slate-800
//         "
//         >
//           VECTOR // ONLINE
//         </span>
//       </div>

//       {/* ============================================================
//           MAIN LOGO
//       ============================================================ */}

//       <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
//         <div className="w-full max-w-[620px] text-center">
//           {/* ========================================================
//               SCANNING LABEL
//           ======================================================== */}

//           <div
//             className={`
//               mb-8
//               flex items-center justify-center gap-3
//               transition-all duration-700
//               ${
//                 phase >= 1
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span
//               className="
//               h-px w-14
//               bg-gradient-to-r
//               from-transparent
//               to-blue-400/30
//             "
//             />

//             <span
//               className="
//               font-mono
//               text-[8px]
//               uppercase
//               tracking-[0.35em]
//               text-slate-600
//             "
//             >
//               Scanning Identity
//             </span>

//             <span
//               className="
//               h-px w-14
//               bg-gradient-to-l
//               from-transparent
//               to-blue-400/30
//             "
//             />
//           </div>

//           {/* ========================================================
//               LOGO SVG
//           ======================================================== */}

//           <div
//             className={`
//               relative mx-auto
//               w-[310px]
//               sm:w-[360px]
//               transition-all
//               duration-[1600ms]
//               ${
//                 logoVisible ? "scale-100 opacity-100" : "scale-[0.9] opacity-70"
//               }
//             `}
//           >
//             {/* Ambient logo glow */}
//             <div
//               className={`
//                 absolute
//                 left-1/2 top-1/2
//                 h-[330px] w-[330px]
//                 -translate-x-1/2
//                 -translate-y-1/2
//                 rounded-full
//                 bg-[#f2bd19]/[0.055]
//                 blur-[80px]
//                 transition-opacity
//                 duration-[1800ms]
//                 ${logoVisible ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <svg
//               viewBox="0 0 500 540"
//               className="relative h-auto w-full overflow-visible"
//             >
//               <defs>
//                 {/* Blue laser */}
//                 <filter id="laserBlue">
//                   <feGaussianBlur stdDeviation="3" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>

//                 {/* Gold laser */}
//                 <filter id="laserGold">
//                   <feGaussianBlur stdDeviation="3" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>

//                 {/* Strong gold glow */}
//                 <filter id="goldGlow">
//                   <feGaussianBlur stdDeviation="8" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>
//               </defs>

//               {/* ==================================================
//                   OUTER SHIELD
//               ================================================== */}

//               <path
//                 d="
//                   M250 35
//                   L390 105
//                   L390 275
//                   C390 370 330 430 250 480
//                   C170 430 110 370 110 275
//                   L110 105
//                   Z
//                 "
//                 fill="none"
//                 stroke="#60a5fa"
//                 strokeWidth="3"
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 pathLength="1000"
//                 strokeDasharray="1000"
//                 strokeDashoffset={
//                   phase >= 2
//                     ? Math.max(1000 - ((phase - 1) / 5) * 1000, 0)
//                     : 1000
//                 }
//                 filter="url(#laserBlue)"
//                 className="transition-all duration-[2500ms] ease-out"
//               />

//               {/* Gold shield overlay */}

//               <path
//                 d="
//                   M250 35
//                   L390 105
//                   L390 275
//                   C390 370 330 430 250 480
//                   C170 430 110 370 110 275
//                   L110 105
//                   Z
//                 "
//                 fill="none"
//                 stroke="#f2bd19"
//                 strokeWidth="1.4"
//                 strokeOpacity={phase >= 6 ? 1 : 0}
//                 filter="url(#laserGold)"
//                 className="transition-opacity duration-[1200ms]"
//               />

//               {/* ==================================================
//                   TOP STAR / POINT
//               ================================================== */}

//               <path
//                 d="
//                   M250 22
//                   L250 48
//                   M237 35
//                   L263 35
//                 "
//                 stroke="#f2bd19"
//                 strokeWidth="2"
//                 strokeLinecap="round"
//                 opacity={phase >= 5 ? 1 : 0}
//                 filter="url(#goldGlow)"
//                 className="transition-opacity duration-700"
//               />

//               {/* ==================================================
//                   CENTRAL BOOK
//               ================================================== */}

//               <g
//                 fill="none"
//                 stroke="#f2bd19"
//                 strokeWidth="3"
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 filter="url(#laserGold)"
//                 className={`
//                   transition-all
//                   duration-[1800ms]
//                   ${phase >= 4 ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Left book */}
//                 <path
//                   d="
//                     M250 320
//                     C215 285 175 270 145 275
//                     L145 355
//                     C180 350 215 365 250 395
//                   "
//                 />

//                 {/* Right book */}
//                 <path
//                   d="
//                     M250 320
//                     C285 285 325 270 355 275
//                     L355 355
//                     C320 350 285 365 250 395
//                   "
//                 />

//                 {/* Inner pages */}

//                 <path
//                   d="
//                     M250 340
//                     C220 315 190 305 165 310
//                   "
//                   strokeWidth="2"
//                 />

//                 <path
//                   d="
//                     M250 340
//                     C280 315 310 305 335 310
//                   "
//                   strokeWidth="2"
//                 />

//                 <path
//                   d="
//                     M250 360
//                     C220 340 190 335 165 340
//                   "
//                   strokeWidth="2"
//                 />

//                 <path
//                   d="
//                     M250 360
//                     C280 340 310 335 335 340
//                   "
//                   strokeWidth="2"
//                 />

//                 {/* Center spine */}

//                 <path d="M250 310 L250 395" strokeWidth="4" />
//               </g>

//               {/* ==================================================
//                   CENTRAL PEN / FLAME
//               ================================================== */}

//               <g
//                 fill="none"
//                 stroke="#f2bd19"
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 filter="url(#goldGlow)"
//                 className={`
//                   transition-all
//                   duration-[1400ms]
//                   ${phase >= 5 ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 <path
//                   d="
//                     M250 135
//                     L250 305
//                   "
//                   strokeWidth="8"
//                 />

//                 <path
//                   d="
//                     M250 125
//                     C235 150 232 170 250 190
//                     C268 170 265 150 250 125
//                   "
//                   strokeWidth="4"
//                 />

//                 <path
//                   d="
//                     M250 195
//                     C235 220 238 245 250 265
//                     C262 245 265 220 250 195
//                   "
//                   strokeWidth="3"
//                 />
//               </g>

//               {/* ==================================================
//                   LASER SCAN LINE
//               ================================================== */}

//               <line
//                 x1="70"
//                 x2="430"
//                 y1={phase < 3 ? 100 : phase < 4 ? 280 : 450}
//                 y2={phase < 3 ? 100 : phase < 4 ? 280 : 450}
//                 stroke="#60a5fa"
//                 strokeWidth="1"
//                 strokeOpacity={phase >= 2 && phase < 6 ? 0.9 : 0}
//                 filter="url(#laserBlue)"
//                 className="transition-all duration-[1800ms] ease-in-out"
//               />

//               {/* ==================================================
//                   FINAL GOLD STARBURST
//               ================================================== */}

//               <g
//                 opacity={phase >= 6 ? 1 : 0}
//                 filter="url(#goldGlow)"
//                 className="transition-opacity duration-[1000ms]"
//               >
//                 <circle cx="250" cy="35" r="5" fill="#f2bd19" />

//                 <circle cx="110" cy="105" r="3" fill="#f2bd19" />

//                 <circle cx="390" cy="105" r="3" fill="#f2bd19" />

//                 <circle cx="250" cy="480" r="4" fill="#f2bd19" />
//               </g>
//             </svg>
//           </div>

//           {/* ========================================================
//               BRAND NAME
//           ======================================================== */}

//           <div
//             className={`
//               mt-[-15px]
//               transition-all
//               duration-[1200ms]
//               ${
//                 textVisible
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-5 opacity-0"
//               }
//             `}
//           >
//             <h1
//               className="
//                 font-serif
//                 text-[32px]
//                 font-semibold
//                 tracking-[0.18em]
//                 text-[#f2bd19]
//                 sm:text-[42px]
//               "
//             >
//               SABAWOON
//             </h1>
//           </div>

//           {/* ========================================================
//               EDUCATIONAL ACADEMY
//           ======================================================== */}

//           <div
//             className={`
//               mt-2
//               transition-all
//               duration-[1000ms]
//               ${
//                 academyVisible
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <div className="flex items-center justify-center gap-3">
//               <span
//                 className="
//                 h-px w-8
//                 bg-[#f2bd19]/40
//               "
//               />

//               <span
//                 className="
//                 text-[9px]
//                 font-medium
//                 uppercase
//                 tracking-[0.4em]
//                 text-slate-500
//               "
//               >
//                 Educational Academy
//               </span>

//               <span
//                 className="
//                 h-px w-8
//                 bg-[#f2bd19]/40
//               "
//               />
//             </div>
//           </div>

//           {/* ========================================================
//               QUEST FOR EXCELLENCE
//           ======================================================== */}

//           <div
//             className={`
//               mt-5
//               transition-all
//               duration-[1200ms]
//               ${
//                 taglineVisible
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <p
//               className="
//               text-[9px]
//               font-medium
//               uppercase
//               tracking-[0.45em]
//               text-[#f2bd19]/70
//             "
//             >
//               Quest for Excellence
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* ============================================================
//           BOTTOM SYSTEM STATUS
//       ============================================================ */}

//       <div
//         className="
//         absolute
//         bottom-7
//         left-0
//         right-0
//         text-center
//       "
//       >
//         <p
//           className="
//           font-mono
//           text-[7px]
//           uppercase
//           tracking-[0.3em]
//           text-slate-800
//         "
//         >
//           {phase < 6
//             ? "Constructing identity..."
//             : phase < 8
//               ? "Identity verified"
//               : "Welcome"}
//         </p>
//       </div>

//       {/* ============================================================
//           FINAL LIGHT FLASH
//       ============================================================ */}

//       <div
//         className={`
//           pointer-events-none
//           absolute inset-0
//           bg-white
//           transition-opacity
//           duration-300
//           ${phase === 6 ? "opacity-[0.025]" : "opacity-0"}
//         `}
//       />
//     </div>
//   );
// }

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// export default function WelcomeScreen() {
//   const navigate = useNavigate();

//   const [phase, setPhase] = useState(0);

//   /*
//   ================================================================
//   CINEMATIC TIMELINE
//   ================================================================

//   0.0s   Darkness
//   0.7s   System wakes
//   1.2s   Coordinate grid
//   1.8s   Gold diamond begins
//   3.2s   Outer shield constructed
//   4.5s   Book drawn
//   5.6s   Flame constructed
//   6.5s   Logo locks into place
//   7.4s   2025 appears
//   8.2s   SABAWOON appears
//   9.0s   EDUCATIONAL ACADEMY
//   9.8s   QUEST FOR EXCELLENCE
//   10.8s  Creator credit
//   12.0s  Final cinematic hold
//   13.5s  Dashboard
//   ================================================================
//   */

//   useEffect(() => {
//     const timers = [
//       setTimeout(() => setPhase(1), 700),
//       setTimeout(() => setPhase(2), 1200),
//       setTimeout(() => setPhase(3), 1800),
//       setTimeout(() => setPhase(4), 3200),
//       setTimeout(() => setPhase(5), 4500),
//       setTimeout(() => setPhase(6), 5600),
//       setTimeout(() => setPhase(7), 6500),
//       setTimeout(() => setPhase(8), 7400),
//       setTimeout(() => setPhase(9), 8200),
//       setTimeout(() => setPhase(10), 9000),
//       setTimeout(() => setPhase(11), 9800),
//       setTimeout(() => setPhase(12), 10800),

//       setTimeout(() => {
//         navigate("/app", { replace: true });
//       }, 13500),
//     ];

//     return () => timers.forEach(clearTimeout);
//   }, [navigate]);

//   const showGrid = phase >= 1;
//   const showDiamond = phase >= 3;
//   const showShield = phase >= 4;
//   const showBook = phase >= 5;
//   const showFlame = phase >= 6;
//   const complete = phase >= 7;

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#020304] text-white">
//       {/* ============================================================
//           BACKGROUND
//       ============================================================ */}

//       <div className="pointer-events-none absolute inset-0">
//         {/* Deep gold atmosphere */}

//         <div
//           className={`
//             absolute left-1/2 top-1/2
//             h-[650px] w-[650px]
//             -translate-x-1/2 -translate-y-1/2
//             rounded-full
//             bg-[#f2bd19]/[0.045]
//             blur-[150px]
//             transition-all
//             duration-[3000ms]
//             ${complete ? "scale-110 opacity-100" : "scale-50 opacity-0"}
//           `}
//         />

//         {/* Small blue technical atmosphere */}

//         <div
//           className={`
//             absolute left-[20%] top-[25%]
//             h-[350px] w-[350px]
//             rounded-full
//             bg-blue-500/[0.025]
//             blur-[130px]
//             transition-opacity
//             duration-[2500ms]
//             ${showGrid ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Grid */}

//         <div
//           className={`
//             absolute inset-0
//             transition-opacity
//             duration-[1800ms]
//             ${showGrid ? "opacity-100" : "opacity-0"}
//           `}
//           style={{
//             backgroundImage: `
//               linear-gradient(
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               ),
//               linear-gradient(
//                 90deg,
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               )
//             `,
//             backgroundSize: "48px 48px",
//           }}
//         />

//         {/* Vignette */}

//         <div
//           className="
//             absolute inset-0
//             bg-[radial-gradient(
//               ellipse_at_center,
//               transparent 25%,
//               rgba(0,0,0,0.82) 100%
//             )]
//           "
//         />
//       </div>

//       {/* ============================================================
//           TOP HUD
//       ============================================================ */}

//       <div
//         className={`
//           absolute left-6 right-6 top-6
//           flex items-center justify-between
//           transition-opacity duration-1000
//           ${showGrid ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <div className="flex items-center gap-2">
//           <span
//             className="
//               h-1.5 w-1.5
//               rounded-full
//               bg-[#f2bd19]
//               shadow-[0_0_14px_rgba(242,189,25,0.9)]
//               animate-pulse
//             "
//           />

//           <span
//             className="
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.35em]
//               text-slate-700
//             "
//           >
//             SABAWOON // IDENTITY CONSTRUCTION
//           </span>
//         </div>

//         <span
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.35em]
//             text-slate-800
//           "
//         >
//           VECTOR SYSTEM ONLINE
//         </span>
//       </div>

//       {/* ============================================================
//           MAIN
//       ============================================================ */}

//       <div className="relative z-10 flex min-h-screen items-center justify-center">
//         <div className="w-full max-w-[650px] px-5 text-center">
//           {/* ========================================================
//               SCANNING LABEL
//           ======================================================== */}

//           <div
//             className={`
//               mb-5
//               flex items-center justify-center gap-3
//               transition-all duration-700
//               ${
//                 showGrid
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span
//               className="
//                 h-px w-12
//                 bg-gradient-to-r
//                 from-transparent
//                 to-[#f2bd19]/30
//               "
//             />

//             <span
//               className="
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.4em]
//                 text-slate-700
//               "
//             >
//               Constructing Identity
//             </span>

//             <span
//               className="
//                 h-px w-12
//                 bg-gradient-to-l
//                 from-transparent
//                 to-[#f2bd19]/30
//               "
//             />
//           </div>

//           {/* ========================================================
//               LOGO CANVAS
//           ======================================================== */}

//           <div
//             className={`
//               relative mx-auto
//               w-[285px]
//               sm:w-[330px]
//               transition-transform
//               duration-[1800ms]
//               ${complete ? "scale-100" : "scale-[0.96]"}
//             `}
//           >
//             {/* Atmospheric glow */}

//             <div
//               className={`
//                 absolute
//                 left-1/2 top-1/2
//                 h-[360px] w-[360px]
//                 -translate-x-1/2
//                 -translate-y-1/2
//                 rounded-full
//                 bg-[#f2bd19]/[0.04]
//                 blur-[90px]
//                 transition-opacity
//                 duration-[1800ms]
//                 ${complete ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <svg
//               viewBox="0 0 500 570"
//               className="relative w-full overflow-visible"
//             >
//               <defs>
//                 {/* ==================================================
//                     LASER GLOW
//                 ================================================== */}

//                 <filter id="laser">
//                   <feGaussianBlur stdDeviation="3" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>

//                 <filter id="strongLaser">
//                   <feGaussianBlur stdDeviation="7" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>

//                 {/* Gold gradient */}

//                 <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
//                   <stop offset="0%" stopColor="#fff1a8" />

//                   <stop offset="30%" stopColor="#f2bd19" />

//                   <stop offset="65%" stopColor="#d79b00" />

//                   <stop offset="100%" stopColor="#fff0a0" />
//                 </linearGradient>

//                 {/* Black logo fill */}

//                 <linearGradient
//                   id="blackMetal"
//                   x1="0%"
//                   y1="0%"
//                   x2="100%"
//                   y2="100%"
//                 >
//                   <stop offset="0%" stopColor="#101215" />

//                   <stop offset="50%" stopColor="#030405" />

//                   <stop offset="100%" stopColor="#15171a" />
//                 </linearGradient>
//               </defs>

//               {/* ======================================================
//                   CONSTRUCTION CROSSHAIR
//               ====================================================== */}

//               <g
//                 opacity={phase >= 2 && phase < 8 ? 0.45 : 0}
//                 className="transition-opacity duration-700"
//               >
//                 <circle
//                   cx="250"
//                   cy="245"
//                   r="205"
//                   fill="none"
//                   stroke="#60a5fa"
//                   strokeWidth="1"
//                   strokeDasharray="3 12"
//                 />

//                 <circle
//                   cx="250"
//                   cy="245"
//                   r="185"
//                   fill="none"
//                   stroke="#60a5fa"
//                   strokeWidth="1"
//                   strokeDasharray="1 18"
//                 />

//                 <line
//                   x1="35"
//                   y1="245"
//                   x2="465"
//                   y2="245"
//                   stroke="#60a5fa"
//                   strokeWidth="1"
//                   strokeOpacity="0.2"
//                 />

//                 <line
//                   x1="250"
//                   y1="25"
//                   x2="250"
//                   y2="465"
//                   stroke="#60a5fa"
//                   strokeWidth="1"
//                   strokeOpacity="0.2"
//                 />
//               </g>

//               {/* ======================================================
//                   GOLD DIAMOND / STAR
//                   This is the first recognizable element.
//               ====================================================== */}

//               <g
//                 filter="url(#strongLaser)"
//                 className={`
//                   transition-all
//                   duration-[1600ms]
//                   ${showDiamond ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Main diamond */}

//                 <path
//                   d="
//                     M250 25
//                     L438 245
//                     L250 465
//                     L62 245
//                     Z
//                   "
//                   fill="none"
//                   stroke="url(#gold)"
//                   strokeWidth="5"
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   pathLength="1000"
//                   strokeDasharray="1000"
//                   strokeDashoffset={showDiamond ? 0 : 1000}
//                   className="
//                     transition-all
//                     duration-[1500ms]
//                     ease-out
//                   "
//                 />

//                 {/* Inner diamond */}

//                 <path
//                   d="
//                     M250 55
//                     L408 245
//                     L250 435
//                     L92 245
//                     Z
//                   "
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="1.5"
//                   strokeOpacity="0.7"
//                   pathLength="1000"
//                   strokeDasharray="1000"
//                   strokeDashoffset={showDiamond ? 0 : 1000}
//                   className="
//                     transition-all
//                     duration-[1800ms]
//                     ease-out
//                   "
//                 />
//               </g>

//               {/* ======================================================
//                   BLACK SHIELD / FRAME
//               ====================================================== */}

//               <g
//                 className={`
//                   transition-opacity
//                   duration-[1000ms]
//                   ${showShield ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Black shield fill */}

//                 <path
//                   d="
//                     M250 78
//                     L365 125
//                     L365 275
//                     C365 350 320 405 250 445
//                     C180 405 135 350 135 275
//                     L135 125
//                     Z
//                   "
//                   fill="url(#blackMetal)"
//                   stroke="url(#gold)"
//                   strokeWidth="5"
//                   strokeLinejoin="round"
//                   filter="url(#laser)"
//                 />

//                 {/* Inner black frame */}

//                 <path
//                   d="
//                     M250 98
//                     L343 137
//                     L343 270
//                     C343 332 306 378 250 415
//                     C194 378 157 332 157 270
//                     L157 137
//                     Z
//                   "
//                   fill="#030405"
//                   stroke="#f2bd19"
//                   strokeWidth="1.5"
//                   strokeOpacity="0.8"
//                 />
//               </g>

//               {/* ======================================================
//                   BOOK
//                   ====================================================== */}

//               <g
//                 className={`
//                   transition-all
//                   duration-[1300ms]
//                   ${
//                     showBook
//                       ? "translate-y-0 opacity-100"
//                       : "translate-y-4 opacity-0"
//                   }
//                 `}
//                 fill="none"
//                 stroke="#ffffff"
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 filter="url(#laser)"
//               >
//                 {/* Left page */}

//                 <path
//                   d="
//                     M250 310
//                     C218 285 180 275 165 282
//                     L165 365
//                     C190 358 220 368 250 390
//                   "
//                   strokeWidth="5"
//                 />

//                 {/* Right page */}

//                 <path
//                   d="
//                     M250 310
//                     C282 285 320 275 335 282
//                     L335 365
//                     C310 358 280 368 250 390
//                   "
//                   strokeWidth="5"
//                 />

//                 {/* Page details */}

//                 <path
//                   d="
//                     M250 330
//                     C220 308 192 305 175 310
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.75"
//                 />

//                 <path
//                   d="
//                     M250 330
//                     C280 308 308 305 325 310
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.75"
//                 />

//                 <path
//                   d="
//                     M250 350
//                     C220 332 192 330 175 337
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.65"
//                 />

//                 <path
//                   d="
//                     M250 350
//                     C280 332 308 330 325 337
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.65"
//                 />

//                 {/* Center spine */}

//                 <path
//                   d="
//                     M250 298
//                     L250 395
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="5"
//                 />

//                 {/* Bottom book contour */}

//                 <path
//                   d="
//                     M165 365
//                     C195 360 220 372 250 395
//                     C280 372 305 360 335 365
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="3"
//                 />
//               </g>

//               {/* ======================================================
//                   CENTRAL FLAME
//               ====================================================== */}

//               <g
//                 filter="url(#strongLaser)"
//                 className={`
//                   transition-all
//                   duration-[1200ms]
//                   ${showFlame ? "scale-100 opacity-100" : "scale-75 opacity-0"}
//                 `}
//                 style={{
//                   transformOrigin: "250px 185px",
//                 }}
//               >
//                 {/* Flame outer */}

//                 <path
//                   d="
//                     M250 112
//                     C228 142 232 166 250 184
//                     C268 166 272 142 250 112
//                     Z
//                   "
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="5"
//                   strokeLinejoin="round"
//                 />

//                 {/* Flame center */}

//                 <path
//                   d="
//                     M250 132
//                     C241 148 244 160 250 169
//                     C256 160 259 148 250 132
//                     Z
//                   "
//                   fill="#f2bd19"
//                   stroke="#fff0a0"
//                   strokeWidth="1.5"
//                 />

//                 {/* Stem */}

//                 <path
//                   d="
//                     M250 181
//                     L250 298
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="7"
//                   strokeLinecap="round"
//                 />
//               </g>

//               {/* ======================================================
//                   LASER SCAN
//               ====================================================== */}

//               <line
//                 x1="55"
//                 x2="445"
//                 y1={phase < 3 ? 55 : phase < 4 ? 240 : phase < 5 ? 440 : 510}
//                 y2={phase < 3 ? 55 : phase < 4 ? 240 : phase < 5 ? 440 : 510}
//                 stroke="#ffffff"
//                 strokeWidth="1.5"
//                 strokeOpacity={phase >= 2 && phase < 7 ? 0.9 : 0}
//                 filter="url(#laser)"
//                 className="
//                   transition-all
//                   duration-[1600ms]
//                   ease-in-out
//                 "
//               />

//               {/* ======================================================
//                   CORNER POINTS
//               ====================================================== */}

//               <g
//                 fill="#f2bd19"
//                 filter="url(#laser)"
//                 opacity={complete ? 1 : 0}
//                 className="transition-opacity duration-1000"
//               >
//                 <circle cx="250" cy="25" r="4" />
//                 <circle cx="438" cy="245" r="4" />
//                 <circle cx="250" cy="465" r="4" />
//                 <circle cx="62" cy="245" r="4" />
//               </g>

//               {/* ======================================================
//                   FINAL LIGHT
//               ====================================================== */}

//               <circle
//                 cx="250"
//                 cy="245"
//                 r="125"
//                 fill="none"
//                 stroke="#f2bd19"
//                 strokeWidth="1"
//                 strokeOpacity={complete ? 0.25 : 0}
//                 filter="url(#strongLaser)"
//                 className="
//                   transition-opacity
//                   duration-[1500ms]
//                 "
//               />
//             </svg>
//           </div>

//           {/* ========================================================
//               YEAR
//           ======================================================== */}

//           <div
//             className={`
//               mt-[-3px]
//               transition-all
//               duration-[1000ms]
//               ${
//                 phase >= 7
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span
//               className="
//                 font-serif
//                 text-[14px]
//                 font-semibold
//                 tracking-[0.35em]
//                 text-[#f2bd19]
//               "
//             >
//               2025
//             </span>
//           </div>

//           {/* ========================================================
//               SABAWOON
//           ======================================================== */}

//           <div
//             className={`
//               mt-2
//               transition-all
//               duration-[1300ms]
//               ${
//                 phase >= 8
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-4 opacity-0"
//               }
//             `}
//           >
//             <h1
//               className="
//                 font-serif
//                 text-[34px]
//                 font-semibold
//                 tracking-[0.2em]
//                 text-[#f2bd19]
//                 drop-shadow-[0_0_18px_rgba(242,189,25,0.18)]
//                 sm:text-[44px]
//               "
//             >
//               SABAWOON
//             </h1>
//           </div>

//           {/* ========================================================
//               EDUCATIONAL ACADEMY
//           ======================================================== */}

//           <div
//             className={`
//               mt-1
//               transition-all
//               duration-[1100ms]
//               ${
//                 phase >= 9
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <div className="flex items-center justify-center gap-3">
//               <span
//                 className="
//                   h-px w-7
//                   bg-[#f2bd19]/35
//                 "
//               />

//               <span
//                 className="
//                   text-[8px]
//                   font-medium
//                   uppercase
//                   tracking-[0.45em]
//                   text-slate-500
//                 "
//               >
//                 Educational Academy
//               </span>

//               <span
//                 className="
//                   h-px w-7
//                   bg-[#f2bd19]/35
//                 "
//               />
//             </div>
//           </div>

//           {/* ========================================================
//               QUEST FOR EXCELLENCE
//           ======================================================== */}

//           <div
//             className={`
//               mt-5
//               transition-all
//               duration-[1200ms]
//               ${
//                 phase >= 10
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <p
//               className="
//                 text-[8px]
//                 font-semibold
//                 uppercase
//                 tracking-[0.48em]
//                 text-[#f2bd19]/75
//               "
//             >
//               Quest for Excellence
//             </p>
//           </div>

//           {/* ========================================================
//               CREATOR CREDIT
//           ======================================================== */}

//           <div
//             className={`
//               mt-6
//               transition-all
//               duration-[1300ms]
//               ${
//                 phase >= 11
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <div
//               className="
//                 mx-auto
//                 h-px
//                 w-16
//                 bg-[#f2bd19]/20
//                 mb-4
//               "
//             />

//             <p
//               className="
//                 text-[7px]
//                 uppercase
//                 tracking-[0.32em]
//                 text-slate-700
//               "
//             >
//               Created by
//             </p>

//             <p
//               className="
//                 mt-1
//                 text-[10px]
//                 font-semibold
//                 uppercase
//                 tracking-[0.25em]
//                 text-slate-500
//               "
//             >
//               Teacher Ayman Najman
//             </p>

//             <p
//               className="
//                 mt-1
//                 text-[8px]
//                 font-medium
//                 tracking-[0.28em]
//                 text-[#f2bd19]/50
//               "
//             >
//               "TRUE BATMAN" 🦇
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* ============================================================
//           BOTTOM STATUS
//       ============================================================ */}

//       <div
//         className="
//           absolute
//           bottom-5
//           left-0
//           right-0
//           text-center
//         "
//       >
//         <p
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.3em]
//             text-slate-800
//           "
//         >
//           {phase < 3
//             ? "Initializing vector engine..."
//             : phase < 7
//               ? "Constructing academy identity..."
//               : phase < 11
//                 ? "Identity verified"
//                 : "Welcome"}
//         </p>
//       </div>

//       {/* ============================================================
//           FINAL CINEMATIC PULSE
//       ============================================================ */}

//       <div
//         className={`
//           pointer-events-none
//           absolute inset-0
//           transition-opacity
//           duration-[1800ms]
//           ${phase >= 12 ? "opacity-[0.025]" : "opacity-0"}
//         `}
//         style={{
//           background:
//             "radial-gradient(circle at center, rgba(242,189,25,0.5), transparent 40%)",
//         }}
//       />
//     </div>
//   );
// }

//

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// export default function WelcomeScreen() {
//   const navigate = useNavigate();
//   const [phase, setPhase] = useState(0);

//   /*
//    * ================================================================
//    * CINEMATIC TIMELINE
//    * ================================================================
//    *
//    *  0.0   BLACK
//    *  0.8   Creator card appears
//    *  1.8   Creator name
//    *  2.7   "TRUE BATMAN"
//    *  4.2   Creator card fades
//    *
//    *  4.8   Logo construction begins
//    *  5.5   Technical grid
//    *  6.2   Outer diamond starts
//    *  7.8   Inner frame
//    *  9.0   Book
//    * 10.1   Flame
//    * 11.2   Gold detailing
//    * 12.2   2025
//    * 13.0   Final logo lock
//    * 14.2   Cinematic hold
//    * 15.5   Dashboard
//    *
//    * ================================================================
//    */

//   useEffect(() => {
//     const timers = [
//       // Creator
//       setTimeout(() => setPhase(1), 700),
//       setTimeout(() => setPhase(2), 1700),
//       setTimeout(() => setPhase(3), 2700),

//       // Transition
//       setTimeout(() => setPhase(4), 4100),

//       // Logo construction
//       setTimeout(() => setPhase(5), 4800),
//       setTimeout(() => setPhase(6), 5600),
//       setTimeout(() => setPhase(7), 7000),
//       setTimeout(() => setPhase(8), 8200),
//       setTimeout(() => setPhase(9), 9500),
//       setTimeout(() => setPhase(10), 10600),
//       setTimeout(() => setPhase(11), 11700),
//       setTimeout(() => setPhase(12), 12700),

//       // Final hold
//       setTimeout(() => setPhase(13), 13700),

//       // Dashboard
//       setTimeout(() => {
//         navigate("/app", { replace: true });
//       }, 15500),
//     ];

//     return () => timers.forEach(clearTimeout);
//   }, [navigate]);

//   const creatorVisible = phase >= 1 && phase < 4;
//   const logoStarted = phase >= 5;
//   const diamondVisible = phase >= 6;
//   const frameVisible = phase >= 7;
//   const bookVisible = phase >= 8;
//   const flameVisible = phase >= 9;
//   const detailsVisible = phase >= 10;
//   const yearVisible = phase >= 11;
//   const finalLogo = phase >= 12;

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#020304] text-white">
//       {/* ============================================================
//           BACKGROUND
//       ============================================================ */}

//       <div className="pointer-events-none absolute inset-0">
//         {/* Main gold atmospheric glow */}

//         <div
//           className={`
//             absolute left-1/2 top-1/2
//             h-[720px] w-[720px]
//             -translate-x-1/2 -translate-y-1/2
//             rounded-full
//             bg-[#f2bd19]/[0.035]
//             blur-[170px]
//             transition-all duration-[3000ms]
//             ${
//               finalLogo
//                 ? "scale-110 opacity-100"
//                 : logoStarted
//                   ? "scale-90 opacity-70"
//                   : "scale-50 opacity-0"
//             }
//           `}
//         />

//         {/* Secondary blue technical glow */}

//         <div
//           className={`
//             absolute left-[18%] top-[18%]
//             h-[400px] w-[400px]
//             rounded-full
//             bg-blue-500/[0.025]
//             blur-[150px]
//             transition-opacity duration-[2000ms]
//             ${logoStarted ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Technical grid */}

//         <div
//           className={`
//             absolute inset-0
//             transition-opacity duration-[1800ms]
//             ${logoStarted ? "opacity-100" : "opacity-0"}
//           `}
//           style={{
//             backgroundImage: `
//               linear-gradient(
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               ),
//               linear-gradient(
//                 90deg,
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               )
//             `,
//             backgroundSize: "48px 48px",
//           }}
//         />

//         {/* Fine center glow */}

//         <div
//           className={`
//             absolute inset-0
//             bg-[radial-gradient(
//               circle_at_center,
//               rgba(242,189,25,0.035),
//               transparent 35%
//             )]
//             transition-opacity duration-[2000ms]
//             ${logoStarted ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Cinematic vignette */}

//         <div
//           className="
//             absolute inset-0
//             bg-[radial-gradient(
//               ellipse_at_center,
//               transparent 20%,
//               rgba(0,0,0,0.88) 100%
//             )]
//           "
//         />
//       </div>

//       {/* ============================================================
//           CREATOR INTRO
//       ============================================================ */}

//       <div
//         className={`
//           absolute inset-0 z-30
//           flex items-center justify-center
//           transition-all duration-[1200ms] ease-in-out
//           ${
//             creatorVisible
//               ? "opacity-100 scale-100"
//               : phase >= 4
//                 ? "opacity-0 scale-[1.04]"
//                 : "opacity-0 scale-[0.96]"
//           }
//         `}
//       >
//         <div className="relative w-full max-w-[620px] px-6 text-center">
//           {/* Tiny top marker */}

//           <div
//             className={`
//               mb-9
//               flex items-center justify-center gap-3
//               transition-all duration-1000
//               ${
//                 phase >= 1
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#f2bd19]/30" />

//             <span
//               className="
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.45em]
//                 text-slate-700
//               "
//             >
//               SYSTEM CREATOR
//             </span>

//             <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#f2bd19]/30" />
//           </div>

//           {/* CREATED BY */}

//           <p
//             className={`
//               text-[8px]
//               font-semibold
//               uppercase
//               tracking-[0.55em]
//               text-[#f2bd19]/60
//               transition-all duration-[1000ms]
//               ${
//                 phase >= 1
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-5 opacity-0"
//               }
//             `}
//           >
//             Created by
//           </p>

//           {/* NAME */}

//           <h1
//             className={`
//               mt-4
//               text-[31px]
//               font-semibold
//               uppercase
//               tracking-[0.16em]
//               text-white
//               transition-all duration-[1200ms]
//               sm:text-[40px]
//               ${
//                 phase >= 2
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-5 opacity-0"
//               }
//             `}
//           >
//             Teacher Ayman Najman
//           </h1>

//           {/* Gold divider */}

//           <div
//             className={`
//               mx-auto mt-7
//               h-px
//               bg-[#f2bd19]
//               shadow-[0_0_18px_rgba(242,189,25,0.45)]
//               transition-all duration-[1200ms]
//               ${phase >= 2 ? "w-28 opacity-100" : "w-0 opacity-0"}
//             `}
//           />

//           {/* TRUE BATMAN */}

//           <div
//             className={`
//               mt-7
//               transition-all duration-[1300ms]
//               ${
//                 phase >= 3
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-4 opacity-0"
//               }
//             `}
//           >
//             <p
//               className="
//                 text-[13px]
//                 font-medium
//                 uppercase
//                 tracking-[0.5em]
//                 text-[#f2bd19]
//                 drop-shadow-[0_0_16px_rgba(242,189,25,0.25)]
//               "
//             >
//               "True Batman"
//             </p>

//             <div className="mt-3 text-[22px] opacity-80">🦇</div>
//           </div>

//           {/* Creator footer */}

//           <p
//             className={`
//               mt-10
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.32em]
//               text-slate-800
//               transition-opacity duration-1000
//               ${phase >= 3 ? "opacity-100" : "opacity-0"}
//             `}
//           >
//             The unnecessary complexity begins now.
//           </p>
//         </div>
//       </div>

//       {/* ============================================================
//           LOGO CONSTRUCTION
//       ============================================================ */}

//       <div
//         className={`
//           relative z-10
//           flex min-h-screen
//           items-center justify-center
//           transition-opacity
//           duration-[1000ms]
//           ${logoStarted ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <div className="w-full max-w-[560px] px-5 text-center">
//           {/* ========================================================
//               TECHNICAL HEADER
//           ======================================================== */}

//           <div
//             className={`
//               mb-5
//               flex items-center justify-center gap-3
//               transition-all duration-700
//               ${
//                 logoStarted
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span className="h-px w-12 bg-gradient-to-r from-transparent to-blue-400/30" />

//             <span
//               className="
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.4em]
//                 text-slate-700
//               "
//             >
//               {phase < 6
//                 ? "Scanning logo pattern..."
//                 : phase < 7
//                   ? "Constructing outer geometry..."
//                   : phase < 8
//                     ? "Rendering book structure..."
//                     : phase < 9
//                       ? "Forming central flame..."
//                       : phase < 10
//                         ? "Applying gold layer..."
//                         : phase < 11
//                           ? "Completing identity..."
//                           : "Identity locked"}
//             </span>

//             <span className="h-px w-12 bg-gradient-to-l from-transparent to-blue-400/30" />
//           </div>

//           {/* ========================================================
//               LOGO SVG
//           ======================================================== */}

//           <div className="relative mx-auto w-[330px] sm:w-[380px]">
//             {/* Massive ambient glow */}

//             <div
//               className={`
//                 absolute
//                 left-1/2 top-1/2
//                 h-[390px] w-[390px]
//                 -translate-x-1/2
//                 -translate-y-1/2
//                 rounded-full
//                 bg-[#f2bd19]/[0.035]
//                 blur-[90px]
//                 transition-opacity duration-[1800ms]
//                 ${finalLogo ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <svg
//               viewBox="0 0 500 600"
//               className="relative w-full overflow-visible"
//             >
//               <defs>
//                 {/* Gold */}

//                 <linearGradient
//                   id="goldLine"
//                   x1="0%"
//                   y1="0%"
//                   x2="100%"
//                   y2="100%"
//                 >
//                   <stop offset="0%" stopColor="#fff4b0" />

//                   <stop offset="25%" stopColor="#f2bd19" />

//                   <stop offset="55%" stopColor="#d99d08" />

//                   <stop offset="80%" stopColor="#f7cf4a" />

//                   <stop offset="100%" stopColor="#fff0a0" />
//                 </linearGradient>

//                 {/* White */}

//                 <linearGradient
//                   id="whiteLine"
//                   x1="0%"
//                   y1="0%"
//                   x2="100%"
//                   y2="100%"
//                 >
//                   <stop offset="0%" stopColor="#ffffff" />

//                   <stop offset="50%" stopColor="#dfe7ef" />

//                   <stop offset="100%" stopColor="#ffffff" />
//                 </linearGradient>

//                 {/* Laser glow */}

//                 <filter id="laserGlow">
//                   <feGaussianBlur stdDeviation="3" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>

//                 <filter id="heavyGlow">
//                   <feGaussianBlur stdDeviation="7" result="blur" />

//                   <feMerge>
//                     <feMergeNode in="blur" />
//                     <feMergeNode in="SourceGraphic" />
//                   </feMerge>
//                 </filter>
//               </defs>

//               {/* ====================================================
//                   BLUEPRINT GUIDES
//               ==================================================== */}

//               <g
//                 className={`
//                   transition-opacity duration-700
//                   ${logoStarted && !finalLogo ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Construction circle */}

//                 <circle
//                   cx="250"
//                   cy="235"
//                   r="210"
//                   fill="none"
//                   stroke="#4da3ff"
//                   strokeWidth="1"
//                   strokeDasharray="2 11"
//                   opacity="0.35"
//                 />

//                 <circle
//                   cx="250"
//                   cy="235"
//                   r="185"
//                   fill="none"
//                   stroke="#4da3ff"
//                   strokeWidth="1"
//                   strokeDasharray="1 17"
//                   opacity="0.2"
//                 />

//                 {/* Horizontal axis */}

//                 <line
//                   x1="25"
//                   y1="235"
//                   x2="475"
//                   y2="235"
//                   stroke="#4da3ff"
//                   strokeWidth="1"
//                   opacity="0.15"
//                 />

//                 {/* Vertical axis */}

//                 <line
//                   x1="250"
//                   y1="10"
//                   x2="250"
//                   y2="460"
//                   stroke="#4da3ff"
//                   strokeWidth="1"
//                   opacity="0.15"
//                 />
//               </g>

//               {/* ====================================================
//                   LASER PARTICLES
//               ==================================================== */}

//               <g
//                 fill="#4da3ff"
//                 className={`
//                   transition-opacity duration-700
//                   ${logoStarted && !finalLogo ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 <circle cx="88" cy="120" r="1.5" />
//                 <circle cx="110" cy="310" r="1" />
//                 <circle cx="145" cy="90" r="1.5" />
//                 <circle cx="390" cy="105" r="1.2" />
//                 <circle cx="415" cy="280" r="1.5" />
//                 <circle cx="375" cy="360" r="1" />
//                 <circle cx="95" cy="370" r="1.2" />
//                 <circle cx="430" cy="190" r="1" />
//               </g>

//               {/* ====================================================
//                   OUTER GOLD DIAMOND
//               ==================================================== */}

//               <g
//                 filter="url(#heavyGlow)"
//                 className={`
//                   transition-opacity duration-500
//                   ${diamondVisible ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Main four-point diamond */}

//                 <path
//                   d="
//                     M250 24
//                     L440 235
//                     L250 446
//                     L60 235
//                     Z
//                   "
//                   fill="none"
//                   stroke="url(#goldLine)"
//                   strokeWidth="6"
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   pathLength="1000"
//                   strokeDasharray="1000"
//                   strokeDashoffset={diamondVisible ? 0 : 1000}
//                   className="
//                     transition-all
//                     duration-[1700ms]
//                     ease-out
//                   "
//                 />

//                 {/* Secondary geometric line */}

//                 <path
//                   d="
//                     M250 48
//                     L418 235
//                     L250 422
//                     L82 235
//                     Z
//                   "
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="1.5"
//                   strokeOpacity="0.65"
//                   pathLength="1000"
//                   strokeDasharray="1000"
//                   strokeDashoffset={diamondVisible ? 0 : 1000}
//                   className="
//                     transition-all
//                     duration-[2100ms]
//                     ease-out
//                   "
//                 />
//               </g>

//               {/* ====================================================
//                   BLACK INNER FRAME
//               ==================================================== */}

//               <g
//                 className={`
//                   transition-all
//                   duration-[1100ms]
//                   ${
//                     frameVisible
//                       ? "opacity-100 scale-100"
//                       : "opacity-0 scale-[0.92]"
//                   }
//                 `}
//                 style={{
//                   transformOrigin: "250px 235px",
//                 }}
//               >
//                 {/* Outer black square / shield */}

//                 <path
//                   d="
//                     M160 105
//                     Q160 88 177 88
//                     L323 88
//                     Q340 88 340 105
//                     L340 275
//                     Q340 350 250 410
//                     Q160 350 160 275
//                     Z
//                   "
//                   fill="#030405"
//                   stroke="url(#goldLine)"
//                   strokeWidth="5"
//                   strokeLinejoin="round"
//                   filter="url(#laserGlow)"
//                 />

//                 {/* Inner black frame */}

//                 <path
//                   d="
//                     M177 116
//                     L323 116
//                     L323 270
//                     Q323 330 250 380
//                     Q177 330 177 270
//                     Z
//                   "
//                   fill="#050608"
//                   stroke="#f2bd19"
//                   strokeWidth="1.5"
//                   strokeOpacity="0.65"
//                 />

//                 {/* Top angular gold structure */}

//                 <path
//                   d="
//                     M177 116
//                     L250 76
//                     L323 116
//                   "
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="4"
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   filter="url(#laserGlow)"
//                 />
//               </g>

//               {/* ====================================================
//                   OPEN BOOK
//               ==================================================== */}

//               <g
//                 className={`
//                   transition-all
//                   duration-[1200ms]
//                   ${
//                     bookVisible
//                       ? "opacity-100 translate-y-0"
//                       : "opacity-0 translate-y-5"
//                   }
//                 `}
//                 fill="none"
//                 stroke="url(#whiteLine)"
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 filter="url(#laserGlow)"
//               >
//                 {/* Left page */}

//                 <path
//                   d="
//                     M250 292
//                     C222 272 191 266 177 274
//                     L177 350
//                     C201 344 226 352 250 374
//                   "
//                   strokeWidth="6"
//                 />

//                 {/* Right page */}

//                 <path
//                   d="
//                     M250 292
//                     C278 272 309 266 323 274
//                     L323 350
//                     C299 344 274 352 250 374
//                   "
//                   strokeWidth="6"
//                 />

//                 {/* Center spine */}

//                 <path
//                   d="
//                     M250 292
//                     L250 376
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="5"
//                 />

//                 {/* Left page detail */}

//                 <path
//                   d="
//                     M250 315
//                     C226 298 202 296 183 302
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.75"
//                 />

//                 <path
//                   d="
//                     M250 337
//                     C226 321 202 319 183 325
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.55"
//                 />

//                 {/* Right page detail */}

//                 <path
//                   d="
//                     M250 315
//                     C274 298 298 296 317 302
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.75"
//                 />

//                 <path
//                   d="
//                     M250 337
//                     C274 321 298 319 317 325
//                   "
//                   strokeWidth="2"
//                   strokeOpacity="0.55"
//                 />

//                 {/* Bottom page contour */}

//                 <path
//                   d="
//                     M177 350
//                     C203 344 226 356 250 378
//                     C274 356 297 344 323 350
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="3"
//                 />
//               </g>

//               {/* ====================================================
//                   CENTRAL FLAME
//               ==================================================== */}

//               <g
//                 className={`
//                   transition-all
//                   duration-[1000ms]
//                   ${
//                     flameVisible
//                       ? "opacity-100 scale-100"
//                       : "opacity-0 scale-50"
//                   }
//                 `}
//                 style={{
//                   transformOrigin: "250px 192px",
//                 }}
//                 filter="url(#heavyGlow)"
//               >
//                 {/* Candle / stem */}

//                 <path
//                   d="
//                     M250 183
//                     L250 292
//                   "
//                   stroke="#f2bd19"
//                   strokeWidth="7"
//                   strokeLinecap="round"
//                 />

//                 {/* Flame outer */}

//                 <path
//                   d="
//                     M250 112
//                     C230 140 232 163 250 183
//                     C268 163 270 140 250 112
//                     Z
//                   "
//                   fill="none"
//                   stroke="url(#goldLine)"
//                   strokeWidth="5"
//                   strokeLinejoin="round"
//                 />

//                 {/* Flame inner */}

//                 <path
//                   d="
//                     M250 130
//                     C242 146 244 158 250 168
//                     C256 158 258 146 250 130
//                     Z
//                   "
//                   fill="#f2bd19"
//                   stroke="#fff2a8"
//                   strokeWidth="1.5"
//                 />
//               </g>

//               {/* ====================================================
//                   GOLD BOOK ACCENT
//               ==================================================== */}

//               <path
//                 d="
//                   M250 375
//                   L250 397
//                 "
//                 stroke="#f2bd19"
//                 strokeWidth="4"
//                 strokeLinecap="round"
//                 opacity={detailsVisible ? 1 : 0}
//                 className="
//                   transition-opacity
//                   duration-[1000ms]
//                 "
//                 filter="url(#laserGlow)"
//               />

//               {/* ====================================================
//                   FOUR GOLD SIDE POINTS
//               ==================================================== */}

//               <g
//                 fill="#f2bd19"
//                 filter="url(#heavyGlow)"
//                 className={`
//                   transition-all
//                   duration-[1000ms]
//                   ${detailsVisible ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 <path d="M60 235 L115 208 L92 235 L115 262 Z" />
//                 <path d="M440 235 L385 208 L408 235 L385 262 Z" />
//                 <path d="M250 24 L223 78 L250 55 L277 78 Z" />
//                 <path d="M250 446 L223 392 L250 415 L277 392 Z" />
//               </g>

//               {/* ====================================================
//                   SCANNING LASER
//               ==================================================== */}

//               <line
//                 x1="48"
//                 x2="452"
//                 y1={phase < 6 ? 40 : phase < 7 ? 235 : phase < 8 ? 445 : 490}
//                 y2={phase < 6 ? 40 : phase < 7 ? 235 : phase < 8 ? 445 : 490}
//                 stroke="#ffffff"
//                 strokeWidth="1.5"
//                 strokeOpacity={logoStarted && !finalLogo ? 0.8 : 0}
//                 filter="url(#laserGlow)"
//                 className="
//                   transition-all
//                   duration-[1500ms]
//                   ease-in-out
//                 "
//               />

//               {/* ====================================================
//                   CONSTRUCTION POINTS
//               ==================================================== */}

//               <g
//                 fill="#ffffff"
//                 filter="url(#laserGlow)"
//                 className={`
//                   transition-opacity duration-700
//                   ${finalLogo ? "opacity-0" : "opacity-100"}
//                 `}
//               >
//                 <circle cx="250" cy="24" r="2.5" />
//                 <circle cx="440" cy="235" r="2.5" />
//                 <circle cx="250" cy="446" r="2.5" />
//                 <circle cx="60" cy="235" r="2.5" />
//               </g>

//               {/* ====================================================
//                   FINAL LOGO GOLD LOCK
//               ==================================================== */}

//               <g
//                 className={`
//                   transition-all
//                   duration-[1500ms]
//                   ${
//                     finalLogo
//                       ? "opacity-100 scale-100"
//                       : "opacity-0 scale-[0.97]"
//                   }
//                 `}
//                 style={{
//                   transformOrigin: "250px 235px",
//                 }}
//               >
//                 <circle
//                   cx="250"
//                   cy="235"
//                   r="185"
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="1"
//                   strokeOpacity="0.12"
//                 />

//                 <circle
//                   cx="250"
//                   cy="235"
//                   r="200"
//                   fill="none"
//                   stroke="#f2bd19"
//                   strokeWidth="1"
//                   strokeOpacity="0.08"
//                 />
//               </g>
//             </svg>
//           </div>

//           {/* ========================================================
//               2025
//           ======================================================== */}

//           <div
//             className={`
//               mt-[-8px]
//               transition-all
//               duration-[1100ms]
//               ${
//                 yearVisible
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-4 opacity-0"
//               }
//             `}
//           >
//             <div
//               className="
//                 text-[15px]
//                 font-semibold
//                 tracking-[0.35em]
//                 text-[#f2bd19]
//                 drop-shadow-[0_0_12px_rgba(242,189,25,0.35)]
//               "
//             >
//               2025
//             </div>
//           </div>

//           {/* ========================================================
//               FINAL MICRO STATUS
//           ======================================================== */}

//           <div
//             className={`
//               mt-4
//               transition-all
//               duration-[1000ms]
//               ${
//                 finalLogo
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <div className="mx-auto h-px w-20 bg-[#f2bd19]/25" />

//             <p
//               className="
//                 mt-3
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.4em]
//                 text-slate-700
//               "
//             >
//               Identity successfully constructed
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* ============================================================
//           TOP HUD
//       ============================================================ */}

//       <div
//         className={`
//           absolute left-6 right-6 top-6 z-40
//           flex items-center justify-between
//           transition-opacity duration-1000
//           ${logoStarted ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <span
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.3em]
//             text-slate-800
//           "
//         >
//           2025 // VECTOR-01
//         </span>

//         <div className="flex items-center gap-2">
//           <span
//             className="
//               h-1.5 w-1.5
//               rounded-full
//               bg-[#f2bd19]
//               shadow-[0_0_12px_rgba(242,189,25,0.8)]
//               animate-pulse
//             "
//           />

//           <span
//             className="
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.3em]
//               text-slate-800
//             "
//           >
//             BUILDING
//           </span>
//         </div>
//       </div>

//       {/* ============================================================
//           BOTTOM CREDIT
//       ============================================================ */}

//       <div
//         className={`
//           absolute bottom-5 left-0 right-0 z-40
//           text-center
//           transition-opacity duration-1000
//           ${logoStarted ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <p
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.32em]
//             text-slate-800
//           "
//         >
//           Made with unnecessary precision
//         </p>
//       </div>

//       {/* ============================================================
//           FINAL GOLD FLASH
//       ============================================================ */}

//       <div
//         className={`
//           pointer-events-none
//           absolute inset-0 z-50
//           bg-[radial-gradient(
//             circle_at_center,
//             rgba(242,189,25,0.22),
//             transparent 32%
//           )]
//           transition-opacity
//           duration-[1400ms]
//           ${phase === 12 ? "opacity-100" : "opacity-0"}
//         `}
//       />
//     </div>
//   );
// }

//

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import logo from "../assets/sabawoon-logo.png";

// export default function WelcomeScreen() {
//   const navigate = useNavigate();
//   const [phase, setPhase] = useState(0);

//   /*
//    * ================================================================
//    * CINEMATIC TIMELINE
//    * ================================================================
//    *
//    * 0.0   Black screen
//    * 0.7   Created by
//    * 1.6   Teacher Ayman Najman
//    * 2.6   "True Batman"
//    * 4.2   Creator disappears
//    *
//    * 4.8   Logo scan begins
//    * 5.8   Laser construction
//    * 7.2   Exact logo starts appearing
//    * 8.8   Logo fully revealed
//    * 9.8   2025
//    * 10.8  Final cinematic hold
//    * 13.0  Dashboard
//    *
//    * ================================================================
//    */

//   useEffect(() => {
//     const timers = [
//       setTimeout(() => setPhase(1), 700),
//       setTimeout(() => setPhase(2), 1600),
//       setTimeout(() => setPhase(3), 2600),

//       // Creator disappears
//       setTimeout(() => setPhase(4), 4200),

//       // Logo sequence
//       setTimeout(() => setPhase(5), 4800),
//       setTimeout(() => setPhase(6), 5800),
//       setTimeout(() => setPhase(7), 6900),
//       setTimeout(() => setPhase(8), 8100),
//       setTimeout(() => setPhase(9), 9000),
//       setTimeout(() => setPhase(10), 10200),

//       // Dashboard
//       setTimeout(() => {
//         navigate("/app", { replace: true });
//       }, 13000),
//     ];

//     return () => timers.forEach(clearTimeout);
//   }, [navigate]);

//   const creatorVisible = phase >= 1 && phase < 4;
//   const logoSequence = phase >= 5;
//   const scanActive = phase >= 5 && phase < 8;
//   const logoRevealing = phase >= 6;
//   const logoComplete = phase >= 8;
//   const yearVisible = phase >= 9;
//   const finalState = phase >= 10;

//   return (
//     <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#020304] text-white">
//       {/* ============================================================
//           BACKGROUND
//       ============================================================ */}

//       <div className="pointer-events-none absolute inset-0">
//         {/* Main cinematic gold glow */}

//         <div
//           className={`
//             absolute left-1/2 top-1/2
//             h-[650px] w-[650px]
//             -translate-x-1/2 -translate-y-1/2
//             rounded-full
//             bg-[#f2bd19]/[0.035]
//             blur-[150px]
//             transition-all
//             duration-[2500ms]
//             ${
//               finalState
//                 ? "scale-110 opacity-100"
//                 : logoSequence
//                   ? "scale-90 opacity-80"
//                   : "scale-50 opacity-0"
//             }
//           `}
//         />

//         {/* Cold technical glow */}

//         <div
//           className={`
//             absolute left-[15%] top-[15%]
//             h-[420px] w-[420px]
//             rounded-full
//             bg-blue-500/[0.018]
//             blur-[150px]
//             transition-opacity
//             duration-[2000ms]
//             ${logoSequence ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Technical grid */}

//         <div
//           className={`
//             absolute inset-0
//             transition-opacity
//             duration-[1500ms]
//             ${logoSequence ? "opacity-100" : "opacity-0"}
//           `}
//           style={{
//             backgroundImage: `
//               linear-gradient(
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               ),
//               linear-gradient(
//                 90deg,
//                 rgba(255,255,255,0.035) 1px,
//                 transparent 1px
//               )
//             `,
//             backgroundSize: "48px 48px",
//           }}
//         />

//         {/* Fine central light */}

//         <div
//           className={`
//             absolute inset-0
//             bg-[radial-gradient(
//               circle_at_center,
//               rgba(242,189,25,0.045),
//               transparent 34%
//             )]
//             transition-opacity
//             duration-[1800ms]
//             ${logoSequence ? "opacity-100" : "opacity-0"}
//           `}
//         />

//         {/* Vignette */}

//         <div
//           className="
//             absolute inset-0
//             bg-[radial-gradient(
//               ellipse_at_center,
//               transparent 15%,
//               rgba(0,0,0,0.9) 100%
//             )]
//           "
//         />
//       </div>

//       {/* ============================================================
//           CREATOR INTRO
//       ============================================================ */}

//       <div
//         className={`
//           absolute inset-0 z-30
//           flex items-center justify-center
//           px-6
//           transition-all
//           duration-[1200ms]
//           ease-in-out
//           ${
//             creatorVisible
//               ? "scale-100 opacity-100"
//               : phase >= 4
//                 ? "scale-[1.04] opacity-0"
//                 : "scale-[0.96] opacity-0"
//           }
//         `}
//       >
//         <div className="w-full max-w-[700px] text-center">
//           {/* Top line */}

//           <div
//             className={`
//               mb-10
//               flex items-center justify-center gap-4
//               transition-all
//               duration-[1000ms]
//               ${
//                 phase >= 1
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-4 opacity-0"
//               }
//             `}
//           >
//             <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#f2bd19]/40" />

//             <span
//               className="
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.5em]
//                 text-slate-700
//               "
//             >
//               System Architect
//             </span>

//             <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#f2bd19]/40" />
//           </div>

//           {/* Created by */}

//           <p
//             className={`
//               text-[9px]
//               font-semibold
//               uppercase
//               tracking-[0.55em]
//               text-[#f2bd19]/65
//               transition-all
//               duration-[1000ms]
//               ${
//                 phase >= 1
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-5 opacity-0"
//               }
//             `}
//           >
//             Created by
//           </p>

//           {/* Ayman */}

//           <h1
//             className={`
//               mt-4
//               text-[30px]
//               font-semibold
//               uppercase
//               tracking-[0.15em]
//               text-white
//               sm:text-[42px]
//               transition-all
//               duration-[1200ms]
//               ${
//                 phase >= 2
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-6 opacity-0"
//               }
//             `}
//           >
//             Teacher Ayman Najman
//           </h1>

//           {/* Gold laser */}

//           <div
//             className={`
//               mx-auto mt-7
//               h-px
//               bg-[#f2bd19]
//               shadow-[0_0_20px_rgba(242,189,25,0.6)]
//               transition-all
//               duration-[1100ms]
//               ${phase >= 2 ? "w-32 opacity-100" : "w-0 opacity-0"}
//             `}
//           />

//           {/* Batman */}

//           <div
//             className={`
//               mt-7
//               transition-all
//               duration-[1200ms]
//               ${
//                 phase >= 3
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-5 opacity-0"
//               }
//             `}
//           >
//             <p
//               className="
//                 text-[13px]
//                 uppercase
//                 tracking-[0.55em]
//                 text-[#f2bd19]
//                 drop-shadow-[0_0_15px_rgba(242,189,25,0.3)]
//               "
//             >
//               "True Batman"
//             </p>

//             <div className="mt-3 text-[23px]">🦇</div>
//           </div>

//           {/* Tiny footer */}

//           <p
//             className={`
//               mt-10
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.35em]
//               text-slate-800
//               transition-opacity
//               duration-1000
//               ${phase >= 3 ? "opacity-100" : "opacity-0"}
//             `}
//           >
//             Preparing unnecessary levels of engineering...
//           </p>
//         </div>
//       </div>

//       {/* ============================================================
//           LOGO CONSTRUCTION
//       ============================================================ */}

//       <div
//         className={`
//           relative z-10
//           flex min-h-screen
//           items-center justify-center
//           px-5
//           transition-opacity
//           duration-[1000ms]
//           ${logoSequence ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <div className="w-full max-w-[500px] text-center">
//           {/* ========================================================
//               TECHNICAL STATUS
//           ======================================================== */}

//           <div
//             className={`
//               mb-6
//               flex items-center justify-center gap-3
//               transition-all
//               duration-700
//               ${
//                 logoSequence
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <span className="h-px w-12 bg-gradient-to-r from-transparent to-blue-400/30" />

//             <span
//               className="
//                 font-mono
//                 text-[7px]
//                 uppercase
//                 tracking-[0.4em]
//                 text-slate-700
//               "
//             >
//               {!logoComplete
//                 ? "Scanning original logo..."
//                 : "Logo identity locked"}
//             </span>

//             <span className="h-px w-12 bg-gradient-to-l from-transparent to-blue-400/30" />
//           </div>

//           {/* ========================================================
//               LOGO STAGE
//           ======================================================== */}

//           <div className="relative mx-auto w-[290px] sm:w-[340px]">
//             {/* ======================================================
//                 OUTER LASER SCAN RINGS
//             ====================================================== */}

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 left-1/2
//                 top-1/2
//                 h-[360px]
//                 w-[360px]
//                 -translate-x-1/2
//                 -translate-y-1/2
//                 rounded-full
//                 border
//                 border-blue-400/20
//                 transition-all
//                 duration-[1800ms]
//                 ${
//                   scanActive
//                     ? "scale-100 opacity-100"
//                     : "scale-[0.55] opacity-0"
//                 }
//               `}
//             />

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 left-1/2
//                 top-1/2
//                 h-[310px]
//                 w-[310px]
//                 -translate-x-1/2
//                 -translate-y-1/2
//                 rounded-full
//                 border
//                 border-[#f2bd19]/15
//                 transition-all
//                 duration-[2200ms]
//                 ${
//                   scanActive ? "scale-100 opacity-100" : "scale-[0.5] opacity-0"
//                 }
//               `}
//             />

//             {/* ======================================================
//                 FOUR LASER CORNERS
//             ====================================================== */}

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 -left-8
//                 -top-8
//                 h-16
//                 w-16
//                 border-l
//                 border-t
//                 border-blue-300/50
//                 transition-all
//                 duration-[900ms]
//                 ${scanActive ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 -right-8
//                 -top-8
//                 h-16
//                 w-16
//                 border-r
//                 border-t
//                 border-blue-300/50
//                 transition-all
//                 duration-[900ms]
//                 ${scanActive ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 -bottom-8
//                 -left-8
//                 h-16
//                 w-16
//                 border-b
//                 border-l
//                 border-blue-300/50
//                 transition-all
//                 duration-[900ms]
//                 ${scanActive ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             <div
//               className={`
//                 pointer-events-none
//                 absolute
//                 -bottom-8
//                 -right-8
//                 h-16
//                 w-16
//                 border-b
//                 border-r
//                 border-blue-300/50
//                 transition-all
//                 duration-[900ms]
//                 ${scanActive ? "opacity-100" : "opacity-0"}
//               `}
//             />

//             {/* ======================================================
//                 ACTUAL ORIGINAL LOGO
//                 ======================================================

//                 IMPORTANT:

//                 This is NOT a recreated SVG.

//                 This is the actual image asset:
//                     sabawoon-logo.png

//                 Therefore the final emblem is exactly the same
//                 artwork as the uploaded reference.
//             ====================================================== */}

//             <div className="relative mx-auto w-[230px] sm:w-[270px]">
//               {/* Gold atmospheric glow */}

//               <div
//                 className={`
//                   pointer-events-none
//                   absolute
//                   inset-[-40px]
//                   rounded-full
//                   bg-[#f2bd19]/[0.08]
//                   blur-[55px]
//                   transition-all
//                   duration-[1800ms]
//                   ${
//                     logoComplete
//                       ? "scale-100 opacity-100"
//                       : "scale-50 opacity-0"
//                   }
//                 `}
//               />

//               {/* ==================================================
//                   LASER DRAWING OVERLAY
//               ================================================== */}

//               <div
//                 className={`
//                   pointer-events-none
//                   absolute
//                   inset-[-15px]
//                   z-20
//                   transition-opacity
//                   duration-700
//                   ${scanActive ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 {/* Horizontal scanning laser */}

//                 <div
//                   className="
//                     absolute
//                     left-[-30px]
//                     right-[-30px]
//                     h-px
//                     bg-white
//                     shadow-[0_0_8px_#ffffff,0_0_22px_rgba(77,163,255,0.9)]
//                     animate-[scanDown_2.2s_linear_infinite]
//                   "
//                 />

//                 {/* Vertical scanning laser */}

//                 <div
//                   className="
//                     absolute
//                     bottom-[-30px]
//                     top-[-30px]
//                     w-px
//                     bg-[#f2bd19]
//                     shadow-[0_0_8px_#f2bd19,0_0_22px_rgba(242,189,25,0.8)]
//                     animate-[scanAcross_2.8s_linear_infinite]
//                   "
//                 />
//               </div>

//               {/* ==================================================
//                   PARTICLES
//               ================================================== */}

//               <div
//                 className={`
//                   pointer-events-none
//                   absolute
//                   inset-[-70px]
//                   z-10
//                   transition-opacity
//                   duration-700
//                   ${scanActive ? "opacity-100" : "opacity-0"}
//                 `}
//               >
//                 <span className="absolute left-[8%] top-[20%] h-1 w-1 rounded-full bg-blue-300 shadow-[0_0_10px_#4da3ff] animate-pulse" />

//                 <span className="absolute left-[20%] top-[75%] h-1 w-1 rounded-full bg-[#f2bd19] shadow-[0_0_10px_#f2bd19] animate-pulse" />

//                 <span className="absolute right-[10%] top-[25%] h-1 w-1 rounded-full bg-blue-300 shadow-[0_0_10px_#4da3ff] animate-pulse" />

//                 <span className="absolute right-[20%] bottom-[18%] h-1 w-1 rounded-full bg-[#f2bd19] shadow-[0_0_10px_#f2bd19] animate-pulse" />

//                 <span className="absolute left-[50%] top-[5%] h-1 w-1 rounded-full bg-white shadow-[0_0_10px_white] animate-pulse" />
//               </div>

//               {/* ==================================================
//                   LOGO REVEAL

//                   The image itself is revealed using a vertical
//                   clip-path so it feels like the laser is building
//                   the actual artwork.
//               ================================================== */}

//               <div
//                 className={`
//                   relative
//                   overflow-hidden
//                   transition-all
//                   duration-[2200ms]
//                   ease-out
//                   ${logoRevealing ? "clip-path-reveal" : "clip-path-hidden"}
//                 `}
//               >
//                 <img
//                   src={logo}
//                   alt="Sabawoon Educational Academy logo"
//                   draggable="false"
//                   className={`
//                     relative
//                     z-0
//                     block
//                     w-full
//                     select-none
//                     object-contain
//                     transition-all
//                     duration-[1800ms]
//                     ${
//                       logoComplete
//                         ? "scale-100 opacity-100"
//                         : "scale-[0.97] opacity-90"
//                     }
//                   `}
//                 />
//               </div>

//               {/* Final gold outline glow */}

//               <div
//                 className={`
//                   pointer-events-none
//                   absolute
//                   inset-[-10px]
//                   rounded-[40px]
//                   border
//                   border-[#f2bd19]/20
//                   shadow-[0_0_45px_rgba(242,189,25,0.12)]
//                   transition-all
//                   duration-[1600ms]
//                   ${
//                     finalState
//                       ? "scale-100 opacity-100"
//                       : "scale-[0.94] opacity-0"
//                   }
//                 `}
//               />
//             </div>
//           </div>

//           {/* ========================================================
//               YEAR
//           ======================================================== */}

//           <div
//             className={`
//               mt-3
//               transition-all
//               duration-[1200ms]
//               ${
//                 yearVisible
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-4 opacity-0"
//               }
//             `}
//           >
//             <span
//               className="
//                 text-[17px]
//                 font-semibold
//                 tracking-[0.42em]
//                 text-[#f2bd19]
//                 drop-shadow-[0_0_14px_rgba(242,189,25,0.4)]
//               "
//             >
//               2025
//             </span>
//           </div>

//           {/* ========================================================
//               QUEST FOR EXCELLENCE
//           ======================================================== */}

//           <div
//             className={`
//               transition-all
//               duration-[1100ms]
//               ${
//                 finalState
//                   ? "translate-y-0 opacity-100"
//                   : "translate-y-3 opacity-0"
//               }
//             `}
//           >
//             <div className="mx-auto mt-5 h-px w-24 bg-[#f2bd19]/35" />

//             <p
//               className="
//                 mt-4
//                 text-[8px]
//                 font-medium
//                 uppercase
//                 tracking-[0.5em]
//                 text-[#f2bd19]/70
//               "
//             >
//               Quest for Excellence
//             </p>
//           </div>

//           {/* ========================================================
//               FINAL STATUS
//           ======================================================== */}

//           <p
//             className={`
//               mt-6
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.35em]
//               text-slate-700
//               transition-all
//               duration-1000
//               ${finalState ? "opacity-100" : "opacity-0"}
//             `}
//           >
//             Identity successfully constructed
//           </p>
//         </div>
//       </div>

//       {/* ============================================================
//           HUD
//       ============================================================ */}

//       <div
//         className={`
//           absolute
//           left-6
//           right-6
//           top-6
//           z-40
//           flex
//           items-center
//           justify-between
//           transition-opacity
//           duration-1000
//           ${logoSequence ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <span
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.3em]
//             text-slate-800
//           "
//         >
//           VECTOR // 2025
//         </span>

//         <div className="flex items-center gap-2">
//           <span
//             className="
//               h-1.5
//               w-1.5
//               rounded-full
//               bg-[#f2bd19]
//               shadow-[0_0_12px_rgba(242,189,25,0.9)]
//               animate-pulse
//             "
//           />

//           <span
//             className="
//               font-mono
//               text-[7px]
//               uppercase
//               tracking-[0.3em]
//               text-slate-800
//             "
//           >
//             BUILDING
//           </span>
//         </div>
//       </div>

//       {/* ============================================================
//           CREDIT
//       ============================================================ */}

//       <div
//         className={`
//           absolute
//           bottom-6
//           left-0
//           right-0
//           z-40
//           text-center
//           transition-opacity
//           duration-1000
//           ${logoSequence ? "opacity-100" : "opacity-0"}
//         `}
//       >
//         <p
//           className="
//             font-mono
//             text-[7px]
//             uppercase
//             tracking-[0.32em]
//             text-slate-800
//           "
//         >
//           Created with unnecessary precision
//         </p>
//       </div>

//       {/* ============================================================
//           FINAL FLASH
//       ============================================================ */}

//       <div
//         className={`
//           pointer-events-none
//           absolute
//           inset-0
//           z-50
//           bg-[radial-gradient(
//             circle_at_center,
//             rgba(242,189,25,0.18),
//             transparent 30%
//           )]
//           transition-opacity
//           duration-[1200ms]
//           ${phase === 10 ? "opacity-100" : "opacity-0"}
//         `}
//       />

//       {/* ============================================================
//           ANIMATION KEYFRAMES
//       ============================================================ */}

//       <style>{`
//         @keyframes scanDown {
//           0% {
//             top: -5%;
//             opacity: 0;
//           }

//           10% {
//             opacity: 1;
//           }

//           90% {
//             opacity: 1;
//           }

//           100% {
//             top: 105%;
//             opacity: 0;
//           }
//         }

//         @keyframes scanAcross {
//           0% {
//             left: -5%;
//             opacity: 0;
//           }

//           10% {
//             opacity: 1;
//           }

//           90% {
//             opacity: 1;
//           }

//           100% {
//             left: 105%;
//             opacity: 0;
//           }
//         }

//         @keyframes logoReveal {
//           0% {
//             clip-path: inset(100% 0 0 0);
//           }

//           100% {
//             clip-path: inset(0 0 0 0);
//           }
//         }

//         .clip-path-hidden {
//           clip-path: inset(100% 0 0 0);
//         }

//         .clip-path-reveal {
//           animation: logoReveal 2.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
//         }
//       `}</style>
//     </div>
//   );
// }

//
