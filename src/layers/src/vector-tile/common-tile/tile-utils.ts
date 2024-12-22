// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {bisectLeft} from 'd3-array';

import {DomainStops, Field as KeplerField, ZoomStopsConfig} from '@kepler.gl/types';
import {DomainQuantiles} from '@kepler.gl/utils';

// helper functions
export function isDomainStops(domain: unknown): domain is DomainStops {
  return (
    typeof domain === 'object' &&
    domain !== null &&
    Array.isArray((domain as any).stops) &&
    Array.isArray((domain as any).z)
  );
}

export function isDomainQuantiles(domain: unknown): domain is DomainQuantiles {
  return (
    typeof domain === 'object' &&
    domain !== null &&
    Array.isArray((domain as any).quantiles) &&
    Array.isArray((domain as any).z)
  );
}

export function isIndexedField(field?: KeplerField | null): boolean {
  return Boolean(field && field.indexBy);
}

export function getPropertyByZoom(
  config: ZoomStopsConfig | undefined,
  defaultValue: number
): (zoom: number) => number {
  if (!config || !config.enabled || !Array.isArray(config.stops)) {
    return () => defaultValue;
  }
  const {stops} = config;
  const zSteps = stops.map(st => st[0]);

  return zoom => {
    const i = bisectLeft(zSteps, zoom);
    if (i === 0) {
      return stops[i][1];
    }

    return stops[i - 1][1];
  };
}
