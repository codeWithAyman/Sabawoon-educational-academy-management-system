import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const TCtx = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2)
    setItems((s) => [...s, { id, type, message }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4000)
  }, [])
  const value = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }
  return (
    <TCtx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 p-3 pr-4 rounded-xl shadow-lg border bg-white ${t.type === 'success' ? 'border-emerald-200' : t.type === 'error' ? 'border-red-200' : 'border-brand-200'}`}>
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />}
            {t.type === 'error' && <XCircle className="w-5 h-5 text-red-500 mt-0.5" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-brand-500 mt-0.5" />}
            <div className="text-sm text-slate-700 flex-1">{t.message}</div>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
        ))}
      </div>
    </TCtx.Provider>
  )
}

export const useToast = () => useContext(TCtx)
