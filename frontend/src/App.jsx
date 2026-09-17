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

// Replace with your local URL for testing, or Render URL for production
const BACKEND_URL = "https://crisis-app-67f7.onrender.com";
const socket = io(BACKEND_URL);
const alarmSound = new Audio('/alarm.mp3');

function DynamicMapUpdater({ centerLocation }) {
  const map = useMap();
  useEffect(() => {
    if (centerLocation) map.flyTo(centerLocation, 14); 
  }, [centerLocation, map]);
  return null;
}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('crisisUser');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Auth Form State
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [roleSelect, setRoleSelect] = useState('victim');

  const [pins, setPins] = useState({});
  const [mapFocus, setMapFocus] = useState(null); 
  const [isConnected, setIsConnected] = useState(false);

  const triggerAlarm = () => {
    alarmSound.currentTime = 0; 
    alarmSound.play().catch(err => console.warn("Audio blocked", err));
  };

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('initial_pins', (data) => setPins(data));
    
    socket.on('new_pin', (newPin) => {
      setPins((prev) => ({ ...prev, [newPin.id]: newPin }));
      if (user?.role === 'volunteer') {
        toast.error("🚨 NEW SOS DETECTED!");
        triggerAlarm();
        setMapFocus([newPin.lat, newPin.lng]);
      }
    });
    
    socket.on('pin_updated', (updatedPin) => {
      setPins((prev) => ({ ...prev, [updatedPin.id]: updatedPin }));
      if (updatedPin.status === 'claimed' && user?.role === 'victim' && updatedPin.victimName === user.name) {
        toast.success(`Help is incoming from ${updatedPin.rescuerName}!`);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('initial_pins');
      socket.off('new_pin');
      socket.off('pin_updated');
    };
  }, [user]);

  // --- DATABASE AUTHENTICATION ---
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !passwordInput.trim()) return toast.error("Fill out all fields");

    const endpoint = authMode === 'signup' ? '/signup' : '/login';
    
    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput, password: passwordInput, role: roleSelect })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setUser(data);
      localStorage.setItem('crisisUser', JSON.stringify(data));
      toast.success(`${authMode === 'signup' ? 'Account created' : 'Logged in'} as ${data.role}`);
      
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('crisisUser');
  };

  const requestHelp = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const coords = [position.coords.latitude, position.coords.longitude];
        setMapFocus(coords); 
        const newSignal = {
          id: Math.random().toString(36).substring(2, 9),
          victimName: user.name,
          lat: coords[0],
          lng: coords[1],
          status: 'pending'
        };
        setPins((prev) => ({ ...prev, [newSignal.id]: newSignal }));
        socket.emit('need_help', newSignal);
        toast.success("SOS Broadcasted Successfully!");
      }, () => toast.error("Please allow location access."));
    } else toast.error("Geolocation not supported.");
  };

  const claimRescue = (pinId) => {
    socket.emit('claim_rescue', { id: pinId, volunteerName: user.name });
    toast.success("You have claimed this rescue!");
  };

  // --- LOGIN UI ---
  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#ecf0f1', fontFamily: 'sans-serif' }}>
        <Toaster position="top-right" />
        <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '320px' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 20px 0', color: '#2c3e50' }}>Crisis Coordinator</h2>
          
          <div style={{ display: 'flex', marginBottom: '20px', cursor: 'pointer' }}>
            <div onClick={() => setAuthMode('login')} style={{ flex: 1, textAlign: 'center', padding: '10px', borderBottom: authMode === 'login' ? '3px solid #3498db' : '3px solid transparent', fontWeight: authMode === 'login' ? 'bold' : 'normal' }}>Login</div>
            <div onClick={() => setAuthMode('signup')} style={{ flex: 1, textAlign: 'center', padding: '10px', borderBottom: authMode === 'signup' ? '3px solid #3498db' : '3px solid transparent', fontWeight: authMode === 'signup' ? 'bold' : 'normal' }}>Sign Up</div>
          </div>

          <form onSubmit={handleAuth}>
            <input type="text" placeholder="Username" value={nameInput} onChange={(e) => setNameInput(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box' }} />
            <input type="password" placeholder="Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box' }} />
            
            <select value={roleSelect} onChange={(e) => setRoleSelect(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box' }}>
              <option value="victim">I Need Help (Victim)</option>
              <option value="volunteer">I Can Help (Volunteer)</option>
            </select>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              {authMode === 'login' ? 'Secure Login' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN MAP UI ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <Toaster position="top-right" />
      <div style={{ padding: '20px', background: '#2c3e50', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', left: '20px', top: '20px', color: isConnected ? '#2ecc71' : '#e74c3c', fontWeight: 'bold', fontSize: '14px' }}>
          {isConnected ? '🟢 Server Online' : '🔴 Server Sleeping (Wait...)'}
        </div>
        <h3 style={{ color: 'white', margin: '0 0 15px 0' }}>{user.name} ({user.role.toUpperCase()})</h3>
        
        {user.role === 'victim' && (
          <button onClick={requestHelp} style={{ padding: '15px 30px', fontSize: '18px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>🚨 TAP FOR SOS RESCUE 🚨</button>
        )}
        {user.role === 'volunteer' && (
          <button onClick={() => { triggerAlarm(); toast("Testing alarm..."); }} style={{ position: 'absolute', right: '20px', top: '20px', padding: '8px 12px', background: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🔊 Test Alarm</button>
        )}
        <button onClick={handleLogout} style={{ position: 'absolute', right: '20px', bottom: '20px', padding: '5px 10px', background: 'transparent', color: '#bdc3c7', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Logout</button>
      </div>
      
      <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ flexGrow: 1, width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <DynamicMapUpdater centerLocation={mapFocus} />
        {Object.values(pins).map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]}>
            <Popup>
              <strong>Victim:</strong> {pin.victimName} <br />
              <strong>Status:</strong> {pin.status.toUpperCase()} <br /><br />
              {pin.status === 'pending' ? (
                user.role === 'volunteer' ? (
                  <button onClick={() => claimRescue(pin.id)} style={{ padding: '8px', background: '#27ae60', color: 'white', border: 'none', cursor: 'pointer', width: '100%' }}>I am on my way (Claim)</button>
                ) : <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>Waiting for volunteer...</span>
              ) : <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Help is incoming from {pin.rescuerName}!</span>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}