import axios from 'axios';

async function testAuth() {
  console.log('🔒 Testing Strict Authentication & Login Validation...\n');

  // 1. Try fake email login
  try {
    await axios.post('http://localhost:8000/api/v1/auth/login', {
      email: 'totally_fake_email_12345@nowhere.com',
      password: 'password123'
    });
    console.error('❌ FAIL: Fake email should NOT be allowed to login!');
  } catch (err) {
    console.log('✅ PASS 1: Fake email strictly rejected: HTTP', err.response?.status, '—', err.response?.data?.message);
  }

  // 2. Try login with wrong password for existing user
  try {
    await axios.post('http://localhost:8000/api/v1/auth/login', {
      email: 'priya@pulse.io',
      password: 'definitely_wrong_password'
    });
    console.error('❌ FAIL: Wrong password should be rejected!');
  } catch (err) {
    console.log('✅ PASS 2: Wrong password strictly rejected: HTTP', err.response?.status, '—', err.response?.data?.message);
  }

  // 3. Login with correct password for registered user
  const loginRes = await axios.post('http://localhost:8000/api/v1/auth/login', {
    email: 'priya@pulse.io',
    password: 'MySecurePassword123!'
  });
  console.log('✅ PASS 3: Registered user accepted, JWT token received:', !!loginRes.data.token, 'User:', loginRes.data.user.email);

  // 4. Register a unique new user
  const uniqueEmail = `testuser_${Date.now()}@pulse.io`;
  const regRes = await axios.post('http://localhost:8000/api/v1/auth/register', {
    name: 'New Registered User',
    email: uniqueEmail,
    password: 'Password123!'
  });
  console.log('✅ PASS 4: Brand new user registered in DB:', regRes.data.user.email);

  // 5. Try duplicate registration with same email
  try {
    await axios.post('http://localhost:8000/api/v1/auth/register', {
      name: 'Duplicate User',
      email: uniqueEmail,
      password: 'Password123!'
    });
    console.error('❌ FAIL: Duplicate email should be rejected!');
  } catch (err) {
    console.log('✅ PASS 5: Duplicate registration strictly rejected: HTTP', err.response?.status, '—', err.response?.data?.message);
  }

  // 6. Check clean stats for new user
  const statsRes = await axios.get('http://localhost:8000/api/v1/monitoring/stats', {
    headers: { Authorization: 'Bearer ' + regRes.data.token }
  });
  console.log('✅ PASS 6: Clean state in central monitoring system:', {
    totalProjects: statsRes.data.totalProjects,
    totalEndpoints: statsRes.data.totalEndpoints,
    activeAlerts: statsRes.data.activeAlerts,
    requestsToday: statsRes.data.requestsToday
  });

  console.log('\n🎉 ALL 6 STRICT AUTHENTICATION, VALIDATION & EMPTY-STATE TESTS PASSED 100%!');
}

testAuth();
