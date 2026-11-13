import { db } from '../src/db/store.js';
import { projectsController } from '../src/modules/projects/projects.controller.js';
import { endpointsController } from '../src/modules/endpoints/endpoints.controller.js';
import { monitoringController } from '../src/modules/monitoring/monitoring.controller.js';
import { scheduler } from '../src/modules/monitoring/scheduler.js';
import { alertsController } from '../src/modules/alerts/alerts.controller.js';

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

async function runTests() {
  console.log('🧪 Starting API Pulse Project Lifecycle & Dashboard Consistency Tests...\n');

  const testUser = {
    id: 'user_test_lifecycle_' + Date.now(),
    email: 'lifecycle@pulse.io',
    name: 'Lifecycle Tester',
    role: 'admin',
  };

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

  // 1. Initial State: Check dashboard stats when no active projects or clean state
  console.log('--- Step 1: Initial Dashboard Stats ---');
  const dashReq1 = createMockReqRes(testUser);
  await monitoringController.getDashboardStats(dashReq1.req, dashReq1.res);
  const initialStats = dashReq1.getResult().data;
  console.log('Initial stats (active projects count):', initialStats.totalProjects);
  assert(typeof initialStats.totalProjects === 'number', 'Dashboard returns valid numeric stats');

  // 2. Create a new project
  console.log('\n--- Step 2: Create Project ---');
  const createProjReq = createMockReqRes(testUser, {
    name: 'Lifecycle Test Project',
    baseUrl: 'https://httpbin.org',
    description: 'Project created for automated lifecycle testing',
    environment: 'staging',
  });
  projectsController.create(createProjReq.req, createProjReq.res);
  const createdProj = createProjReq.getResult().data;
  assert(createdProj && createdProj.id, 'Project created successfully with ID: ' + createdProj?.id);
  assert(createdProj.status === 'active', 'Project has active status');
  assert(!createdProj.deletedAt, 'Project has null/undefined deletedAt initially');

  // 3. Register an endpoint under the project
  console.log('\n--- Step 3: Register Endpoint ---');
  const createEpReq = createMockReqRes(testUser, {
    projectId: createdProj.id,
    name: 'Status 200 Endpoint',
    path: '/status/200',
    method: 'GET',
    intervalSeconds: 60,
  });
  endpointsController.create(createEpReq.req, createEpReq.res);
  const createdEp = createEpReq.getResult().data;
  assert(createdEp && createdEp.id, 'Endpoint registered successfully with ID: ' + createdEp?.id);
  assert(createdEp.projectId === createdProj.id, 'Endpoint associated with project');

  // 4. Create an alert rule and alert for the project
  console.log('\n--- Step 4: Add Alert & Request Log ---');
  const testAlertId = 'alert_test_' + Date.now();
  db.alerts.unshift({
    id: testAlertId,
    projectId: createdProj.id,
    endpointId: createdEp.id,
    title: 'High Latency Detected',
    message: 'Latency crossed 500ms threshold',
    severity: 'warning',
    status: 'active',
    createdAt: new Date().toISOString(),
    ruleId: 'rule_1',
  });
  db.logs.unshift({
    id: 'log_test_' + Date.now(),
    projectId: createdProj.id,
    endpointId: createdEp.id,
    timestamp: new Date().toISOString(),
    method: 'GET',
    path: '/status/200',
    statusCode: 200,
    responseTimeMs: 85,
    status: 'healthy',
  });
  assert(db.alerts.some(a => a.id === testAlertId), 'Alert added to DB');

  // 5. Verify Active Projects list contains project
  console.log('\n--- Step 5: Active Projects List ---');
  const activeReq = createMockReqRes(testUser, {}, { tab: 'active' });
  projectsController.list(activeReq.req, activeReq.res);
  const activeRes = activeReq.getResult().data;
  const activeList = Array.isArray(activeRes) ? activeRes : activeRes.data;
  assert(activeList.some((p: any) => p.id === createdProj.id), 'Project appears in Active Projects tab');

  // 6. Verify Dashboard stats include active project
  console.log('\n--- Step 6: Dashboard Stats with Active Project ---');
  const dashReq2 = createMockReqRes(testUser);
  await monitoringController.getDashboardStats(dashReq2.req, dashReq2.res);
  const activeStats = dashReq2.getResult().data;
  assert(activeStats.totalProjects >= 1, 'Dashboard stats include active project');
  assert(activeStats.totalEndpoints >= 1, 'Dashboard stats include active endpoint');
  assert(activeStats.activeAlerts >= 1, 'Dashboard stats include active alert');

  // 7. Soft Delete Project
  console.log('\n--- Step 7: Soft Delete Project ---');
  const deleteReq = createMockReqRes(testUser, {}, {}, { id: createdProj.id });
  projectsController.delete(deleteReq.req, deleteReq.res);
  const deleteResult = deleteReq.getResult().data;
  assert(deleteResult.success === true, 'Soft delete succeeded: ' + deleteResult.message);

  // 8. Verify Project is marked as deleted in DB
  const deletedProjInDb = db.projects.find(p => p.id === createdProj.id);
  assert(deletedProjInDb?.status === 'deleted', 'Project status updated to "deleted" in store');
  assert(typeof deletedProjInDb?.deletedAt === 'string', 'Project deletedAt timestamp recorded: ' + deletedProjInDb?.deletedAt);

  // 9. Verify Active Projects tab NO LONGER includes soft-deleted project
  console.log('\n--- Step 9: Active Projects Filtering ---');
  const activeReqAfterDel = createMockReqRes(testUser, {}, { tab: 'active' });
  projectsController.list(activeReqAfterDel.req, activeReqAfterDel.res);
  const activeResAfterDel = activeReqAfterDel.getResult().data;
  const activeListAfterDel = Array.isArray(activeResAfterDel) ? activeResAfterDel : activeResAfterDel.data;
  assert(!activeListAfterDel.some((p: any) => p.id === createdProj.id), 'Deleted project is NOT present in Active Projects list');

  // 10. Verify Project History tab INCLUDES soft-deleted project
  console.log('\n--- Step 10: Project History Tab ---');
  const historyReq = createMockReqRes(testUser, {}, { tab: 'history' });
  projectsController.list(historyReq.req, historyReq.res);
  const historyRes = historyReq.getResult().data;
  const historyList = Array.isArray(historyRes) ? historyRes : historyRes.data;
  const historyItem = historyList.find((p: any) => p.id === createdProj.id);
  assert(!!historyItem, 'Deleted project appears in Project History tab');
  assert(historyItem.status === 'deleted', 'History item status is "deleted"');
  assert(!!historyItem.deletedAt, 'History item displays deletedAt date');
  assert(typeof historyItem.endpointCount === 'number', 'History item includes associated endpoint count');

  // 11. Verify Endpoints list excludes endpoints from deleted project
  console.log('\n--- Step 11: Endpoints Controller Filtering ---');
  const epListReq = createMockReqRes(testUser, {}, { projectId: createdProj.id });
  endpointsController.list(epListReq.req, epListReq.res);
  const epListRes = epListReq.getResult().data;
  const epList = Array.isArray(epListRes) ? epListRes : (epListRes?.data || []);
  assert(epList.length === 0, 'Endpoints list returns empty for deleted project');

  // 12. Verify Scheduler skips endpoints of deleted project
  console.log('\n--- Step 12: Scheduler Exclusion ---');
  const deletedEp = db.endpoints.find(e => e.id === createdEp.id);
  assert(deletedEp?.status === 'paused', 'Endpoint status paused upon project deletion');

  // 13. Verify Dashboard stats recalculate and EXCLUDE deleted project
  console.log('\n--- Step 13: Dashboard Stats Excludes Deleted Project ---');
  const dashReq3 = createMockReqRes(testUser);
  await monitoringController.getDashboardStats(dashReq3.req, dashReq3.res);
  const statsAfterDel = dashReq3.getResult().data;
  assert(statsAfterDel.totalProjects === activeStats.totalProjects - 1, 'Dashboard totalProjects decreased by 1');
  assert(statsAfterDel.totalEndpoints === activeStats.totalEndpoints - 1, 'Dashboard totalEndpoints decreased by 1');
  console.log('Dashboard stats successfully recalculated to active-only records.');

  // 14. Restore Project
  console.log('\n--- Step 14: Restore Project ---');
  const restoreReq = createMockReqRes(testUser, {}, {}, { id: createdProj.id });
  projectsController.restore(restoreReq.req, restoreReq.res);
  const restoreResult = restoreReq.getResult().data;
  assert(restoreResult.success === true, 'Project restoration succeeded');
  assert(restoreResult.project.status === 'active', 'Restored project status returned to "active"');
  assert(restoreResult.project.deletedAt === null, 'Restored project deletedAt cleared to null');

  // 15. Verify Project returns to Active Projects tab
  console.log('\n--- Step 15: Verify Restoration in Active Projects ---');
  const activeReqAfterRestore = createMockReqRes(testUser, {}, { tab: 'active' });
  projectsController.list(activeReqAfterRestore.req, activeReqAfterRestore.res);
  const activeResAfterRestore = activeReqAfterRestore.getResult().data;
  const activeListAfterRestore = Array.isArray(activeResAfterRestore) ? activeResAfterRestore : activeResAfterRestore.data;
  assert(activeListAfterRestore.some((p: any) => p.id === createdProj.id), 'Restored project re-appears in Active Projects tab');

  // 16. Verify Endpoints are restored and active
  const restoredEp = db.endpoints.find(e => e.id === createdEp.id);
  assert(restoredEp?.status === 'healthy', 'Restored endpoint status reactivated to "healthy"');

  // 17. Permanent Deletion from History
  console.log('\n--- Step 17: Permanent Deletion ---');
  // Soft delete first so it is in history
  projectsController.delete(createMockReqRes(testUser, {}, {}, { id: createdProj.id }).req, createMockReqRes().res);
  
  // Now permanently delete
  const permDelReq = createMockReqRes(testUser, {}, {}, { id: createdProj.id });
  projectsController.permanentDelete(permDelReq.req, permDelReq.res);
  const permDelResult = permDelReq.getResult().data;
  assert(permDelResult.success === true, 'Permanent deletion succeeded: ' + permDelResult.message);

  // 18. Verify Complete Wipe and Cascading Removal
  console.log('\n--- Step 18: Verify Complete Wipe ---');
  assert(!db.projects.some(p => p.id === createdProj.id), 'Project permanently removed from store');
  assert(!db.endpoints.some(e => e.projectId === createdProj.id), 'Associated endpoints permanently removed');
  assert(!db.alerts.some(a => a.projectId === createdProj.id), 'Associated alerts permanently removed');
  assert(!db.logs.some(l => l.projectId === createdProj.id), 'Associated logs permanently removed');

  console.log(`\n==========================================`);
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log(`==========================================\n`);
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
