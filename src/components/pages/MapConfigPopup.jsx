// MapConfigPopup Component - Map configuration popup
// Extracted from Strata index.html Section F

import { useState, useEffect } from 'react';
import { X } from '../icons';

const MapConfigPopup = ({ blockId, currentData, onSave, onClose, position }) => {
  // Initialize address from currentData if available, or try to reverse geocode the center
  const [address, setAddress] = useState(currentData?.address || '');
  const [zoom, setZoom] = useState(currentData?.zoom || 13);
  const [locked, setLocked] = useState(currentData?.locked || false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [tempCenter, setTempCenter] = useState(currentData?.center || null);
  
  // Reverse geocode center to get address if address is not set
  useEffect(() => {
    if (!address && currentData?.center && currentData.center.length === 2) {
      const [lat, lng] = currentData.center;
      // Reverse geocode to get address
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: {
          'User-Agent': 'Strata Notebook App'
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.display_name) {
          setAddress(data.display_name);
        }
      })
      .catch(() => {
        // Silently fail - user can enter address manually
      });
    }
  }, []);
  
  // Real-time zoom and lock update effect
  useEffect(() => {
    if ((tempCenter || currentData?.center) && onSave) {
      // Update map center and zoom in real-time
      const center = tempCenter || currentData.center;
      const currentMarkers = currentData?.markers || [];
      const currentAddress = address || currentData?.address || '';
      
      onSave({
        center: center,
        zoom: zoom,
        locked: locked,
        markers: currentMarkers,
        address: currentAddress
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, locked]);

  const parseCoordinates = (input) => {
    // Try to match lat,lng or lat lng formats
    const coordPattern1 = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
    const coordPattern2 = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;
    
    let match = input.match(coordPattern1) || input.match(coordPattern2);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return [lat, lng];
      }
    }
    return null;
  };

  const handleGeocode = async () => {
    setError('');
    setGeocoding(true);
    
    try {
      const addressInput = address.trim();
      
      // First try to parse as coordinates
      const coords = parseCoordinates(addressInput);
      if (coords) {
        const [lat, lng] = coords;
        setTempCenter([lat, lng]);
        
        // Add a marker at this location
        const newMarker = {
          lat: lat,
          lng: lng,
          label: addressInput || 'Location'
        };
        
        const updatedMarkers = [...(currentData?.markers || []), newMarker];
        
        onSave({
          center: [lat, lng],
          zoom: zoom,
          locked: locked,
          markers: updatedMarkers,
          address: addressInput // Keep the address for editing
        });
        
        // Don't close - keep popup open for further editing
        setGeocoding(false);
        return;
      }

      // If not coordinates, geocode the address
      if (!addressInput) {
        setError('Please enter an address or GPS coordinates');
        setGeocoding(false);
        return;
      }

      // More flexible geocoding - try with different query formats
      let geocodeQuery = addressInput;
      
      // Try geocoding with the address
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Strata Notebook App'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding service unavailable');
      }

      const data = await response.json();
      if (data && data.length > 0) {
        // Use the first (most relevant) result
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        
        setTempCenter([lat, lon]);
        
        // Add a marker at the geocoded location
        const displayName = result.display_name || addressInput;
        const newMarker = {
          lat: lat,
          lng: lon,
          label: displayName
        };
        
        const updatedMarkers = [...(currentData?.markers || []), newMarker];
        
        // Update with the geocoded location and keep the address
        onSave({
          center: [lat, lon],
          zoom: zoom,
          locked: locked,
          markers: updatedMarkers,
          address: addressInput // Keep the original input for editing
        });
        
        // Update address field with the display name for better UX
        setAddress(displayName);
        
        // Don't close - keep popup open for further editing
        setGeocoding(false);
      } else {
        setError('Address not found. Please try a different address or use GPS coordinates (lat, lng)');
        setGeocoding(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to geocode address. Please try again or use GPS coordinates (lat, lng)');
      setGeocoding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !geocoding) {
      handleGeocode();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Calculate smart positioning
  const getPopupStyle = () => {
    if (!position) return { top: 0, left: 0 };
    
    const estimatedPopupHeight = 280; // Approximate popup height
    const estimatedPopupWidth = 320;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 10; // Padding from viewport edges
    
    let top = position.top;
    let left = position.left;
    let transform = '';
    
    // Check if there's enough space above
    if (position.top < estimatedPopupHeight + padding) {
      // Not enough space above, position below
      top = position.top;
      transform = '';
    } else {
      // Position above
      top = position.top;
      transform = 'translateY(-100%)';
    }
    
    // Ensure popup doesn't go off left edge
    if (left < padding) {
      left = padding;
    }
    
    // Ensure popup doesn't go off right edge
    if (left + estimatedPopupWidth > viewportWidth - padding) {
      left = viewportWidth - estimatedPopupWidth - padding;
    }
    
    // Ensure popup doesn't go off bottom edge (when positioned below)
    if (!transform && top + estimatedPopupHeight > viewportHeight - padding) {
      top = viewportHeight - estimatedPopupHeight - padding;
    }
    
    return {
      top: `${top}px`,
      left: `${left}px`,
      transform: transform || 'none',
      marginTop: transform ? '-8px' : '8px'
    };
  };

  return (
    <div 
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-lg p-4 z-[10000] min-w-[320px]"
      style={getPopupStyle()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Configure Map</h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address or GPS Coordinates
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., New York, NY or 40.7128, -74.0060"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Enter an address or coordinates (lat, lng). Partial addresses work too.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Zoom Level
          </label>
          <input
            type="number"
            min="1"
            max="19"
            value={zoom}
            onChange={(e) => {
              const newZoom = parseInt(e.target.value) || 13;
              setZoom(newZoom);
              // Real-time update will be handled by useEffect
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`lock-${blockId}`}
            checked={locked}
            onChange={(e) => {
              setLocked(e.target.checked);
              // Real-time update will be handled by useEffect
            }}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label 
            htmlFor={`lock-${blockId}`}
            className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            Lock map (prevent interaction)
          </label>
        </div>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleGeocode}
            disabled={geocoding}
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {geocoding ? 'Searching...' : 'Set Location & Add Pin'}
          </button>
          <button
            onClick={() => {
              // Save current state before closing
              if (tempCenter || currentData?.center) {
                onSave({
                  center: tempCenter || currentData.center,
                  zoom: zoom,
                  locked: locked,
                  markers: currentData?.markers || [],
                  address: address
                });
              }
              onClose();
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapConfigPopup;
