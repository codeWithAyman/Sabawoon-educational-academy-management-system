import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('hm_token')
  if (t) c.headers.Authorization = `Bearer ${t}`
  return c
})
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('hm_token')
      localStorage.removeItem('hm_user')
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/register') && location.pathname !== '/') location.href = '/login'
    }
    return Promise.reject(err)
  }
)
export default api
