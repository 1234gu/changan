import {
  ApiOutlined,
  DashboardOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { RESOURCE_KINDS, RESOURCE_UNITS } from '../types/resource';
import type { CanonicalResourceUnit, ResourceKind } from '../types/resource';

interface ResourcePresentation {
  label: string;
  unit: CanonicalResourceUnit;
  color: string;
  icon: ReactNode;
}

export const RESOURCE_ORDER: readonly ResourceKind[] = RESOURCE_KINDS;

export const RESOURCE_PRESENTATION: Record<ResourceKind, ResourcePresentation> = {
  cpu: {
    label: 'CPU',
    unit: RESOURCE_UNITS.cpu,
    color: '#356df3',
    icon: createElement(DashboardOutlined),
  },
  gpu: {
    label: 'GPU',
    unit: RESOURCE_UNITS.gpu,
    color: '#08a88a',
    icon: createElement(ThunderboltOutlined),
  },
  npu: {
    label: 'NPU',
    unit: RESOURCE_UNITS.npu,
    color: '#7c5ce7',
    icon: createElement(RadarChartOutlined),
  },
  dla: {
    label: 'DLA',
    unit: RESOURCE_UNITS.dla,
    color: '#12a4c7',
    icon: createElement(ApiOutlined),
  },
};
