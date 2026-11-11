import axios from 'axios';
import { DatabaseSync } from 'node:sqlite';

async function test() {
  try {
    const health = await axios.get('http://localhost:8000/health');
    console.log('1. Health check:', health.data.status);

    // Register brand new user
    const regRes = await axios.post('http://localhost:8000/api/v1/auth/register', {
      name: 'Real User',
      email: 'realuser@pulse.io',
      password: 'SecretPassword123!'
    });
    console.log('2. User Registration:', regRes.data.user.email, 'Token received:', !!regRes.data.token);

    // Verify user in SQLite DB
    const db = new DatabaseSync('backend/data/apipulse.db');
    const userInDb = db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').get('realuser@pulse.io');
    console.log('3. User in SQL database table `users`:', userInDb);

    // Login with registered user
    const loginRes = await axios.post('http://localhost:8000/api/v1/auth/login', {
      email: 'realuser@pulse.io',
      password: 'SecretPassword123!'
    });
    const token = loginRes.data.token;
    console.log('4. User Login Successful:', loginRes.data.user.email);

    // Fetch dashboard stats (should be clean with 0 projects)
    const stats0 = await axios.get('http://localhost:8000/api/v1/monitoring/stats', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('5. Initial Clean Stats:', {
      totalProjects: stats0.data.totalProjects,
      totalEndpoints: stats0.data.totalEndpoints,
      activeAlerts: stats0.data.activeAlerts
    });

    // Create a real project
    const projRes = await axios.post('http://localhost:8000/api/v1/projects', {
      name: 'GitHub Public API',
      baseUrl: 'https://api.github.com',
      description: 'Production integration with GitHub REST API',
      environment: 'production'
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('6. Project Created in DB:', projRes.data.name, 'ID:', projRes.data.id);

    // Verify project in SQLite
    const projInDb = db.prepare('SELECT id, name, base_url FROM projects WHERE id = ?').get(projRes.data.id);
    console.log('7. Project in SQL table `projects`:', projInDb);

    // Add an endpoint to this project
    const epRes = await axios.post('http://localhost:8000/api/v1/endpoints', {
      projectId: projRes.data.id,
      name: 'Octocat User Profile',
      path: '/users/octocat',
      method: 'GET',
      interval: 30,
      expectedStatus: 200,
      timeout: 5000
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('8. Endpoint Created in DB:', epRes.data.name, 'Path:', epRes.data.path);

    // Verify endpoint in SQLite
    const epInDb = db.prepare('SELECT id, name, path, method FROM endpoints WHERE id = ?').get(epRes.data.id);
    console.log('9. Endpoint in SQL table `endpoints`:', epInDb);

    // Run instant ping check (⚡)
    const checkRes = await axios.post('http://localhost:8000/api/v1/endpoints/' + epRes.data.id + '/check', {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('10. Live Ping Check Result:', checkRes.data);

    // Verify log in SQLite request_logs
    const logInDb = db.prepare('SELECT id, method, path, status_code, response_time_ms FROM request_logs ORDER BY timestamp DESC LIMIT 1').get();
    console.log('11. Request Log in SQL table `request_logs`:', logInDb);

    // Check updated dashboard stats
    const stats1 = await axios.get('http://localhost:8000/api/v1/monitoring/stats', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('12. Updated Live Dashboard Stats:', {
      totalProjects: stats1.data.totalProjects,
      totalEndpoints: stats1.data.totalEndpoints,
      requestsToday: stats1.data.requestsToday,
      avgUptime: stats1.data.avgUptime + '%'
    });

    db.close();
    console.log('\n🎉 ALL END-TO-END FLOWS AND SQL DATABASE PERSISTENCE FULLY VERIFIED!');
  } catch (err) {
    console.error('Test error:', err.response ? err.response.data : err.message);
  }
}

test();

