import { LogOut, Bell, User, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { useSite } from "../../context/SiteContext";

export default function Navbar() {
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username"); // optional (if you store)
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const profilePic = storedUser?.profile_picture;
  const { sites, siteId, setSiteId } = useSite();

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div className="fixed top-0 left-64 right-0 h-16 bg-white shadow-sm border-b flex items-center justify-between px-6 z-50">

      {/* 🔥 LEFT: PAGE TITLE */}
      <div>
        <h1 className="text-lg font-semibold capitalize">
          {role === "employee" && "Employee Dashboard"}
          {role === "manager" && "Manager Dashboard"}
          {role === "hr" && "HR Dashboard"}
          {role === "admin" && "Admin Dashboard"}
          {role === "superadmin" && "Superadmin Dashboard"}
        </h1>

        <p className="text-xs text-gray-500">
          Welcome back 👋
        </p>
      </div>

      {/* 🔥 RIGHT: USER SECTION */}
      <div className="flex items-center gap-4">

        {["admin", "superadmin", "hr", "manager"].includes(role) && sites.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>Work site</span>
            <select aria-label="Filter by work site" value={siteId} onChange={(event) => setSiteId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
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

        {/* 🔔 Notification (future use) */}
        <button className="p-2 rounded-full hover:bg-gray-100">
          <Bell size={18} />
        </button>

        {/* 👤 User Info */}
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg">
          {profilePic ? (
            <img src={profilePic} alt="" className="h-5 w-5 rounded-full object-cover border border-slate-200" />
          ) : (
            <User size={16} />
          )}
          <span className="text-sm capitalize">
            {username || role}
          </span>
        </div>

        {/* 🚪 Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition"
        >
          <LogOut size={16} />
          Logout
        </button>

      </div>
    </div>
  );
}
