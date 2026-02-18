/**
 * Lightweight Prometheus Metrics
 *
 * Provides simple counter / gauge / histogram primitives that render
 * to Prometheus text format.  No external dependencies required.
 *
 * This is intentionally minimal — enough for queue depth, API latency,
 * and request counts.  If the project later adopts `prom-client`, this
 * module can be replaced without touching consumers.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Labels {
  [key: string]: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter
// ─────────────────────────────────────────────────────────────────────────────

class Counter {
  private readonly name: string;
  private readonly help: string;
  private readonly values = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels = {}, amount = 1): void {
    const key = serializeLabels(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + amount);
  }

  render(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, val] of this.values) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gauge
// ─────────────────────────────────────────────────────────────────────────────

class Gauge {
  private readonly name: string;
  private readonly help: string;
  private readonly values = new Map<string, number>();
  private readonly collectFn?: () => Map<string, number>;

  constructor(name: string, help: string, collectFn?: () => Map<string, number>) {
    this.name = name;
    this.help = help;
    this.collectFn = collectFn;
  }

  set(labels: Labels, value: number): void {
    this.values.set(serializeLabels(labels), value);
  }

  render(): string {
    // If a collect function is provided, call it to refresh values
    if (this.collectFn) {
      const fresh = this.collectFn();
      this.values.clear();
      for (const [k, v] of fresh) {
        this.values.set(k, v);
      }
    }
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, val] of this.values) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Histogram (summary-style: count + sum + buckets)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

class Histogram {
  private readonly name: string;
  private readonly help: string;
  private readonly buckets: number[];
  private readonly data = new Map<
    string,
    { count: number; sum: number; buckets: number[] }
  >();

  constructor(name: string, help: string, buckets?: number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets ?? DEFAULT_BUCKETS;
  }

  observe(labels: Labels, value: number): void {
    const key = serializeLabels(labels);
    let entry = this.data.get(key);
    if (!entry) {
      entry = { count: 0, sum: 0, buckets: new Array(this.buckets.length).fill(0) };
      this.data.set(key, entry);
    }
    entry.count++;
    entry.sum += value;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        entry.buckets[i]++;
      }
    }
  }

  render(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, entry] of this.data) {
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(`${this.name}_bucket${injectLabel(key, 'le', String(this.buckets[i]))} ${entry.buckets[i]}`);
      }
      lines.push(`${this.name}_bucket${injectLabel(key, 'le', '+Inf')} ${entry.count}`);
      lines.push(`${this.name}_sum${key} ${entry.sum}`);
      lines.push(`${this.name}_count${key} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function serializeLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const inner = entries.map(([k, v]) => `${k}="${v}"`).join(',');
  return `{${inner}}`;
}

function injectLabel(existingKey: string, name: string, value: string): string {
  const extra = `${name}="${value}"`;
  if (!existingKey) return `{${extra}}`;
  // existingKey looks like `{foo="bar"}`
  return existingKey.replace('}', `,${extra}}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Registry
// ─────────────────────────────────────────────────────────────────────────────

const metrics: Array<Counter | Gauge | Histogram> = [];

function registerCounter(name: string, help: string): Counter {
  const c = new Counter(name, help);
  metrics.push(c);
  return c;
}

function registerGauge(name: string, help: string, collectFn?: () => Map<string, number>): Gauge {
  const g = new Gauge(name, help, collectFn);
  metrics.push(g);
  return g;
}

function registerHistogram(name: string, help: string, buckets?: number[]): Histogram {
  const h = new Histogram(name, help, buckets);
  metrics.push(h);
  return h;
}

/** Render all registered metrics in Prometheus text exposition format. */
export function renderMetrics(): string {
  return metrics.map((m) => m.render()).join('\n\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Metrics
// ─────────────────────────────────────────────────────────────────────────────

/** Total HTTP requests handled. */
export const httpRequestsTotal = registerCounter(
  'p2picks_http_requests_total',
  'Total HTTP requests handled',
);

/** HTTP request duration in ms. */
export const httpRequestDurationMs = registerHistogram(
  'p2picks_http_request_duration_ms',
  'HTTP request latency in milliseconds',
);

/** External API call duration in ms (ESPN, NBA.com). */
export const externalApiDurationMs = registerHistogram(
  'p2picks_external_api_duration_ms',
  'External API call latency in milliseconds',
);

/** Resolution queue depth (collected on-demand). */
export const resolutionQueueDepth = registerGauge(
  'p2picks_resolution_queue_depth',
  'Current resolution queue depth by state',
);

/** Lifecycle queue depth (collected on-demand). */
export const lifecycleQueueDepth = registerGauge(
  'p2picks_lifecycle_queue_depth',
  'Current lifecycle queue depth by state',
);

/** Circuit breaker state (0 = CLOSED, 1 = OPEN, 2 = HALF_OPEN). */
export const circuitBreakerState = registerGauge(
  'p2picks_circuit_breaker_state',
  'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
);
