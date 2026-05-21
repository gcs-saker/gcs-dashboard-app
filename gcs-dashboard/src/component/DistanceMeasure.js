import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-measure';

function DistanceMeasure({ map }) {
  useEffect(() => {
    if (!map) return;

    const measureControl = new L.Control.Measure({
      position: 'topleft',
      primaryLengthUnit: 'meters',
      secondaryLengthUnit: 'kilometers',
      primaryAreaUnit: 'sqmeters',
      secondaryAreaUnit: 'hectares',
      activeColor: '#db4a29',
      completedColor: '#9b2d14'
    });

    map.addControl(measureControl);

    return () => {
      map.removeControl(measureControl);
    };
  }, [map]);

  return null;
}

export default DistanceMeasure;
