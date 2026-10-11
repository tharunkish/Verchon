import React from 'react';

/**
 * BackgroundAura: Atmospheric, non-distracting volumetric crimson aurora.
 * Inspired by Raycast / Linear dark aesthetic with angled organic light streaks
 * and a deep vignette mask to maintain 100% crystal-clear foreground legibility.
 */
export default function BackgroundAura() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#050507]">
      {/* Volumetric Layered Crimson Nebula */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Layer 1: Primary Diagonal Crimson Light Slash */}
        <div 
          className="animate-crimson-beam-1 absolute -top-[12%] left-[12%] h-[780px] w-[950px] -rotate-[32deg] rounded-[100%] bg-gradient-to-tr from-[#68071e] via-[#c9183b] to-[#e11d48] opacity-55 blur-[105px]"
        />

        {/* Layer 2: Secondary Counter-Atmosphere Ruby Glow */}
        <div 
          className="animate-crimson-beam-2 absolute top-[12%] right-[4%] h-[640px] w-[800px] -rotate-[26deg] rounded-[100%] bg-gradient-to-br from-[#e11d48] via-[#a80e2b] to-[#45020e] opacity-45 blur-[115px]"
        />

        {/* Layer 3: Radiant Core Crimson Energy Streak */}
        <div 
          className="animate-crimson-pulse absolute top-[22%] left-[26%] h-[420px] w-[680px] -rotate-[34deg] rounded-[90px] bg-gradient-to-r from-[#d01c38] via-[#ff224c] to-[#990824] opacity-40 blur-[80px]"
        />

        {/* Layer 4: Deep Ambient Wine/Crimson Floor Anchor */}
        <div 
          className="animate-crimson-drift absolute -bottom-[22%] left-[28%] h-[520px] w-[840px] rounded-[100%] bg-[#520516] opacity-35 blur-[130px]"
        />
      </div>

      {/* Subtle Micro-Grid Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Dark Vignette & Edge Shadow: Guarantees zero contrast degradation for tables, cards & charts */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-[#050507]/60 via-transparent to-[#050507]/90"
      />
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 95% 85% at 50% 32%, transparent 32%, #050507 90%)',
        }}
      />
    </div>
  );
}
