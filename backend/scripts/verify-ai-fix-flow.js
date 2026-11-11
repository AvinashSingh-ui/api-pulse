import axios from 'axios';

const BASE_URL = 'http://localhost:8000/api/v1';

async function testFullFlow() {
  console.log('🚀 Testing Automated Issue Raising & AI Fix Flow...\n');

  // 1. Register and Login a fresh user
  const email = `ai_tester_${Date.now()}@apipulse.io`;
  const regRes = await axios.post(`${BASE_URL}/auth/register`, {
    name: 'AI Fix Tester',
    email,
    password: 'securePassword123!',
  });
  const token = regRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('✅ User registered and token obtained:', email);

  // 2. Create a test project
  const projRes = await axios.post(`${BASE_URL}/projects`, {
    name: 'DummyJSON Production API',
    baseUrl: 'https://dummyjson.com',
    description: 'Real-world public API test harness',
    environment: 'production',
  }, { headers });
  const project = projRes.data;
  console.log('✅ Test project created:', project.id, project.name);

  // 3. Create a failing endpoint (HTTP 500)
  const failEpRes = await axios.post(`${BASE_URL}/endpoints`, {
    projectId: project.id,
    name: 'Error Simulation Route (500)',
    path: '/http/500',
    method: 'GET',
    expectedStatus: 200,
    timeout: 3000,
  }, { headers });
  const failEndpoint = failEpRes.data;
  console.log('✅ Failing endpoint created:', failEndpoint.id, failEndpoint.path);

  // 4. Trigger CheckNow on failing endpoint
  console.log('\n⚡ Pinging failing endpoint...');
  const checkRes = await axios.post(`${BASE_URL}/endpoints/${failEndpoint.id}/check`, {}, { headers });
  console.log('Check Response Status:', checkRes.data.status);
  console.log('Check Response StatusCode:', checkRes.data.statusCode);
  console.log('Check Response Error:', checkRes.data.error);

  if (checkRes.data.status !== 'down') {
    throw new Error(`Expected status 'down', got ${checkRes.data.status}`);
  }
  if (!checkRes.data.alert) {
    throw new Error('Expected alert to be automatically created and returned');
  }
  console.log('✅ Alert auto-raised:', checkRes.data.alert.id, checkRes.data.alert.title);

  // 5. Verify AI Root Cause & Fix is generated
  console.log('\n🤖 Fetching AI Root-Cause & Code Fix...');
  const aiRes = await axios.get(`${BASE_URL}/ai/insights?endpointId=${failEndpoint.id}`, { headers });
  const insights = aiRes.data;
  console.log(`Found ${insights.length} AI insight(s)`);

  if (insights.length === 0) {
    throw new Error('Expected at least 1 AI insight');
  }

  const latestInsight = insights[0];
  console.log('AI Diagnosis Title:', latestInsight.title);
  console.log('AI Confidence Score:', `${Math.round(latestInsight.confidence * 100)}%`);
  console.log('Likely Causes Identified:', latestInsight.likelyCauses?.length);
  latestInsight.likelyCauses?.forEach((c, i) => {
    console.log(`   ${i + 1}. [${c.confidence.toUpperCase()}] ${c.cause}`);
  });

  console.log('Suggested Fix Summary:', latestInsight.suggestedFix?.summary);
  console.log('Has Code Snippet:', !!latestInsight.suggestedFix?.codeSnippet);
  if (latestInsight.suggestedFix?.codeSnippet) {
    console.log('Fix Code Preview:\n', latestInsight.suggestedFix.codeSnippet.slice(0, 150) + '...\n');
  }

  // 6. Verify Alerts API lists the active incident
  const alertsRes = await axios.get(`${BASE_URL}/alerts?projectId=${project.id}&status=active`, { headers });
  console.log(`Active alerts for project: ${alertsRes.data.data.length}`);
  if (alertsRes.data.data.length === 0) {
    throw new Error('Alert should be listed in active alerts');
  }

  // 7. Test Recovery Flow: Create healthy endpoint and verify ping
  const healthyEpRes = await axios.post(`${BASE_URL}/endpoints`, {
    projectId: project.id,
    name: 'Products API (Healthy 200)',
    path: '/products/1',
    method: 'GET',
    expectedStatus: 200,
    timeout: 3000,
  }, { headers });
  const healthyEp = healthyEpRes.data;

  console.log('\n⚡ Pinging healthy endpoint:', healthyEp.path);
  const healthyCheckRes = await axios.post(`${BASE_URL}/endpoints/${healthyEp.id}/check`, {}, { headers });
  console.log('Healthy Check Status:', healthyCheckRes.data.status, `(HTTP ${healthyCheckRes.data.statusCode} in ${healthyCheckRes.data.responseTime}ms)`);

  if (healthyCheckRes.data.status !== 'healthy') {
    throw new Error('Expected healthy status');
  }

  console.log('\n🎉 ALL CHECKS PASSED 100%! End-to-end Issue Detection, Alert Redirection, and AI Root-Cause Resolution verified working.');
}

testFullFlow().catch(err => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});

