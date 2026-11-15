import { useLocation } from "react-router-dom";
import EmployeeDashboard from "./dashboard/EmployeeDashboard";
import ManagerDashboard from "./dashboard/ManagerDashboard";
import HRDashboard from "./dashboard/HRDashboard";
import AdminDashboard from "./dashboard/AdminDashboard";

export default function Dashboard() {
  const role = localStorage.getItem("role");
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const view = searchParams.get("view");

  if (view === "personal" && role !== "admin" && role !== "superadmin") return <EmployeeDashboard />;

  if (role === "employee") return <EmployeeDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  if (role === "hr") return <EmployeeDashboard />;
  if (role === "admin") return <AdminDashboard />;
  if (role === "superadmin") return <AdminDashboard />;

  return <div>No Access</div>;
}
