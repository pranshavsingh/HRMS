import React, { createContext, useContext, useState } from "react";
import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";

const PopupContext = createContext(null);

export function usePopup() {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error("usePopup must be used within a PopupProvider");
  }
  return context;
}

export function PopupProvider({ children }) {
  const [popup, setPopup] = useState(null); // { message, tone: 'success' | 'error' | 'warning' | 'info', title }

  const showPopup = (message, tone = "info", title = "") => {
    return new Promise((resolve) => {
      let defaultTitle = "";
      if (tone === "success") defaultTitle = "Success";
      else if (tone === "error") defaultTitle = "Error";
      else if (tone === "warning") defaultTitle = "Warning";
      else defaultTitle = "Notification";

      setPopup({
        message,
        tone,
        title: title || defaultTitle,
        onClose: () => {
          setPopup(null);
          resolve(true);
        },
      });
    });
  };

  const getToneDetails = (tone) => {
    switch (tone) {
      case "success":
        return {
          icon: <CheckCircle className="h-10 w-10 text-emerald-500 animate-bounce" />,
          bgColor: "bg-emerald-50 border-emerald-200",
          buttonColor: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
          textColor: "text-emerald-950",
          barColor: "bg-emerald-500",
        };
      case "error":
        return {
          icon: <XCircle className="h-10 w-10 text-rose-500 animate-shake" />,
          bgColor: "bg-rose-50 border-rose-200",
          buttonColor: "bg-rose-600 hover:bg-rose-700 focus:ring-rose-500",
          textColor: "text-rose-950",
          barColor: "bg-rose-500",
        };
      case "warning":
        return {
          icon: <AlertTriangle className="h-10 w-10 text-amber-500 animate-pulse" />,
          bgColor: "bg-amber-50 border-amber-200",
          buttonColor: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500",
          textColor: "text-amber-950",
          barColor: "bg-amber-500",
        };
      case "info":
      default:
        return {
          icon: <Info className="h-10 w-10 text-sky-500" />,
          bgColor: "bg-sky-50 border-sky-200",
          buttonColor: "bg-sky-600 hover:bg-sky-700 focus:ring-sky-500",
          textColor: "text-sky-950",
          barColor: "bg-sky-500",
        };
    }
  };

  const toneDetails = popup ? getToneDetails(popup.tone) : null;

  return (
    <PopupContext.Provider value={{ showPopup }}>
      {children}
      {popup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={popup.onClose}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-sm transform overflow-hidden rounded-3xl border border-white bg-white/95 p-6 text-left shadow-2xl transition-all duration-300 ease-out scale-100 flex flex-col gap-4">
            {/* Colored top bar indicator */}
            <div className={`absolute top-0 inset-x-0 h-1.5 ${toneDetails.barColor}`} />

            {/* Close Button */}
            <button
              onClick={popup.onClose}
              className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-4 mt-2">
              <div className="flex-shrink-0">{toneDetails.icon}</div>
              <div className="flex-1 space-y-1">
                <h3 className={`text-lg font-bold leading-6 ${toneDetails.textColor}`}>
                  {popup.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed break-words whitespace-pre-line">
                  {popup.message}
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={popup.onClose}
                className={`inline-flex w-full justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${toneDetails.buttonColor}`}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </PopupContext.Provider>
  );
}
