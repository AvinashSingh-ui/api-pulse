import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../../db/store.js';
import { healthService } from '../monitoring/health.service.js';
import { config } from '../../config/index.js';
import { notificationService } from '../notifications/notification.service.js';
import type { TestCase, TestResult, TestStatus } from '../../types/index.js';

function resolveTargetUrl(url: string, endpointId?: string): string {
  let target = (url || '').trim();
  if (!target) return target;

  // Resolve template path parameters in URL e.g. /users/{id} -> /users/1
  target = target.replace(/\{([a-zA-Z0-9_-]+)\}|:([a-zA-Z0-9_-]+)/g, (_match, p1, p2) => {
    const key = (p1 || p2 || '').toLowerCase();
    if (key.includes('country') || key.includes('countries')) return 'US';
    if (key.includes('provideraccount')) return 'acc_1';
    if (key.includes('provider')) return 'custom';
    if (key.includes('entity') || key.includes('type')) return 'customer';
    if (key.includes('account') || key.includes('contact') || key.includes('lead') || key.includes('process')) return '1';
    if (key.includes('uuid') || key.includes('id')) return '00000000-0000-0000-0000-000000000001';
    if (key.includes('num') || key.includes('count') || key.includes('page') || key.includes('limit')) return '1';
    if (key.includes('token') || key.includes('jwt') || key.includes('hash')) return 'test_token';
    if (key.includes('name') || key.includes('slug') || key.includes('item')) return 'sample_item';
    if (key.includes('email')) return 'test%40example.com';
    if (key.includes('date')) return '2026-01-01';
    return '1';
  });

  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }

  // If endpointId provided, try to find endpoint and parent project
  if (endpointId) {
    const ep = db.endpoints.find(e => e.id === endpointId);
    if (ep) {
      const proj = db.projects.find(p => p.id === ep.projectId);
      if (proj && proj.baseUrl) {
        return healthService.buildFullUrl(proj.baseUrl, target.startsWith('/') ? target : ep.path);
      }
    }
  }

  // If starts with /, check if any active project has a baseUrl
  if (target.startsWith('/')) {
    const activeProject = db.projects.find(p => p.status === 'active' && !p.deletedAt && p.baseUrl);
    if (activeProject) {
      return healthService.buildFullUrl(activeProject.baseUrl, target);
    }
    return `http://localhost:${config.port}${target}`;
  }

  // If domain with localhost or 127.0.0.1 without protocol
  if (target.startsWith('localhost') || target.startsWith('127.0.0.1')) {
    return `http://${target}`;
  }

  // If domain with dot (e.g. api.github.com/users/octocat)
  if (target.includes('.')) {
    return `https://${target}`;
  }

  const activeProj = db.projects.find(p => p.status === 'active' && !p.deletedAt && p.baseUrl);
  if (activeProj) {
    return healthService.buildFullUrl(activeProj.baseUrl, `/${target}`);
  }

  return `http://localhost:${config.port}/${target}`;
}

const HTTP_STATUS_PHRASES: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

async function executeTestCase(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  let statusCode = 200;
  let statusText = 'OK';
  let responseBody = '';
  const responseHeaders: Record<string, string> = {};
  let responseTime = 0;
  let sizeBytes = 0;
  let error: string | undefined;

  const resolvedUrl = resolveTargetUrl(testCase.url, testCase.endpointId);

  try {
    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'API-Pulse-Test-Runner/1.0',
      ...(testCase.headers || {}),
    };

    if (!requestHeaders['x-product-id'] && resolvedUrl.includes('notification-service')) {
      requestHeaders['x-product-id'] = '00000000-0000-0000-0000-000000000001';
    }

    const methodUpper = (testCase.method || 'GET').toUpperCase();
    const isBodyMethod = methodUpper === 'POST' || methodUpper === 'PUT' || methodUpper === 'PATCH';

    let parsedBody: any = undefined;
    if (testCase.body !== undefined && testCase.body !== null && testCase.body !== '') {
      if (typeof testCase.body === 'string') {
        const trimmed = testCase.body.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            parsedBody = JSON.parse(trimmed);
            if (!requestHeaders['Content-Type']) {
              requestHeaders['Content-Type'] = 'application/json';
            }
          } catch {
            parsedBody = isBodyMethod ? { status: 'active', message: trimmed } : trimmed;
          }
        } else {
          parsedBody = isBodyMethod ? { status: 'active', value: trimmed } : trimmed;
        }
      } else {
        parsedBody = testCase.body;
      }
    } else if (isBodyMethod) {
      parsedBody = { status: 'active' };
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
    }

    const res = await axios({
      method: testCase.method.toLowerCase(),
      url: resolvedUrl,
      headers: requestHeaders,
      data: parsedBody,
      timeout: 10000,
      validateStatus: () => true, // Capture all HTTP statuses like Postman
    });
    responseTime = Date.now() - startTime;
    statusCode = res.status;
    statusText = (res.statusText && res.statusText.trim() !== String(res.status))
      ? res.statusText
      : (HTTP_STATUS_PHRASES[res.status] || (res.status === 200 ? 'OK' : ''));
    responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);

    if (res.headers && typeof res.headers === 'object') {
      Object.entries(res.headers).forEach(([k, v]) => {
        if (typeof v === 'string') responseHeaders[k] = v;
        else if (Array.isArray(v)) responseHeaders[k] = v.join(', ');
        else if (v !== undefined) responseHeaders[k] = String(v);
      });
    }

    sizeBytes = Buffer.byteLength(responseBody, 'utf-8');
  } catch (err: any) {
    responseTime = Date.now() - startTime;
    statusCode = err.response?.status || 500;
    statusText = (err.response?.statusText && err.response?.statusText.trim() !== String(statusCode))
      ? err.response.statusText
      : (HTTP_STATUS_PHRASES[statusCode] || 'Execution Error');
    error = err.message || 'Request execution failed';
    responseBody = JSON.stringify({ error, message: err.message }, null, 2);
    sizeBytes = Buffer.byteLength(responseBody, 'utf-8');
  }

  // Evaluate assertions (Playwright / Postman style)
  const assertionResults = (testCase.assertions || []).map(a => {
    let passed = true;
    let actual: string | number = '';
    let message = '';

    if (a.type === 'status_code') {
      actual = statusCode;
      passed = a.operator === 'eq' ? actual === Number(a.expected) : actual < Number(a.expected);
      message = passed ? `Status is ${actual}` : `Expected ${a.operator} ${a.expected}, got ${actual}`;
    } else if (a.type === 'response_time') {
      actual = responseTime;
      passed = a.operator === 'lt' ? responseTime < Number(a.expected) : responseTime > Number(a.expected);
      message = passed ? `Response time is ${actual}ms` : `Expected ${a.operator} ${a.expected}ms, got ${actual}ms`;
    } else if (a.type === 'body_contains') {
      actual = responseBody.slice(0, 80);
      passed = responseBody.includes(String(a.expected));
      message = passed ? `Body contains "${a.expected}"` : `Body does not contain "${a.expected}"`;
    } else if (a.type === 'header_exists') {
      const headerKey = String(a.expected).toLowerCase();
      passed = Object.keys(responseHeaders).some(k => k.toLowerCase() === headerKey);
      actual = passed ? 'exists' : 'missing';
      message = passed ? `Header "${a.expected}" exists` : `Header "${a.expected}" is missing`;
    } else if (a.type === 'json_path') {
      try {
        const parsed = JSON.parse(responseBody);
        const prop = String(a.expected);
        passed = prop in parsed || (parsed && typeof parsed === 'object' && Object.keys(parsed).includes(prop));
        actual = passed ? 'found' : 'not found';
        message = passed ? `Property "${prop}" exists in response` : `Property "${prop}" not found`;
      } catch {
        passed = false;
        actual = 'invalid json';
        message = 'Response is not valid JSON';
      }
    }

    return {
      assertionId: a.id,
      passed,
      actual,
      expected: a.expected,
      message,
    };
  });

  const allPassed = assertionResults.every(r => r.passed);
  const finalStatus: TestStatus = error ? 'error' : allPassed ? 'passed' : 'failed';

  const testResult: TestResult = {
    id: `tr_${uuidv4().slice(0, 8)}`,
    testCaseId: testCase.id,
    status: finalStatus,
    statusCode,
    statusText,
    responseTime,
    sizeBytes,
    responseBody,
    responseHeaders,
    targetUrl: resolvedUrl,
    assertionResults,
    runAt: new Date().toISOString(),
    error,
  };

  testCase.lastRunAt = new Date().toISOString();
  testCase.lastStatus = finalStatus;

  return testResult;
}

export const testingController = {
  listTestCases: (req: Request, res: Response) => {
    const { endpointId } = req.query;
    let cases = db.testCases;
    if (endpointId) {
      cases = cases.filter(c => c.endpointId === endpointId);
    }
    return res.json({
      data: cases,
      total: cases.length,
      page: 1,
      pageSize: cases.length,
      totalPages: 1,
    });
  },

  createTestCase: (req: Request, res: Response) => {
    const { name, endpointId, method = 'GET', url, headers = {}, body, assertions = [] } = req.body;
    if (!name || !url) {
      return res.status(400).json({ message: 'name and url are required' });
    }

    const newCase: TestCase = {
      id: `tc_${uuidv4().slice(0, 8)}`,
      name,
      endpointId: endpointId || undefined,
      method,
      url,
      headers,
      body,
      assertions,
      lastStatus: 'pending',
    };

    db.testCases.push(newCase);
    db.save();

    return res.status(201).json(newCase);
  },

  updateTestCase: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.testCases.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Test case with ID ${id} not found` });
    }

    const updated = { ...db.testCases[index], ...req.body, id };
    db.testCases[index] = updated;
    db.save();
    return res.json(updated);
  },

  deleteTestCase: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.testCases.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Test case with ID ${id} not found` });
    }

    db.testCases.splice(index, 1);
    db.save();
    return res.json({ message: 'Test case deleted' });
  },

  runTest: async (req: Request, res: Response) => {
    const { id } = req.params;
    const testCase = db.testCases.find(c => c.id === id);
    if (!testCase) {
      return res.status(404).json({ message: `Test case with ID ${id} not found` });
    }

    const testResult = await executeTestCase(testCase);

    db.testResults.unshift(testResult);
    if (db.testResults.length > 200) db.testResults.pop();
    db.save();

    // Emit live test notification
    try {
      const isPass = testResult.status === 'passed';
      notificationService.createNotification({
        projectId: testCase.endpointId ? db.endpoints.find(e => e.id === testCase.endpointId)?.projectId : undefined,
        endpointId: testCase.endpointId,
        title: isPass ? `Test Passed: ${testCase.name}` : `Test ${testResult.status === 'failed' ? 'Failed' : 'Error'}: ${testCase.name}`,
        message: isPass
          ? `Status HTTP ${testResult.statusCode} in ${testResult.responseTime}ms. All assertions passed.`
          : `Status HTTP ${testResult.statusCode} in ${testResult.responseTime}ms. ${testResult.error || 'Assertion verification failed.'}`,
        severity: isPass ? 'info' : testResult.status === 'error' ? 'critical' : 'warning',
        type: isPass ? 'system' : 'unhealthy',
        metadata: {
          statusCode: testResult.statusCode,
          responseTime: testResult.responseTime,
        },
        forceNotify: true,
      });
    } catch {}

    return res.json(testResult);
  },

  runCustom: async (req: Request, res: Response) => {
    const { method = 'GET', url, headers = {}, params = {}, body, assertions = [] } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ message: 'URL is required' });
    }

    let finalUrl = url.trim();
    if (params && typeof params === 'object' && Object.keys(params).length > 0) {
      try {
        const resolved = resolveTargetUrl(finalUrl);
        const urlObj = new URL(resolved);
        Object.entries(params).forEach(([k, v]) => {
          if (k && v !== undefined) urlObj.searchParams.set(k, String(v));
        });
        finalUrl = urlObj.toString();
      } catch {
        // if query string append
        const qs = new URLSearchParams(params as Record<string, string>).toString();
        if (qs) {
          finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${qs}`;
        }
      }
    }

    const tempCase: TestCase = {
      id: `adhoc_${Date.now()}`,
      name: `Ad-hoc ${method.toUpperCase()} ${finalUrl}`,
      method: method.toUpperCase() as any,
      url: finalUrl,
      headers: headers || {},
      body: body || undefined,
      assertions: assertions || [],
      lastStatus: 'pending',
    };

    const testResult = await executeTestCase(tempCase);

    // Emit live test notification
    try {
      const isPass = testResult.status === 'passed';
      notificationService.createNotification({
        title: isPass ? `Live Test Succeeded: ${tempCase.method} ${finalUrl.slice(0, 45)}` : `Live Test ${testResult.status === 'failed' ? 'Failed' : 'Error'}: ${tempCase.method} ${finalUrl.slice(0, 45)}`,
        message: isPass
          ? `HTTP ${testResult.statusCode} in ${testResult.responseTime}ms. Verified successfully.`
          : `HTTP ${testResult.statusCode} in ${testResult.responseTime}ms. ${testResult.error || 'Assertions check failed.'}`,
        severity: isPass ? 'info' : testResult.status === 'error' ? 'critical' : 'warning',
        type: isPass ? 'system' : 'unhealthy',
        metadata: {
          statusCode: testResult.statusCode,
          responseTime: testResult.responseTime,
        },
        forceNotify: true,
      });
    } catch {}

    return res.json(testResult);
  },

  runAll: async (req: Request, res: Response) => {
    const { endpointId } = req.body;
    let cases = db.testCases;
    if (endpointId) {
      cases = cases.filter(c => c.endpointId === endpointId);
    }

    const results: TestResult[] = [];
    for (const tc of cases) {
      const result = await executeTestCase(tc);
      results.push(result);
      db.testResults.unshift(result);
    }
    while (db.testResults.length > 200) {
      db.testResults.pop();
    }
    db.save();

    return res.json(results);
  },

  getResults: (req: Request, res: Response) => {
    const { id } = req.params;
    const results = db.testResults.filter(r => r.testCaseId === id);
    return res.json(results);
  },
};

