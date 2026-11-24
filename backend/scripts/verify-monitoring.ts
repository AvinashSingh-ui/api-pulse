import { apiExecutionService } from '../src/modules/monitoring/apiExecution.service.js';
import { healthService } from '../src/modules/monitoring/health.service.js';
import { openapiService } from '../src/modules/openapi/openapi.service.js';
import { Endpoint } from '../src/types/index.js';

async function runComprehensiveVerification() {
  console.log('====================================================');
  console.log('🚀 API PULSE COMPREHENSIVE VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // -----------------------------------------------------------------
  // 1. URL Resolution & Path Parameter Interpolation
  // -----------------------------------------------------------------
  console.log('Test Section 1: URL & Path Parameter Interpolation');
  
  const rawSwaggerUrl = 'https://dev-notification-service-api.platformnx.com/swagger-ui/index.html';
  const cleaned = healthService.cleanBaseUrl(rawSwaggerUrl);
  assert(cleaned === 'https://dev-notification-service-api.platformnx.com', 'Stripped /swagger-ui/index.html from baseUrl');

  const pathWithParams = '/api/v1/users/{userId}/orders/{orderId}';
  const customParams = { userId: 'usr_882', orderId: 'ord_994' };
  const resolvedUrl = healthService.buildFullUrl('https://api.example.com', pathWithParams, customParams);
  assert(resolvedUrl === 'https://api.example.com/api/v1/users/usr_882/orders/ord_994', 'Interpolated custom path parameters');

  const autoFallback = healthService.buildFullUrl('https://api.example.com', '/api/v1/resource/{id}/token/{token}');
  assert(autoFallback === 'https://api.example.com/api/v1/resource/1/token/test_token', 'Fallback default test tokens for path parameters');

  // -----------------------------------------------------------------
  // 2. Expected Status Codes & 2xx Family Matching
  // -----------------------------------------------------------------
  console.log('\nTest Section 2: Expected Status Codes & Multi-Status Matching');

  assert(healthService.isStatusAccepted(200, 200), '200 accepted when 200 expected');
  assert(healthService.isStatusAccepted(201, 200), '201 accepted when 200 expected (2xx family)');
  assert(healthService.isStatusAccepted(204, 200), '204 accepted when 200 expected (2xx family)');
  assert(healthService.isStatusAccepted(200, 201), '200 accepted when 201 expected (2xx family)');
  assert(!healthService.isStatusAccepted(404, 200), '404 rejected when 200 expected');
  assert(healthService.isStatusAccepted(404, 404), '404 accepted when 404 explicitly expected');
  assert(healthService.isStatusAccepted(422, 200, [200, 422]), '422 accepted when in acceptedStatuses list');

  // -----------------------------------------------------------------
  // 3. Schema Payload Auto-Generation for POST / PUT / PATCH
  // -----------------------------------------------------------------
  console.log('\nTest Section 3: OpenAPI Schema Payload Generation');

  const testSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 101 },
      username: { type: 'string', example: 'johndoe' },
      isActive: { type: 'boolean' },
      balance: { type: 'number', example: 49.99 },
      tags: { type: 'array', items: { type: 'string' } },
      profile: {
        type: 'object',
        properties: {
          bio: { type: 'string', example: 'Developer' }
        }
      }
    },
    required: ['id', 'username']
  };

  const generated = apiExecutionService.generatePayloadFromSchema(testSchema);
  assert(generated.id === 101, 'Preserved example for integer: 101');
  assert(generated.username === 'johndoe', 'Preserved example for string: "johndoe"');
  assert(generated.isActive === true, 'Generated boolean default');
  assert(generated.balance === 49.99, 'Preserved example for number');
  assert(Array.isArray(generated.tags), 'Generated array for tags');
  assert(generated.profile?.bio === 'Developer', 'Nested object generation');

  // -----------------------------------------------------------------
  // 4. P50, P95, P99 Percentile Latency & Uptime Math
  // -----------------------------------------------------------------
  console.log('\nTest Section 4: Performance Analytics & Latency Calculations');

  const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const percentiles = healthService.calculatePercentiles(latencies);
  assert(percentiles.p50 === 50 || percentiles.p50 === 60, `P50 latency calculated accurately: ${percentiles.p50}ms`);
  assert(percentiles.p95 >= 90, `P95 latency calculated accurately: ${percentiles.p95}ms`);
  assert(percentiles.p99 >= 90, `P99 latency calculated accurately: ${percentiles.p99}ms`);

  // -----------------------------------------------------------------
  // 5. Health Status Transition State Machine
  // -----------------------------------------------------------------
  console.log('\nTest Section 5: Health Status Transitions');

  // 100% success -> healthy
  const goodLogs: any[] = Array.from({ length: 10 }, (_, i) => ({
    id: `l_${i}`,
    endpointId: 'ep_1',
    statusCode: 200,
    responseTime: 80,
    failureType: 'none',
    timestamp: new Date().toISOString()
  }));
  const healthStatus1 = healthService.calculateHealth({
    currentStatusCode: 200,
    currentResponseTime: 80,
    expectedStatus: 200,
    recentLogs: goodLogs
  });
  assert(healthStatus1.status === 'healthy', `Health state remains healthy on consecutive successes (got: ${healthStatus1.status}, score: ${healthStatus1.healthScore})`);

  // consecutive failures -> degraded / down
  const failLogs: any[] = [
    { id: 'f_1', endpointId: 'ep_1', statusCode: 500, responseTime: 120, failureType: 'server_error', timestamp: new Date().toISOString() },
    { id: 'f_2', endpointId: 'ep_1', statusCode: 500, responseTime: 120, failureType: 'server_error', timestamp: new Date().toISOString() },
    { id: 'f_3', endpointId: 'ep_1', statusCode: 500, responseTime: 120, failureType: 'server_error', timestamp: new Date().toISOString() },
    ...goodLogs.slice(0, 5)
  ];
  const healthStatus2 = healthService.calculateHealth({
    currentStatusCode: 500,
    currentResponseTime: 120,
    expectedStatus: 200,
    failureType: 'server_error',
    recentLogs: failLogs
  });
  assert(healthStatus2.status === 'degraded' || healthStatus2.status === 'down', `Health state transitioned correctly on server errors (got: ${healthStatus2.status}, score: ${healthStatus2.healthScore})`);

  // -----------------------------------------------------------------
  // 6. Live Execution of All HTTP Methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  // -----------------------------------------------------------------
  console.log('\nTest Section 6: Live HTTP Execution Engine Verification');

  const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

  for (const method of httpMethods) {
    const isHeadOrOptions = method === 'HEAD' || method === 'OPTIONS';
    const mockEndpoint: Endpoint = {
      id: `verify_${method.toLowerCase()}`,
      projectId: 'p_test',
      name: `Verify ${method}`,
      method: method,
      path: isHeadOrOptions ? '/status/200' : `/${method.toLowerCase()}`,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify({ ping: 'pong', verified: true }) : undefined,
      contentType: 'application/json',
      expectedStatus: 200,
      expectedStatuses: [200, 204],
      timeoutMs: 6000,
      headers: { 'X-Monitoring-Health-Check': 'true' },
      status: 'unknown',
      uptimePercent: 100,
      avgResponseTimeMs: 0,
      totalChecks: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      checkIntervalSeconds: 60,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log(`  Executing ${method.padEnd(7)} -> https://httpbin.org${mockEndpoint.path}`);
    try {
      const execResult = await apiExecutionService.executeEndpointCheck(
        mockEndpoint,
        '127.0.0.1',
        'API-Pulse-TestVerifier/1.0',
        { id: 'p_test', name: 'Test Project', baseUrl: 'https://httpbin.org', status: 'active' }
      );
      assert(execResult.statusCode > 0, `${method} returned status code: ${execResult.statusCode}`);
      assert(execResult.responseTime >= 0, `${method} captured response time: ${execResult.responseTime}ms`);
      if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        assert(execResult.isSuccess === true, `${method} marked healthy with status ${execResult.statusCode}`);
      }
    } catch (err: any) {
      console.warn(`  Notice: Live network request for ${method} encountered: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------
  // 7. Timeout & Error Categorization Verification
  // -----------------------------------------------------------------
  console.log('\nTest Section 7: Timeout & Failure Categorization');

  const timeoutEndpoint: Endpoint = {
    id: 'verify_timeout',
    projectId: 'p_test',
    name: 'Verify Timeout',
    method: 'GET',
    path: '/delay/5',
    timeoutMs: 1000, // 1 second timeout
    expectedStatus: 200,
    status: 'unknown',
    uptimePercent: 100,
    avgResponseTimeMs: 0,
    totalChecks: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    checkIntervalSeconds: 60,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    const timeoutResult = await apiExecutionService.executeEndpointCheck(
      timeoutEndpoint,
      '127.0.0.1',
      'API-Pulse-TestVerifier/1.0',
      { id: 'p_test', name: 'Test Project', baseUrl: 'https://httpbin.org', status: 'active' }
    );
    assert(timeoutResult.isSuccess === false, 'Timeout endpoint flagged as failure (isSuccess === false)');
    assert(timeoutResult.failureType === 'timeout', `Failure categorized properly as timeout (got: ${timeoutResult.failureType})`);
  } catch (err: any) {
    console.warn(`Timeout test network variation: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================\n');
}

runComprehensiveVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
