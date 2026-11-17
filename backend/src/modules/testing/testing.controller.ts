import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../../db/store.js';
import { healthService } from '../monitoring/health.service.js';
import type { TestCase, TestResult, TestStatus } from '../../types/index.js';

async function executeTestCase(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  let statusCode = 200;
  let responseBody = '';
  let responseTime = 0;
  let error: string | undefined;

  let targetUrl = testCase.url;
  // If URL is a relative path or doesn't have protocol, resolve from endpoint & project
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (testCase.endpointId) {
      const ep = db.endpoints.find(e => e.id === testCase.endpointId);
      if (ep) {
        const proj = db.projects.find(p => p.id === ep.projectId);
        if (proj && proj.baseUrl) {
          targetUrl = healthService.buildFullUrl(proj.baseUrl, targetUrl.startsWith('/') ? targetUrl : ep.path);
        }
      }
    }
  }

  // Ensure protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (targetUrl.startsWith('localhost') || targetUrl.startsWith('127.0.0.1')) {
      targetUrl = `http://${targetUrl}`;
    } else if (targetUrl.includes('.')) {
      targetUrl = `https://${targetUrl}`;
    }
  }

  try {
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      throw new Error(`Invalid URL: "${testCase.url}". Please provide a valid HTTP/HTTPS URL.`);
    }

    const res = await axios({
      method: testCase.method.toLowerCase(),
      url: targetUrl,
      headers: testCase.headers,
      data: testCase.body ? (typeof testCase.body === 'string' ? JSON.parse(testCase.body) : testCase.body) : undefined,
      timeout: 5000,
      validateStatus: () => true,
    });
    responseTime = Date.now() - startTime;
    statusCode = res.status;
    responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } catch (err: any) {
    responseTime = Date.now() - startTime;
    statusCode = err.response?.status || 500;
    error = err.message || 'Request execution failed';
    responseBody = JSON.stringify({ error });
  }

  // Evaluate assertions
  const assertionResults = (testCase.assertions || []).map(a => {
    let passed = true;
    let actual: string | number = '';

    if (a.type === 'status_code') {
      actual = statusCode;
      passed = a.operator === 'eq' ? actual === Number(a.expected) : actual < Number(a.expected);
    } else if (a.type === 'response_time') {
      actual = responseTime;
      passed = a.operator === 'lt' ? responseTime < Number(a.expected) : responseTime > Number(a.expected);
    } else if (a.type === 'body_contains') {
      actual = responseBody.slice(0, 50);
      passed = responseBody.includes(String(a.expected));
    }

    return {
      assertionId: a.id,
      passed,
      actual,
      expected: a.expected,
    };
  });

  const allPassed = assertionResults.every(r => r.passed);
  const finalStatus: TestStatus = error ? 'error' : allPassed ? 'passed' : 'failed';

  const testResult: TestResult = {
    id: `tr_${uuidv4().slice(0, 8)}`,
    testCaseId: testCase.id,
    status: finalStatus,
    statusCode,
    responseTime,
    responseBody,
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
    if (!name || !endpointId || !url) {
      return res.status(400).json({ message: 'name, endpointId, and url are required' });
    }

    const newCase: TestCase = {
      id: `tc_${uuidv4().slice(0, 8)}`,
      name,
      endpointId,
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

