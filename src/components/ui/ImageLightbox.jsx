// ImageLightbox - Full screen image viewer with zoom
// Extracted from Strata index.html (lines 1574-1588)

import { useState } from 'react';
import { X } from '../icons';

const ImageLightbox = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  
  return (
    <div className="fixed inset-0 z-[10001] bg-black/95 flex flex-col animate-fade-in backdrop-blur-sm">
      <div className="flex justify-end p-6">
        <button 
          onClick={onClose} 
          className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full"
        >
          <X size={24} />
        </button>
      </div>
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden p-8" 
        onClick={onClose}
      >
        <img 
          src={src} 
          alt="Full screen" 
          className="max-w-full max-h-full object-contain transition-transform duration-300 ease-in-out"
          style={{ transform: `scale(${scale})`, cursor: scale > 1 ? 'zoom-out' : 'zoom-in' }}
          onClick={(e) => { 
            e.stopPropagation(); 
            setScale(prev => prev === 1 ? 2.5 : 1); 
          }} 
        />
      </div>
    </div>
  );
};

export default ImageLightbox;
