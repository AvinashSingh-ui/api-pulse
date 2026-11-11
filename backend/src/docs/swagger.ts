export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'API Pulse REST API',
    version: '1.0.0',
    description: 'Intelligent API Monitoring & Observability Platform Backend API',
    contact: {
      name: 'API Pulse Team',
      email: 'support@apipulse.io',
    },
  },
  servers: [
    {
      url: 'http://localhost:8000/api/v1',
      description: 'Local Development Server',
    },
  ],
  paths: {
    '/auth/login': {
      post: {
        summary: 'User Login',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@apipulse.io' },
                  password: { type: 'string', example: 'password' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Authenticated successfully with JWT' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/monitoring/stats': {
      get: {
        summary: 'Get Dashboard Overview Stats',
        tags: ['Monitoring'],
        responses: {
          200: { description: 'KPI counters, health breakdown, needing attention routes' },
        },
      },
    },
    '/projects': {
      get: {
        summary: 'List All Projects',
        tags: ['Projects'],
        responses: { 200: { description: 'Paginated list of projects' } },
      },
      post: {
        summary: 'Register New Project',
        tags: ['Projects'],
        responses: { 201: { description: 'Project created' } },
      },
    },
    '/endpoints': {
      get: {
        summary: 'List All Endpoints',
        tags: ['Endpoints'],
        responses: { 200: { description: 'Paginated list of endpoints' } },
      },
      post: {
        summary: 'Register Endpoint',
        tags: ['Endpoints'],
        responses: { 201: { description: 'Endpoint registered' } },
      },
    },
    '/endpoints/{id}/check': {
      post: {
        summary: 'Trigger Instant Health Check Ping',
        tags: ['Endpoints'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Health check result with measured latency' } },
      },
    },
    '/logs': {
      get: {
        summary: 'Query Request Logs',
        tags: ['Logs'],
        responses: { 200: { description: 'Paginated request and health check execution logs' } },
      },
    },
    '/alerts': {
      get: {
        summary: 'List Active and Historical Alerts',
        tags: ['Alerts'],
        responses: { 200: { description: 'Alert incidents' } },
      },
    },
    '/ai/chat': {
      post: {
        summary: 'Interactive AI Diagnostic Chat',
        tags: ['AI Analysis'],
        responses: { 200: { description: 'AI diagnostic explanation and suggested fixes' } },
      },
    },
    '/openapi/preview': {
      post: {
        summary: 'Preview and validate OpenAPI/Swagger Spec',
        tags: ['OpenAPI Import'],
        responses: { 200: { description: 'Parsed endpoints and sync diff plan' } },
      },
    },
  },
};

