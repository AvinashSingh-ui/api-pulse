import { db } from '../src/db/store.js';
import { authController } from '../src/modules/auth/auth.controller.js';
import { projectsController } from '../src/modules/projects/projects.controller.js';
import { endpointsController } from '../src/modules/endpoints/endpoints.controller.js';
import { alertsController } from '../src/modules/alerts/alerts.controller.js';
import { aiService } from '../src/modules/ai/ai.service.js';

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

async function verify() {
  console.log('🧪 Verifying Automated Alert Generation & AI Fix Flow In-Process...\n');

  // 1. Create a project
  const pReq = createMockReqRes({
    name: 'Real API Verification Project',
    baseUrl: 'https://dummyjson.com',
    description: 'Testing automatic alert raising and AI fixes',
  });
  projectsController.create(pReq.req, pReq.res);
  const proj = pReq.getResult().data;
  console.log('1. Project Created:', proj.id, proj.name);

  // 2. Create an endpoint that points to /http/500
  const epReq = createMockReqRes({
    projectId: proj.id,
    name: 'Failing 500 Route',
    path: '/http/500',
    method: 'GET',
    expectedStatus: 200,
    timeout: 3000,
  });
  endpointsController.create(epReq.req, epReq.res);
  const ep = epReq.getResult().data;
  console.log('2. Endpoint Created:', ep.id, ep.path);

  // 3. Ping the endpoint (checkNow)
  console.log('\n3. Pinging /http/500 endpoint...');
  const checkReq = createMockReqRes({}, {}, { id: ep.id });
  await endpointsController.checkNow(checkReq.req, checkReq.res);
  const checkResult = checkReq.getResult().data;

  console.log('   - Endpoint Status:', checkResult.status);
  console.log('   - HTTP Status Code:', checkResult.statusCode);
  console.log('   - Error Description:', checkResult.error);
  console.log('   - Auto-Raised Alert ID:', checkResult.alert?.id);
  console.log('   - Auto-Raised Alert Title:', checkResult.alert?.title);

  if (checkResult.status !== 'down') {
    throw new Error(`Expected status 'down', got ${checkResult.status}`);
  }
  if (!checkResult.alert) {
    throw new Error('Expected alert to be returned');
  }

  // 4. Verify AI Root-Cause & Code Fix
  console.log('\n4. Verifying AI Root-Cause Diagnosis & Suggested Code Fix...');
  const insights = await aiService.analyzeEndpoint(ep.id);
  const latestInsight = insights[0];

  console.log('   - AI Insight Title:', latestInsight?.title);
  console.log('   - Confidence Score:', `${Math.round((latestInsight?.confidence || 0) * 100)}%`);
  console.log('   - Likely Causes Count:', latestInsight?.likelyCauses?.length);
  latestInsight?.likelyCauses?.forEach((c, idx) => {
    console.log(`     ${idx + 1}. [${c.confidence.toUpperCase()}] ${c.cause}`);
  });
  console.log('   - Suggested Fix Summary:', latestInsight?.suggestedFix?.summary);
  console.log('   - Has Executable Code Snippet:', !!latestInsight?.suggestedFix?.codeSnippet);

  if (!latestInsight?.suggestedFix?.codeSnippet) {
    throw new Error('Expected suggestedFix with codeSnippet');
  }

  // 5. Verify Alert is in the Alerts list
  console.log('\n5. Verifying Alert in Alerts Controller...');
  const alertsReq = createMockReqRes({}, { projectId: proj.id, status: 'active' });
  alertsController.listAlerts(alertsReq.req, alertsReq.res);
  const activeAlerts = alertsReq.getResult().data;
  console.log('   - Active Alerts Count:', activeAlerts.data.length);
  const matchingAlert = activeAlerts.data.find((a: any) => a.endpointId === ep.id);
  console.log('   - Found Matching Alert:', matchingAlert ? 'YES' : 'NO', matchingAlert?.id);

  if (!matchingAlert) {
    throw new Error('Alert not found in active alerts');
  }

  console.log('\n🎉 ALL VERIFICATIONS PASSED! System automatically captures errors, creates real incidents, diagnoses root-causes with AI, and delivers actionable code fixes.');
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

