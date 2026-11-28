import { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-gray-100 overflow-x-clip">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="lg:pl-[var(--hrms-sidebar-width)] min-w-0 flex flex-col min-h-screen">
        {/* Navbar */}
        <Navbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

        {/* Page Content */}
        <main className="flex-1 min-w-0 bg-gray-100 px-4 pb-4 pt-[calc(var(--hrms-navbar-height)+1rem)] sm:px-6 sm:pb-6 sm:pt-[calc(var(--hrms-navbar-height)+1.5rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}