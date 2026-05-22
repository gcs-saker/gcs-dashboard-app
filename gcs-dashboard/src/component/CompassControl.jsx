import { useEffect } from 'react';
import L from 'leaflet';
import '../App.scss'; // ✨ 스타일 따로

function CompassControl({ map }) {
  useEffect(() => {
    if (!map) return;

    const compass = L.control({ position: 'bottomleft' });

    compass.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-control-compass');
      div.innerHTML = `
        <img src="compass.png" alt="Compass" class="compass-image" />
      `;
      return div;
    };

    compass.addTo(map);

    return () => {
      compass.remove();
    };
  }, [map]);

  return null;
}

export default CompassControl;
