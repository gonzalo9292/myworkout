import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const PORT = Number(process.env.PORT || 8080);

const CORE_API_TARGET = process.env.CORE_API_TARGET || "http://core-api:3000";
const ANALYTICS_API_TARGET =
  process.env.ANALYTICS_API_TARGET || "http://analytics-api:8000";

// Health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Core API: /api/*  -> core-api/*
// Aquí SÍ queremos que llegue /exercises, /workouts, etc.
// Nota: no hace falta pathRewrite porque Express ya recorta /api.
app.use(
  "/api",
  createProxyMiddleware({
    target: CORE_API_TARGET,
    changeOrigin: true,
  })
);

// Analytics API: /analytics/* -> analytics-api/analytics/*
// IMPORTANTÍSIMO: como Express recorta /analytics, lo reponemos
app.use(
  "/analytics",
  createProxyMiddleware({
    target: ANALYTICS_API_TARGET,
    changeOrigin: true,
    pathRewrite: (path) => `/analytics${path}`, // /summary -> /analytics/summary
  })
);

app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`);
});
