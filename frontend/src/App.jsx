import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import { Toaster, toast } from 'react-hot-toast';

import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

const socket = io("https://crisis-app-67f7.onrender.com");

// 1. Initialize the audio file from the public folder
const alarmSound = new Audio('/alarm.mp3');

function DynamicMapUpdater({ centerLocation }) {
  const map = useMap();
  useEffect(() => {
    if (centerLocation) {
      map.flyTo(centerLocation, 14); 
    }
  }, [centerLocation, map]);
  return null;
}

export default function App() {
  const [pins, setPins] = useState({});
  const [mapFocus, setMapFocus] = useState(null); 

  useEffect(() => {
    socket.on('initial_pins', (data) => setPins(data));
    
    socket.on('new_pin', (newPin) => {
      setPins((prev) => ({ ...prev, [newPin.id]: newPin }));
      
      toast.error("🚨 NEW SOS DETECTED! Zooming to victim...", {
        duration: 5000,
        style: { fontWeight: 'bold', fontSize: '16px' }
      });
      
      // 2. Play the sound. The .catch() prevents the app from crashing 
      // if the browser blocks it due to the Autoplay Policy.
      alarmSound.play().catch((err) => {
        console.warn("Browser blocked the alarm sound. The user needs to click anywhere on the page first.", err);
      });
      
      setMapFocus([newPin.lat, newPin.lng]);
    });
    
    socket.on('pin_updated', (updatedPin) => {
      setPins((prev) => ({ ...prev, [updatedPin.id]: updatedPin }));
      if (updatedPin.status === 'claimed') {
        toast.success(`Rescue claimed for victim ${updatedPin.id.substring(0, 4)}`);
      }
    });

    return () => {
      socket.off('initial_pins');
      socket.off('new_pin');
      socket.off('pin_updated');
    };
  }, []);

  const requestHelp = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const coords = [position.coords.latitude, position.coords.longitude];
        setMapFocus(coords); 

        const newSignal = {
          id: Math.random().toString(36).substring(2, 9),
          lat: coords[0],
          lng: coords[1],
          status: 'pending'
        };
        
        setPins((prev) => ({ ...prev, [newSignal.id]: newSignal }));
        socket.emit('need_help', newSignal);
      }, (error) => {
        toast.error("Please allow location access to request help.");
      });
    } else {
      toast.error("Geolocation is not supported by your browser.");
    }
  };

  // 3. Optional feature: A function to let volunteers test the alarm volume
  const testAlarm = () => {
    alarmSound.play();
    toast("Testing alarm volume...");
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      
      <Toaster position="top-right" reverseOrder={false} />

      <div style={{ padding: '20px', background: '#2c3e50', textAlign: 'center', position: 'relative' }}>
        <button 
          onClick={requestHelp} 
          style={{ padding: '15px 30px', fontSize: '18px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          🚨 TAP FOR SOS RESCUE 🚨
        </button>
        <p style={{ color: 'white', margin: '10px 0 0 0' }}>It will grab your exact GPS location.</p>
        
        {/* Added a small button to test the audio and satisfy the browser's interaction rule */}
        <button 
          onClick={testAlarm} 
          style={{ position: 'absolute', right: '20px', top: '20px', padding: '8px 12px', background: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          🔊 Test Alarm
        </button>
      </div>
      
      <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ flexGrow: 1, width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <DynamicMapUpdater centerLocation={mapFocus} />
        
        {Object.values(pins).map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]}>
            <Popup>
              <strong>Status:</strong> {pin.status.toUpperCase()} <br /><br />
              {pin.status === 'pending' ? (
                <button onClick={() => socket.emit('claim_rescue', pin.id)} style={{ padding: '8px', background: '#27ae60', color: 'white', border: 'none', cursor: 'pointer' }}>
                  I am on my way (Claim)
                </button>
              ) : (
                <span style={{ color: '#f39c12', fontWeight: 'bold' }}>Help is incoming!</span>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}