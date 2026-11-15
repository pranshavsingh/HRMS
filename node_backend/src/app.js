import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { config } from "./config/env.js";
import accountsRoutes from "./routes/accounts.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import leaveRoutes from "./routes/leave.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/auth.js";
import { getDocumentDetailRedirect } from "./controllers/accounts.controller.js";
import { createApiLimiter, createLoginLimiter } from "./middleware/rateLimiter.js";

export function createApp() {
  const app = express();

  // 1. Helmet Security
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // 2. Strict Rate Limiter for Login Routes (stops brute-force without affecting office NAT)
  const loginLimiter = createLoginLimiter();
  app.use("/api/v1/auth/login", loginLimiter);
  app.use("/api/auth/login", loginLimiter);

  // 3. Tiered High-Throughput API Limiter
  app.use(createApiLimiter());

  // 3. CORS
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin }));

  // 4. Request Logger (Morgan)
  app.use(morgan("combined"));

  // 5. Body Parsers & payload compression
  app.use(express.json({ limit: "5mb" }));
  app.use(compression());

  // Request rewrite helper matching original setup
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/accounts/")) {
      req.url = req.url.replace("/api/accounts/", "/api/auth/");
    }
    next();
  });

  // Secure documents signed URL direct access route
  app.get("/api/documents/:id", authenticate, getDocumentDetailRedirect);

  // Media files server
  app.use("/media", express.static(path.resolve(process.cwd(), config.mediaRoot)));

  // Versioned API v1 Routes
  app.use("/api/v1/auth", accountsRoutes);
  app.use("/api/v1/attendance", attendanceRoutes);
  app.use("/api/v1/leave", leaveRoutes);

  // Backward compatibility fallback routes
  app.use("/api/auth", accountsRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/leave", leaveRoutes);

  // System Health check
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // 404 Route Not Found
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // 6. Centralized Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}