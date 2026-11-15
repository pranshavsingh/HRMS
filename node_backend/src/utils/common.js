import path from "path";

export function buildMediaPath(filePath) {
  if (!filePath) return null;
  return `/media/${String(filePath).replace(/\\/g, "/")}`;
}

export function isRole(user, roles) {
  return roles.includes(user.role);
}

export function ext(file) {
  return path.extname(file || "");
}