import { db } from '../src/db/store.js';
import { healthService } from '../src/modules/monitoring/health.service.js';
import { projectsController } from '../src/modules/projects/projects.controller.js';
import { endpointsController } from '../src/modules/endpoints/endpoints.controller.js';
import { monitoringController } from '../src/modules/monitoring/monitoring.controller.js';

function createMockReqRes(user: any = null, body: any = {}, query: any = {}, params: any = {}) {
  const req: any = { user, body, query, params, headers: {}, ip: '127.0.0.1' };
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

async function runTestSuite() {
  console.log('🧪 Starting API Pulse Endpoints & Health Scoring Automated Test Suite...\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    total++;
    if (condition) {
      console.log(`✅ [PASS ${total}] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL ${total}] ${testName}`, details || '');
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  const testUser = {
    id: 'user_endpoints_tester_' + Date.now(),
    email: 'tester@pulse.io',
    name: 'Endpoint Tester',
    role: 'admin',
  };

  // ==========================================
  // SECTION 1: URL Construction & Validation
  // ==========================================
  console.log('--- SECTION 1: URL Construction & Validation ---');

  // Test 1: Clean joining with trailing slash on base URL and leading slash on path
  const url1 = healthService.buildFullUrl('https://httpbin.org/', '/get');
  assert(url1 === 'https://httpbin.org/get', 'Base URL with trailing slash + leading slash path: https://httpbin.org/get');

  // Test 2: Clean joining without trailing slash on base URL and without leading slash on path
  const url2 = healthService.buildFullUrl('https://httpbin.org', 'get');
  assert(url2 === 'https://httpbin.org/get', 'Base URL without trailing slash + path without leading slash: https://httpbin.org/get');

  // Test 3: Multiple slashes normalized
  const url3 = healthService.buildFullUrl('https://httpbin.org///', '///status/200');
  assert(url3 === 'https://httpbin.org/status/200', 'Multiple slashes normalized: https://httpbin.org/status/200');

  // Test 4: Validate valid URL
  const val1 = healthService.validateEndpointUrl('https://httpbin.org', '/api/v1/users');
  assert(val1.isValid && val1.fullUrl === 'https://httpbin.org/api/v1/users', 'Valid endpoint URL passes validation');

  // Test 5: Reject invalid whitespace characters in path
  const val2 = healthService.validateEndpointUrl('https://httpbin.org', '/api/v1/user path with spaces');
  assert(!val2.isValid, 'Path containing illegal whitespace rejected');

  // Test 6: Reject non-http protocols
  const val3 = healthService.validateEndpointUrl('ftp://files.example.com', '/file.txt');
  assert(!val3.isValid, 'Non-HTTP protocol rejected');

  // ==========================================
  // SECTION 2: Project & Endpoint Registration
  // ==========================================
  console.log('\n--- SECTION 2: Project & Endpoint Registration ---');

  // Create Project
  const pReq = createMockReqRes(testUser, {
    name: 'Endpoints Test Project',
    baseUrl: 'https://httpbin.org/',
    environment: 'staging',
  });
  projectsController.create(pReq.req, pReq.res);
  const proj = pReq.getResult().data;
  assert(proj && proj.id, 'Project created with ID: ' + proj?.id);

  // Register Endpoint 1: Standard GET endpoint
  const epReq1 = createMockReqRes(testUser, {
    projectId: proj.id,
    name: 'Get User Data',
    path: '/get',
    method: 'GET',
    interval: 60,
    expectedStatus: 200,
    latencyThresholdMs: 400,
  });
  await endpointsController.create(epReq1.req, epReq1.res);
  const ep1 = epReq1.getResult().data;
  assert(ep1 && ep1.id, 'Endpoint 1 created with ID: ' + ep1?.id);
  assert(ep1.healthScore === 100, 'Initial healthScore is 100');
  assert(ep1.status === 'healthy', 'Initial status is healthy');

  // Test Duplicate Endpoint Prevention
  const dupReq = createMockReqRes(testUser, {
    projectId: proj.id,
    name: 'Duplicate Route',
    path: '/get',
    method: 'GET',
  });
  await endpointsController.create(dupReq.req, dupReq.res);
  const dupResult = dupReq.getResult();
  assert(dupResult.statusCode === 409, 'Duplicate endpoint (same method + path in same project) strictly rejected with HTTP 409 Conflict');

  // Register Endpoint 2: 500 Failure Route
  const epReq2 = createMockReqRes(testUser, {
    projectId: proj.id,
    name: 'Failing Internal Error Route',
    path: '/status/500',
    method: 'GET',
    expectedStatus: 200,
  });
  await endpointsController.create(epReq2.req, epReq2.res);
  const ep2 = epReq2.getResult().data;
  assert(ep2 && ep2.id, 'Endpoint 2 (500 Route) registered successfully');

  // ==========================================
  // SECTION 3: Real Percentile & Uptime Math
  // ==========================================
  console.log('\n--- SECTION 3: Percentiles & Uptime Calculations ---');

  const sampleLatencies = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 180, 200];
  const percentiles = healthService.calculatePercentiles(sampleLatencies);
  assert(percentiles.p50 === 95, 'P50 (median) accurately calculated: ' + percentiles.p50);
  assert(percentiles.p95 === 200, 'P95 accurately calculated: ' + percentiles.p95);

  const sampleLogs: any[] = [
    { statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 },
    { statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 }, { statusCode: 200 },
    { statusCode: 500 }, { statusCode: 200 },
  ];
  const calculatedUptime = healthService.calculateUptime(sampleLogs, 200);
  assert(calculatedUptime === 90.0, 'Uptime accurately calculated from actual logs: ' + calculatedUptime + '%');

  // ==========================================
  // SECTION 4: Health Scoring System Engine
  // ==========================================
  console.log('\n--- SECTION 4: Health Scoring System Scenarios ---');

  // Scenario A: Fast HTTP 200 (60ms, threshold 400ms)
  const healthA = healthService.calculateHealth({
    currentStatusCode: 200,
    currentResponseTime: 60,
    expectedStatus: 200,
    latencyThresholdMs: 400,
    failureType: 'none',
  });
  assert(healthA.healthScore === 100, 'Fast HTTP 200 yields Health Score: 100');
  assert(healthA.status === 'healthy', 'Status is Healthy');

  // Scenario B: Slow HTTP 200 (800ms, threshold 400ms)
  // Requirement: "A successful HTTP 200 response must not automatically mean the API is 100% healthy."
  const healthB = healthService.calculateHealth({
    currentStatusCode: 200,
    currentResponseTime: 800,
    expectedStatus: 200,
    latencyThresholdMs: 400,
    failureType: 'none',
  });
  assert(healthB.healthScore < 90 && healthB.healthScore >= 50, 'Slow HTTP 200 score dropped to Degraded range: ' + healthB.healthScore);
  assert(healthB.status === 'degraded', 'Status is Degraded due to high latency');
  assert(!!healthB.degradationReason && healthB.degradationReason.includes('latency'), 'Degradation reason explains high latency: ' + healthB.degradationReason);

  // Scenario C: Unexpected HTTP 404 (Expected 200)
  const healthC = healthService.calculateHealth({
    currentStatusCode: 404,
    currentResponseTime: 75,
    expectedStatus: 200,
    latencyThresholdMs: 500,
    failureType: 'unexpected_status',
  });
  assert(healthC.healthScore < 90, 'HTTP 404 drops Health Score: ' + healthC.healthScore);
  assert(healthC.status === 'degraded', 'HTTP 404 classifies as Degraded');
  assert(!!healthC.degradationReason && healthC.degradationReason.includes('404'), 'Degradation reason explains 404: ' + healthC.degradationReason);

  // Scenario D: HTTP 500 Internal Server Error
  const healthD = healthService.calculateHealth({
    currentStatusCode: 500,
    currentResponseTime: 120,
    expectedStatus: 200,
    latencyThresholdMs: 500,
    failureType: 'unexpected_status',
  });
  assert(healthD.healthScore < 50, 'HTTP 500 drops Health Score to Unhealthy range (< 50): ' + healthD.healthScore);
  assert(healthD.status === 'down', 'HTTP 500 classifies as Unhealthy/Down');
  assert(!!healthD.degradationReason && healthD.degradationReason.includes('500'), 'Degradation reason explains 500: ' + healthD.degradationReason);

  // Scenario E: Request Timeout
  const healthE = healthService.calculateHealth({
    currentStatusCode: 504,
    currentResponseTime: 5000,
    expectedStatus: 200,
    latencyThresholdMs: 500,
    failureType: 'timeout',
    timeout: 5000,
  });
  assert(healthE.healthScore < 50, 'Timeout drops Health Score to Unhealthy (< 50): ' + healthE.healthScore);
  assert(healthE.status === 'down', 'Timeout classifies as Unhealthy/Down');
  assert(!!healthE.degradationReason && healthE.degradationReason.includes('timed out'), 'Degradation reason explains timeout: ' + healthE.degradationReason);

  // Scenario F: Health Score Recovery
  const recoveryLogs: any[] = [
    { statusCode: 200, responseTime: 50 },
    { statusCode: 200, responseTime: 55 },
    { statusCode: 200, responseTime: 45 },
    { statusCode: 200, responseTime: 60 },
  ];
  const healthF = healthService.calculateHealth({
    currentStatusCode: 200,
    currentResponseTime: 48,
    expectedStatus: 200,
    latencyThresholdMs: 500,
    failureType: 'none',
    recentLogs: recoveryLogs,
  });
  assert(healthF.healthScore === 100, 'Consistent fast 200 checks recover Health Score to 100');
  assert(healthF.status === 'healthy', 'Status returns to Healthy upon recovery');

  // ==========================================
  // SECTION 5: Live Check & Controller Accuracy
  // ==========================================
  console.log('\n--- SECTION 5: Endpoints Controller CheckNow & Persistence ---');

  // Run Check on ep1 (valid /get)
  const checkReq1 = createMockReqRes(testUser, {}, {}, { id: ep1.id });
  await endpointsController.checkNow(checkReq1.req, checkReq1.res);
  const checkRes1 = checkReq1.getResult().data;
  assert(typeof checkRes1.healthScore === 'number', 'checkNow returns healthScore: ' + checkRes1.healthScore);
  assert(typeof checkRes1.responseTime === 'number', 'checkNow returns measured responseTime: ' + checkRes1.responseTime + 'ms');
  assert(typeof checkRes1.uptime === 'number', 'checkNow returns actual uptime: ' + checkRes1.uptime + '%');

  // Verify updated endpoint in memory store
  const updatedEp1 = db.endpoints.find(e => e.id === ep1.id);
  assert(updatedEp1?.lastStatusCode !== undefined, 'Endpoint lastStatusCode recorded: ' + updatedEp1?.lastStatusCode);
  assert(updatedEp1?.healthScore !== undefined, 'Endpoint healthScore recorded in store: ' + updatedEp1?.healthScore);

  // Run Check on ep2 (/status/500)
  const checkReq2 = createMockReqRes(testUser, {}, {}, { id: ep2.id });
  await endpointsController.checkNow(checkReq2.req, checkReq2.res);
  const checkRes2 = checkReq2.getResult().data;
  assert(checkRes2.status === 'down', 'checkNow on /status/500 sets status to down');
  assert(checkRes2.healthScore < 50, 'checkNow on /status/500 sets healthScore < 50: ' + checkRes2.healthScore);
  assert(!!checkRes2.degradationReason, 'checkNow sets degradationReason: ' + checkRes2.degradationReason);
  assert(!!checkRes2.alert, 'checkNow automatically raised Alert for failing endpoint');

  // ==========================================
  // SECTION 6: Dashboard Statistics Consistency
  // ==========================================
  console.log('\n--- SECTION 6: Dashboard Metrics Consistency ---');

  const dashReq = createMockReqRes(testUser);
  await monitoringController.getDashboardStats(dashReq.req, dashReq.res);
  const dashStats = dashReq.getResult().data;

  assert(typeof dashStats.avgHealthScore === 'number', 'Dashboard returns avgHealthScore: ' + dashStats.avgHealthScore);
  assert(typeof dashStats.avgAvailability === 'number', 'Dashboard returns avgAvailability: ' + dashStats.avgAvailability + '%');
  assert(typeof dashStats.avgUptime === 'number', 'Dashboard returns avgUptime: ' + dashStats.avgUptime + '%');
  assert(dashStats.totalEndpoints >= 2, 'Dashboard reflects active registered endpoints: ' + dashStats.totalEndpoints);

  // Cleanup: Delete test project
  projectsController.permanentDelete(createMockReqRes(testUser, {}, {}, { id: proj.id }).req, createMockReqRes().res);

  console.log(`\n==========================================`);
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log(`==========================================\n`);
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

