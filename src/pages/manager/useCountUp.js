import { useState, useEffect } from 'react';

/**
 * Custom hook to animate a number counting up from 0 to target
 * @param {number} end - The target number
 * @param {number} duration - Animation duration in ms (default: 1000)
 * @returns {number} The current animated value
 */
export default function useCountUp(end, duration = 1000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const startValue = 0;
    
    // Safety check - if end is not a number, just return it
    if (typeof end !== 'number' || isNaN(end)) {
      setCount(end || 0);
      return;
    }

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing function: easeOutQuart
      const easeOut = 1 - Math.pow(1 - progress, 4);
      
      const currentVal = Math.floor(easeOut * (end - startValue) + startValue);
      setCount(currentVal);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(end); // Ensure we hit exactly the end value
      }
    };
    
    window.requestAnimationFrame(step);
    
    return () => {
      // Cleanup if component unmounts before animation finishes
    };
  }, [end, duration]);

  return count;
}
