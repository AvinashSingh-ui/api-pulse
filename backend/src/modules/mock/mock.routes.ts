import { Router, Request, Response } from 'express';

const router = Router();

// 1. Success endpoint (200 OK fast)
router.get('/success', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    code: 200,
    message: 'Mock API is healthy and operational',
    timestamp: new Date().toISOString(),
  });
});

// 2. Slow endpoint (Simulates high latency bottleneck ~1200ms)
router.get('/slow', async (_req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1200));
  res.json({
    status: 'degraded',
    code: 200,
    latency_ms: 1200,
    message: 'Simulated high database read latency',
    timestamp: new Date().toISOString(),
  });
});

// 3. Server Error endpoint (Simulates 500 crash)
router.get('/error', (_req: Request, res: Response) => {
  res.status(500).json({
    status: 'error',
    code: 500,
    error: 'InternalServerError: Database connection pool exhausted',
    stack: 'Error: Connection pool timed out at pool.getConnection()',
  });
});

// 4. Gateway Timeout endpoint (Simulates 504 timeout ~3500ms)
router.get('/timeout', async (_req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 3500));
  res.status(504).json({
    status: 'error',
    code: 504,
    error: 'Gateway Timeout: Downstream microservice did not respond in time',
  });
});

// 5. Rate Limit endpoint (Simulates 429 Too Many Requests)
router.get('/rate-limit', (_req: Request, res: Response) => {
  res.status(429).json({
    status: 'error',
    code: 429,
    error: 'Too Many Requests: Rate limit quota exceeded (Max 60 req/min)',
    retryAfter: 30,
  });
});

// 6. Users collection (GET & POST)
router.get('/users', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Alex Johnson', email: 'alex@example.com', role: 'admin' },
    { id: 2, name: 'Maria Garcia', email: 'maria@example.com', role: 'developer' },
    { id: 3, name: 'Liam Smith', email: 'liam@example.com', role: 'viewer' },
  ]);
});

router.post('/users', (req: Request, res: Response) => {
  const { name = 'New User', email = 'user@example.com' } = req.body || {};
  res.status(201).json({
    id: Math.floor(Math.random() * 1000) + 10,
    name,
    email,
    createdAt: new Date().toISOString(),
  });
});

export default router;

