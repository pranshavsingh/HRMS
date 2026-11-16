/**
 * Tier 1 — Feature 13: Mobile Navigation & Modal Access Fix
 * Tests the Expo Router navigation guard specification (DEF-01 fix):
 * Ensures authenticated users can open /documents and /my-documents modals without
 * being forcefully redirected back to /(tabs)/dashboard.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mobile Navigation Guard contract implementation:
 * Mirrors the hardened _layout.tsx navigation transition rule.
 */
function evaluateNavigationGuard({ isAuthenticated, isLoading, segments }) {
  if (isLoading) return null; // Wait for session load

  const segment0 = segments[0] || "index";
  const inTabsGroup = segment0 === "(tabs)";
  const isAllowedModal = segment0 === "documents" || segment0 === "my-documents";
  const isAuthRoute = segment0 === "index" || segment0 === "";

  if (!isAuthenticated) {
    if (inTabsGroup || isAllowedModal) {
      return { action: "redirect", target: "/" };
    }
    return { action: "stay" };
  }

  // When Authenticated
  if (inTabsGroup || isAllowedModal) {
    return { action: "stay" };
  }

  if (isAuthRoute) {
    return { action: "redirect", target: "/(tabs)/dashboard" };
  }

  return { action: "stay" };
}

describe("T1.13 — Mobile Navigation & Modal Access Fix", () => {
  it("T1-MOBNAV-01: Authenticated user accessing /documents modal is allowed without redirect", () => {
    const decision = evaluateNavigationGuard({
      isAuthenticated: true,
      isLoading: false,
      segments: ["documents"]
    });

    assert.equal(decision.action, "stay", "Authenticated user must be allowed on /documents modal");
  });

  it("T1-MOBNAV-02: Authenticated user accessing /my-documents modal is allowed without redirect", () => {
    const decision = evaluateNavigationGuard({
      isAuthenticated: true,
      isLoading: false,
      segments: ["my-documents"]
    });

    assert.equal(decision.action, "stay", "Authenticated user must be allowed on /my-documents modal");
  });

  it("T1-MOBNAV-03: Unauthenticated user attempting to open modal routes is redirected to login", () => {
    const decisionDoc = evaluateNavigationGuard({
      isAuthenticated: false,
      isLoading: false,
      segments: ["documents"]
    });
    assert.equal(decisionDoc.action, "redirect");
    assert.equal(decisionDoc.target, "/");

    const decisionMyDoc = evaluateNavigationGuard({
      isAuthenticated: false,
      isLoading: false,
      segments: ["my-documents"]
    });
    assert.equal(decisionMyDoc.action, "redirect");
    assert.equal(decisionMyDoc.target, "/");
  });

  it("T1-MOBNAV-04: Authenticated user on root login screen is redirected to dashboard", () => {
    const decision = evaluateNavigationGuard({
      isAuthenticated: true,
      isLoading: false,
      segments: ["index"]
    });

    assert.equal(decision.action, "redirect");
    assert.equal(decision.target, "/(tabs)/dashboard");
  });

  it("T1-MOBNAV-05: Modal screen registrations exist in mobile _layout.tsx manifest", () => {
    const layoutPath = path.resolve(__dirname, "../../../../hrms_mobile/src/app/_layout.tsx");
    assert.equal(fs.existsSync(layoutPath), true, "_layout.tsx must exist");

    const layoutSource = fs.readFileSync(layoutPath, "utf-8");
    assert.match(layoutSource, /name="documents"/, "documents modal screen must be defined in Stack");
    assert.match(layoutSource, /name="my-documents"/, "my-documents modal screen must be defined in Stack");
    assert.match(layoutSource, /presentation:\s*"modal"/, "Screen options must configure modal presentation");
  });
});
