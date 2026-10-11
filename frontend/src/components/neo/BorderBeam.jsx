import React from 'react';

export default function BorderBeam({
  className = '',
  size = 200,
  duration = 8,
  colorFrom = '#f43f5e',
  colorTo = '#38bdf8',
}) {
  return (
    <div className={`pointer-events-none absolute -inset-[1px] rounded-[inherit] overflow-hidden ${className}`}>
      <div
        style={{
          animation: `spin ${duration}s linear infinite`,
          background: `conic-gradient(from 0deg, transparent 0deg 270deg, ${colorFrom} 315deg, ${colorTo} 360deg)`,
        }}
        className="absolute -inset-[100%] w-[300%] h-[300%]"
      />
      <div className="absolute inset-[1px] rounded-[inherit] bg-zinc-950/90" />
    </div>
  );
}
