import React, { useEffect, useState } from 'react';
import { useSpring } from 'framer-motion';

export default function NumberTicker({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
}) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  const [displayValue, setDisplayValue] = useState(numericValue);

  const spring = useSpring(numericValue, {
    mass: 0.8,
    stiffness: 75,
    damping: 15,
  });

  useEffect(() => {
    spring.set(numericValue);
  }, [numericValue, spring]);

  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplayValue(latest);
    });
  }, [spring]);

  const formatted = `${prefix}${displayValue.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return <span className={`font-mono-num ${className}`}>{formatted}</span>;
}
