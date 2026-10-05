const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const FRONTEND_URLS = process.env.FRONTEND_URLS || "";
const BACKEND_SERVICE_URL =
  process.env.BACKEND_SERVICE_URL || "http://localhost:5001";
const GPT_SERVICE_URL =
  process.env.GPT_SERVICE_URL || "http://localhost:5002";
const DEEPSEEK_SERVICE_URL =
  process.env.DEEPSEEK_SERVICE_URL || "http://localhost:5004";
const RESOURCE_UPLOAD_URL =
  process.env.RESOURCE_UPLOAD_URL || "http://localhost:5000";
const GATEWAY_SHARED_SECRET =
  process.env.GATEWAY_SHARED_SECRET || "resource_gateway_secret_2026";
const EXPLAINABLE_AI_BACKEND_URL =
  process.env.EXPLAINABLE_AI_BACKEND_URL || "http://localhost:8000";
const LIME_AI_SERVICE_URL =
  process.env.LIME_AI_SERVICE_URL || "http://localhost:8110";
const SHAP_AI_SERVICE_URL =
  process.env.SHAP_AI_SERVICE_URL || "http://localhost:8111";
const NEXT_LESSON_RECOMMENDATION_URL =
  process.env.NEXT_LESSON_RECOMMENDATION_URL || "http://localhost:5003";
const COGNITIVE_LOAD_SERVICE_URL =
  process.env.COGNITIVE_LOAD_SERVICE_URL || "http://localhost:8021";
const COGNITIVE_STYLE_SERVICE_URL = 
  process.env.COGNITIVE_STYLE_SERVICE_URL || "http://localhost:8003";
const COGNITIVE_STYLE_AI_URL =
  process.env.COGNITIVE_STYLE_AI_URL || "http://localhost:8112";

const allowedOrigins = [
  FRONTEND_URL,
  ...FRONTEND_URLS.split(",").map((origin) => origin.trim()).filter(Boolean),
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.json({
    message: "API Gateway server is running",
    backendService: BACKEND_SERVICE_URL,
    gptService: GPT_SERVICE_URL,
    deepseekService: DEEPSEEK_SERVICE_URL,
    resourceUploadService: RESOURCE_UPLOAD_URL,
    shapAiService: SHAP_AI_SERVICE_URL,
  });
});

app.use(
  "/api/auth",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/auth${path}`,
  })
);

app.use(
  "/api/dashboard",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/dashboard${path}`,
  })
);

app.use(
  "/api/lessons",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/lessons${path}`,
  })
);

app.use(
  "/api/enrollments",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/enrollments${path}`,
    on: {
      proxyReq: (proxyReq) => {
        if (GATEWAY_SHARED_SECRET) {
          proxyReq.setHeader("x-gateway-secret", GATEWAY_SHARED_SECRET);
        }
      },
    },
  })
);

app.use(
  "/api/student-lesson-summaries",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/student-lesson-summaries${path}`,
  })
);

app.use(
  "/api/gpt",
  createProxyMiddleware({
    target: GPT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/gpt${path}`,
    // LLM calls can exceed the default ~60s proxy timeout → browser shows 504.
    timeout: 180000,
    proxyTimeout: 180000,
  })
);

app.use(
  "/api/deepseek",
  createProxyMiddleware({
    target: DEEPSEEK_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/deepseek${path}`,
    timeout: 180000,
    proxyTimeout: 180000,
  })
);

app.use(
  createProxyMiddleware({
    target: COGNITIVE_LOAD_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith("/api/cognitive-load"),
    pathRewrite: (path) => path.replace(/^\/api\/cognitive-load/, ""),
  })
);

app.use(
  createProxyMiddleware({
    target: RESOURCE_UPLOAD_URL,
    changeOrigin: true,
    timeout: 180000,
    proxyTimeout: 180000,
    pathFilter: (pathname) =>
      pathname === "/api/public/courses" ||
      pathname.startsWith("/api/public/courses/"),
    pathRewrite: (path) =>
      path.replace(/^\/api\/public\/courses/, "/public/courses"),
    on: {
      proxyReq: (proxyReq) => {
        if (GATEWAY_SHARED_SECRET) {
          proxyReq.setHeader("x-gateway-secret", GATEWAY_SHARED_SECRET);
        }
      },
      proxyRes: (proxyRes, req) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
          proxyRes.headers["access-control-allow-origin"] = origin;
          proxyRes.headers["access-control-allow-credentials"] = "true";
          proxyRes.headers["access-control-expose-headers"] =
            "Content-Disposition, Content-Type, Content-Length";
        }
      },
    },
  })
);

// http-proxy-middleware v3 uses pathFilter (not filter). A missing pathFilter
// defaults to "/" and would match every request, breaking /api/sections routing.
app.use(
  createProxyMiddleware({
    target: RESOURCE_UPLOAD_URL,
    changeOrigin: true,
    pathFilter: (pathname) =>
      pathname === "/api/courses" || pathname.startsWith("/api/courses/"),
    pathRewrite: (path) => path.replace(/^\/api\/courses/, "/courses"),
    on: {
      proxyReq: (proxyReq) => {
        if (GATEWAY_SHARED_SECRET) {
          proxyReq.setHeader("x-gateway-secret", GATEWAY_SHARED_SECRET);
        }
      },
    },
  })
);

app.use(
  createProxyMiddleware({
    target: RESOURCE_UPLOAD_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith("/api/push"),
    pathRewrite: (path) => path.replace(/^\/api\/push/, "/push"),
    on: {
      proxyReq: (proxyReq) => {
        if (GATEWAY_SHARED_SECRET) {
          proxyReq.setHeader("x-gateway-secret", GATEWAY_SHARED_SECRET);
        }
      },
    },
  })
);

app.use(
  createProxyMiddleware({
    target: RESOURCE_UPLOAD_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith("/api/sections"),
    pathRewrite: (path) => path.replace(/^\/api\/sections/, "/sections"),
    timeout: 180000,
    proxyTimeout: 180000,
    on: {
      proxyReq: (proxyReq) => {
        if (GATEWAY_SHARED_SECRET) {
          proxyReq.setHeader("x-gateway-secret", GATEWAY_SHARED_SECRET);
        }
      },
    },
  })
);

app.use(
  "/files",
  createProxyMiddleware({
    target: RESOURCE_UPLOAD_URL,
    changeOrigin: true,
  })
);

app.use(
  "/api/explainable",
  createProxyMiddleware({
    target: EXPLAINABLE_AI_BACKEND_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  })
);

app.use(
  "/api/lime-ai",
  createProxyMiddleware({
    target: LIME_AI_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  })
);

app.use(
  "/api/shap-ai",
  createProxyMiddleware({
    target: SHAP_AI_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  })
);

app.use(
  "/api/cognitive-style-ai",
  createProxyMiddleware({
    target: COGNITIVE_STYLE_AI_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  })
);

app.use(
  "/api/next-lesson-recommendation",
  createProxyMiddleware({
    target: NEXT_LESSON_RECOMMENDATION_URL,
    changeOrigin: true,
    pathRewrite: (path) =>
      path.replace(/^\/api\/next-lesson-recommendation/, ""),
  })
);

app.use(
  "/api/exam",
  createProxyMiddleware({
    target: BACKEND_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/exam${path}`,
  })
);

app.use(
  "/cognitive-style",
  createProxyMiddleware({
    target: "http://localhost:8003",
    changeOrigin: true,
    pathRewrite: (path) => path.replace(/^\/cognitive-style/, ""),
  })
);



app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
