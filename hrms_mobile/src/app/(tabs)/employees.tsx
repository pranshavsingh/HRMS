import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { useAuth } from "../../context/AuthContext";
import * as DocumentPicker from "expo-document-picker";
import { 
  Contact, 
  Search, 
  X, 
  Edit3, 
  Trash2, 
  MapPin, 
  User, 
  Mail, 
  ShieldCheck, 
  Plus,
  UserPlus,
  FolderUp,
  Check
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Employee {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: string;
  designation?: string;
  joining_date?: string;
  latitude: number;
  longitude: number;
  allowed_radius: number;
}

export default function EmployeesScreen() {
  const { user } = useAuth();
  const role = user?.role || "employee";
  const isHR = role === "hr";
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";
  const showFAB = isHR || isAdmin || isSuperadmin;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Edit State
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    designation: "",
    latitude: "",
    longitude: "",
    allowed_radius: "",
  });

  // Onboard/Create Staff States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "employee",
    manager: "",
    team_name: "",
    joining_date: "",
    leave_allotted: "12",
    designation: "",
    latitude: "",
    longitude: "",
    allowed_radius: "100",
  });

  // Selected onboarding files
  const [selectedAadhar, setSelectedAadhar] = useState<any>(null);
  const [selectedPan, setSelectedPan] = useState<any>(null);
  const [selectedBank, setSelectedBank] = useState<any>(null);

  const [showCreateRoleSelector, setShowCreateRoleSelector] = useState(false);
  const [showCreateManagerSelector, setShowCreateManagerSelector] = useState(false);

  const fetchEmployeesList = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [empRes, mgrRes] = await Promise.all([
        api.get("/auth/employees/"),
        api.get("/auth/managers/").catch(() => ({ data: [] })) // Safe fallback if endpoint differs or is empty
      ]);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
      setManagers(Array.isArray(mgrRes.data) ? mgrRes.data : []);
    } catch (err: any) {
      console.error("Error loading staff roster directory", err);
      Alert.alert("Sync Error", "Unable to load employees database.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRealtime("employee_update", () => fetchEmployeesList(false));

  useEffect(() => {
    fetchEmployeesList(true);
  }, [fetchEmployeesList]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmployeesList(false);
  };

  const handleEditClick = (emp: Employee) => {
    setEditingEmp(emp);
    setForm({
      first_name: emp.first_name || "",
      last_name: emp.last_name || "",
      designation: emp.designation || "",
      latitude: emp.latitude !== undefined && emp.latitude !== null ? String(emp.latitude) : "",
      longitude: emp.longitude !== undefined && emp.longitude !== null ? String(emp.longitude) : "",
      allowed_radius: emp.allowed_radius !== undefined && emp.allowed_radius !== null ? String(emp.allowed_radius) : "100",
    });
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmp) return;

    // Validate inputs
    const latNum = parseFloat(form.latitude);
    const lonNum = parseFloat(form.longitude);
    const radNum = parseInt(form.allowed_radius, 10);

    if (isNaN(latNum) || isNaN(lonNum)) {
      Alert.alert("Input Error", "Latitude and Longitude must be valid decimal coordinates.");
      return;
    }
    if (isNaN(radNum) || radNum <= 0) {
      Alert.alert("Input Error", "Allowed Radius must be a positive integer in meters.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        designation: form.designation.trim(),
        latitude: latNum,
        longitude: lonNum,
        allowed_radius: radNum,
      };

      const res = await api.put(`/auth/employees/${editingEmp.id}/`, payload);
      Alert.alert("Update Success", res.data.message || "Employee parameters updated.");
      setEditingEmp(null);
      fetchEmployeesList(false);
    } catch (err: any) {
      console.error("Update employee error:", err);
      Alert.alert("Update Failed", err.response?.data?.error || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveClick = (emp: Employee) => {
    Alert.alert(
      "Confirm Archive",
      `Are you sure you want to soft-delete profile folder for ${emp.first_name || emp.username}? Documents will remain secure in cloud storage.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive Staff",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.delete(`/auth/employees/${emp.id}/`);
              Alert.alert("Archived", res.data.message || "Profile archived successfully.");
              fetchEmployeesList(false);
            } catch (err: any) {
              console.error("Archive employee error", err);
              Alert.alert("Action Failed", err.response?.data?.error || "Unable to archive employee.");
            }
          },
        },
      ]
    );
  };

  const handlePickCreateDocument = async (type: "aadhar" | "pan" | "bank") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileInfo = {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream",
        };
        if (type === "aadhar") setSelectedAadhar(fileInfo);
        else if (type === "pan") setSelectedPan(fileInfo);
        else if (type === "bank") setSelectedBank(fileInfo);
      }
    } catch (err) {
      console.error("Document picking failed:", err);
      Alert.alert("Error", "Failed to select document");
    }
  };

  const getRoleOptions = () => {
    const opts = [
      { value: "employee", label: "Employee" },
      { value: "manager", label: "Manager" }
    ];
    if (isSuperadmin) {
      opts.push({ value: "hr", label: "HR" });
      opts.push({ value: "admin", label: "Admin" });
      opts.push({ value: "superadmin", label: "Superadmin" });
    } else if (isAdmin) {
      opts.push({ value: "hr", label: "HR" });
    }
    return opts;
  };

  const handleCreateEmployee = async () => {
    if (!createForm.username.trim() || !createForm.password || !createForm.first_name.trim() || !createForm.last_name.trim() || !createForm.email.trim()) {
      Alert.alert("Validation Error", "Username, Password, First Name, Last Name, and Email are required.");
      return;
    }

    if (createForm.role === "employee" && !createForm.manager) {
      Alert.alert("Validation Error", "Please assign a reporting manager/team.");
      return;
    }

    if (createForm.role === "manager" && !createForm.team_name.trim()) {
      Alert.alert("Validation Error", "Please specify the Managed Team Name.");
      return;
    }

    const latNum = parseFloat(createForm.latitude);
    const lonNum = parseFloat(createForm.longitude);
    const radNum = parseInt(createForm.allowed_radius, 10);

    if (isNaN(latNum) || isNaN(lonNum)) {
      Alert.alert("Validation Error", "Latitude and Longitude must be valid decimal coordinates.");
      return;
    }

    if (isNaN(radNum) || radNum <= 0) {
      Alert.alert("Validation Error", "Allowed Radius must be a positive integer in meters.");
      return;
    }

    if (!selectedAadhar || !selectedPan || !selectedBank) {
      Alert.alert("Validation Error", "Aadhar Card, PAN Card, and Bank Details documents are required.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("username", createForm.username.trim());
      formData.append("password", createForm.password);
      formData.append("first_name", createForm.first_name.trim());
      formData.append("last_name", createForm.last_name.trim());
      formData.append("email", createForm.email.trim());
      formData.append("role", createForm.role);
      formData.append("designation", createForm.designation.trim());
      formData.append("joining_date", createForm.joining_date || "");
      formData.append("leave_allotted", createForm.leave_allotted || "0");
      formData.append("latitude", String(latNum));
      formData.append("longitude", String(lonNum));
      formData.append("allowed_radius", String(radNum));

      const locations = [
        {
          latitude: latNum,
          longitude: lonNum,
          allowed_radius: radNum,
          is_primary: true
        }
      ];
      formData.append("locations", JSON.stringify(locations));

      if (createForm.role === "employee") {
        formData.append("manager", createForm.manager);
      } else if (createForm.role === "manager") {
        formData.append("team_name", createForm.team_name.trim());
      }

      formData.append("aadhar_file", selectedAadhar as any);
      formData.append("pan_file", selectedPan as any);
      formData.append("bank_file", selectedBank as any);

      const res = await api.post("/auth/create-employee/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      Alert.alert("Success", res.data.message || "Employee onboarding successful.");
      setShowCreateModal(false);
      
      setCreateForm({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        role: "employee",
        manager: "",
        team_name: "",
        joining_date: "",
        leave_allotted: "12",
        designation: "",
        latitude: "",
        longitude: "",
        allowed_radius: "100",
      });
      setSelectedAadhar(null);
      setSelectedPan(null);
      setSelectedBank(null);

      fetchEmployeesList(false);
    } catch (err: any) {
      console.error("Create employee failed:", err.response?.data || err.message);
      Alert.alert("Onboarding Failed", err.response?.data?.error || "Failed to onboard employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(
      (emp) =>
        emp.username?.toLowerCase().includes(query) ||
        emp.first_name?.toLowerCase().includes(query) ||
        emp.last_name?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.designation?.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  const renderRosterItem = ({ item }: { item: Employee }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#94a3b8" />
            <Text style={styles.employeeName}>
              {item.first_name ? `${item.first_name} ${item.last_name || ""}` : item.username}
            </Text>
          </View>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>{item.role?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          {item.designation ? (
            <Text style={styles.metaRow}>Title: {item.designation}</Text>
          ) : null}
          <Text style={styles.metaRow}>Username: {item.username}</Text>
          <Text style={styles.metaRow}>Email: {item.email || "N/A"}</Text>

          {/* Location telemetry info */}
          <View style={styles.telemetryBox}>
            <MapPin size={12} color="#10b981" style={{ marginRight: 6 }} />
            <Text style={styles.telemetryText}>
              Perimeter: {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)} ({item.allowed_radius}m zone)
            </Text>
          </View>
        </View>

        {/* Administration Controls */}
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.editBtn} onPress={() => handleEditClick(item)}>
            <Edit3 size={12} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.editBtnText}>Modify Bounds</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchiveClick(item)}>
            <Trash2 size={12} color="#ef4444" style={{ marginRight: 6 }} />
            <Text style={styles.archiveBtnText}>Archive</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Filtering */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search staff database..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Roster flat list */}
      <FlatList
        data={filteredEmployees}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRosterItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Contact size={32} color="#64748b" />
            <Text style={styles.emptyText}>No employee records found in payroll registry.</Text>
          </View>
        }
      />

      {/* --- EDIT EMPLOYEE DETAILS MODAL --- */}
      <Modal
        visible={editingEmp !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingEmp(null)}
      >
        <View style={styles.modalOverlay}>
          {editingEmp && (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Modify Employee Details</Text>
                  <Text style={styles.modalSub}>Updating code parameters for {editingEmp.username}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditingEmp(null)} style={styles.closeBtn}>
                  <X size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                {/* Form fields */}
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="First Name"
                  placeholderTextColor="#64748b"
                  value={form.first_name}
                  onChangeText={(val) => setForm(prev => ({ ...prev, first_name: val }))}
                />

                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Last Name"
                  placeholderTextColor="#64748b"
                  value={form.last_name}
                  onChangeText={(val) => setForm(prev => ({ ...prev, last_name: val }))}
                />

                <Text style={styles.inputLabel}>Designation</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Designation Title"
                  placeholderTextColor="#64748b"
                  value={form.designation}
                  onChangeText={(val) => setForm(prev => ({ ...prev, designation: val }))}
                />

                <Text style={styles.inputLabel}>Primary Location Latitude</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 12.97159"
                  placeholderTextColor="#64748b"
                  value={form.latitude}
                  onChangeText={(val) => setForm(prev => ({ ...prev, latitude: val }))}
                />

                <Text style={styles.inputLabel}>Primary Location Longitude</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 77.59456"
                  placeholderTextColor="#64748b"
                  value={form.longitude}
                  onChangeText={(val) => setForm(prev => ({ ...prev, longitude: val }))}
                />

                <Text style={styles.inputLabel}>Allowed Geofence Radius (meters)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 100"
                  placeholderTextColor="#64748b"
                  value={form.allowed_radius}
                  onChangeText={(val) => setForm(prev => ({ ...prev, allowed_radius: val }))}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, submitting && styles.disabledBtn]}
                  onPress={handleUpdateEmployee}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Employee Bounds</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* --- CREATE EMPLOYEE / ONBOARD MODAL --- */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Onboard Staff Member</Text>
                <Text style={styles.modalSub}>Create profile credentials & upload documents</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.closeBtn}>
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Role</Text>
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => setShowCreateRoleSelector(!showCreateRoleSelector)}
              >
                <Text style={styles.selectorBtnText}>
                  {createForm.role.toUpperCase()}
                </Text>
              </TouchableOpacity>

              {showCreateRoleSelector && (
                <View style={styles.dropdownList}>
                  {getRoleOptions().map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.dropdownItem, createForm.role === opt.value && styles.dropdownItemActive]}
                      onPress={() => {
                        setCreateForm(prev => ({
                          ...prev,
                          role: opt.value,
                          manager: opt.value === "employee" ? prev.manager : "",
                          team_name: opt.value === "manager" ? prev.team_name : ""
                        }));
                        setShowCreateRoleSelector(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Unique username"
                placeholderTextColor="#64748b"
                value={createForm.username}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, username: val }))}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>First Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="First Name"
                placeholderTextColor="#64748b"
                value={createForm.first_name}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, first_name: val }))}
              />

              <Text style={styles.inputLabel}>Last Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Last Name"
                placeholderTextColor="#64748b"
                value={createForm.last_name}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, last_name: val }))}
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.textInput}
                placeholder="email@workplace.com"
                placeholderTextColor="#64748b"
                value={createForm.email}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, email: val }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Designation / Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Designation"
                placeholderTextColor="#64748b"
                value={createForm.designation}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, designation: val }))}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Password"
                placeholderTextColor="#64748b"
                value={createForm.password}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, password: val }))}
                secureTextEntry
                autoCapitalize="none"
              />

              {createForm.role === "employee" && (
                <>
                  <Text style={styles.inputLabel}>Reporting Manager / Team</Text>
                  <TouchableOpacity
                    style={styles.selectorBtn}
                    onPress={() => setShowCreateManagerSelector(!showCreateManagerSelector)}
                  >
                    <Text style={styles.selectorBtnText}>
                      {managers.find(m => String(m.id) === createForm.manager)?.name || "Select reporting manager"}
                    </Text>
                  </TouchableOpacity>

                  {showCreateManagerSelector && (
                    <View style={styles.dropdownList}>
                      {managers.map((mgr) => (
                        <TouchableOpacity
                          key={mgr.id}
                          style={[styles.dropdownItem, createForm.manager === String(mgr.id) && styles.dropdownItemActive]}
                          onPress={() => {
                            setCreateForm(prev => ({ ...prev, manager: String(mgr.id) }));
                            setShowCreateManagerSelector(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>
                            {mgr.team_name ? `${mgr.name} - ${mgr.team_name}` : mgr.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {createForm.role === "manager" && (
                <>
                  <Text style={styles.inputLabel}>Managed Team Name</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Managed Team Name"
                    placeholderTextColor="#64748b"
                    value={createForm.team_name}
                    onChangeText={(val) => setCreateForm(prev => ({ ...prev, team_name: val }))}
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Joining Date</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748b"
                value={createForm.joining_date}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, joining_date: val }))}
              />

              <Text style={styles.inputLabel}>Leave Allotted</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Leaves allotted"
                placeholderTextColor="#64748b"
                value={createForm.leave_allotted}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, leave_allotted: val }))}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Geofence Latitude</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 12.97159"
                placeholderTextColor="#64748b"
                value={createForm.latitude}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, latitude: val }))}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Geofence Longitude</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 77.59456"
                placeholderTextColor="#64748b"
                value={createForm.longitude}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, longitude: val }))}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Allowed Geofence Radius (meters)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 100"
                placeholderTextColor="#64748b"
                value={createForm.allowed_radius}
                onChangeText={(val) => setCreateForm(prev => ({ ...prev, allowed_radius: val }))}
                keyboardType="numeric"
              />

              {/* Joining Documents Block */}
              <Text style={[styles.inputLabel, { marginTop: 20 }]}>Onboarding Files (Aadhar, PAN & Bank Details are mandatory)</Text>
              
              <View style={styles.docUploadCard}>
                <Text style={styles.docUploadLabel}>Aadhar Card *</Text>
                <TouchableOpacity
                  style={[styles.docPickBtn, selectedAadhar && styles.docPickBtnActive]}
                  onPress={() => handlePickCreateDocument("aadhar")}
                >
                  {selectedAadhar ? (
                    <>
                      <Check size={14} color="#10b981" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickTextActive} numberOfLines={1}>{selectedAadhar.name}</Text>
                    </>
                  ) : (
                    <>
                      <FolderUp size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickText}>Select Aadhar PDF/Image...</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.docUploadCard}>
                <Text style={styles.docUploadLabel}>PAN Card *</Text>
                <TouchableOpacity
                  style={[styles.docPickBtn, selectedPan && styles.docPickBtnActive]}
                  onPress={() => handlePickCreateDocument("pan")}
                >
                  {selectedPan ? (
                    <>
                      <Check size={14} color="#10b981" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickTextActive} numberOfLines={1}>{selectedPan.name}</Text>
                    </>
                  ) : (
                    <>
                      <FolderUp size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickText}>Select PAN PDF/Image...</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.docUploadCard}>
                <Text style={styles.docUploadLabel}>Bank Details *</Text>
                <TouchableOpacity
                  style={[styles.docPickBtn, selectedBank && styles.docPickBtnActive]}
                  onPress={() => handlePickCreateDocument("bank")}
                >
                  {selectedBank ? (
                    <>
                      <Check size={14} color="#10b981" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickTextActive} numberOfLines={1}>{selectedBank.name}</Text>
                    </>
                  ) : (
                    <>
                      <FolderUp size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                      <Text style={styles.docPickText}>Select Bank PDF/Image...</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, submitting && styles.disabledBtn]}
                onPress={handleCreateEmployee}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>Onboard Employee</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {showFAB && (
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => setShowCreateModal(true)}
        >
          <UserPlus size={20} color="#ffffff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSection: {
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#33415550",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: "#ffffff",
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#33415540",
    paddingBottom: 8,
    marginBottom: 10,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  employeeName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  roleTag: {
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#312e81",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleTagText: {
    color: "#a5b4fc",
    fontSize: 9,
    fontWeight: "700",
  },
  cardContent: {
    marginBottom: 14,
  },
  metaRow: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  telemetryBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10b98110",
    borderWidth: 1,
    borderColor: "#10b98120",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  telemetryText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "600",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#33415540",
    paddingTop: 12,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#475569",
  },
  editBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7f1d1d20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef444430",
  },
  archiveBtnText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  // Modal Edit layout
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  modalSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    padding: 6,
    borderRadius: 14,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 12,
    color: "#ffffff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  saveBtn: {
    backgroundColor: "#10b981",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#34d39950",
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  fabBtn: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#34d39980",
  },
  selectorBtn: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectorBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },
  dropdownList: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    marginTop: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  docUploadCard: {
    backgroundColor: "#0f172a50",
    borderWidth: 1,
    borderColor: "#33415560",
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  docUploadLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  docPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  docPickBtnActive: {
    borderColor: "#10b98150",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  docPickText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  docPickTextActive: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "600",
    flex: 1,
  },
});

