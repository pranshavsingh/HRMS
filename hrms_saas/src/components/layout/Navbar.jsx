import { LogOut, Bell, User } from "lucide-react";

export default function Navbar() {
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username"); // optional (if you store)

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

        {/* 🔔 Notification (future use) */}
        <button className="p-2 rounded-full hover:bg-gray-100">
          <Bell size={18} />
        </button>

        {/* 👤 User Info */}
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg">
          <User size={16} />
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
