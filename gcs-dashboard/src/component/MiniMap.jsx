import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-minimap';
import 'leaflet-minimap/dist/Control.MiniMap.min.css';

function MiniMap({ map }) {
  useEffect(() => {
    if (!map) return;

    const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const osmAttrib = '&copy; OpenStreetMap contributors';
    const miniMapLayer = new L.TileLayer(osmUrl, { attribution: osmAttrib });

    const miniMap = new L.Control.MiniMap(miniMapLayer, {
      toggleDisplay: true,
      minimized: false,
      position: 'bottomright'
    }).addTo(map);

    return () => {
      miniMap.remove();
    };
  }, [map]);

  return null;
}

export default MiniMap;
