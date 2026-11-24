import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import type { Endpoint, Alert } from '../../types/index.js';
import { apiExecutionService } from './apiExecution.service.js';

class MonitoringScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeChecks = new Set<string>();

  public start(pollIntervalMs = 15000): void {
    if (this.timer) return;
    console.log('[Scheduler] Background API Pulse health monitoring service started.');
    this.timer = setInterval(() => this.runCheckCycle(), pollIntervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] Monitoring service stopped.');
    }
  }

  public removeEndpoint(endpointId: string): void {
    this.activeChecks.delete(endpointId);
  }

  private async runCheckCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = Date.now();
      const activeProjectIds = new Set(
        db.projects
          .filter(p => p.status === 'active' && !p.deletedAt)
          .map(p => p.id)
      );

      // Only monitor endpoints of active projects that are not paused
      const activeEndpoints = db.endpoints.filter(
        e => e.status !== 'paused' && activeProjectIds.has(e.projectId)
      );

      for (const endpoint of activeEndpoints) {
        // Prevent overlapping checks for the same endpoint
        if (this.activeChecks.has(endpoint.id)) continue;

        const lastCheckedMs = new Date(endpoint.lastChecked || 0).getTime();
        const intervalMs = (endpoint.interval || 60) * 1000;

        if (now - lastCheckedMs >= intervalMs) {
          this.activeChecks.add(endpoint.id);
          try {
            await this.pingEndpoint(endpoint);
          } finally {
            this.activeChecks.delete(endpoint.id);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error in check cycle:', err);
    } finally {
      this.isRunning = false;
    }
  }

  private async pingEndpoint(endpoint: Endpoint): Promise<void> {
    const project = db.projects.find(p => p.id === endpoint.projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      return;
    }

    try {
      const result = await apiExecutionService.executeEndpointCheck(
        endpoint,
        '127.0.0.1',
        'API-Pulse-Automated-Monitor/1.0'
      );

      // Check custom alert rule triggers
      this.evaluateAlertsForEndpoint(endpoint, result.responseTime, result.isSuccess);
    } catch (err: any) {
      console.warn(`[Scheduler] Health check error for endpoint ${endpoint.id}:`, err.message);
    }
  }

  private evaluateAlertsForEndpoint(endpoint: Endpoint, measuredRt: number, isSuccess: boolean): void {
    const rules = db.alertRules.filter(
      r => r.isEnabled && (r.endpointId === endpoint.id || (r.projectId === endpoint.projectId && !r.endpointId))
    );

    for (const rule of rules) {
      let violated = false;
      let alertMsg = '';

      if (rule.trigger === 'response_time' && measuredRt > rule.threshold) {
        violated = true;
        alertMsg = `P95 latency of ${measuredRt}ms exceeded threshold of ${rule.threshold}ms`;
      } else if (rule.trigger === 'status_code' && !isSuccess) {
        violated = true;
        alertMsg = `Failed status code assertion on route ${endpoint.path}`;
      } else if (rule.trigger === 'consecutive_failures' && !isSuccess) {
        violated = true;
        alertMsg = `Endpoint ${endpoint.path} failed consecutive health checks`;
      }

      if (violated) {
        const existing = db.alerts.find(a => a.ruleId === rule.id && a.status === 'active');
        if (!existing) {
          const newAlert: Alert = {
            id: `a_${uuidv4().slice(0, 8)}`,
            ruleId: rule.id,
            projectId: rule.projectId,
            endpointId: endpoint.id,
            title: `[${rule.severity.toUpperCase()}] ${rule.name}`,
            message: alertMsg,
            severity: rule.severity,
            status: 'active',
            triggeredAt: new Date().toISOString(),
            value: measuredRt,
            threshold: rule.threshold,
          };
          db.alerts.unshift(newAlert);
        }
      }
    }
  }
}

export const scheduler = new MonitoringScheduler();
export const monitoringScheduler = scheduler;
