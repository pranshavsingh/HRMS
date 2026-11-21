import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/layout/Layout";
import { ShieldAlert } from "lucide-react";
import EmployeeDashboard from "./dashboard/EmployeeDashboard";
import ManagerDashboard from "./dashboard/ManagerDashboard";
import HRDashboard from "./dashboard/HRDashboard";
import AdminDashboard from "./dashboard/AdminDashboard";

export default function Dashboard() {
  const { role: authRole } = useAuth();
  const role = authRole || localStorage.getItem("role");
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const view = searchParams.get("view");

  if (view === "personal" && role !== "admin" && role !== "superadmin") return <EmployeeDashboard />;

  if (role === "employee") return <EmployeeDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  if (role === "hr") return <EmployeeDashboard />;
  if (role === "admin") return <AdminDashboard />;
  if (role === "superadmin") return <AdminDashboard />;

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-700 max-w-md shadow-sm">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="font-bold text-lg text-slate-900 mb-2">Access Restricted</h3>
          <p className="text-sm text-slate-500">
            Your user account ({role || "unassigned"}) does not have a designated dashboard view. Please contact your administrator.
          </p>
        </div>
      </div>
    </Layout>
  );
}
