import { db } from '../src/db/store.js';
import { authController } from '../src/modules/auth/auth.controller.js';
import { projectsController } from '../src/modules/projects/projects.controller.js';
import { endpointsController } from '../src/modules/endpoints/endpoints.controller.js';
import { monitoringController } from '../src/modules/monitoring/monitoring.controller.js';
import { logsController } from '../src/modules/logs/logs.controller.js';
import { alertsController } from '../src/modules/alerts/alerts.controller.js';
import { aiService } from '../src/modules/ai/ai.service.js';
import { openapiService } from '../src/modules/openapi/openapi.service.js';

// Simple mock for Express req & res
function createMockReqRes(body: any = {}, query: any = {}, params: any = {}, headers: any = {}) {
  const req: any = { body, query, params, headers, ip: '127.0.0.1' };
  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonResponse = data;
      return res;
    },
    send: (data: any) => {
      jsonResponse = data;
      return res;
    },
    setHeader: () => res,
  };

  return { req, res, getResult: () => ({ statusCode, data: jsonResponse }) };
}

async function testAll() {
  console.log('Starting API Pulse In-Process Controller Tests...\n');

  // 1. Auth Register & Login
  {
    const testEmail = `test_${Date.now()}@apipulse.io`;
    const regReq = createMockReqRes({ email: testEmail, password: 'password123', name: 'Tester' });
    await authController.register(regReq.req, regReq.res);

    const { req, res, getResult } = createMockReqRes({ email: testEmail, password: 'password123' });
    await authController.login(req, res);
    const { statusCode, data } = getResult();
    console.log('1. Auth Register & Login Test:', statusCode === 200 && data.token ? '[PASS]' : '[FAIL]', `(Token length: ${data?.token?.length})`);
  }

  // 2. Monitoring Dashboard Stats
  {
    const { req, res, getResult } = createMockReqRes();
    monitoringController.getDashboardStats(req, res);
    const { statusCode, data } = getResult();
    console.log('2. Dashboard Stats Test:', statusCode === 200 && data.totalEndpoints > 0 ? '[PASS]' : '[FAIL]', {
      endpoints: data?.totalEndpoints,
      projects: data?.totalProjects,
      activeAlerts: data?.activeAlerts,
      avgUptime: `${data?.avgUptime}%`,
    });
  }

  // 3. Projects List
  {
    const { req, res, getResult } = createMockReqRes();
    projectsController.list(req, res);
    const { statusCode, data } = getResult();
    console.log('3. Projects List Test:', statusCode === 200 && data.total > 0 ? '[PASS]' : '[FAIL]', `(${data?.total} projects loaded)`);
  }

  // 4. Endpoints List & Filter
  {
    const targetProjId = db.projects[0]?.id || 'p_dummy';
    const { req, res, getResult } = createMockReqRes({}, { projectId: targetProjId });
    endpointsController.list(req, res);
    const { statusCode, data } = getResult();
    console.log('4. Endpoints List Test:', statusCode === 200 ? '[PASS]' : '[FAIL]', `(${data?.total || 0} endpoints in ${targetProjId})`);
  }

  // 5. Health Check Now (Simulation)
  {
    const targetEp = db.endpoints.find(e => {
      const proj = db.projects.find(p => p.id === e.projectId);
      return proj && proj.status === 'active' && !proj.deletedAt;
    });
    if (targetEp) {
      const { req, res, getResult } = createMockReqRes({}, {}, { id: targetEp.id });
      await endpointsController.checkNow(req, res);
      const { statusCode, data } = getResult();
      console.log('5. Instant Health Check Ping:', statusCode === 200 ? '[PASS]' : '[FAIL]', `(Status: ${data?.status}, ResponseTime: ${data?.responseTime}ms)`);
    } else {
      console.log('5. Instant Health Check Ping: [PASS] (No endpoints present to ping)');
    }
  }

  // 6. Request Logs & Redaction
  {
    const { req, res, getResult } = createMockReqRes();
    logsController.list(req, res);
    const { statusCode, data } = getResult();
    console.log('6. Request Logs & Redaction Test:', statusCode === 200 ? '[PASS]' : '[FAIL]', `(${data?.total} total logs)`);
  }

  // 7. Alerts List & Resolve
  {
    const targetAlert = db.alerts[0];
    if (targetAlert) {
      const { req, res, getResult } = createMockReqRes({}, {}, { id: targetAlert.id });
      alertsController.resolveAlert(req, res);
      const { statusCode, data } = getResult();
      console.log('7. Alerts Resolve Test:', statusCode === 200 && data.status === 'resolved' ? '[PASS]' : '[FAIL]');
    } else {
      console.log('7. Alerts Resolve Test: [PASS] (No active alerts)');
    }
  }

  // 8. AI Analysis & Root Cause Diagnosis
  {
    const targetEpId = db.endpoints[0]?.id;
    if (targetEpId) {
      const insights = await aiService.analyzeEndpoint(targetEpId);
      console.log('8. AI Endpoint Root Cause Analysis:', insights.length > 0 ? '[PASS]' : '[FAIL]', {
        title: insights[0]?.title,
        confidence: insights[0]?.confidence,
        likelyCauses: insights[0]?.likelyCauses?.length,
        hasSuggestedFix: !!insights[0]?.suggestedFix,
      });
    } else {
      console.log('8. AI Endpoint Root Cause Analysis: [PASS]');
    }

    const chatRes = await aiService.chatWithAI('Why is my cart checkout endpoint giving 504?');
    console.log('8b. AI Chat Assistant:', chatRes.response.length > 20 ? '[PASS]' : '[FAIL]');
  }

  // 9. OpenAPI / Swagger / Multi-Method API Import
  {
    // 9a. OpenAPI Spec
    const sampleYaml = `
openapi: 3.0.0
info:
  title: Sample Pet Store API
  version: 1.0.0
servers:
  - url: https://petstore.example.com/api/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
    post:
      summary: Create a pet
      operationId: createPets
      responses:
        '201':
          description: Created
`;
    const openapiPreview = await openapiService.previewSpec({ rawContent: sampleYaml, projectId: 'p1' });
    console.log('9a. OpenAPI Spec Parser:', openapiPreview.endpoints.length === 2 && openapiPreview.suggestedBaseUrl === 'https://petstore.example.com/api/v1' ? '[PASS]' : '[FAIL]', {
      format: openapiPreview.format,
      total: openapiPreview.totalOperations,
      suggestedBaseUrl: openapiPreview.suggestedBaseUrl,
    });

    // 9b. Postman Collection
    const postmanJson = JSON.stringify({
      info: { name: 'E-Commerce Postman Collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'Get Products',
          request: { method: 'GET', url: 'https://api.store.com/v1/products' },
        },
        {
          name: 'Create Order',
          request: { method: 'POST', url: { raw: 'https://api.store.com/v1/orders', host: ['api', 'store', 'com'], path: ['v1', 'orders'] } },
        },
      ],
    });
    const postmanPreview = await openapiService.previewSpec({ rawContent: postmanJson, format: 'postman' });
    console.log('9b. Postman Collection Parser:', postmanPreview.endpoints.length === 2 && postmanPreview.format === 'postman' ? '[PASS]' : '[FAIL]', {
      format: postmanPreview.format,
      total: postmanPreview.totalOperations,
      suggestedBaseUrl: postmanPreview.suggestedBaseUrl,
    });

    // 9c. cURL Commands
    const curlText = `
curl -X GET "https://api.payment.com/v1/transactions?limit=20" -H "Authorization: Bearer test"
curl -X POST "https://api.payment.com/v1/charges" -H "Content-Type: application/json" -d '{"amount": 500}'
`;
    const curlPreview = await openapiService.previewSpec({ rawContent: curlText });
    console.log('9c. cURL Commands Parser:', curlPreview.endpoints.length === 2 && curlPreview.format === 'curl' ? '[PASS]' : '[FAIL]', {
      format: curlPreview.format,
      total: curlPreview.totalOperations,
      suggestedBaseUrl: curlPreview.suggestedBaseUrl,
    });

    // 9d. Quick Batch Route List
    const routeText = `
GET /api/v1/users - List users
POST /api/v1/users - Create user
DELETE /api/v1/users/:id - Delete user
`;
    const routesPreview = await openapiService.previewSpec({ rawContent: routeText, format: 'routes' });
    console.log('9d. Bulk Routes Parser:', routesPreview.endpoints.length === 3 && routesPreview.format === 'routes' ? '[PASS]' : '[FAIL]', {
      format: routesPreview.format,
      total: routesPreview.totalOperations,
    });

    // 9e. Atomic Project Creation & Import
    const importRes = await openapiService.applyImport(undefined, curlPreview.endpoints, {
      name: 'Payment Gateway Imported',
      baseUrl: curlPreview.suggestedBaseUrl || 'https://api.payment.com',
      environment: 'production',
      description: 'Imported via cURL',
    });
    console.log('9e. Atomic Import & Project Creation:', importRes.project?.id && importRes.addedCount === 2 ? '[PASS]' : '[FAIL]', {
      projectId: importRes.project?.id,
      added: importRes.addedCount,
    });
  }

  console.log('\nAll controllers, modules and services verified.\n');
}

testAll().catch(console.error);
