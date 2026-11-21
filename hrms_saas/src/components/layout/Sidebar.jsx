import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  History,
  FileText,
  Users,
  CheckCircle,
  BarChart,
  Settings
} from "lucide-react";

export default function Sidebar() {
  const { role: authRole } = useAuth();
  const role = authRole || localStorage.getItem("role");
  const location = useLocation();

  const menuClass = (path) => {
    const current = location.pathname + location.search;
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");

    let active = current === path;

    if (!active && location.pathname === "/roster") {
      const isManagerOrAdmin = ["admin", "superadmin", "hr", "manager"].includes(role);
      const effectiveTab = tabParam || (isManagerOrAdmin ? "calendar" : "my-schedule");
      if (path === `/roster?tab=${effectiveTab}`) {
        active = true;
      }
    }

    if (!active && path === "/dashboard" && location.pathname === "/dashboard" && !location.search) {
      active = true;
    }

    return `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
      active
        ? "bg-blue-600 text-white"
        : "text-gray-300 hover:bg-gray-800"
    }`;
  };

  return (
    <div className="fixed left-0 top-0 w-64 h-screen bg-gray-900 text-white flex flex-col p-4">

      {/* 🔥 LOGO */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold">HRMS</h2>
        <p className="text-xs text-gray-400">Smart Workforce</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto">

        {/* 👤 EMPLOYEE / PERSONAL PORTAL */}
        {role && (
          <div>
            <p className="text-xs text-gray-500 uppercase mb-2">
              {role === "admin" || role === "superadmin" ? "My Portal" : "Employee"}
            </p>

            {(role === "admin" || role === "superadmin") ? (
              <Link to="/dashboard?view=personal" className={menuClass("/dashboard?view=personal")}>
                <LayoutDashboard size={18} /> Dashboard
              </Link>
            ) : (
              <Link to="/dashboard" className={menuClass("/dashboard")}>
                <LayoutDashboard size={18} /> Dashboard
              </Link>
            )}

            <Link to="/attendance" className={menuClass("/attendance")}>
              <Clock size={18} /> Attendance
            </Link>

            <Link to="/roster?tab=my-schedule" className={menuClass("/roster?tab=my-schedule")}>
              <Calendar size={18} /> My Schedule
            </Link>

            <Link to="/history" className={menuClass("/history")}>
              <History size={18} /> History
            </Link>

            <Link to="/leave" className={menuClass("/leave")}>
              <FileText size={18} /> Leave
            </Link>

            <Link to="/documents" className={menuClass("/documents")}>
              <FileText size={18} /> Documents
            </Link>
          </div>
        )}

        {/* 👨‍💼 MANAGER ONLY */}
        {role === "manager" && (
          <div>
            <p className="text-xs text-gray-500 uppercase mb-2">Team</p>

            <Link to="/team-dashboard" className={menuClass("/team-dashboard")}>
              <LayoutDashboard size={18} /> Team Dashboard
            </Link>

            <Link to="/team-attendance-approvals" className={menuClass("/team-attendance-approvals")}>
              <CheckCircle size={18} /> Attendance Approvals
            </Link>

            <Link to="/team-leave-approvals" className={menuClass("/team-leave-approvals")}>
              <CheckCircle size={18} /> Leave Approvals
            </Link>

            <Link to="/team-attendance" className={menuClass("/team-attendance")}>
              <Users size={18} /> Team Attendance
            </Link>

            <Link to="/roster?tab=calendar" className={menuClass("/roster?tab=calendar")}>
              <Calendar size={18} /> Team Roster
            </Link>

            <Link to="/team-analytics" className={menuClass("/team-analytics")}>
              <BarChart size={18} /> Team Analytics
            </Link>
          </div>
        )}

        {/* 🧑‍💼 HR ONLY */}
        {role === "hr" && (
          <div>
            <p className="text-xs text-gray-500 uppercase mb-2">HR Tools</p>

            <Link to="/hr-dashboard" className={menuClass("/hr-dashboard")}>
              <LayoutDashboard size={18} /> HR Dashboard
            </Link>

            <Link to="/attendance-approvals" className={menuClass("/attendance-approvals")}>
              <CheckCircle size={18} /> Attendance Approvals
            </Link>

            <Link to="/leave-approvals" className={menuClass("/leave-approvals")}>
              <CheckCircle size={18} /> Leave Approvals
            </Link>

            <Link to="/employees" className={menuClass("/employees")}>
              <Users size={18} /> Manage Employees
            </Link>

            <Link to="/employee-documents" className={menuClass("/employee-documents")}>
              <FileText size={18} /> View Emp Documents
            </Link>

            <Link to="/team-attendance" className={menuClass("/team-attendance")}>
              <Users size={18} /> Team Attendance
            </Link>

            <Link to="/roster?tab=calendar" className={menuClass("/roster?tab=calendar")}>
              <Calendar size={18} /> Team Roster
            </Link>

            <Link to="/team-analytics" className={menuClass("/team-analytics")}>
              <BarChart size={18} /> Team Analytics
            </Link>

            <Link to="/reports" className={menuClass("/reports")}>
              <BarChart size={18} /> Reports & Excel
            </Link>

            <Link to="/shifts" className={menuClass("/shifts")}>
              <Clock size={18} /> Shift Management
            </Link>
          </div>
        )}

        {/* 👑 ADMIN ONLY */}
        {(role === "admin" || role === "superadmin") && (
          <div>
            <p className="text-xs text-gray-500 uppercase mb-2">System</p>

            <Link to="/dashboard" className={menuClass("/dashboard")}>
              <LayoutDashboard size={18} /> {role === "superadmin" ? "Superadmin Dashboard" : "Admin Dashboard"}
            </Link>

            <Link to="/employees" className={menuClass("/employees")}>
              <Users size={18} /> Manage Employees
            </Link>

            <Link to="/employee-documents" className={menuClass("/employee-documents")}>
              <FileText size={18} /> View Emp Documents
            </Link>

            <Link to="/attendance-approvals" className={menuClass("/attendance-approvals")}>
              <CheckCircle size={18} /> Attendance Approvals
            </Link>

            <Link to="/leave-approvals" className={menuClass("/leave-approvals")}>
              <CheckCircle size={18} /> Leave Approvals
            </Link>

            <Link to="/team-attendance" className={menuClass("/team-attendance")}>
              <Clock size={18} /> Emp Attendance
            </Link>

            <Link to="/roster?tab=calendar" className={menuClass("/roster?tab=calendar")}>
              <Calendar size={18} /> Team Roster
            </Link>

            <Link to="/team-analytics" className={menuClass("/team-analytics")}>
              <BarChart size={18} /> Team Analytics
            </Link>

            <Link to="/reports" className={menuClass("/reports")}>
              <BarChart size={18} /> Reports
            </Link>

            <Link to="/shifts" className={menuClass("/shifts")}>
              <Clock size={18} /> Shift Management
            </Link>

            {role === "superadmin" && (
              <Link to="/audit-logs" className={menuClass("/audit-logs")}>
                <Settings size={18} /> Audit Logs
              </Link>
            )}
          </div>
        )}

      </div>

      {/* 🔥 FOOTER */}
      <div className="border-t border-gray-700 pt-4 text-xs text-gray-400">
        Role: <span className="capitalize">{role}</span>
      </div>
    </div>
  );
}
