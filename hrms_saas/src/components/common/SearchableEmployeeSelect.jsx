import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, X, User } from "lucide-react";

export default function SearchableEmployeeSelect({
  employees = [],
  value = "",
  onChange,
  placeholder = "Search registered employee...",
  label = "Select Registered Employee",
  required = false,
  error = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setSearchQuery("");
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const selectedEmployee = useMemo(() => {
    if (!value) return null;
    return employees.find((emp) => String(emp.id) === String(value)) || null;
  }, [employees, value]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase().trim();
    return employees.filter((emp) => {
      const idMatch = String(emp.id).includes(q);
      const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim().toLowerCase();
      const nameMatch = name.includes(q);
      const usernameMatch = emp.username?.toLowerCase().includes(q);
      const emailMatch = emp.email?.toLowerCase().includes(q);
      const roleMatch = emp.role?.toLowerCase().includes(q);
      const teamMatch = emp.team_name?.toLowerCase().includes(q);
      const designationMatch = emp.designation?.toLowerCase().includes(q);
      return idMatch || nameMatch || usernameMatch || emailMatch || roleMatch || teamMatch || designationMatch;
    });
  }, [employees, searchQuery]);

  const handleSelect = (emp) => {
    onChange(emp.id, emp);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("", null);
  };

  const getDisplayName = (emp) => {
    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    return fullName || emp.username || emp.name || `User #${emp.id}`;
  };

  return (
    <div className="relative text-xs" ref={dropdownRef}>
      {label && (
        <label className="block text-gray-400 mb-1 font-medium">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}

      {/* Trigger Button / Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-gray-800 text-white p-2.5 rounded-lg border cursor-pointer flex items-center justify-between transition-colors ${
          isOpen
            ? "border-blue-500 ring-1 ring-blue-500/50"
            : error
              ? "border-red-500"
              : "border-gray-700 hover:border-gray-600"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          {selectedEmployee?.profile_picture ? (
            <img src={selectedEmployee.profile_picture} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-gray-300">
              <User size={13} />
            </div>
          )}
          {selectedEmployee ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-white truncate">
                {getDisplayName(selectedEmployee)}
              </span>
              <span className="text-gray-400 text-[11px] shrink-0 font-mono">
                #{selectedEmployee.id}
              </span>
              {selectedEmployee.role && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700/80 text-blue-300 capitalize shrink-0">
                  {selectedEmployee.role}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedEmployee && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-white" : ""}`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input Box */}
          <div className="p-2 border-b border-gray-800 bg-gray-950/70">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, role or ID..."
                className="w-full bg-gray-800/90 text-white pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-500"
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List of Options */}
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-800/40">
            {filteredEmployees.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-xs">
                {employees.length === 0 ? "No registered employees found" : "No employees match your search"}
              </div>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = String(emp.id) === String(value);
                const displayName = getDisplayName(emp);
                return (
                  <div
                    key={emp.id}
                    onClick={() => handleSelect(emp)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-600/20 text-blue-200"
                        : "hover:bg-gray-800/70 text-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {emp.profile_picture ? (
                        <img src={emp.profile_picture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-gray-700" />
                      ) : (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 border border-gray-700"
                          }`}
                        >
                          {(displayName[0] || "U").toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white truncate text-xs">
                            {displayName}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            #{emp.id}
                          </span>
                          {emp.role && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-gray-800 text-gray-300 capitalize border border-gray-700/60">
                              {emp.role}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
                          {emp.email && <span>{emp.email}</span>}
                          {emp.email && (emp.team_name || emp.designation) && <span>•</span>}
                          {emp.team_name && <span>{emp.team_name}</span>}
                          {emp.designation && <span>({emp.designation})</span>}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="text-blue-400 font-semibold text-xs shrink-0 ml-2">
                        ✓
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-[11px] mt-1">{error}</p>}
    </div>
  );
}
