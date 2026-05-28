import { 
    MapContainer, 
    TileLayer, 
    Marker, 
    Popup, 
    useMapEvents, 
    useMap,
    LayersControl, 
    Circle 
} from 'react-leaflet';
import { useState, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../App.scss';
import MiniMap from './MiniMap';
import DistanceMeasure from './DistanceMeasure';
import CompassControl from './CompassControl';
import 'leaflet-rotatedmarker';
import { rcIcon, droneIcon } from '../icon/customIcons';
import { fetchTelemetryNodes } from './telemetryFeed';


// 미니맵 추가 함수
function MapWithMiniMap() {
  const map = useMap();
  return <MiniMap map={map} />;
}

// 측정도구 추가가
function MapWithTools() {
  const map = useMap();
  return (
    <>
      <DistanceMeasure map={map} />
      <CompassControl map={map} />
    </>
  );
}


// 마커 아이콘 오류 방지 설정
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 컴포넌트: 사용자의 위치로 지도 이동
function LocateUser({ onLocated }) {
  const map = useMap();

  useEffect(() => {
    map.locate({
      setView: false,           // ⛔ setView 끔
      enableHighAccuracy: true,
    }).on("locationfound", function (e) {
      onLocated(e.latlng); // 위치는 가져오되 지도 이동은 안 함
    });
  }, [map, onLocated]);

  return null;
}

export default function MainMap({ setTelemetryMap }) {
  const [gpsPos, setGpsPos] = useState(null); // 대구 좌표
  const [nodeList, setNodeList] = useState([]); // 무인체 입력 노드

  useEffect(() => {
  let isMounted = true;

  const fetchLoop = async () => {
    try {
      const data = await fetchTelemetryNodes();

      if (isMounted) {
        // ✅ nodeList도 갱신해야 지도에 Marker가 찍힘
        setNodeList(data);

        const map = {};
        data.forEach((node) => (map[node.uuid] = node));
        setTelemetryMap(map);
      }
    } catch (err) {
      console.error("❌ 위치 요청 실패:", err);
    }

    if (isMounted) {
      setTimeout(fetchLoop, 2000); // 2초 후 다시 실행
    }
  };

  fetchLoop();

  return () => {
    isMounted = false; // 언마운트 시 루프 중단
  };
}, []);



  return (
    <div className="mainmap">
       <MapContainer
        center={[35.82599, 128.75597]} // 초기 대구
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
        />

        {/* 측정도구 추가 */}
        <MapWithTools />


        {/* 지도의 종류 선택 */}
        <LayersControl position="topright">
             <LayersControl.BaseLayer checked name="위성 지도 (Esri)">
                <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
                />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="OpenStreetMap">
                <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
                />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="야간 지도 (CartoDB Dark)">
                <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution="© CartoDB"
                />
            </LayersControl.BaseLayer>
        </LayersControl>

        {/* 위치 자동 탐색 */}
        <LocateUser onLocated={(latlng) => {
          console.log('🛰 GPS 위치 탐지됨:', latlng);
          setGpsPos(latlng);
        }} />

        {/* 사용자 위치 마커 */}
        {gpsPos && (
          <>
            <Marker position={gpsPos}>
              <Popup>📍 현재 위치 정보 </Popup>
            </Marker>
            <Circle center={gpsPos} radius={100} pathOptions={{ color: 'red' }} />
          </>
        )}

        {/* 노드 리스트 마커 출력 */}
        {nodeList.map((node) => (
          <Marker key={node.uuid} position={[node.latitude, node.longitude]}
          icon={
            node.uuid.includes("f")
              ? rcIcon
              : droneIcon
          }  
          >
            <Popup>
              노드: {node.uuid}<br />
              위도: {node.latitude.toFixed(5)} <br />
              경도: {node.longitude} <br />
              고도: {node.altitude}m<br />
              지자계: X={node.magneticX.toFixed(1)}<br />
              Y={node.magneticY.toFixed(1)}<br />
              Z={node.magneticZ.toFixed(1)}<br />
              무인체 배터리 : {node.soc} % <br />
              게이트웨이 배터리 : {node.phoneBatterySOC} % <br />
              속도 : {node.velocity} m/s <br />
              주행거리 : {node.totalDistance} m <br />
              주행시간 : {node.epochTime} s <br />
              충전소거리 : {node.portDistance} m <br />
            </Popup>
            <Circle
              center={[node.latitude, node.longitude]}
              radius={100}
              pathOptions={{ color: 'green' }}
            />
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
