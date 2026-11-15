import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div>

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="ml-64">

        {/* Navbar */}
        <Navbar />

        {/* Page Content */}
        <div className="pt-20 p-6 bg-gray-100 min-h-screen">
          {children}
        </div>

      </div>

    </div>
  );
}