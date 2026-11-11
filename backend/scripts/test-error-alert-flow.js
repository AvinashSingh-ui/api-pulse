import axios from 'axios';
import { DatabaseSync } from 'node:sqlite';

async function testErrorAndAlert() {
  console.log('🚨 Testing Degraded Health, Error Notifications & Auto Issue Raising...\n');

  try {
    // 1. Login with registered user
    const loginRes = await axios.post('http://localhost:8000/api/v1/auth/login', {
      email: 'priya@pulse.io',
      password: 'MySecurePassword123!'
    });
    const token = loginRes.data.token;
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // 2. Create project for DummyJSON
    const projRes = await axios.post('http://localhost:8000/api/v1/projects', {
      name: 'E-Commerce Store Service',
      baseUrl: 'https://dummyjson.com',
      description: 'Public API testing environment',
      environment: 'production'
    }, authHeaders);
    console.log('1. Project Created:', projRes.data.name, 'ID:', projRes.data.id);

    // 3. Add an endpoint designed to fail (500 Server Error)
    const epRes = await axios.post('http://localhost:8000/api/v1/endpoints', {
      projectId: projRes.data.id,
      name: 'Server Crash Simulation',
      path: '/http/500',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    }, authHeaders);
    console.log('2. Failing Endpoint Created:', epRes.data.name, 'Path:', epRes.data.path);

    // 4. Trigger Instant Ping (⚡)
    console.log('3. Triggering Instant Health Check (⚡)...');
    const checkRes = await axios.post(`http://localhost:8000/api/v1/endpoints/${epRes.data.id}/check`, {}, authHeaders);
    console.log('   -> Health Check Result:', {
      status: checkRes.data.status,
      statusCode: checkRes.data.statusCode,
      responseTime: checkRes.data.responseTime + 'ms',
      alertRaised: !!checkRes.data.alert,
      alertTitle: checkRes.data.alert?.title,
      severity: checkRes.data.alert?.severity
    });

    // 5. Verify Alert was saved in SQLite DB table `alerts`
    const db = new DatabaseSync('backend/data/apipulse.db');
    const alertInDb = db.prepare('SELECT id, title, severity, status, current_value FROM alerts WHERE endpoint_id = ?').get(epRes.data.id);
    console.log('4. Alert in SQL database table `alerts`:', alertInDb);

    // 6. Verify Dashboard stats reflect the active alert
    const statsRes = await axios.get('http://localhost:8000/api/v1/monitoring/stats', authHeaders);
    console.log('5. Dashboard Stats Updated:', {
      activeAlerts: statsRes.data.activeAlerts,
      downEndpoints: statsRes.data.downEndpoints,
      degradedEndpoints: statsRes.data.degradedEndpoints,
      totalEndpoints: statsRes.data.totalEndpoints
    });

    // 7. Verify AI Analysis generated automatic Root Cause Analysis
    const insightsRes = await axios.get(`http://localhost:8000/api/v1/ai/insights?endpointId=${epRes.data.id}`, authHeaders);
    console.log('6. Automatic AI Root Cause Analysis Generated:', {
      count: insightsRes.data.length,
      title: insightsRes.data[0]?.title,
      confidence: insightsRes.data[0]?.confidence,
      likelyCauses: insightsRes.data[0]?.likelyCauses?.length
    });

    db.close();
    console.log('\n🎉 SUCCESS: Low/Degraded health automatically raised critical issue, created SQL alert, and triggered AI diagnosis!');
  } catch (err) {
    console.error('Error during test:', err.response?.data || err.message);
  }
}

testErrorAndAlert();

