import { LogOut, User, CalendarDays, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSite } from "../../context/SiteContext";
import { useAuth } from "../../context/AuthContext";

const ROUTE_TITLES = {
  "/attendance": "Attendance",
  "/history": "Attendance History",
  "/attendance-history": "Attendance History",
  "/monthly-register": "Monthly Attendance Register",
  "/leave": "Leave Management",
  "/documents": "My Documents",
  "/employees": "Employee Directory",
  "/employee-documents": "Employee Documents",
  "/attendance-approvals": "Attendance Approvals",
  "/team-attendance-approvals": "Attendance Approvals",
  "/leave-approvals": "Leave Approvals",
  "/team-leave-approvals": "Leave Approvals",
  "/team-dashboard": "Team Dashboard",
  "/team-attendance": "Team Attendance",
  "/team-analytics": "Team Analytics",
  "/hr-dashboard": "HR Dashboard",
  "/reports": "Reports & Analytics",
  "/audit-logs": "Audit Logs",
  "/shifts": "Shift Management",
  "/roster": "Roster Management",
  "/holidays": "Company Holidays",
  "/site-management": "Site Management",
  "/sites": "Site Management",
};

export default function Navbar({ onToggleSidebar }) {
  const { user, role: authRole, logout } = useAuth();
  const role = authRole || "";
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const viewParam = searchParams.get("view");

  const getPageTitle = () => {
    const pathname = location.pathname.replace(/\/$/, "");

    if (pathname === "/dashboard" || pathname === "") {
      if (viewParam === "personal") return "Personal Dashboard";
      if (role === "employee") return "Employee Dashboard";
      if (role === "manager") return "Manager Dashboard";
      if (role === "hr") return "HR Dashboard";
      if (role === "admin") return "Admin Dashboard";
      if (role === "superadmin") return "Superadmin Dashboard";
      return "Dashboard";
    }

    if (ROUTE_TITLES[pathname]) {
      return ROUTE_TITLES[pathname];
    }

    return role ? `${role.charAt(0).toUpperCase() + role.slice(1)} Portal` : "HRMS Portal";
  };
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const username = user?.username || localStorage.getItem("username");
  const profilePic = user?.profile_picture || storedUser?.profile_picture;
  const { sites, siteId, setSiteId } = useSite();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      localStorage.clear();
      window.location.href = "/";
    }
  };

  return (
    <div className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white shadow-sm border-b flex items-center justify-between gap-2 px-3 sm:px-6 z-40">

      {/* 🔥 LEFT: MENU BUTTON + PAGE TITLE */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Open navigation menu"
            className="lg:hidden rounded-lg p-2 text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate">
            {getPageTitle()}
          </h1>

          <p className="text-xs text-gray-500 hidden sm:block">
            Welcome back 👋
          </p>
        </div>
      </div>

      {/* 🔥 RIGHT: USER SECTION */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">

        {["admin", "superadmin", "hr", "manager"].includes(role) && sites.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="hidden md:inline">Work site</span>
            <select aria-label="Filter by work site" value={siteId} onChange={(event) => setSiteId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm max-w-[115px] sm:max-w-[180px]">
              <option value="all">{role === "admin" || role === "superadmin" ? "All sites" : "All my sites"}</option>
              {(role === "admin" || role === "superadmin") && <option value="unassigned">Unassigned</option>}
              {sites.filter((site) => site.is_active).map((site) => <option key={site.id} value={String(site.id)}>{site.name}</option>)}
            </select>
          </label>
        )}

        <Link
          to="/holidays"
          title="Holiday Calendar"
          aria-label="Open Company Holiday Calendar"
          className="relative rounded-full p-2 text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <CalendarDays size={19} aria-hidden="true" />
        </Link>

        {/* 👤 User Info */}
        <div className="flex items-center gap-2 bg-gray-100 px-2 sm:px-3 py-1 rounded-lg">
          {profilePic ? (
            <img src={profilePic} alt="" className="h-5 w-5 rounded-full object-cover border border-slate-200" />
          ) : (
            <User size={16} />
          )}
          <span className="text-sm capitalize hidden sm:inline">
            {username || role}
          </span>
        </div>

        {/* 🚪 Logout */}
        <button
          onClick={handleLogout}
          aria-label="Logout"
          className="flex items-center gap-2 bg-red-500 text-white px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-red-600 transition"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>

      </div>
    </div>
  );
}
