import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  const content = (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-8 ring-rose-50/50">
          <AlertCircle size={32} />
        </div>
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600">
          Error 404
        </span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Page Not Found
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          The page you are looking for does not exist, has been removed, or is temporarily unavailable.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to={isAuthenticated ? "/dashboard" : "/"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Home size={16} />
            {isAuthenticated ? "Back to Dashboard" : "Go to Login"}
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );

  if (isAuthenticated) {
    return <Layout>{content}</Layout>;
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-900 p-4">
      {content}
    </div>
  );
}
