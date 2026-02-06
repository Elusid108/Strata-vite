// MapBlock Component - Interactive Leaflet map
// Extracted from Strata index.html Section F

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const MapBlock = ({ data, onUpdate, readOnly = false, height = 400, disableScrollWheel = false, locked = false }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const onUpdateRef = useRef(onUpdate);
  const dataRef = useRef(data);
  
  // Keep refs updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    dataRef.current = data;
  }, [onUpdate, data]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const mapData = data || {
      center: [40.7128, -74.0060],
      zoom: 13,
      markers: []
    };

    // Initialize Leaflet map
    const map = L.map(mapRef.current, {
      center: mapData.center || [40.7128, -74.0060],
      zoom: mapData.zoom || 13,
      scrollWheelZoom: !disableScrollWheel && !locked,
      dragging: !locked,
      touchZoom: !locked,
      doubleClickZoom: !locked,
      boxZoom: !locked,
      keyboard: !locked
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    // Add existing markers
    if (mapData.markers && mapData.markers.length > 0) {
      const mapId = mapRef.current.id || `map_${Date.now()}`;
      if (!mapRef.current.id) mapRef.current.id = mapId;
      mapData.markers.forEach((markerData, index) => {
        const marker = L.marker([markerData.lat, markerData.lng]).addTo(map);
        const popupContent = readOnly 
          ? markerData.label || 'Marker'
          : `<input type="text" value="${markerData.label || 'New Point'}" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px; width: 150px;" onblur="window.updateMarkerLabel_${mapId}(${index}, this.value)" />`;
        marker.bindPopup(popupContent);
        markersRef.current.push({ marker, data: markerData, index });
      });
    }

    // Store update function globally for popup input (using unique ID to avoid conflicts)
    if (!readOnly && onUpdate) {
      const mapId = mapRef.current.id || `map_${Date.now()}`;
      if (!mapRef.current.id) mapRef.current.id = mapId;
      window[`updateMarkerLabel_${mapId}`] = (index, newLabel) => {
        const mapData = dataRef.current || { center: [40.7128, -74.0060], zoom: 13, markers: [] };
        const updatedMarkers = [...(mapData.markers || [])];
        if (updatedMarkers[index]) {
          updatedMarkers[index] = { ...updatedMarkers[index], label: newLabel };
          if (onUpdateRef.current) {
            onUpdateRef.current({
              ...mapData,
              markers: updatedMarkers
            });
          }
        }
      };
    }

    // Handle map click to add markers (when not readOnly and not locked)
    if (!readOnly && !locked) {
      map.on('click', (e) => {
        const newMarker = {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          label: 'New Point'
        };
        
        const marker = L.marker([newMarker.lat, newMarker.lng]).addTo(map);
        const markerIndex = (mapData.markers || []).length;
        const mapId = mapRef.current.id || `map_${Date.now()}`;
        if (!mapRef.current.id) mapRef.current.id = mapId;
        const popupContent = `<input type="text" value="${newMarker.label}" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px; width: 150px;" onblur="window.updateMarkerLabel_${mapId}(${markerIndex}, this.value)" />`;
        marker.bindPopup(popupContent);
        marker.openPopup();
        
        const updatedMarkers = [...(mapData.markers || []), newMarker];
        markersRef.current.push({ marker, data: newMarker, index: markerIndex });
        
        if (onUpdate) {
          onUpdate({
            ...mapData,
            markers: updatedMarkers
          });
        }
      });
    }

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = [];
      }
    };
  }, []); // Only run once on mount

  // Update markers when data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !data) return;

    const mapData = data;
    const newMarkers = mapData.markers || [];

    // Remove markers that are no longer in data
    markersRef.current.forEach(({ marker }) => {
      mapInstanceRef.current.removeLayer(marker);
    });
    markersRef.current = [];

    // Add new markers
    newMarkers.forEach((markerData, index) => {
      const marker = L.marker([markerData.lat, markerData.lng]).addTo(mapInstanceRef.current);
      const mapId = mapRef.current?.id || `map_${Date.now()}`;
      const popupContent = readOnly 
        ? markerData.label || 'Marker'
        : `<input type="text" value="${markerData.label || 'New Point'}" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px; width: 150px;" onblur="window.updateMarkerLabel_${mapId}(${index}, this.value)" />`;
      marker.bindPopup(popupContent);
      markersRef.current.push({ marker, data: markerData, index });
    });
  }, [data?.markers, readOnly]);

  // Update map center/zoom when data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !data) return;
    
    const mapData = data;
    if (mapData.center) {
      mapInstanceRef.current.setView(mapData.center, mapData.zoom || 13);
    }
  }, [data?.center, data?.zoom]);

  // Update locked state
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    if (locked) {
      mapInstanceRef.current.dragging.disable();
      mapInstanceRef.current.touchZoom.disable();
      mapInstanceRef.current.doubleClickZoom.disable();
      mapInstanceRef.current.scrollWheelZoom.disable();
      mapInstanceRef.current.boxZoom.disable();
      mapInstanceRef.current.keyboard.disable();
    } else {
      mapInstanceRef.current.dragging.enable();
      mapInstanceRef.current.touchZoom.enable();
      mapInstanceRef.current.doubleClickZoom.enable();
      if (!disableScrollWheel) {
        mapInstanceRef.current.scrollWheelZoom.enable();
      }
      mapInstanceRef.current.boxZoom.enable();
      mapInstanceRef.current.keyboard.enable();
    }
  }, [locked, disableScrollWheel]);

  // Invalidate map size when height changes (for canvas resizing)
  useEffect(() => {
    if (mapInstanceRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 0);
    }
  }, [height]);

  return (
    <div style={{ height: `${height}px`, width: '100%', position: 'relative', pointerEvents: locked ? 'none' : 'auto' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%', pointerEvents: locked ? 'none' : 'auto' }} />
    </div>
  );
};

export default MapBlock;
