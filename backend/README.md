# 🚀 API Pulse – Backend Architecture & Server

> **Enterprise Intelligent API Observability & Monitoring Backend**  
> Engineered with Node.js, Express.js, TypeScript, OpenAPI 3.0, Background Health Scheduler, and AI Root-Cause Analysis.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js (v24+)
- **Framework:** Express.js (v4.21)
- **Language:** TypeScript 5.7 (Strict mode, ES2022)
- **Execution & Hot-Reload:** `tsx`
- **Documentation:** Swagger / OpenAPI 3.0 (`swagger-ui-express` at `/api/docs`)
- **Authentication:** JWT (JSON Web Tokens) with `bcryptjs` password hashing
- **Networking & Pings:** `axios`
- **Spec Parser:** `yaml` (YAML & JSON OpenAPI 3.0 / Swagger 2.0 parser)
- **AI Integration:** Google Gemini Live API integration + Intelligent Heuristic Root-Cause Analysis Engine

---

## 📁 Directory Structure
```text
c:/API_PULSE/backend/
├── src/
│   ├── index.ts                  # Server entry point & graceful shutdown
│   ├── app.ts                    # Express app configuration & middleware
│   ├── config/index.ts           # Environment variables & constants
│   ├── db/
│   │   └── store.ts              # In-memory + persisted JSON data store with seed data
│   ├── types/index.ts            # Strict TypeScript domain interfaces
│   ├── middlewares/
│   │   ├── auth.ts               # JWT authentication middleware
│   │   └── errorHandler.ts       # Global standardized error handler
│   ├── docs/
│   │   └── swagger.ts            # OpenAPI 3.0 specification
│   └── modules/
│       ├── auth/                 # Login, Register, Me, Refresh, Logout
│       ├── projects/             # Multi-project CRUD & stats sync
│       ├── endpoints/            # Route registration & Instant Ping (checkNow)
│       ├── monitoring/           # Dashboard KPIs, P50/P95 latencies, Scheduler
│       ├── logs/                 # Request logs & sensitive data redaction
│       ├── alerts/               # Alert threshold engine, Acknowledge & Resolve
│       ├── ai/                   # AI Root-Cause diagnosis & diagnostic chat
│       ├── testing/              # Automated test suites & assertion runner
│       └── openapi/              # OpenAPI/Swagger file/URL parser & Sync Plan
├── data/
│   └── database.json             # Seed and runtime database
├── test-controllers.ts           # End-to-end controller test suite
├── package.json
└── tsconfig.json
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Run in Development Mode (with Live Reload)
```bash
npm run dev
```
The server will start on:
- **API Base:** `http://localhost:8000/api/v1`
- **Swagger Documentation:** `http://localhost:8000/api/docs`
- **Health Check:** `http://localhost:8000/health`

### 3. Run Automated Tests
```bash
npm test
```

---

## 📡 API Endpoint Reference

| Module | Method | Route | Description |
|---|---|---|---|
| **Health** | `GET` | `/health` | Server uptime & health status |
| **Docs** | `GET` | `/api/docs` | Interactive Swagger UI API documentation |
| **Auth** | `POST` | `/api/v1/auth/login` | Authenticate with email & password |
| **Auth** | `POST` | `/api/v1/auth/register` | Register new team member |
| **Auth** | `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |
| **Projects** | `GET` | `/api/v1/projects` | List projects (with search & environment filter) |
| **Projects** | `POST` | `/api/v1/projects` | Create a new project |
| **Projects** | `PATCH` | `/api/v1/projects/:id` | Update project configurations |
| **Projects** | `DELETE` | `/api/v1/projects/:id` | Remove project & cascaded endpoints |
| **Endpoints** | `GET` | `/api/v1/endpoints` | List endpoints (filter by method, status, project) |
| **Endpoints** | `POST` | `/api/v1/endpoints` | Register a new monitored route |
| **Endpoints** | `POST` | `/api/v1/endpoints/:id/check` | Trigger instant ping / health check execution |
| **Monitoring** | `GET` | `/api/v1/monitoring/stats` | Dashboard KPI stats, needing attention routes |
| **Monitoring** | `GET` | `/api/v1/monitoring/endpoints/:id` | Endpoint latency & request volume timeseries |
| **Logs** | `GET` | `/api/v1/logs` | Query request logs with sensitive header redaction |
| **Logs** | `GET` | `/api/v1/logs/export` | Export logs as CSV or JSON |
| **Alerts** | `GET` | `/api/v1/alerts` | List active & historical incidents |
| **Alerts** | `POST` | `/api/v1/alerts/:id/resolve` | Mark incident as resolved |
| **AI** | `POST` | `/api/v1/ai/analyze/endpoint/:id` | AI Root-Cause Analysis with confidence levels |
| **AI** | `POST` | `/api/v1/ai/chat` | AI diagnostic chatbot |
| **Testing** | `POST` | `/api/v1/testing/cases/:id/run` | Execute assertions & test suite |
| **OpenAPI** | `POST` | `/api/v1/openapi/preview` | Parse YAML/JSON spec & preview sync plan |
| **OpenAPI** | `POST` | `/api/v1/openapi/import` | Bulk import endpoints into project |

