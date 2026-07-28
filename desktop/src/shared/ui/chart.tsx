import { lazy, Suspense } from 'react';
import type { ChartProps, ChartTokens } from '@/shared/ui/chart-impl';

/**
 * Lazily-loaded chart.
 *
 * ECharts is ~520 kB - by far the heaviest dependency in the app. Loading it
 * with the app shell would delay the first paint of every screen, including the
 * ones with no charts at all. Here it downloads only once a chart is actually
 * rendered, and a skeleton holds its exact space in the meantime so the layout
 * never jumps.
 */
const ChartImpl = lazy(() =>
  import('@/shared/ui/chart-impl').then((module) => ({ default: module.Chart })),
);

export type { ChartProps, ChartTokens };

export function Chart(props: ChartProps) {
  return (
    <Suspense
      fallback={<div className="skeleton rounded-lg" style={{ height: props.height ?? 280 }} />}
    >
      <ChartImpl {...props} />
    </Suspense>
  );
}
