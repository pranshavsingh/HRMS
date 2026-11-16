import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./routes/ProtectedRoute";
import Attendance from "./pages/Attendance";
import AttendanceHistory from "./pages/AttendanceHistory";
import Leave from "./pages/Leave";
import Documents from "./pages/Documents";
import Employees from "./pages/Employees";
import EmployeeDocuments from "./pages/EmployeeDocuments";
import LeaveApprovals from "./pages/LeaveApprovals";
import AttendanceApprovals from "./pages/AttendanceApprovals";
import TeamDashboard from "./pages/TeamDashboard";
import TeamAttendance from "./pages/TeamAttendance";
import TeamAnalytics from "./pages/TeamAnalytics";
import HRDashboard from "./pages/dashboard/HRDashboard";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import { AuthProvider } from "./context/AuthContext";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute>
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <AttendanceHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leave"
          element={
            <ProtectedRoute>
              <Leave />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute>
              <Employees />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-documents"
          element={
            <ProtectedRoute>
              <EmployeeDocuments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance-approvals"
          element={
            <ProtectedRoute>
              <AttendanceApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-attendance-approvals"
          element={
            <ProtectedRoute>
              <AttendanceApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leave-approvals"
          element={
            <ProtectedRoute>
              <LeaveApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-leave-approvals"
          element={
            <ProtectedRoute>
              <LeaveApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-dashboard"
          element={
            <ProtectedRoute>
              <TeamDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-attendance"
          element={
            <ProtectedRoute>
              <TeamAttendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-analytics"
          element={
            <ProtectedRoute>
              <TeamAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hr-dashboard"
          element={
            <ProtectedRoute>
              <HRDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
