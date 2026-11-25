import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Forgot password flow states
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState(1); // 1: Send OTP, 2: Verify OTP, 3: Reset Password
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setErrorMsg("Please enter both username and password");
      return;
    }
    setErrorMsg("");
    setLoading(true);

    try {
      const result = await login(username.trim(), password);
      if (!result.success) {
        setErrorMsg(result.error || "Login failed");
      }
    } catch (err: any) {
      setErrorMsg("Connection error");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!forgotEmail.trim()) {
      setForgotMsg("Please enter your email");
      return;
    }
    setForgotLoading(true);
    setForgotMsg("");
    try {
      await api.post("/auth/forgot-password/request-otp/", { email: forgotEmail.trim() });
      setForgotStep(2);
      setForgotMsg("OTP sent to your email.");
    } catch (err: any) {
      setForgotMsg(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      setForgotMsg("Please enter the OTP");
      return;
    }
    setForgotLoading(true);
    setForgotMsg("");
    try {
      const res = await api.post("/auth/forgot-password/verify-otp/", { email: forgotEmail.trim(), otp: otp.trim() });
      if (res.data?.reset_token) {
        setResetToken(res.data.reset_token);
      }
      setForgotStep(3);
      setForgotMsg("OTP verified. Set your new password.");
    } catch (err: any) {
      setForgotMsg(err.response?.data?.error || "Invalid OTP");
    } finally {
      setForgotLoading(false);
    }
  };

  const validatePasswordComplexity = (pwd: string) => {
    if (pwd.length < 12) return "Password must be at least 12 characters.";
    if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter (A-Z).";
    if (!/[a-z]/.test(pwd)) return "Password must include at least one lowercase letter (a-z).";
    if (!/[0-9]/.test(pwd)) return "Password must include at least one number (0-9).";
    if (!/[!@#$%^&*(),.?":{}|<>_\-]/.test(pwd)) return "Password must include at least one special character (!@#$%^&*...).";
    return null;
  };

  const handleResetPassword = async () => {
    if (!newPassword) {
      setForgotMsg("Please enter your new password");
      return;
    }

    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      setForgotMsg(complexityError);
      return;
    }

    setForgotLoading(true);
    setForgotMsg("");
    try {
      await api.post("/auth/forgot-password/reset/", {
        email: forgotEmail.trim(),
        otp: otp.trim(),
        reset_token: resetToken,
        new_password: newPassword,
      });
      Alert.alert("Success", "Password reset successful. You can log in now.");
      setShowForgot(false);
      setForgotStep(1);
      setForgotEmail("");
      setOtp("");
      setResetToken("");
      setNewPassword("");
      setShowResetPassword(false);
      setForgotMsg("");
    } catch (err: any) {
      setForgotMsg(err.response?.data?.error || "Password reset failed");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.headerSection}>
            <Text style={styles.logoText}>HRMS Mobile</Text>
            <Text style={styles.subtitleText}>Secure Workforce Portal</Text>
          </View>

          <View style={styles.card}>
            {!showForgot ? (
              <>
                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subTitle}>Login to continue to your dashboard</Text>

                {errorMsg ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Username or Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your username"
                    placeholderTextColor="#64748b"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Enter your password"
                      placeholderTextColor="#64748b"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#94a3b8" />
                      ) : (
                        <Eye size={18} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    setShowForgot(true);
                    setForgotMsg("");
                  }}
                  style={styles.forgotLink}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Login</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subTitle}>Recover your employee credentials</Text>

                {forgotMsg ? (
                  <View style={[styles.errorContainer, { borderColor: "rgba(16, 185, 129, 0.2)" }]}>
                    <Text style={[styles.errorText, { color: "#34d399" }]}>{forgotMsg}</Text>
                  </View>
                ) : null}

                {forgotStep === 1 && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email"
                      placeholderTextColor="#64748b"
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                )}

                {forgotStep === 2 && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Enter OTP</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter the OTP received"
                      placeholderTextColor="#64748b"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                    />
                  </View>
                )}

                {forgotStep === 3 && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>New Password (min 12 chars)</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="Enter new password (min 12 chars)"
                        placeholderTextColor="#64748b"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showResetPassword}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowResetPassword(!showResetPassword)}
                        accessibilityLabel={showResetPassword ? "Hide password" : "Show password"}
                      >
                        {showResetPassword ? (
                          <EyeOff size={18} color="#94a3b8" />
                        ) : (
                          <Eye size={18} color="#94a3b8" />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.passwordRequirementsText}>
                      Must be 12+ characters with uppercase, lowercase, number, and special character.
                    </Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setShowForgot(false);
                      setForgotStep(1);
                      setForgotMsg("");
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Back</Text>
                  </TouchableOpacity>

                  {forgotStep === 1 && (
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.inlineButton, forgotLoading && styles.disabledButton]}
                      onPress={handleSendOTP}
                      disabled={forgotLoading}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.buttonText}>Send OTP</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {forgotStep === 2 && (
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.inlineButton, forgotLoading && styles.disabledButton]}
                      onPress={handleVerifyOTP}
                      disabled={forgotLoading}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.buttonText}>Verify OTP</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {forgotStep === 3 && (
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.inlineButton, forgotLoading && styles.disabledButton, { backgroundColor: "#10b981" }]}
                      onPress={handleResetPassword}
                      disabled={forgotLoading}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.buttonText}>Reset Password</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a", // Dark slate background matching the web theme
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  subTitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 20,
    fontWeight: "500",
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f87171",
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#ffffff",
  },
  passwordInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    padding: 6,
  },
  passwordRequirementsText: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginBottom: 22,
  },
  forgotText: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94a3b8",
  },
  inlineButton: {
    flex: 2,
  },
});
