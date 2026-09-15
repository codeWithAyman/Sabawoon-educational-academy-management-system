import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Loader2 } from 'lucide-react'
export default function Register() {
  const { register } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '', dob: '', gender: '', address: '', guardian_name: '', guardian_phone: '' })
  const [loading, setLoading] = useState(false)
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setLoading(true)
    try { await register(form); toast.success('Account created!'); nav('/app') }
    catch (err) { toast.error(err.response?.data?.error || 'Registration failed') }
    finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6 lg:p-12">
      <form onSubmit={submit} className="w-full max-w-2xl card p-8" data-testid="register-form">
        <h1 className="text-2xl font-bold text-slate-800">Create student account</h1>
        <p className="text-sm text-slate-500 mt-1">Sign up to access your dashboard, attendance, results and more.</p>
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div><label className="label">Full name *</label><input required className="input" value={form.full_name} onChange={upd('full_name')} data-testid="reg-name" /></div>
          <div><label className="label">Email *</label><input type="email" required className="input" value={form.email} onChange={upd('email')} data-testid="reg-email" /></div>
          <div><label className="label">Password *</label><input type="password" minLength={6} required className="input" value={form.password} onChange={upd('password')} data-testid="reg-password" /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={upd('phone')} /></div>
          <div><label className="label">Date of birth</label><input type="date" className="input" value={form.dob} onChange={upd('dob')} /></div>
          <div><label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={upd('gender')}>
              <option value="">Select</option><option>male</option><option>female</option><option>other</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={upd('address')} /></div>
          <div><label className="label">Guardian name</label><input className="input" value={form.guardian_name} onChange={upd('guardian_name')} /></div>
          <div><label className="label">Guardian phone</label><input className="input" value={form.guardian_phone} onChange={upd('guardian_phone')} /></div>
        </div>
        <button disabled={loading} className="btn-primary w-full mt-6" data-testid="reg-submit">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create account
        </button>
        <div className="text-sm text-slate-500 mt-6 text-center">
          Already have an account? <Link to="/login" className="text-brand-600 font-medium" data-testid="link-login">Sign in</Link>
        </div>
      </form>
    </div>
  )
}
