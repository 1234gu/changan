import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { EChartsOption } from 'echarts';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/esm/core';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import type { ResourceTrendPoint } from '../../../types/dashboard';
import type { ResourceKind, ResourceMap } from '../../../types/resource';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const trendColors: Record<ResourceKind, string> = {
  cpu: '#0e8ca5',
  gpu: '#4277a9',
  npu: '#7869a0',
  dla: '#a46f3b',
};

interface ResourceTrendChartProps {
  points: ResourceTrendPoint[];
  resources: ResourceMap;
}

export function ResourceTrendChart({ points, resources }: ResourceTrendChartProps) {
  const resourceKinds = useMemo(
    () => RESOURCE_ORDER.filter((kind) => resources[kind] !== undefined),
    [resources],
  );

  const option = useMemo<EChartsOption>(
    () => ({
      animation: true,
      animationDuration: 500,
      color: resourceKinds.map((kind) => trendColors[kind]),
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#f5fafc',
        borderColor: '#b9d5e0',
        textStyle: { color: '#143247' },
        valueFormatter: (value) => `${value}%`,
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 18,
        itemHeight: 3,
        textStyle: { color: '#516b7b' },
      },
      grid: {
        top: 44,
        right: 18,
        bottom: 20,
        left: 8,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) => dayjs(point.timestamp).format('HH:mm')),
        axisLine: { lineStyle: { color: '#b9d5e0' } },
        axisTick: { show: false },
        axisLabel: { color: '#516b7b', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: { color: '#516b7b', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#c7dce5', type: 'dashed' } },
      },
      series: resourceKinds.map((kind) => ({
        name: RESOURCE_PRESENTATION[kind].label,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        areaStyle: { opacity: kind === 'cpu' ? 0.06 : 0.04 },
        data: points.map((point) => point.utilization[kind] ?? null),
      })),
    }),
    [points, resourceKinds],
  );

  const description = resourceKinds
    .map((kind) => {
      const presentation = RESOURCE_PRESENTATION[kind];
      return `${presentation.label} ${resources[kind]?.utilization ?? 0}%`;
    })
    .join('，');

  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`最近 30 分钟资源利用率折线图。当前${description}。`}
    >
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height: 238, width: '100%' }}
      />
    </div>
  );
}
