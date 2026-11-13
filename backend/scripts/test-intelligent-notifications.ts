import { db } from '../src/db/store.js';
import { notificationService } from '../src/modules/notifications/notification.service.js';
import { notificationsController } from '../src/modules/notifications/notifications.controller.js';
import { monitoringController } from '../src/modules/monitoring/monitoring.controller.js';
import { projectsController } from '../src/modules/projects/projects.controller.js';
import { endpointsController } from '../src/modules/endpoints/endpoints.controller.js';

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
  console.log('🧪 Starting API Pulse Intelligent Alerts & Notification System Test Suite...\n');

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
    id: 'user_notif_tester_' + Date.now(),
    email: 'notif_tester@pulse.io',
    name: 'Notification Tester',
    role: 'admin',
  };

  // Step 0: Create a test project and endpoint
  console.log('--- SETUP: Project & Endpoint Initialization ---');
  const projectSetup = createMockReqRes(testUser, {
    name: 'Notification Alerts Test Project',
    baseUrl: 'https://httpbin.org',
    environment: 'production',
  });
  await projectsController.create(projectSetup.req, projectSetup.res);
  const project = projectSetup.getResult().data?.data || projectSetup.getResult().data;
  assert(project && project.id, 'Test project created successfully', project);

  const endpointSetup = createMockReqRes(testUser, {
    projectId: project.id,
    name: 'Status Test Route',
    path: '/status/200',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5000,
  });
  await endpointsController.create(endpointSetup.req, endpointSetup.res);
  const endpoint = endpointSetup.getResult().data?.data || endpointSetup.getResult().data;
  assert(endpoint && endpoint.id, 'Test endpoint created successfully', endpoint);

  // ==========================================
  // SECTION 1: Automatic API Health Detection & Alerts
  // ==========================================
  console.log('\n--- SECTION 1: Automatic API Health Detection & Alerts ---');

  // Test 1: Transition Healthy -> Degraded creates warning notification
  const warnNotif = notificationService.handleHealthTransition({
    endpoint,
    prevStatus: 'healthy',
    newStatus: 'degraded',
    statusCode: 200,
    responseTime: 950,
    healthScore: 70,
    degradationReason: 'High response latency (950ms > 500ms threshold)',
  });
  assert(warnNotif !== null, 'Warning notification created for Healthy -> Degraded transition', warnNotif);
  assert(warnNotif?.severity === 'warning', 'Notification severity is warning', warnNotif?.severity);
  assert(warnNotif?.type === 'degraded', 'Notification type is degraded', warnNotif?.type);
  assert(warnNotif?.metadata?.responseTime === 950, 'Notification metadata contains latency (950ms)', warnNotif?.metadata);
  assert(warnNotif?.metadata?.statusCode === 200, 'Notification metadata contains statusCode (200)', warnNotif?.metadata);

  // Test 2: Ongoing incident deduplication prevents spam within 15 minutes
  const duplicateDegradedNotif = notificationService.handleHealthTransition({
    endpoint,
    prevStatus: 'degraded',
    newStatus: 'degraded',
    statusCode: 200,
    responseTime: 960,
    healthScore: 68,
    degradationReason: 'High response latency (960ms > 500ms threshold)',
  });
  assert(duplicateDegradedNotif === null, 'Deduplication suppressed duplicate degraded alert for ongoing incident');

  // Test 3: Transition Degraded -> Unhealthy (Down) creates critical notification
  const critNotif = notificationService.handleHealthTransition({
    endpoint,
    prevStatus: 'degraded',
    newStatus: 'down',
    statusCode: 503,
    responseTime: 310,
    healthScore: 0,
    degradationReason: 'Service Unavailable (HTTP 503)',
  });
  assert(critNotif !== null, 'Critical notification created for Degraded -> Down transition', critNotif);
  assert(critNotif?.severity === 'critical', 'Notification severity is critical', critNotif?.severity);
  assert(critNotif?.type === 'unhealthy', 'Notification type is unhealthy', critNotif?.type);
  assert(critNotif?.metadata?.statusCode === 503, 'Notification metadata contains HTTP 503', critNotif?.metadata);

  // Test 4: Deduplication suppresses repeated unhealthy alerts for same ongoing outage
  const duplicateDownNotif = notificationService.handleHealthTransition({
    endpoint,
    prevStatus: 'down',
    newStatus: 'down',
    statusCode: 503,
    responseTime: 320,
    healthScore: 0,
    degradationReason: 'Service Unavailable (HTTP 503)',
  });
  assert(duplicateDownNotif === null, 'Deduplication suppressed duplicate critical alert for ongoing outage');

  // Test 5: Transition Down -> Healthy creates recovery notification & auto-resolves alerts
  const recoveryNotif = notificationService.handleHealthTransition({
    endpoint,
    prevStatus: 'down',
    newStatus: 'healthy',
    statusCode: 200,
    responseTime: 85,
    healthScore: 100,
  });
  assert(recoveryNotif !== null, 'Recovery notification created for Down -> Healthy transition', recoveryNotif);
  assert(recoveryNotif?.severity === 'success', 'Recovery notification severity is success', recoveryNotif?.severity);
  assert(recoveryNotif?.type === 'recovered', 'Recovery notification type is recovered', recoveryNotif?.type);
  assert(recoveryNotif?.title.includes('Recovered'), 'Recovery title indicates endpoint recovery', recoveryNotif?.title);

  // ==========================================
  // SECTION 2: Notification Management APIs
  // ==========================================
  console.log('\n--- SECTION 2: Notification Management APIs ---');

  // Test 6: List notifications with pagination
  const listReqRes = createMockReqRes(testUser, {}, { pageSize: 10, page: 1 });
  await notificationsController.list(listReqRes.req, listReqRes.res);
  const listResult = listReqRes.getResult().data;
  assert(listResult.data && listResult.data.length >= 3, 'List notifications returned created notifications', listResult);
  assert(listResult.unreadCount !== undefined, 'List response includes unreadCount', listResult.unreadCount);

  // Test 7: Filter notifications by severity (critical)
  const filterCritReqRes = createMockReqRes(testUser, {}, { severity: 'critical' });
  await notificationsController.list(filterCritReqRes.req, filterCritReqRes.res);
  const critListResult = filterCritReqRes.getResult().data;
  assert(critListResult.data.length > 0, 'Filter by severity critical returns items');
  assert(critListResult.data.every((n: any) => n.severity === 'critical'), 'All items have severity critical');

  // Test 8: Filter notifications by severity (success / recovery)
  const filterRecovReqRes = createMockReqRes(testUser, {}, { severity: 'success' });
  await notificationsController.list(filterRecovReqRes.req, filterRecovReqRes.res);
  const recovListResult = filterRecovReqRes.getResult().data;
  assert(recovListResult.data.length > 0, 'Filter by severity success returns recovery items');
  assert(recovListResult.data.every((n: any) => n.severity === 'success'), 'All items have severity success');

  // Test 9: Filter notifications by endpointId
  const filterEndpointReqRes = createMockReqRes(testUser, {}, { endpointId: endpoint.id });
  await notificationsController.list(filterEndpointReqRes.req, filterEndpointReqRes.res);
  const epListResult = filterEndpointReqRes.getResult().data;
  assert(epListResult.data.length > 0, 'Filter by endpointId returns items for endpoint');
  assert(epListResult.data.every((n: any) => n.endpointId === endpoint.id), 'All items belong to the target endpoint');

  // Test 10: Get unread count
  const unreadReqRes = createMockReqRes(testUser);
  await notificationsController.getUnreadCount(unreadReqRes.req, unreadReqRes.res);
  const unreadData = unreadReqRes.getResult().data;
  assert(unreadData.unreadCount === 1, 'Unread count is 1 because prior failure alerts were auto-resolved upon recovery', unreadData.unreadCount);

  // Test 11: Mark a single notification as read
  const notifToMark = listResult.data[0];
  const markReadReqRes = createMockReqRes(testUser, {}, {}, { id: notifToMark.id });
  await notificationsController.markAsRead(markReadReqRes.req, markReadReqRes.res);
  const markReadResult = markReadReqRes.getResult().data;
  assert(markReadResult.success === true, 'markAsRead returned success');
  assert(markReadResult.notification.isRead === true, 'Notification isRead is true after marking');

  // Test 12: Mark all notifications as read
  const markAllReqRes = createMockReqRes(testUser);
  await notificationsController.markAllAsRead(markAllReqRes.req, markAllReqRes.res);
  const markAllResult = markAllReqRes.getResult().data;
  assert(markAllResult.success === true, 'markAllAsRead returned success');

  const verifyUnread = createMockReqRes(testUser);
  await notificationsController.getUnreadCount(verifyUnread.req, verifyUnread.res);
  assert(verifyUnread.getResult().data.unreadCount === 0, 'Unread count is 0 after markAllAsRead');

  // ==========================================
  // SECTION 3: Dashboard Integration
  // ==========================================
  console.log('\n--- SECTION 3: Dashboard Health Stats Integration ---');

  // Test 13: Dashboard stats include recoveredEndpoints and recentNotifications
  const dashReqRes = createMockReqRes(testUser);
  await monitoringController.getDashboardStats(dashReqRes.req, dashReqRes.res);
  const dashStats = dashReqRes.getResult().data;
  assert(dashStats.recoveredEndpoints !== undefined, 'Dashboard stats includes recoveredEndpoints count', dashStats.recoveredEndpoints);
  assert(dashStats.recentNotifications !== undefined, 'Dashboard stats includes recentNotifications list', dashStats.recentNotifications?.length);
  assert(dashStats.recoveredEndpoints >= 1, 'Dashboard recoveredEndpoints reflects recent recovery');

  // Test 14: Delete an individual notification
  const deleteReqRes = createMockReqRes(testUser, {}, {}, { id: notifToMark.id });
  await notificationsController.delete(deleteReqRes.req, deleteReqRes.res);
  assert(deleteReqRes.getResult().data.success === true, 'delete returned success');

  // Test 15: Clear all notifications
  const clearReqRes = createMockReqRes(testUser);
  await notificationsController.clearAll(clearReqRes.req, clearReqRes.res);
  assert(clearReqRes.getResult().data.success === true, 'clearAll returned success');

  const afterClearReqRes = createMockReqRes(testUser);
  await notificationsController.list(afterClearReqRes.req, afterClearReqRes.res);
  assert(afterClearReqRes.getResult().data.data.length === 0, 'Notification list is empty after clearAll');

  // Cleanup: Delete the test project (soft delete + purge)
  const cleanupReqRes = createMockReqRes(testUser, {}, {}, { id: project.id });
  await projectsController.delete(cleanupReqRes.req, cleanupReqRes.res);

  console.log(`\n🎉 All ${passed}/${total} Intelligent Alerts & Notification System tests passed successfully!\n`);
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite execution failed:', err);
  process.exit(1);
});
