import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useTheme } from '@/state/theme.store';
import { cn } from '@/shared/lib/cn';

/**
 * ECharts wrapper.
 *
 * Only the chart types actually used are registered, which keeps the bundle far
 * smaller than importing the full library. Charts render to canvas, so a series
 * with thousands of points does not create thousands of DOM nodes.
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

/** Reads the live design tokens so charts follow the active theme exactly. */
function readThemeTokens() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();

  return {
    text: token('--text'),
    muted: token('--text-muted'),
    border: token('--border'),
    surface: token('--surface'),
    primary: token('--primary'),
    accent: token('--accent'),
    success: token('--success'),
    warning: token('--warning'),
    danger: token('--danger'),
    info: token('--info'),
  };
}

export type ChartTokens = ReturnType<typeof readThemeTokens>;

export type ChartProps = {
  /** Receives the resolved theme tokens so series colours match the UI. */
  buildOption: (tokens: ChartTokens) => echarts.EChartsCoreOption;
  height?: number;
  className?: string;
  ariaLabel: string;
};

export function Chart({ buildOption, height = 280, className, ariaLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const resolvedTheme = useTheme((state) => state.resolved);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    // ResizeObserver instead of a window listener: the chart also has to react
    // when the sidebar collapses, which does not resize the window.
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const tokens = readThemeTokens();
    const option = buildOption(tokens);

    chart.setOption(
      {
        textStyle: { fontFamily: 'inherit', color: tokens.muted },
        tooltip: {
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          textStyle: { color: tokens.text },
          extraCssText: 'box-shadow: var(--shadow-md); border-radius: 10px;',
        },
        animationDuration: 420,
        animationEasing: 'cubicOut',
        ...option,
      },
      { notMerge: true },
    );
    // Re-running on theme change is what repaints the chart in the new palette.
  }, [buildOption, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ height }}
      className={cn('w-full', className)}
    />
  );
}
