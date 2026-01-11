import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// 2. Fix for Leaflet's Default Icon issues in Webpack
// This ensures Leaflet uses the images we just imported
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const blueIcon = new L.Icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Force IPv4 for Windows/Docker compatibility
const socket = io('http://127.0.0.1:8080', { transports: ['websocket'] });

function MapFlyTo({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center && Array.isArray(center) && center.length === 2 && center[0] != null) {
            map.flyTo(center, 15, { duration: 2 });
        }
    }, [center, map]);
    return null;
}

export default function TruckMap() {
  const [trucks, setTrucks] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [focusLocation, setFocusLocation] = useState(null);

  useEffect(() => {
    socket.on('truck_update', (data) => {
      setTrucks(prev => ({ ...prev, [data.truckId]: data }));
    });

    socket.on('notification', (newAlert) => {
      setAlerts(prev => [newAlert, ...prev].slice(0, 10));
    });

    return () => socket.off();
  }, []);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '20px', fontFamily: 'Arial, sans-serif' }}>
      
      {/* MAP PANEL */}
      <div style={{ flex: 3, border: '2px solid #ccc', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
        <MapContainer center={[46.7712, 23.6236]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
            />
            {focusLocation && <MapFlyTo center={focusLocation} />}
            
            {Object.values(trucks).map((truck) => (
                <Marker 
                    key={truck.truckId} 
                    position={[truck.latitude, truck.longitude]}
                    icon={truck.vibration > 4.0 ? redIcon : blueIcon}
                >
                <Popup>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 5px 0', color: '#1976d2' }}>{truck.truckId}</h3>
                        <div>🌡️ {truck.temperature}°C</div>
                        <div>📉 {truck.vibration}G</div>
                    </div>
                </Popup>
                </Marker>
            ))}
        </MapContainer>
      </div>

      {/* ALERT PANEL */}
      <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: '#f8f9fa', 
          borderRadius: '12px', 
          border: '1px solid #ddd',
          overflow: 'hidden'
      }}>
        <div style={{ padding: '15px', background: '#e3f2fd', borderBottom: '1px solid #bbdefb' }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>📢 Live Alert Feed</h3>
            <small style={{ color: '#666' }}>Click alert to locate truck</small>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {alerts.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                    System Normal...
                </div>
            )}
            
            {alerts.map((alert) => (
                <div 
                    key={alert.id} 
                    onClick={() => setFocusLocation([alert.location.lat, alert.location.lng])}
                    style={{
                        marginBottom: '10px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#fff',
                        borderLeft: `5px solid ${alert.type === 'CRITICAL' ? '#d32f2f' : '#f57c00'}`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                        transition: 'transform 0.1s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong>{alert.truckId}</strong>
                        <span style={{ fontSize: '12px', color: '#888' }}>{alert.time}</span>
                    </div>
                    <div style={{ color: alert.type === 'CRITICAL' ? '#d32f2f' : '#e65100', fontWeight: 'bold', fontSize: '14px' }}>
                        {alert.message}
                    </div>

                    {alert.riskData && (
                        <div style={{ 
                            marginTop: '8px', 
                            padding: '6px', 
                            background: '#ffebee', 
                            borderRadius: '4px',
                            fontSize: '13px', 
                            color: '#b71c1c',
                            border: '1px solid #ffcdd2'
                        }}>
                            💰 <strong>Est. Loss: ${alert.riskData.estimatedLoss}</strong>
                            <br/>
                            📊 Risk Score: {alert.riskData.riskScore}/100
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
