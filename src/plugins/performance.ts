import { CDPSession } from 'playwright';

const supportedMetrics = new Set<string>([
  'Timestamp',
  'Documents',
  'Frames',
  'JSEventListeners',
  'Nodes',
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
]);

export interface Metrics {
  Timestamp?: number;
  Documents?: number;
  Frames?: number;
  JSEventListeners?: number;
  Nodes?: number;
  LayoutCount?: number;
  RecalcStyleCount?: number;
  LayoutDuration?: number;
  RecalcStyleDuration?: number;
  ScriptDuration?: number;
  TaskDuration?: number;
  JSHeapUsedSize?: number;
  JSHeapTotalSize?: number;
}

export class PerformanceManager {
  constructor(private client: CDPSession) {}

  async start() {
    await this.client.send('Performance.enable');
  }

  async stop() {
    await this.client.send('Performance.disable');
  }

  async getMetrics() {
    const { metrics } = await this.client.send('Performance.getMetrics');
    return this.buildMetricsObject(metrics);
  }

  private buildMetricsObject(metrics = []): Metrics {
    const result = {};
    for (const metric of metrics) {
      if (supportedMetrics.has(metric.name)) result[metric.name] = metric.value;
    }
    return result;
  }
}
