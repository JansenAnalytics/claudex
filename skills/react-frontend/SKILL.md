---
description: "Opinionated guide for building data-heavy React applications — dashboards, trading UIs, analytics tools. Based on the 2025/2026 React ecosystem and our actual stack (React 19 + Vite + TypeScript + ..."
name: react-frontend
triggers:
  - react app
  - react component
  - react dashboard
  - react performance
  - state management
  - build a dashboard
  - trading UI
  - analytics frontend
  - refactor react
  - react architecture
---

# React Frontend Skill

Opinionated guide for building data-heavy React applications — dashboards, trading UIs, analytics tools. Based on the 2025/2026 React ecosystem and our actual stack (React 19 + Vite + TypeScript + Tailwind).

**Companion skill**: Use with `frontend-design` for aesthetics guidance.

---

## Our Stack

This is what we use and what this skill optimizes for:

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | React 19 + Vite 7 (SPA) | Fast dev, no SSR needed for dashboards |
| **Language** | TypeScript (strict) | Non-negotiable for data-heavy apps |
| **Styling** | Tailwind CSS 4 | Utility-first, consistent, fast iteration |
| **Routing** | React Router 7 | Mature, well-known, sufficient for SPAs |
| **Charts** | Lightweight Charts (TradingView) | Best for financial/OHLCV data |
| **Build** | Vite + `vite preview` for prod | Fast HMR, good tree-shaking |

### When NOT to use this stack
- **Need SSR/SEO**: Use Next.js instead
- **Need server components**: Use Next.js App Router
- **Simple marketing site**: Use Astro
- **Mobile app**: Use React Native (different skill)

---

## Project Structure

```
src/
├── App.tsx                  # Root component, router setup
├── main.tsx                 # Entry point
├── types/                   # Shared TypeScript types
│   ├── index.ts             # Re-exports
│   └── market.ts            # Domain-specific types
├── hooks/                   # Custom hooks (data fetching, subscriptions)
│   ├── useApi.ts            # Generic API fetcher
│   ├── useBchUsd.ts         # Domain-specific data hook
│   └── useSubscription.ts   # WebSocket/SSE subscriptions
├── context/                 # React Context providers (sparingly)
│   ├── CurrencyContext.tsx
│   └── ThemeContext.tsx
├── components/
│   ├── shared/              # Reusable UI primitives
│   │   ├── Card.tsx
│   │   ├── Table.tsx
│   │   ├── LoadingSpinner.tsx
│   │   └── ErrorBoundary.tsx
│   ├── layout/              # App shell, navigation
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopNav.tsx
│   ├── dashboard/           # Feature: main dashboard
│   │   ├── AnalyticsDashboard.tsx
│   │   ├── PriceChart.tsx
│   │   ├── StatsPanel.tsx
│   │   └── TokenSelector.tsx
│   ├── market/              # Feature: market overview
│   │   ├── MarketDashboard.tsx
│   │   ├── CorrelationMatrix.tsx
│   │   └── HeatmapView.tsx
│   └── chain/               # Feature: chain analytics
│       ├── ChainDashboard.tsx
│       └── TraderGrowthChart.tsx
├── lib/                     # Pure utility functions (no React)
│   ├── api.ts               # API client
│   ├── formatters.ts        # Number/date formatting
│   └── colors.ts            # Color scales for charts
└── assets/                  # Static files
```

### Structure Rules

1. **Group by feature, not by type.** `components/dashboard/` not `components/charts/`, `components/tables/`, `components/forms/`.
2. **Shared components are UI primitives only.** If it's feature-specific, it goes in the feature folder.
3. **Hooks folder for data hooks only.** Component-specific hooks live next to the component.
4. **Types folder for shared types.** Component-specific types live in the component file.
5. **No barrel files (index.ts re-exports) unless the folder has 5+ files.** They slow down HMR.
6. **lib/ is pure functions.** No React imports. Testable without JSDOM.

---

## Component Patterns

### Naming
- Components: `PascalCase` — `PriceChart.tsx`, `TokenSelector.tsx`
- Hooks: `camelCase` with `use` prefix — `useMarketData.ts`
- Utils: `camelCase` — `formatCurrency.ts`
- Types: `PascalCase` — `interface TokenData {}`
- Constants: `SCREAMING_SNAKE` — `const MAX_CHART_POINTS = 500`

### Component Size Rule
**If a component is >200 lines, split it.** Extract:
- Subcomponents (visual sections)
- Custom hooks (data logic)
- Utility functions (pure transformations)

### Component Template

```tsx
// StatsPanel.tsx
import { type FC, memo, useMemo } from 'react';

interface StatsPanelProps {
  data: MarketStats;
  period: '24h' | '7d' | '30d';
  onPeriodChange: (period: '24h' | '7d' | '30d') => void;
}

export const StatsPanel: FC<StatsPanelProps> = memo(({ data, period, onPeriodChange }) => {
  const formattedStats = useMemo(() => ({
    volume: formatCurrency(data.volume),
    change: formatPercent(data.change),
    tvl: formatCurrency(data.tvl),
  }), [data]);

  return (
    <div className="rounded-xl bg-surface p-6">
      {/* Component JSX */}
    </div>
  );
});

StatsPanel.displayName = 'StatsPanel';
```

### Patterns to Use

**Compound Components** — for complex UI with shared state:
```tsx
<DataTable data={tokens}>
  <DataTable.Header>
    <DataTable.Column field="name" sortable />
    <DataTable.Column field="price" sortable format="currency" />
  </DataTable.Header>
  <DataTable.Body renderRow={(token) => <TokenRow token={token} />} />
  <DataTable.Pagination pageSize={25} />
</DataTable>
```

**Render Props / Children as Function** — for headless data components:
```tsx
<MarketDataProvider token="BCH">
  {({ price, volume, loading }) => (
    loading ? <Skeleton /> : <PriceDisplay price={price} volume={volume} />
  )}
</MarketDataProvider>
```

**Custom Hooks for Data** — extract ALL data fetching into hooks:
```tsx
// hooks/useTokenData.ts
export function useTokenData(tokenId: string) {
  const [data, setData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/tokens/${tokenId}`)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tokenId]);

  return { data, loading, error };
}
```

### Anti-Patterns to Avoid

❌ **Prop drilling through 3+ levels** → Use Context or Zustand
❌ **useEffect for derived state** → Use `useMemo` instead
❌ **State for URL-representable data** → Use URL search params
❌ **Fetching in components** → Extract to custom hooks
❌ **Giant god-components** → Split at 200 lines
❌ **Inline object/array literals in JSX** → Causes unnecessary re-renders
❌ **useEffect for event handlers** → Use event callbacks directly
❌ **`any` type** → Use `unknown` and narrow, or define proper types

---

## State Management

### Decision Tree

```
Is this server data? (API responses, fetched data)
  └─ YES → Use custom fetch hooks (or TanStack Query if complex)
  └─ NO → Is this shared across many components?
       └─ YES → Zustand store (small, fast, no boilerplate)
       └─ NO → Is it URL-representable? (filters, page, sort)
            └─ YES → URL search params (useSearchParams)
            └─ NO → Local useState/useReducer
```

### Recommended Libraries (by use case)

| Use Case | Library | Why |
|----------|---------|-----|
| **Server state / API cache** | TanStack Query (React Query) | Auto-refetch, cache, dedup, stale-while-revalidate |
| **Global client state** | Zustand | Tiny (1KB), no providers, no boilerplate, fast |
| **Atomic state** | Jotai | When you need many independent atoms (e.g. per-widget settings) |
| **Form state** | React Hook Form | Performance-optimized, minimal re-renders |
| **URL state** | React Router `useSearchParams` | Filters, pagination, sort order belong in the URL |

### What NOT to Use

❌ **Redux** — Overkill for dashboards. Too much boilerplate. Use Zustand.
❌ **MobX** — Adds complexity, proxy-based reactivity conflicts with React's model.
❌ **Context for high-frequency updates** — Context re-renders ALL consumers. Use Zustand instead.

### Zustand Example (our preferred approach)

```tsx
// stores/dashboardStore.ts
import { create } from 'zustand';

interface DashboardState {
  selectedToken: string;
  timeframe: '1h' | '4h' | '1d' | '1w';
  setSelectedToken: (token: string) => void;
  setTimeframe: (tf: '1h' | '4h' | '1d' | '1w') => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedToken: 'BCH',
  timeframe: '1d',
  setSelectedToken: (token) => set({ selectedToken: token }),
  setTimeframe: (tf) => set({ timeframe: tf }),
}));

// Usage in component — only re-renders when selectedToken changes
const token = useDashboardStore((s) => s.selectedToken);
```

### TanStack Query Example (for API data)

```tsx
// hooks/useTokenPrice.ts
import { useQuery } from '@tanstack/react-query';

export function useTokenPrice(tokenId: string) {
  return useQuery({
    queryKey: ['token-price', tokenId],
    queryFn: () => apiFetch(`/tokens/${tokenId}/price`),
    staleTime: 30_000,        // Consider fresh for 30s
    refetchInterval: 60_000,  // Auto-refetch every 60s
    retry: 2,
  });
}
```

---

## Performance Optimization

### The Big Wins (ordered by impact)

#### 1. Virtualize Long Lists
Any list with 50+ items MUST be virtualized. Use `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function TokenList({ tokens }: { tokens: Token[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tokens.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vRow) => (
          <div key={vRow.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%',
              height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}>
            <TokenRow token={tokens[vRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 2. Memoize Expensive Components
Use `memo()` for components that receive complex props but rarely change:

```tsx
// DO: Memoize chart components (expensive to re-render)
export const PriceChart = memo(({ data, timeframe }: ChartProps) => {
  // ... chart rendering
});

// DON'T: Memoize everything — memo has overhead. Only memoize when:
// - Component re-renders frequently with same props
// - Component is expensive to render (charts, tables, complex layouts)
// - Parent re-renders often but this child's props don't change
```

#### 3. Code-Split Routes
Every route should be lazy-loaded:

```tsx
import { lazy, Suspense } from 'react';

const MarketDashboard = lazy(() => import('./components/market/MarketDashboard'));
const ChainDashboard = lazy(() => import('./components/chain/ChainDashboard'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/market" element={<MarketDashboard />} />
        <Route path="/chain" element={<ChainDashboard />} />
      </Routes>
    </Suspense>
  );
}
```

#### 4. Debounce User Input
Search, filter, resize — always debounce:

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Usage
const debouncedSearch = useDebounce(searchTerm, 300);
useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
```

#### 5. Avoid Unnecessary Re-Renders

```tsx
// ❌ BAD: Creates new object every render → children always re-render
<ChartConfig options={{ theme: 'dark', grid: true }} />

// ✅ GOOD: Stable reference
const chartOptions = useMemo(() => ({ theme: 'dark', grid: true }), []);
<ChartConfig options={chartOptions} />

// ❌ BAD: Inline function → new reference every render
<Button onClick={() => handleClick(id)} />

// ✅ GOOD: Stable callback
const handleClick = useCallback(() => { /* ... */ }, [id]);
<Button onClick={handleClick} />
```

#### 6. Image and Asset Optimization
```tsx
// Lazy-load images below the fold
<img loading="lazy" decoding="async" src={tokenLogo} alt={tokenName} />

// Use CSS containment for complex widgets
<div style={{ contain: 'layout paint' }}>
  <ExpensiveWidget />
</div>
```

### Performance Checklist

- [ ] Lists with 50+ items virtualized
- [ ] Routes are lazy-loaded
- [ ] Chart components are memoized
- [ ] No inline objects/functions in hot render paths
- [ ] API requests are deduped and cached
- [ ] Search/filter inputs are debounced
- [ ] Heavy computation in `useMemo` / Web Workers
- [ ] Bundle analyzed (`npx vite-bundle-visualizer`)

---

## Charting Libraries

### Decision Matrix

| Library | Best For | Bundle Size | Learning Curve |
|---------|----------|-------------|----------------|
| **Lightweight Charts** (TradingView) | Financial OHLCV, candlesticks, trading | ~45KB | Low |
| **Recharts** | Simple dashboards, bar/line/pie | ~180KB | Very Low |
| **Visx** (Airbnb) | Custom/unique visualizations | ~15KB (modular) | High |
| **D3** | Full control, complex/custom viz | ~80KB (modular) | Very High |
| **Tremor** | Pre-built dashboard components | ~200KB | Very Low |
| **Chart.js + react-chartjs-2** | General purpose, quick setup | ~65KB | Low |
| **Nivo** | Beautiful defaults, many chart types | ~150KB+ | Medium |
| **Apache ECharts** | Complex enterprise dashboards, large datasets | ~300KB+ | Medium |

### Our Recommendations

**For financial/trading data** → **Lightweight Charts** (what BrewBoard uses)
- TradingView's library, purpose-built for OHLCV
- Handles 10k+ candles smoothly
- Built-in crosshair, time scale, responsive

**For general dashboard charts** → **Recharts** (simple) or **Visx** (custom)
- Recharts: declarative, React-native API, covers 90% of use cases
- Visx: D3 primitives wrapped as React components, for when you need full control

**For quick prototypes** → **Tremor**
- Pre-built dashboard components (cards, charts, tables)
- Looks good out of the box with zero customization
- Limited when you need custom designs

### Chart Performance Rules

1. **Limit data points** — 500-1000 visible points max. Aggregate/downsample beyond that.
2. **Canvas over SVG** for large datasets (>1000 points). Lightweight Charts uses Canvas.
3. **Memoize chart components** — `memo()` always on chart wrappers.
4. **Throttle resize handlers** — Charts redraw on resize; throttle to 100ms.
5. **Lazy-load chart libraries** — Don't load charting code until the chart is visible.

```tsx
// Lazy-load a chart component
const PriceChart = lazy(() => import('./PriceChart'));

// Only render when data is available
{data && (
  <Suspense fallback={<ChartSkeleton />}>
    <PriceChart data={data} />
  </Suspense>
)}
```

---

## Data Fetching Patterns

### API Client

```tsx
// lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Request dedup cache
const inflightRequests = new Map<string, Promise<any>>();

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const cacheKey = `${options?.method || 'GET'}:${url}`;

  // Dedup identical in-flight requests
  if (!options?.method || options.method === 'GET') {
    const inflight = inflightRequests.get(cacheKey);
    if (inflight) return inflight as Promise<T>;
  }

  const promise = fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  }).then(async (res) => {
    inflightRequests.delete(cacheKey);
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }).catch((err) => {
    inflightRequests.delete(cacheKey);
    throw err;
  });

  if (!options?.method || options.method === 'GET') {
    inflightRequests.set(cacheKey, promise);
  }

  return promise;
}
```

### Polling Pattern (for live data)

```tsx
function useLiveData<T>(url: string, intervalMs: number = 30_000) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await apiFetch<T>(url);
        if (active) setData(result);
      } catch (e) {
        console.error(`Poll error: ${url}`, e);
      }
    };

    poll(); // Initial fetch
    const id = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [url, intervalMs]);

  return data;
}
```

### WebSocket Pattern (for real-time)

```tsx
function useWebSocket<T>(url: string, onMessage: (data: T) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try { onMessage(JSON.parse(event.data)); } catch {}
      };

      ws.onclose = () => {
        // Reconnect with exponential backoff
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimeout.current);
    };
  }, [url]); // Intentionally exclude onMessage — use useCallback at call site
}
```

---

## Tailwind CSS Patterns

### Dashboard-Specific Utilities

```css
/* In your Tailwind config or global CSS */
@layer components {
  /* Card variants */
  .card { @apply rounded-xl bg-surface border border-border p-6; }
  .card-compact { @apply rounded-lg bg-surface border border-border p-4; }

  /* Stat display */
  .stat-value { @apply text-2xl font-bold font-mono tabular-nums; }
  .stat-label { @apply text-sm text-muted uppercase tracking-wide; }
  .stat-change-up { @apply text-emerald-500; }
  .stat-change-down { @apply text-red-500; }

  /* Data table */
  .table-header { @apply text-xs font-medium text-muted uppercase tracking-wider; }
  .table-cell { @apply px-4 py-3 text-sm font-mono tabular-nums; }
}
```

### Theme Variables (CSS custom properties + Tailwind)

```css
:root {
  --bg: #0f0f12;
  --surface: #1a1a22;
  --border: #2a2a35;
  --text: #e4e4e7;
  --muted: #71717a;
  --primary: #3b82f6;
  --accent: #f59e0b;
  --success: #10b981;
  --danger: #ef4444;
}

/* Extend Tailwind to use these */
/* In tailwind.config.ts: colors: { surface: 'var(--surface)', ... } */
```

### Responsive Dashboard Layout

```tsx
// Standard 3-panel dashboard layout
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
  {/* Main chart — full width on mobile, 8 cols on desktop */}
  <div className="lg:col-span-8">
    <PriceChart />
  </div>

  {/* Sidebar — stacks below on mobile, 4 cols on desktop */}
  <div className="lg:col-span-4 space-y-4">
    <StatsPanel />
    <RecentTrades />
  </div>

  {/* Full-width bottom section */}
  <div className="lg:col-span-12">
    <TokenTable />
  </div>
</div>
```

---

## Error Handling

### Error Boundary (every feature section needs one)

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; name?: string; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="card text-center py-12">
          <p className="text-lg font-medium text-danger">Something went wrong</p>
          <p className="text-sm text-muted mt-2">{this.state.error?.message}</p>
          <button className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
            onClick={() => this.setState({ hasError: false })}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage: wrap each dashboard section independently
<ErrorBoundary name="price-chart">
  <PriceChart />
</ErrorBoundary>
<ErrorBoundary name="token-list">
  <TokenList />
</ErrorBoundary>
```

### Loading States

Always show something — never blank screens:

```tsx
// Skeleton for chart
function ChartSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-6 w-32 bg-border rounded mb-4" />
      <div className="h-[300px] bg-border/50 rounded" />
    </div>
  );
}

// Skeleton for stat cards
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-4 w-20 bg-border rounded mb-2" />
          <div className="h-8 w-28 bg-border rounded" />
        </div>
      ))}
    </div>
  );
}
```

---

## Testing Strategy

### What to Test (prioritized)

1. **Custom hooks** — test data transformation logic with `@testing-library/react-hooks`
2. **Utility functions** — pure functions in `lib/` — plain Vitest, no React
3. **User interactions** — click, type, filter — with `@testing-library/react`
4. **Integration** — key user flows (select token → chart updates → stats update)

### What NOT to Test

❌ Implementation details (state values, instance methods)
❌ Third-party library internals (chart rendering, router behavior)
❌ Styling / CSS classes
❌ Snapshot tests (fragile, low value)

### Test Example

```tsx
// hooks/useTokenData.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useTokenData } from './useTokenData';

test('fetches and returns token data', async () => {
  const { result } = renderHook(() => useTokenData('BCH'));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toBeDefined();
  expect(result.current.data.symbol).toBe('BCH');
});
```

---

## Library Quick Reference

### Essential (install these)

| Library | Purpose | Install |
|---------|---------|---------|
| `zustand` | Global state (1KB) | `npm i zustand` |
| `@tanstack/react-query` | Server state / API cache | `npm i @tanstack/react-query` |
| `@tanstack/react-virtual` | List virtualization | `npm i @tanstack/react-virtual` |
| `motion` | Animations (used to be framer-motion) | `npm i motion` |
| `clsx` | Conditional classNames | `npm i clsx` |
| `date-fns` | Date formatting (tree-shakeable) | `npm i date-fns` |

### Useful (add when needed)

| Library | Purpose | Install |
|---------|---------|---------|
| `react-hook-form` | Form handling | `npm i react-hook-form` |
| `@radix-ui/react-*` | Headless accessible UI primitives | `npm i @radix-ui/react-dialog` |
| `recharts` | Simple charts | `npm i recharts` |
| `cmdk` | Command palette (⌘K) | `npm i cmdk` |
| `sonner` | Toast notifications | `npm i sonner` |
| `nuqs` | Type-safe URL search params | `npm i nuqs` |

### Avoid

| Library | Why | Alternative |
|---------|-----|-------------|
| Redux / Redux Toolkit | Too much boilerplate for dashboards | Zustand |
| Axios | Fetch API is sufficient, smaller bundle | Native `fetch` |
| Moment.js | Huge bundle, deprecated | `date-fns` or `dayjs` |
| Lodash (full) | 70KB. Import individual functions | `lodash-es/debounce` or write it |
| Material UI / Ant Design | Massive bundles, hard to customize | Tailwind + Radix |
| Styled-components | Runtime CSS-in-JS has performance cost | Tailwind |

---

## Build & Deploy

### Vite Config (optimized)

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['lightweight-charts'],
        },
      },
    },
    sourcemap: true,
    target: 'es2022', // Modern browsers only
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
```

### Bundle Analysis

```bash
# Check what's in your bundle
npx vite-bundle-visualizer

# Good targets:
# - Total JS < 200KB gzipped
# - Largest chunk < 100KB gzipped
# - No duplicate dependencies
```

### Pre-Deploy Checklist

- [ ] `npm run build` succeeds with no errors
- [ ] Bundle size checked (`npx vite-bundle-visualizer`)
- [ ] No `console.log` in production (use build plugin to strip)
- [ ] API URLs use env variables (`import.meta.env.VITE_API_URL`)
- [ ] Error boundaries wrap each major section
- [ ] Loading skeletons for async content
- [ ] Mobile responsive (check at 375px width)
