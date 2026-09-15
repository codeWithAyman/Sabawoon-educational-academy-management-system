import { Link } from 'react-router-dom'
import { GraduationCap, ClipboardCheck, Wallet, Megaphone, Calendar, Award, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react'
export default function Landing() {
  const features = [
    { icon: GraduationCap, title: 'Student records', desc: 'Manage profiles, classes, sections, guardians and admission data.' },
    { icon: ClipboardCheck, title: 'Attendance', desc: 'Daily attendance with class & student reports and percentages.' },
    { icon: Award, title: 'Exams & marks', desc: 'Create exams, enter marks and publish secure results.' },
    { icon: Wallet, title: 'Fees', desc: 'Track total, paid and due amounts with receipt numbers.' },
    { icon: Megaphone, title: 'Notices', desc: 'Publish notices to everyone or a specific class/role.' },
    { icon: Calendar, title: 'Timetable', desc: 'Plan periods, subjects, teachers and rooms per class.' },
  ]
  return (
    <div className="min-h-screen">
      <header className="px-6 lg:px-12 py-5 flex items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600 text-white grid place-items-center font-bold shadow-md">H</div>
          <div className="font-bold text-slate-800 text-lg">H_M SMS</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-brand-600" data-testid="nav-login">Sign in</Link>
          <Link to="/register" className="btn-primary text-sm" data-testid="nav-register">Get started</Link>
        </div>
      </header>
      <section className="px-6 lg:px-12 pt-8 lg:pt-16 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 border border-brand-100 text-brand-700 rounded-full text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" /> Built for modern schools
            </div>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.05] tracking-tight">
              The complete <span className="text-brand-600">Student Management</span> System for your institution
            </h1>
            <p className="mt-5 text-slate-600 text-lg max-w-xl">Admissions, attendance, exams, fees, timetable, assignments and notices — everything in one secure, fast, and easy-to-use platform.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary" data-testid="hero-register">Create account <ArrowRight className="w-4 h-4" /></Link>
              <Link to="/login" className="btn-outline" data-testid="hero-login">Sign in to dashboard</Link>
            </div>
            <div className="mt-8 flex items-center gap-3 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> JWT auth, role-based access, audit-ready records
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-200/40 to-transparent blur-3xl rounded-3xl" />
            <div className="relative card p-6 lg:p-8">
              <div className="grid grid-cols-2 gap-4">
                {features.slice(0,4).map((f, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <f.icon className="w-6 h-6 text-brand-600" />
                    <div className="mt-3 font-semibold text-slate-800">{f.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-12 mt-20 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800">Everything you need, nothing you don't.</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {features.map((f, i) => (
            <div key={i} className="card p-5 hover:shadow-md transition">
              <f.icon className="w-6 h-6 text-brand-600" />
              <div className="mt-3 font-semibold text-slate-800">{f.title}</div>
              <p className="text-sm text-slate-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mt-20 py-10 text-center text-sm text-slate-500">© {new Date().getFullYear()} H_M Student Management System</footer>
    </div>
  )
}
