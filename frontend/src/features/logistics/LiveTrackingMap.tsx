import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet icon issue in React
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Brand Icons
const RiderIcon = L.divIcon({
  className: "custom-rider-icon",
  html: `<div class="w-8 h-8 bg-brand rounded-full border-4 border-white shadow-xl flex items-center justify-center">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
             <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
             <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v4.05a2.5 2.5 0 014.9 0H18V10l-4-3z" />
           </svg>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const DestIcon = L.divIcon({
  className: "custom-dest-icon",
  html: `<div class="w-8 h-8 bg-accent rounded-full border-4 border-white shadow-xl flex items-center justify-center">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
             <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
           </svg>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

interface LiveTrackingMapProps {
  currentLocation: [number, number] | null;
  destination: [number, number] | null;
  pickup: [number, number] | null;
}

function RecenterMap({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

export function LiveTrackingMap({ currentLocation, destination, pickup }: LiveTrackingMapProps) {
  const points: [number, number][] = [];
  if (currentLocation) points.push(currentLocation);
  if (pickup) points.push(pickup);
  if (destination) points.push(destination);

  // Default center if no data (Dar es Salaam center)
  const defaultCenter: [number, number] = [-6.7924, 39.2083];

  return (
    <div className="h-[400px] md:h-[500px] w-full glass-card overflow-hidden relative z-0">
      <MapContainer 
        center={currentLocation || defaultCenter} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {pickup && (
          <Marker position={pickup}>
            <Popup><span className="font-bold">Pickup Location</span></Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={destination} icon={DestIcon}>
            <Popup><span className="font-bold">Delivery Destination</span></Popup>
          </Marker>
        )}

        {currentLocation && (
          <Marker position={currentLocation} icon={RiderIcon}>
            <Popup><span className="font-bold text-brand">Rider Current Position</span></Popup>
          </Marker>
        )}

        {pickup && destination && (
           <Polyline 
             positions={[pickup, destination]} 
             color="#0f766e" 
             dashArray="10, 10" 
             weight={2} 
             opacity={0.5}
           />
        )}

        <RecenterMap coords={points} />
      </MapContainer>
      
      <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
         <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Real-time GPS</span>
      </div>
    </div>
  );
}
