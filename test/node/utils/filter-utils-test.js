// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import test from 'tape';
import moment from 'moment';

import {getDatasetFieldIndexForFilter} from '@kepler.gl/table';

import {
  isValidFilterValue,
  adjustValueToFilterDomain,
  getFilterFunction,
  getDefaultFilter,
  validatePolygonFilter,
  generatePolygonFilter,
  isInPolygon,
  diffFilters,
  getTimestampFieldDomain,
  scaleSourceDomainToDestination,
  mergeFilterWithTimeline,
  createDataContainer
} from '@kepler.gl/utils';

import {FILTER_TYPES} from '@kepler.gl/constants';
import {mockPolygonFeature, mockPolygonData} from '../../fixtures/polygon';

/* eslint-disable max-statements */
test('filterUtils -> adjustValueToFilterDomain', t => {
  // TODO: needs id
  const rangeFilter = getDefaultFilter();
  rangeFilter.type = FILTER_TYPES.range;
  rangeFilter.domain = [0, 1];

  t.deepEqual(
    adjustValueToFilterDomain([0, 0.5], rangeFilter),
    [0, 0.5],
    'should return value matched to range filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain([-1, 0.5], rangeFilter),
    [0, 0.5],
    'should return value adjust to range filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain([0.1, 1.5], rangeFilter),
    [0.1, 1],
    'should return value adjust to range filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain([1.1, 2], rangeFilter),
    [0, 1],
    'should return value adjust to range filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain(null, rangeFilter),
    [0, 1],
    'should return value adjust to range filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain([undefined, 0.5], rangeFilter),
    [0, 0.5],
    'should return value adjust to range filter'
  );

  // TODO needs id
  const multiSelectFilter = getDefaultFilter();
  multiSelectFilter.type = FILTER_TYPES.multiSelect;
  multiSelectFilter.domain = ['a', 'b', 'c'];

  t.deepEqual(
    adjustValueToFilterDomain(['a', 'b'], multiSelectFilter),
    ['a', 'b'],
    'should return value matched to multiSelect filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain(['a', 'b', 'd'], multiSelectFilter),
    ['a', 'b'],
    'should return value matched to multiSelect filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain(['a', 'b', null], multiSelectFilter),
    ['a', 'b'],
    'should return value matched to multiSelect filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain(null, multiSelectFilter),
    [],
    'should return [] if nothing matched to multiSelect filter'
  );

  t.deepEqual(
    adjustValueToFilterDomain([1, 2], multiSelectFilter),
    [],
    'should return [] if nothing matched to multiSelect filter'
  );

  // TODO needs id
  const selectFilter = getDefaultFilter();
  selectFilter.type = FILTER_TYPES.select;
  selectFilter.domain = ['a', 'b', 'c'];

  t.equal(
    adjustValueToFilterDomain('a', selectFilter),
    'a',
    'should return value matched to select filter'
  );

  t.equal(
    adjustValueToFilterDomain(['a', 'b'], selectFilter),
    true,
    'should return true if nothing matched to select filter'
  );

  t.equal(
    adjustValueToFilterDomain(null, selectFilter),
    true,
    'should return true if nothing matched to select filter'
  );

  t.end();
});

test('filterUtils -> getDatasetFieldIndexForFilter', t => {
  const dataId = 'test-this-id';

  let fieldIndex = getDatasetFieldIndexForFilter(dataId, {
    dataId: [dataId],
    fieldIdx: [3]
  });

  t.equal(fieldIndex, 3, 'FieldIndex should be 3');

  fieldIndex = getDatasetFieldIndexForFilter(dataId, {
    dataId: ['different-id', dataId],
    fieldIdx: [3, 5]
  });

  t.equal(fieldIndex, 5, 'FieldIndex should be 5');

  fieldIndex = getDatasetFieldIndexForFilter(dataId, {dataId: ['different-id']});
  t.equal(fieldIndex, -1, 'FieldIndex should be -1');

  t.end();
});

test('filterUtils -> isValidFilterValue', t => {
  t.equal(isValidFilterValue(null, true), false, 'Should return false because type is null');

  t.equal(
    isValidFilterValue(FILTER_TYPES.select, true),
    true,
    'Should return true because type is select and value is true'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.select, false),
    true,
    'Should return true because type is select and value is true'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.timeRange, false),
    false,
    'Should return false because type is timeRange and value is not an array'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.timeRange, []),
    true,
    'Should return true because type is timeRange and value is an empty array'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.timeRange, [1]),
    true,
    'Should return false because type is timeRange and value is an array'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.multiSelect, true),
    false,
    'Should return false because type is multiSelect and value is not an array'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.multiSelect, []),
    false,
    'Should return false because type is multiSelect and value is an empty array'
  );

  t.equal(
    isValidFilterValue(FILTER_TYPES.multiSelect, [1]),
    true,
    'Should return false because type is multiSelect and value is an array'
  );

  t.end();
});

test('filterUtils -> isInPolygon', t => {
  t.equal(
    isInPolygon([120.47448, 23.667604], {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [120.21949418752885, 23.755486652156186],
            [120.21949418752885, 23.221461105318184],
            [121.05994828909135, 23.221461105318184],
            [121.05994828909135, 23.755486652156186],
            [120.21949418752885, 23.755486652156186]
          ]
        ]
      },
      properties: {
        renderType: 'Rectangle',
        isClosed: true,
        bbox: {
          xmin: 120.21949418752885,
          xmax: null,
          ymin: 23.755486652156186,
          ymax: null
        },
        isVisible: true,
        filterId: 'z1ilfjv6'
      },
      id: '036d9e21-af6b-4350-aab9-f1ce37c35cce'
    }),
    true,
    'Should return true because the point is within the polygon'
  );

  t.equal(
    isInPolygon([119.47448, 23.667604], {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [120.21949418752885, 23.755486652156186],
            [120.21949418752885, 23.221461105318184],
            [121.05994828909135, 23.221461105318184],
            [121.05994828909135, 23.755486652156186],
            [120.21949418752885, 23.755486652156186]
          ]
        ]
      },
      properties: {
        renderType: 'Rectangle',
        isClosed: true,
        bbox: {
          xmin: 120.21949418752885,
          xmax: null,
          ymin: 23.755486652156186,
          ymax: null
        },
        isVisible: true,
        filterId: 'z1ilfjv6'
      },
      id: '036d9e21-af6b-4350-aab9-f1ce37c35cce'
    }),
    false,
    'Should return false because the point is not within the polygon'
  );

  t.end();
});

test('filterUtils -> validatePolygonFilter', t => {
  const filter = {
    layerId: ['layer1'],
    dataId: ['puppy'],
    value: {
      id: 'feature_1',
      geometry: {
        coordinates: []
      }
    },
    type: 'polygon'
  };

  const dataset = {
    id: 'puppy'
  };

  const layers = [
    {
      id: 'layer1'
    }
  ];

  t.deepEqual(
    validatePolygonFilter(dataset, filter, layers).filter,
    {
      ...filter,
      fieldIdx: []
    },
    'Should positively validate filter'
  );

  t.equal(
    validatePolygonFilter(dataset, filter, [{id: 'layer2'}]).filter,
    null,
    'Should not validate the filter since layers are not matched'
  );

  t.equal(
    validatePolygonFilter(dataset, {}, layers).filter,
    null,
    'Should not validate empty filter'
  );

  t.deepEqual(
    validatePolygonFilter(
      dataset,
      {
        ...filter,
        dataId: ['non_valid']
      },
      layers
    ).filter,
    null,
    'Should not validate filter with non existing dataId'
  );

  t.deepEqual(
    validatePolygonFilter(
      dataset,
      {
        ...filter,
        value: {
          id: 'wrong-value-for-polygon-type'
        }
      },
      layers
    ).filter,
    null,
    'Should not validate filter given type and value without corresponding layer'
  );

  t.end();
});

test('filterUtils -> Polygon getFilterFunction ', t => {
  const dataset = {
    id: 'puppy',
    data: mockPolygonData.data,
    fields: mockPolygonData.fields
  };

  const dataContainer = createDataContainer(dataset.data);

  const {layers, data} = mockPolygonData;

  const polygonFilter = generatePolygonFilter(layers, mockPolygonFeature);

  let filterFunction = getFilterFunction(null, dataset.id, polygonFilter, [], dataContainer);

  t.equal(filterFunction(data[0], 0), true, `Should return true because layer list is empty`);

  filterFunction = getFilterFunction(null, 'puppy-2', polygonFilter, layers, dataContainer);

  t.equal(
    filterFunction(data[0], 0),
    true,
    `${data[0][0]} - ${data[0][1]} should be inside the range`
  );

  t.end();
});

/* eslint-enable max-statements */

test('filterUtils -> diffFilters', t => {
  const testCases = [
    {
      filterRecord: {
        dynamicDomain: [],
        fixedDomain: [],
        cpu: [],
        gpu: []
      },
      oldFilterRecord: undefined,
      result: {
        dynamicDomain: null,
        fixedDomain: null,
        cpu: null,
        gpu: null
      }
    },
    {
      filterRecord: {
        dynamicDomain: [],
        fixedDomain: [],
        cpu: [],
        gpu: []
      },
      oldFilterRecord: {
        dynamicDomain: [],
        fixedDomain: [],
        cpu: [],
        gpu: []
      },
      result: {
        dynamicDomain: null,
        fixedDomain: null,
        cpu: null,
        gpu: null
      }
    },
    {
      filterRecord: {
        dynamicDomain: [{id: 'aa', name: 'hello', value: 'bb'}],
        fixedDomain: [{id: 'bb', name: 'ab', value: 'ab'}],
        cpu: [
          {id: 'dd', name: 'hey', value: 'ee'},
          {id: 'ee', name: 'ee', value: 'ff'}
        ],
        gpu: []
      },
      oldFilterRecord: {
        dynamicDomain: [{id: 'aa', name: 'hello', value: 'bb'}],
        fixedDomain: [
          {id: 'bb', name: 'cd', value: 'ab'},
          {id: 'cc', name: 'world', value: 'dd'}
        ],
        cpu: [{id: 'ee', name: 'ee', value: 'gg'}],
        gpu: []
      },
      result: {
        dynamicDomain: null,
        fixedDomain: {bb: 'name_changed', cc: 'deleted'},
        cpu: {dd: 'added', ee: 'value_changed'},
        gpu: null
      }
    }
  ];

  testCases.forEach(({filterRecord, oldFilterRecord, result}) => {
    t.deepEqual(
      diffFilters(filterRecord, oldFilterRecord),
      result,
      'diff filters should be correct'
    );
  });

  t.end();
});

test('filterUtils -> getTimestampFieldDomain', t => {
  const timeData = {
    zero: {
      input: ['2016-10-01 09:45:39', '2016-10-01 09:45:39'],
      expect: {
        domain: [1475315139000, 1475315140000],
        mappedValue: [1475315139000, 1475315139000],
        step: 0.05,
        defaultTimeFormat: 'L LTS'
      }
    },
    tiny: {
      input: ['2016-10-01 09:45:39.001', '2016-10-01 09:45:39.002', '2016-10-01 09:45:39.003'],
      expect: {
        domain: [1475315139001, 1475315139003],
        mappedValue: [1475315139001, 1475315139002, 1475315139003],
        step: 0.1,
        defaultTimeFormat: 'L LTS'
      }
    },
    small: {
      input: ['2016-10-01 09:45:39.010', '2016-10-01 09:45:39.020', '2016-10-01 09:45:39.030'],
      expect: {
        domain: [1475315139010, 1475315139030],
        mappedValue: [1475315139010, 1475315139020, 1475315139030],
        step: 1,
        defaultTimeFormat: 'L LTS'
      }
    },
    medium: {
      input: ['2016-10-01 09:45:39.100', '2016-10-01 09:45:39.200', '2016-10-01 09:45:39.300'],
      expect: {
        domain: [1475315139100, 1475315139300],
        mappedValue: [1475315139100, 1475315139200, 1475315139300],
        step: 5,
        defaultTimeFormat: 'L LTS'
      }
    },
    large: {
      input: ['2016-10-01 09:45:39', '2016-10-01 09:45:45'],
      expect: {
        domain: [1475315139000, 1475315145000],
        mappedValue: [1475315139000, 1475315145000],
        step: 1000,
        defaultTimeFormat: 'L LTS'
      }
    }
  };

  Object.keys(timeData).forEach(key => {
    const dataContainer = createDataContainer(timeData[key].input.map(d => [d]));
    const valueAccessor = dc => d => moment.utc(dc.valueAt(d.index, 0)).valueOf();
    const tsFieldDomain = getTimestampFieldDomain(dataContainer, valueAccessor(dataContainer));

    t.deepEqual(
      Object.keys(tsFieldDomain).sort(),
      Object.keys(timeData[key].expect).sort(),
      'domain should have same keys'
    );

    Object.keys(timeData[key].expect).forEach(k => {
      // histogram is created by d3, only need to test they exist
      t.deepEqual(tsFieldDomain[k], timeData[key].expect[k], `time domain ${k} should be the same`);
    });
  });

  t.end();
});

test('filterUtils -> scaleSourceDomainToDestination', t => {
  const sourceDomain = [1564174363000, 1564179109000];
  const destinationDomain = [1564174363000, 1564184336370];

  t.deepEqual(
    scaleSourceDomainToDestination(sourceDomain, destinationDomain),
    [0, 47.586723444532794]
  );

  t.end();
});

test('filterUtils -> mergeFilterWithTimeline', t => {
  const animationConfig = {
    domain: [1564174363000, 1564179109000],
    currentTime: 1564178316089.6846,
    speed: 1,
    isAnimating: false,
    timeSteps: null,
    timeFormat: null,
    timezone: null,
    defaultTimeFormat: 'L LTS',
    duration: null
  };

  const filter = {
    dataId: ['fe422b77-b0fd-4c0e-848c-190e7bf94a72'],
    id: 'daqu9ulv',
    fixedDomain: true,
    enlarged: true,
    isAnimating: false,
    animationWindow: 'free',
    speed: 1,
    name: ['DateTime'],
    type: 'timeRange',
    fieldIdx: [0],
    domain: [1564176748230, 1564184336370],
    value: [1564176936089.6848, 1564178316089.6846],
    plotType: {
      interval: '1-minute',
      defaultTimeFormat: 'L  LT',
      type: 'histogram',
      aggregation: 'sum'
    },
    yAxis: null,
    gpu: true,
    syncedWithLayerTimeline: true,
    syncTimelineMode: 1,
    step: 1000,
    mappedValue: [
      1564176748230, 1564177260220, 1564178662720, 1564178735140, 1564182284550, 1564183811180,
      1564184245340, 1564184331290, 1564184336370
    ],
    defaultTimeFormat: 'L LTS',
    fieldType: 'timestamp',
    timeBins: {
      'fe422b77-b0fd-4c0e-848c-190e7bf94a72': {
        '1-minute': [
          {
            count: 1,
            indexes: [0],
            x0: 1564176720000,
            x1: 1564176780000
          },
          {
            count: 1,
            indexes: [1],
            x0: 1564177260000,
            x1: 1564177320000
          },
          {
            count: 1,
            indexes: [2],
            x0: 1564178640000,
            x1: 1564178700000
          },
          {
            count: 1,
            indexes: [3],
            x0: 1564178700000,
            x1: 1564178760000
          },
          {
            count: 1,
            indexes: [4],
            x0: 1564182240000,
            x1: 1564182300000
          },
          {
            count: 1,
            indexes: [5],
            x0: 1564183800000,
            x1: 1564183860000
          },
          {
            count: 1,
            indexes: [6],
            x0: 1564184220000,
            x1: 1564184280000
          },
          {
            count: 2,
            indexes: [7, 8],
            x0: 1564184280000,
            x1: 1564184340000
          }
        ]
      }
    },
    gpuChannel: [0]
  };

  const {filter: newFilter, animationConfig: newAnimationConfig} = mergeFilterWithTimeline(
    filter,
    animationConfig
  );

  t.deepEqual(
    newFilter.domain,
    [1564174363000, 1564184336370],
    'Merged filter should have the same domain'
  );

  t.deepEqual(
    newAnimationConfig.domain,
    [1564174363000, 1564184336370],
    'Merged animationConfig should have the same domain'
  );

  t.deepEqual(
    newFilter.domain,
    newAnimationConfig.domain,
    'New filter and animationConfig should have the same domain'
  );

  t.end();
});
