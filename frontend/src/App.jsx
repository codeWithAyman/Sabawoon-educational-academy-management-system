import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";

import Layout from "./components/Layout";

import Login from "./pages/Login";
import WelcomeScreen from "./pages/WelcomeScreen";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import UsersPage from "./pages/UsersPage";
import Classes from "./pages/Classes";
import Attendance from "./pages/Attendance";
import Exams from "./pages/Exams";
import Fees from "./pages/Fees";
import Finance from "./pages/Finance";
import Assignments from "./pages/Assignments";
import Timetable from "./pages/Timetable";
import Profile from "./pages/Profile";
import UpdatesBackup from "./pages/UpdatesBackup";

function Protected({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Login />} />
          <Route path="/welcome" element={<WelcomeScreen />} />

          {/* Protected application */}
          <Route
            path="/app"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />

            <Route path="students" element={<Students />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="classes" element={<Classes />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="reports" element={<Exams />} />
            <Route path="fees" element={<Fees />} />

            {/* Admin-only Finance page */}
            <Route path="finance" element={<Finance />} />

            <Route path="assignments" element={<Assignments />} />
            <Route path="timetable" element={<Timetable />} />
            <Route path="profile" element={<Profile />} />

            {/* Admin-only Updates & Backup page */}
            <Route path="updates-backup" element={<UpdatesBackup />} />
          </Route>

          {/* Unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
