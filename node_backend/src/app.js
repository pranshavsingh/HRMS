import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { config } from "./config/env.js";
import accountsRoutes from "./routes/accounts.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import leaveRoutes from "./routes/leave.routes.js";
import financialLeaveRoutes from "./routes/financial-leave.routes.js";
import shiftRoutes from "./routes/shift.routes.js";
import companyHolidayRoutes from "./routes/company-holiday.routes.js";
import companyPolicyRoutes from "./routes/company-policy.routes.js";
import weeklyOffPolicyRoutes from "./routes/weekly-off-policy.routes.js";
import shiftAssignmentRoutes from "./routes/shift-assignment.routes.js";
import rotationRoutes from "./routes/rotation.routes.js";
import rosterRoutes from "./routes/roster.routes.js";
import siteRoutes from "./routes/site.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { errorHandler, AppError } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/auth.js";
import { getDocumentDetailRedirect } from "./controllers/accounts.controller.js";
import { createApiLimiter, createLoginLimiter } from "./middleware/rateLimiter.js";
import { healthCheck } from "./db/index.js";
import redisService from "./services/redis.service.js";
import metricsService from "./services/metrics.service.js";

export function createApp() {
  const app = express();

  // 1. Helmet Security
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // Observability: Collect Prometheus HTTP latency & throughput metrics
  app.use(metricsService.httpMetricsMiddleware());

  // 2. Strict Rate Limiter for Login Routes (stops brute-force without affecting office NAT)
  const loginLimiter = createLoginLimiter();
  app.use("/api/v1/auth/login", loginLimiter);
  app.use("/api/auth/login", loginLimiter);

  // 3. Tiered High-Throughput API Limiter
  app.use(createApiLimiter());

  // 3. Enterprise CORS Configuration (Strict Production Allowlist)
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = config.corsOrigin && config.corsOrigin !== "*"
    ? config.corsOrigin.split(",").map((s) => s.trim().toLowerCase())
    : [];

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile native apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.trim().toLowerCase();

      if (isProduction) {
        if (allowedOrigins.length > 0) {
          if (allowedOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
          }
          const isDomainMatch = allowedOrigins.some((allowed) => {
            try {
              const allowedHost = new URL(allowed).hostname.replace(/^www\./, "");
              const requestHost = new URL(normalizedOrigin).hostname.replace(/^www\./, "");
              return requestHost === allowedHost || requestHost.endsWith(`.${allowedHost}`);
            } catch {
              return false;
            }
          });
          if (isDomainMatch) {
            return callback(null, true);
          }
        }
        return callback(new AppError(`Origin '${origin}' is not permitted by CORS policy`, 403));
      } else {
        if (
          config.corsOrigin === "*" ||
          allowedOrigins.includes(normalizedOrigin) ||
          normalizedOrigin.includes("localhost") ||
          normalizedOrigin.includes("127.0.0.1")
        ) {
          return callback(null, true);
        }
        return callback(new AppError(`Origin '${origin}' is not permitted by CORS policy`, 403));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Platform"],
    maxAge: 86400,
  };
  app.use(cors(corsOptions));

  // 4. Request Logger (Morgan) - Skip internal healthcheck and metrics polling to keep logs clean
  app.use(
    morgan("combined", {
      skip: (req) => {
        const url = req.url || "";
        return (
          url === "/health" ||
          url.startsWith("/health/") ||
          url === "/metrics" ||
          url.startsWith("/metrics?")
        );
      },
    })
  );

  // 5. Body Parsers, Cookie Parser & payload compression
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());
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

  // Protected Media files server: Prohibit public static access to confidential employee documents
  app.use("/media/documents", (_req, res) => {
    return res.status(403).json({ error: "Direct access to private employee documents is forbidden. Use authenticated document routes." });
  });
  app.use("/media", express.static(path.resolve(process.cwd(), config.mediaRoot)));

  // Versioned API v1 Routes
  app.use("/api/v1/auth", accountsRoutes);
  app.use("/api/v1/attendance", attendanceRoutes);
  app.use("/api/v1/leave", leaveRoutes);
  app.use("/api/v1/leave/policy", financialLeaveRoutes);
  app.use("/api/v1/shifts", shiftRoutes);
  app.use("/api/v1/workforce/shifts", shiftRoutes);
  app.use("/api/v1/workforce/holidays", companyHolidayRoutes);
  app.use("/api/v1/workforce/policies", companyPolicyRoutes);
  app.use("/api/v1/workforce/weekly-off-policies", weeklyOffPolicyRoutes);
  app.use("/api/v1/workforce/assignments", shiftAssignmentRoutes);
  app.use("/api/v1/workforce/rotations", rotationRoutes);
  app.use("/api/v1/workforce/rosters", rosterRoutes);
  app.use("/api/v1/workforce/sites", siteRoutes);
  app.use("/api/v1/notifications", notificationRoutes);

  // Direct and backward compatibility fallback routes
  app.use("/api/v1/assignments", shiftAssignmentRoutes);
  app.use("/api/v1/rotations", rotationRoutes);
  app.use("/api/v1/rosters", rosterRoutes);

  // Backward compatibility fallback routes
  app.use("/api/auth", accountsRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/leave", leaveRoutes);
  app.use("/api/leave/policy", financialLeaveRoutes);
  app.use("/api/shifts", shiftRoutes);
  app.use("/api/workforce/shifts", shiftRoutes);
  app.use("/api/workforce/holidays", companyHolidayRoutes);
  app.use("/api/workforce/policies", companyPolicyRoutes);
  app.use("/api/workforce/weekly-off-policies", weeklyOffPolicyRoutes);
  app.use("/api/workforce/assignments", shiftAssignmentRoutes);
  app.use("/api/workforce/rotations", rotationRoutes);
  app.use("/api/workforce/rosters", rosterRoutes);
  app.use("/api/workforce/sites", siteRoutes);
  app.use("/api/sites", siteRoutes);
  app.use("/api/notifications", notificationRoutes);

  // System Liveness check
  app.get("/health", (_req, res) => res.json({ status: "alive", uptime: process.uptime() }));

  // Deep Enterprise Readiness Probe (inspects MySQL & Redis status and memory)
  app.get("/health/ready", async (_req, res) => {
    const checks = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime_seconds: Number(process.uptime().toFixed(1)),
      memory: {
        rss_mb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1)),
        heap_used_mb: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1)),
      },
      dependencies: {
        database: "unknown",
        redis: "unknown",
      },
    };

    let isHealthy = true;

    try {
      const start = Date.now();
      await healthCheck();
      checks.dependencies.database = { status: "connected", latency_ms: Date.now() - start };
    } catch (err) {
      checks.dependencies.database = { status: "unreachable", error: err.message };
      isHealthy = false;
    }

    try {
      if (redisService.isReady()) {
        const start = Date.now();
        await redisService.client.ping();
        checks.dependencies.redis = { status: "connected", latency_ms: Date.now() - start };
      } else {
        checks.dependencies.redis = { status: "offline", mode: "in-memory fallback" };
        if (isProduction) {
          isHealthy = false;
        }
      }
    } catch (err) {
      checks.dependencies.redis = { status: "error", error: err.message };
      if (isProduction) {
        isHealthy = false;
      }
    }

    checks.status = isHealthy ? "ready" : "degraded";
    return res.status(isHealthy ? 200 : 503).json(checks);
  });

  // Prometheus Metrics Scrape Endpoint
  app.get("/metrics", async (_req, res) => {
    try {
      const metrics = await metricsService.getMetrics();
      res.setHeader("Content-Type", metricsService.getContentType());
      return res.status(200).send(metrics);
    } catch (err) {
      return res.status(500).send(`Error collecting metrics: ${err.message}`);
    }
  });

  // 404 Route Not Found
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // 6. Centralized Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}
