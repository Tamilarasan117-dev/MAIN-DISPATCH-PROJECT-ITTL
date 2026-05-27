import React, { useEffect, useState } from 'react';

/**
 * Animated SVG circular progress ring
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} size - Width/height of the SVG in pixels
 * @param {number} strokeWidth - Thickness of the ring
 * @param {string} color - Hex or rgb color code
 */
export default function ProgressRing({ percentage = 0, size = 120, strokeWidth = 10, color = '#38a169' }) {
  const [offset, setOffset] = useState(0);
  
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    // Calculate the offset based on percentage
    const progressOffset = circumference - (percentage / 100) * circumference;
    
    // Slight delay to ensure the CSS transition triggers on mount
    const timer = setTimeout(() => {
      setOffset(progressOffset);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [percentage, circumference]);

  return (
    <svg 
      className="manager-progress-ring" 
      width={size} 
      height={size}
    >
      {/* Background ring */}
      <circle
        stroke="#e2e8f0"
        fill="transparent"
        strokeWidth={strokeWidth}
        r={radius}
        cx={center}
        cy={center}
      />
      
      {/* Foreground animated ring */}
      <circle
        className="manager-progress-ring-circle"
        stroke={color}
        fill="transparent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference + ' ' + circumference}
        style={{ strokeDashoffset: offset }}
        r={radius}
        cx={center}
        cy={center}
      />
    </svg>
  );
}
