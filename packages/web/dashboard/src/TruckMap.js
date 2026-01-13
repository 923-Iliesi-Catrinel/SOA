import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Box } from '@mui/material';
import L from 'leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { useAuth } from '../../host/src/AuthContext';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for Leaflet's Default Icon issues in Webpack
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

export default function TruckMap(props) {
  const authContext = useAuth(); 
  const user = authContext?.user || props.user;
  const token = authContext?.token || props.token;
  const [trucks, setTrucks] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [myTruckIds, setMyTruckIds] = useState([]); // List of trucks carrying pharmacist's orders
  const [focusLocation, setFocusLocation] = useState(null);

  if (!user) {
    return <Box p={4}>Waiting for authentication...</Box>;
  }

  useEffect(() => {
    const fetchMyTrucks = async () => {
      if (user?.role === 'MANAGER') return; // Managers don't need to filter

      try {
        const res = await axios.get('http://localhost:8080/api/orders/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Get all unique truckIds assigned to my orders that are currently SHIPPED
        const assignedTrucks = res.data
          .filter(order => order.status === 'SHIPPED' && order.truckId)
          .map(order => order.truckId);
        
        setMyTruckIds([...new Set(assignedTrucks)]);
      } catch (err) {
        console.error("Could not fetch assigned trucks", err);
      }
    };

    fetchMyTrucks();
  }, [user, token]);

  useEffect(() => {
    socket.on('truck_update', (data) => {
      // If Manager OR if this truck is assigned to me
      if (user?.role === 'MANAGER' || myTruckIds.includes(data.truckId)) {
        setTrucks(prev => ({ ...prev, [data.truckId]: data }));
      }
    });

    socket.on('notification', (newAlert) => {
      // If Manager OR if alert is about my truck
      if (user?.role === 'MANAGER' || myTruckIds.includes(newAlert.truckId)) {
        setAlerts(prev => [newAlert, ...prev].slice(0, 10));
      }
    });

    return () => socket.off();
  }, [user, myTruckIds]);

  const title = user?.role === 'MANAGER' ? "All Orders Live Alerts" : "My Orders Live Alerts";

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
                        <h3 style={{ margin: '0 0 5px 0' }}>{truck.truckId}</h3>
                        <div>📦 Carrying your order</div>
                        <div>🌡️ {truck.temperature}°C | 📉 {truck.vibration}G</div>
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
            <h3 style={{ margin: 0, color: '#1565c0' }}>📢 {title}</h3>
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
                            💰 <strong>Est. Loss: ${alert.riskData.estimated_loss}</strong>
                            <br/>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
