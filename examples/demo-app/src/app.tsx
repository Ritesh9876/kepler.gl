// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback, useEffect, useRef, useState} from 'react';
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer';
import styled, {ThemeProvider, StyleSheetManager} from 'styled-components';
import Window from 'global/window';
import {connect, useDispatch} from 'react-redux';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import {useSelector} from 'react-redux';
import isPropValid from '@emotion/is-prop-valid';
import {WebMercatorViewport} from '@deck.gl/core';
import {ScreenshotWrapper} from '@openassistant/ui';
import {
  setStartScreenCapture,
  setScreenCaptured,
  AiAssistantPanel,
  setMapBoundary
} from '@kepler.gl/ai-assistant';
import {panelBorderColor, theme} from '@kepler.gl/styles';
import {ParsedConfig} from '@kepler.gl/types';
import {getApplicationConfig,} from '@kepler.gl/utils';
import {SqlPanel} from '@kepler.gl/duckdb';
import Banner from './components/banner';
import Announcement, {FormLink} from './components/announcement';
import {replaceLoadDataModal} from './factories/load-data-modal';
import {replaceMapControl} from './factories/map-control';
import {replacePanelHeader} from './factories/panel-header';
import {CLOUD_PROVIDERS_CONFIGURATION, DEFAULT_FEATURE_FLAGS} from './constants/default-settings';
import {messages} from './constants/localization';
import {PMTilesSource, PMTilesMetadata} from '@loaders.gl/pmtiles';
import {MVTSource, TileJSON} from '@loaders.gl/mvt';
import {LayerClasses,VectorTileLayer} from '@kepler.gl/layers'
import {
  loadRemoteMap,
  loadSampleConfigurations,
  onExportFileSuccess,
  onLoadCloudMapSuccess
} from './actions';

import {
  loadCloudMap,
  addDataToMap,
  replaceDataInMap,
  toggleMapControl,
  toggleModal,
  updateVisData,
  addLayer,
  layerVisualChannelConfigChange,
  fitBounds
} from '@kepler.gl/actions';
import {CLOUD_PROVIDERS} from './cloud-providers';
import {Panel, PanelGroup, PanelResizeHandle} from 'react-resizable-panels';

const KeplerGl = require('@kepler.gl/components').injectComponents([
  replaceLoadDataModal(),
  replaceMapControl(),
  replacePanelHeader()
]);

// Sample data
/* eslint-disable no-unused-vars */
import sampleTripData, {testCsvData, sampleTripDataConfig} from './data/sample-trip-data';
// import sampleGeojson from './data/sample-small-geojson';
// import sampleGeojsonPoints from './data/sample-geojson-points';
import sampleGeojsonConfig from './data/sample-geojson-config';
import sampleH3Data, {config as h3MapConfig} from './data/sample-hex-id-csv';
import sampleS2Data, {config as s2MapConfig, dataId as s2DataId, dataId} from './data/sample-s2-data';
import sampleAnimateTrip, {
  pointData,
  pointDataId,
  animateTripDataId,
  replacePointData,
  config as syncedTripConfig
} from './data/sample-animate-trip-data';
import sampleIconCsv from './data/sample-icon-csv';
import sampleGpsData from './data/sample-gps-data';
import sampleRowData, {config as rowDataConfig} from './data/sample-row-data';
import {processCsvData, processGeojson, processRowObject} from '@kepler.gl/processors';
import { VectorTileDatasetMetadata, ALL_FIELD_TYPES,DatasetType, REMOTE_TILE, RemoteTileFormat } from '@kepler.gl/constants';
import {
  FilterProps,
  NumericFieldFilterProps,
  StringFieldFilterProps,
  default as KeplerDataset
} from '@kepler.gl/table';

import {DATA_TYPES as ANALYZER_DATA_TYPES} from 'type-analyzer';
import {DATA_TYPES} from 'type-analyzer';
import { getFilterProps, parseVectorMetadata } from './vector-utils';
import {Merge} from '@kepler.gl/types';
import { findDefaultLayer } from '@kepler.gl/reducers';
import {guessDefaultLayer} from '@kepler.gl/ai-assistant'
import { validconfig, validdata } from './data/test_data';
/* eslint-enable no-unused-vars */


export const isPMTilesUrl = (url?: string | null) => url?.includes('.pmtiles');


enum PMTilesType {
  RASTER = 'raster',
  MVT = 'mvt'
}

// This implements the default behavior from styled-components v5
function shouldForwardProp(propName, target) {
  if (typeof target === 'string') {
    // For HTML elements, forward the prop if it is a valid HTML attribute
    return isPropValid(propName);
  }
  // For other elements, forward all props
  return true;
}

const BannerHeight = 48;
const BannerKey = `banner-${FormLink}`;
const keplerGlGetState = state => state.demo.keplerGl;

const GlobalStyle = styled.div`
  font-family: ff-clan-web-pro, 'Helvetica Neue', Helvetica, sans-serif;
  font-weight: 400;
  font-size: 0.875em;
  line-height: 1.71429;

  *,
  *:before,
  *:after {
    -webkit-box-sizing: border-box;
    -moz-box-sizing: border-box;
    box-sizing: border-box;
  }

  ul {
    margin: 0;
    padding: 0;
  }

  li {
    margin: 0;
  }

  a {
    text-decoration: none;
    color: ${props => props.theme.labelColor};
  }
`;

const CONTAINER_STYLE = {
  transition: 'margin 1s, height 1s',
  position: 'absolute',
  width: '100%',
  height: '100%',
  left: 0,
  top: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#333'
};

const StyledResizeHandle = styled(PanelResizeHandle)`
  background-color: ${panelBorderColor};
  &:hover {
    background-color: #555;
  }
  width: 100%;
  height: 5px;
  cursor: row-resize;
`;

const StyledVerticalResizeHandle = styled(PanelResizeHandle)`
  background-color: ${panelBorderColor};
  width: 4px;
  height: 100%;
  cursor: row-resize;

  &:hover {
    background-color: #555;
  }
`;

const App = props => {
  const [showBanner, toggleShowBanner] = useState(false);
  const {params: {id, provider} = {}, location: {query = {}} = {}} = props;
  const dispatch = useDispatch();
  const [used,setUsed] = useState(false)
  let xx = 'railroads.pmtiles1'
  // TODO find another way to check for existence of duckDb plugin
  const duckDbPluginEnabled = (getApplicationConfig().plugins || []).some(p => p.name === 'duckdb');
  const xfields = useSelector( state =>  state?.demo?.keplerGl?.map?.visState?.datasets?.[xx]?.fields)
  const xdataset =  useSelector( state =>  state?.demo?.keplerGl?.map?.visState?.datasets)
    const xvisState =  useSelector( state =>  state?.demo?.keplerGl?.map?.visState)

  const isSqlPanelOpen = useSelector(
    state => duckDbPluginEnabled && state?.demo?.keplerGl?.map?.uiState.mapControls.sqlPanel?.active
  );


  
  const isAiAssistantPanelOpen = useSelector(
    state => state?.demo?.keplerGl?.map?.uiState.mapControls.aiAssistant?.active
  );
  const prevQueryRef = useRef<number>(null);


   const _onTilesetAdded = ( // use this to directly add programmtically
      tileset: {name: string; type: string; metadata: Record<string, any>},
      processedMetadata?: Record<string, any>
    ) => {
      console.log('**/tileset ',tileset,processedMetadata)
      dispatch(
      updateVisData(
        {
          info: {id: 'lolo.pbf',label: tileset.name, type: tileset.type, format: 'rows'},
          data: {
            fields: processedMetadata?.fields || [],
            rows: []
          },
          metadata: {
            ...processedMetadata,
            ...tileset.metadata,
            colorField: 'devices_monthly'
          },
          // Vector tile layer supports GPU filtering for numeric and boolean fields
          supportedFilterTypes: [
            ALL_FIELD_TYPES.real,
            ALL_FIELD_TYPES.integer,
            ALL_FIELD_TYPES.boolean
          ],
          disableDataOperation: true
        },
        {
          autoCreateLayers: true,
          centerMap: true
        },
        {
          visState: {
            layers: [
            {
              id: 'testLayer.pbf',
              type: 'vector-tile',
              config: {
                dataId: 'lolo.pbf',
                label: 'lolo.pbf',
                color: [255, 0, 0],
                columns: {

                }
              }
            }
          ]

          }
        }
      ))
    
    }

     type VectorTilesetFormData = {
  name: string;
  dataUrl: string;
  metadataUrl?: string;
};

 type DatasetCreationAttributes = {
  name: string;
  type: string;
  metadata: Record<string, any>;
};

 type VectorTileDatasetCreationAttributes = Merge<
  DatasetCreationAttributes,
  {
    metadata: VectorTileDatasetMetadata;
  }
>;
    function getDatasetAttributesFromVectorTile({
  name,
  dataUrl,
  metadataUrl
}: VectorTilesetFormData): VectorTileDatasetCreationAttributes {
  return {
    name,
    type: DatasetType.VECTOR_TILE,
    metadata: {
      type: REMOTE_TILE,
      remoteTileFormat: isPMTilesUrl(dataUrl) ? RemoteTileFormat.PMTILES : RemoteTileFormat.MVT,
      tilesetDataUrl: dataUrl,
      tilesetMetadataUrl: metadataUrl
    }
  };
}

  async function xy(id: number | string) {
    // https://r2-public.protomaps.com/protomaps-sample-datasets/nz-buildings-v3.pmtiles
    let datauri = 'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles.pmtiles?report_id=37167'
    let metauri = 'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles.pmtiles?report_id=37167'
 let checkmetadata =  PMTilesSource.createDataSource(datauri, {})
 console.log('**/check edata ',checkmetadata)
  let metadata = await checkmetadata.metadata;

    let finalData =       parseVectorMetadata(metadata,
      {tileUrl: datauri}
    )
        console.log('[tile metadata] standAlone ',finalData) 
    

        const dataset = getDatasetAttributesFromVectorTile({
        name: `lolo_${id}.pbf`,
        dataUrl: datauri,
        metadataUrl: metauri
      });

      _onTilesetAdded(dataset, finalData)
    return finalData
  }

  



  function findDefaultLayer2(dataset, layerClasses) {
  if (!dataset) {
    return [];
  }

  const layerProps = (Object.keys(layerClasses)).reduce(
    (previous, lc) => {
      const result =
        typeof layerClasses[lc].findDefaultLayerProps === 'function'
          ? layerClasses[lc].findDefaultLayerProps(dataset, previous)
          : {props: []};

      const props = Array.isArray(result) ? result : result.props || [];
      const foundLayers = result.foundLayers || previous;

      return foundLayers.concat(
        props.map(p => ({
          ...p,
          type: lc,
          dataId: dataset.id,
          // set arc layer initial visiblity to false, because arcs tend to be too musy
          ...(lc === 'arc' || lc === 'line' ? {isVisible: false} : {})
        }))
      );
    },
    [] 
  );
  
  // go through all layerProps to create layer
  let xx =  layerProps.map(props => {
    const layer = new layerClasses[props.type](props);
    
  //  return layer
     typeof layer.setInitialLayerConfig === 'function' && dataset.dataContainer
      ? layer.setInitialLayerConfig(dataset)
      : layer;

      return layer.updateLayerConfig({
    colorField: dataset.fields.find(item => item.name === 'devices_monthly')
  })
  });
  
    console.log('**/[findDefaultLayer] came here',layerProps,xx,dataset)

  return xx

}


  useEffect(() => {
    console.log('**/xfields ',xfields)

    if(!xfields) return;
    if(used) return;

    let kkfield = xfields.find(item => item.name === 'devices_monthly')
    console.log('**/xfields single ',kkfield)
       // xy(1)
    // xy(2)
      setUsed(true)
    let layer1 = new LayerClasses['vectorTile']({
    "dataId": "railroads.pmtiles1",
    "label": "testadd.pmtiles",
    "isVisible": true,
    "type": "vectorTile"
})
// let koko =findDefaultLayer2(xdataset[xx],LayerClasses) //findDefaultLayer(xdataset[xx],LayerClasses)
layer1.updateLayerMeta(xdataset[xx],xdataset)
layer1.setInitialLayerConfig(xdataset[xx])

console.log('[app.tsx] layer1 before color update',layer1,xdataset[xx])
 // kkfield
// layer1.updateLayerConfig({
//   colorField: kkfield
// //   {
// //     "name": "devices_monthly",
// //     "id": "devices_monthly",
// //     // "format": "",
// //     // "filterProps": {
// //     //     "domain": [
// //     //         3,
// //     //         1024
// //     //     ],
// //     //     "value": [
// //     //         3,
// //     //         1024
// //     //     ],
// //     //     "type": "range",
// //     //     "typeOptions": [
// //     //         "range"
// //     //     ],
// //     //     "gpu": true,
// //     //     "step": 1
// //     // },
// //     "type": "real",
// //     // "analyzerType": "FLOAT",
// //     // "fieldIdx": 6,
// //     // "displayName": "devices_monthly"
// // }
// })
console.log('[app.tsx] layer1',layer1)

  //  if(xvisState)
    dispatch(fitBounds(xvisState?.datasets[xx]?.metadata?.bounds))
    dispatch(addLayer(layer1,'railroads.pmtiles1'))
    dispatch(layerVisualChannelConfigChange(layer1,{
    colorField: kkfield,
   
    },
     'color'
  ))
        // _loadVectorTileData()
  // setTimeout(() => {
  //   dispatch(addLayer(layer1,'railroads.pmtiles1'))
  // },5000)

  },[xfields])


  useEffect(() => {
        dispatch(
      addDataToMap({
        options: {
         autoCreateLayers: false
        },
        datasets: [
          {
            info: {
              label: 'test_data',
              id: 'test_data'
            },
            data:processRowObject(validdata), //    processRowObject(sampleRowData), // 
          }
        ],
        config: validconfig //   rowDataConfig // 
      }) 
    );
  },[])
  useEffect( () => {
    
 _loadVectorTileData()
    // if we pass an id as part of the url
    // we try to fetch along map configurations
    const cloudProvider = CLOUD_PROVIDERS.find(c => c.name === provider);
    if (cloudProvider) {
      // Prevent constant reloading after change of the location
      if (isEqual(prevQueryRef.current, {provider, id, query})) {
        return;
      }

      dispatch(
        loadCloudMap({
          loadParams: query,
          provider: cloudProvider,
          onSuccess: onLoadCloudMapSuccess
        })
      );
      prevQueryRef.current = {provider, id, query};
      return;
    }

    // Load sample using its id
    if (id) {
      dispatch(loadSampleConfigurations(id));
    }

    // Load map using a custom
    if (query.mapUrl) {
      // TODO?: validate map url
      dispatch(loadRemoteMap({dataUrl: query.mapUrl}));
    }

    if (duckDbPluginEnabled && query.sql) {
      dispatch(toggleMapControl('sqlPanel', 0));
      dispatch(toggleModal(null));
    }

    // delay zs to show the banner
    // if (!window.localStorage.getItem(BannerKey)) {
    //   window.setTimeout(_showBanner, 3000);
    // }
    // load sample data
    _loadSampleData();

    // Notifications

    // no dependencies, as this was part of componentDidMount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Update map boundary when view state changes, used by ai-assistant to
   * get data from vector tiles when map boundary changes
   */
  const onViewStateChange = useCallback(
    viewState => {
      const viewport = new WebMercatorViewport(viewState);
      const nw = viewport.unproject([0, 0]);
      const se = viewport.unproject([viewport.width, viewport.height]);
      dispatch(setMapBoundary(nw, se));
    },
    [dispatch]
  );

  const _setStartScreenCapture = useCallback(
    flag => {
      dispatch(setStartScreenCapture(flag));
    },
    [dispatch]
  );

  const _setScreenCaptured = useCallback(
    screenshot => {
      dispatch(setScreenCaptured(screenshot));
    },
    [dispatch]
  );

  /*
  const _showBanner = useCallback(() => {
    toggleShowBanner(true);
  }, [toggleShowBanner]);
  */

  const hideBanner = useCallback(() => {
    toggleShowBanner(false);
  }, [toggleShowBanner]);

  const _disableBanner = useCallback(() => {
    hideBanner();
    Window.localStorage.setItem(BannerKey, 'true');
  }, [hideBanner]);

  const _loadRowData = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'Sample Visit Data',
              id: 'sample_visit_data'
            },
            data: processRowObject(sampleRowData)//processRowObject(sampleRowData)
          }
        ],
        config: rowDataConfig //rowDataConfig
      })
    );
  }, [dispatch]);

  const _loadVectorTileData = useCallback(async () => {
    let randomnum = 1//Math.random()
    
let datauri = 'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles.pmtiles?report_id=37167'
    let metauri = 'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles.pmtiles?report_id=37167'
 let checkmetadata =  PMTilesSource.createDataSource(datauri, {

  loadOptions: {
          
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      console.log('**/fetch PMTiles with auth', input);
      const authToken = 'helloworld';// this.getAuthToken();
      const authInit: RequestInit = {
        ...init,
        headers: {
          ...init?.headers,
          // Add authorization token if available
         ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      };
      return fetch(input, authInit);
    }
  }
 })
 return
  let metadata = await checkmetadata.metadata;

    let processedMetadata =       parseVectorMetadata(metadata,
      {tileUrl: datauri}
    )
    

        const tileset = getDatasetAttributesFromVectorTile({
        name: `lolo_${id}.pbf`,
        dataUrl: datauri,
        metadataUrl: metauri
      });

    
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'Railroads' + randomnum,
              id: 'railroads.pmtiles' + randomnum,
              color: [255, 0, 0],
              type: 'vector-tile'
            },
            data: {
              rows: [],
              fields: processedMetadata?.fields || [],
            },
            supportedFilterTypes: [
            ALL_FIELD_TYPES.real,
            ALL_FIELD_TYPES.integer,
            ALL_FIELD_TYPES.boolean
          ],
            metadata: {
              ...processedMetadata,
            ...tileset.metadata,
          
            //   name: 'output.pmtiles',
            //   description: 'output.pmtiles',
            //   type: 'remote',
            //   remoteTileFormat: 'pmtiles',
            //   tilesetDataUrl:'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles-2.pmtiles?report_id=35390',
            //     //'https://4sq-studio-public.s3.us-west-2.amazonaws.com/pmtiles-test/161727fe-7952-4e57-aa05-850b3086b0b2.pmtiles',
            //   tilesetMetadataUrl:
            //   'http://localhost:11005/sherlock/api/v3/mobility/delta/get_pmtiles-2.pmtiles?report_id=35390',
            //  //   'https://4sq-studio-public.s3.us-west-2.amazonaws.com/pmtiles-test/161727fe-7952-4e57-aa05-850b3086b0b2.pmtiles',
            //   id: 'sz6uy1xtj',
              format: 'rows',
            //   label: 'output.pmtiles',
            //   metaJson: null,
            //   bounds: [-150.1122219, -51.8952777, 179.3577783, 69.6043747],
            //   center: [14.0625, 50.7026397, 6],
            //   // colorField: 'category',
            //   // visualChannels: {
            //   //   colorField: {name: 'category'}
            //   // },
            //   maxZoom: 6,
            //   minZoom: 0,
              // fields: [
              //   {
              //     name: 'continent',
              //     id: 'continent',
              //     format: '',
              //     filterProps: {
              //       domain: [
              //         'Africa',
              //         'Asia',
              //         'Europe',
              //         'North America',
              //         'Oceania',
              //         'South America'
              //       ],
              //       value: [],
              //       type: 'multiSelect',
              //       gpu: false
              //     },
              //     type: 'string',
              //     analyzerType: 'STRING'
              //   }
              // ]
            }
          }
        ],
        options: {
          autoCreateLayers: false
        }
      })
    );


  //   let layer1 = 
  //   dispatch(layerVisualChannelConfigChange(xlayer[0],{
  //   colorField: kkfield,
   
  //   },
  //    'color'
  // ))
  }, [dispatch]);

  const _loadPointData = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'Sample Taxi Trips 1',
              id: 'test_trip_data',
              color: [255, 0, 0]
            },
            data: {
              rows: sampleTripData.rows.slice(0, 20),
              fields: cloneDeep(sampleTripData.fields)
            }
          },
          {
            info: {
              label: 'Sample Taxi Trips 2',
              id: 'test_trip_data_2',
              color: [0, 255, 0]
            },
            data: {
              rows: sampleTripData.rows.slice(5, sampleTripData.rows.length),
              fields: cloneDeep(sampleTripData.fields)
            }
          }
        ],
        options: {
          // centerMap: true,
          keepExistingConfig: true
        },
        config: sampleTripDataConfig
      })
    );
  }, [dispatch]);

  const _loadScenegraphLayer = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: {
          info: {
            label: 'Sample Scenegraph Ducks',
            id: 'test_trip_data'
          },
          data: processCsvData(testCsvData)
        },
        config: {
          version: 'v1',
          config: {
            visState: {
              layers: [
                {
                  type: '3D',
                  config: {
                    dataId: 'test_trip_data',
                    columns: {
                      lat: 'gps_data.lat',
                      lng: 'gps_data.lng'
                    },
                    isVisible: true
                  }
                }
              ]
            }
          }
        }
      })
    );
  }, [dispatch]);

  const _loadIconData = useCallback(() => {
    // load icon data and config and process csv file
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'Icon Data',
              id: 'test_icon_data'
            },
            data: processCsvData(sampleIconCsv)
          }
        ]
      })
    );
  }, [dispatch]);

  const _loadTripGeoJson = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {label: 'Trip animation', id: animateTripDataId},
            data: processGeojson(sampleAnimateTrip)
          }
        ]
      })
    );
  }, [dispatch]);

  const _loadGeojsonData = useCallback(() => {
    // load geojson
    const geojsonPoints = processGeojson(sampleGeojsonPoints);
    const geojsonZip = null; // processGeojson(sampleGeojson);
    dispatch(
      addDataToMap({
        datasets: [
          geojsonPoints
            ? {
                info: {label: 'Bart Stops Geo', id: 'bart-stops-geo'},
                data: geojsonPoints
              }
            : null,
          geojsonZip
            ? {
                info: {label: 'SF Zip Geo', id: 'sf-zip-geo'},
                data: geojsonZip
              }
            : null
        ].filter(d => d !== null),
        options: {
          keepExistingConfig: true
        },
        config: sampleGeojsonConfig as ParsedConfig
      })
    );
  }, [dispatch]);

  const _loadSyncedFilterWTripLayer = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {label: 'Trip animation', id: animateTripDataId},
            data: processGeojson(sampleAnimateTrip)
          },
          {
            info: {
              label: 'Sample Taxi Trips',
              id: pointDataId,
              color: [255, 0, 0]
            },
            data: pointData
          }
        ],
        config: syncedTripConfig,
        options: {
          centerMap: true
        }
      })
    );
  }, [dispatch]);

  const _replaceSyncedFilterWTripLayer = useCallback(() => {
    window.setTimeout(() => {
      dispatch(
        replaceDataInMap({
          datasetToReplaceId: pointDataId,
          datasetToUse: {
            info: {label: 'Sample Taxi Trips Replaced', id: `${pointDataId}-2`},
            data: replacePointData
          }
        })
      );
    }, 1000);
  }, [dispatch]);

  const _replaceData = useCallback(() => {
    // add geojson data
    const sliceData = processGeojson({
      type: 'FeatureCollection',
      features: sampleGeojsonPoints.features.slice(0, 5)
    });
    _loadGeojsonData();
    Window.setTimeout(() => {
      dispatch(
        replaceDataInMap({
          datasetToReplaceId: 'bart-stops-geo',
          datasetToUse: {
            info: {label: 'Bart Stops Geo Replaced', id: 'bart-stops-geo-2'},
            data: sliceData
          }
        })
      );
    }, 1000);
  }, [dispatch, _loadGeojsonData]);

  const _loadH3HexagonData = useCallback(() => {
    // load h3 hexagon
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'H3 Hexagons V2',
              id: 'h3-hex-id'
            },
            data: processCsvData(sampleH3Data)
          }
        ],
        config: h3MapConfig,
        options: {
          keepExistingConfig: true
        }
      })
    );
  }, [dispatch]);

  const _loadS2Data = useCallback(() => {
    // load s2
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'S2 Data',
              id: s2DataId
            },
            data: processCsvData(sampleS2Data)
          }
        ],
        config: s2MapConfig as ParsedConfig,
        options: {
          keepExistingConfig: true
        }
      })
    );
  }, [dispatch]);

  const _loadGpsData = useCallback(() => {
    dispatch(
      addDataToMap({
        datasets: [
          {
            info: {
              label: 'Gps Data',
              id: 'gps-data'
            },
            data: processCsvData(sampleGpsData)
          }
        ],
        options: {
          keepExistingConfig: true
        }
      })
    );
  }, [dispatch]);

  const _loadSampleData = useCallback(() => {
    // _loadPointData();
    // _loadGeojsonData();
    // _loadTripGeoJson();
    // _loadIconData();
    // _loadH3HexagonData();
    // _loadS2Data();
    // _loadScenegraphLayer();
    // _loadGpsData();
    // _loadRowData();
    // _loadVectorTileData();
    // _loadSyncedFilterWTripLayer();
    // _replaceSyncedFilterWTripLayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    _loadPointData,
    _loadGeojsonData,
    _loadTripGeoJson,
    _loadIconData,
    _loadH3HexagonData,
    _loadS2Data,
    _loadScenegraphLayer,
    _loadGpsData,
    _loadRowData,
    _replaceData,
    _loadVectorTileData,
    _loadSyncedFilterWTripLayer,
    _replaceSyncedFilterWTripLayer
  ]);

  return (
    <StyleSheetManager shouldForwardProp={shouldForwardProp}>
      <ThemeProvider theme={theme}>
        <GlobalStyle
        // this is to apply the same modal style as kepler.gl core
        // because styled-components doesn't always return a node
        // https://github.com/styled-components/styled-components/issues/617
        // ref={node => {
        //   node ? (this.root = node) : null;
        // }}
        >
          <ScreenshotWrapper
            startScreenCapture={props.demo.aiAssistant.screenshotToAsk.startScreenCapture}
            setScreenCaptured={_setScreenCaptured}
            setStartScreenCapture={_setStartScreenCapture}
            className="h-screen"
          >
            <Banner show={showBanner} height={BannerHeight} bgColor="#2E7CF6" onClose={hideBanner}>
              <Announcement onDisable={_disableBanner} />
            </Banner>
            <div style={CONTAINER_STYLE}>
              <PanelGroup direction="horizontal">
                <Panel defaultSize={isAiAssistantPanelOpen ? 70 : 100}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={isSqlPanelOpen ? 60 : 100}>
                      <AutoSizer>
                        {({height, width}) => (
                          <KeplerGl
                            mapboxApiAccessToken={CLOUD_PROVIDERS_CONFIGURATION.MAPBOX_TOKEN}
                            id="map"
                            getState={keplerGlGetState}
                            width={width}
                            height={height}
                            cloudProviders={CLOUD_PROVIDERS}
                            localeMessages={messages}
                            onExportToCloudSuccess={onExportFileSuccess}
                            onLoadCloudMapSuccess={onLoadCloudMapSuccess}
                            featureFlags={DEFAULT_FEATURE_FLAGS}
                            onViewStateChange={onViewStateChange}
                          />
                        )}
                      </AutoSizer>
                    </Panel>

                    {isSqlPanelOpen && (
                      <>
                        <StyledResizeHandle />
                        <Panel defaultSize={40} minSize={20}>
                          <SqlPanel initialSql={query.sql || ''} />
                        </Panel>
                      </>
                    )}
                  </PanelGroup>
                </Panel>
                {isAiAssistantPanelOpen && (
                  <>
                    <StyledVerticalResizeHandle />
                    <Panel defaultSize={30} minSize={20}>
                      <AiAssistantPanel />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </div>
          </ScreenshotWrapper>
        </GlobalStyle>
      </ThemeProvider>
    </StyleSheetManager>
  );
};

const mapStateToProps = state => state;
const dispatchToProps = dispatch => ({dispatch});

export default connect(mapStateToProps, dispatchToProps)(App);
