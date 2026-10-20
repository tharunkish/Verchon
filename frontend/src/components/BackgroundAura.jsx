import React from 'react';

/**
 * BackgroundAura: Atmospheric, non-distracting volumetric crimson aurora.
 * Inspired by Raycast / Linear dark aesthetic with angled organic light streaks
 * and a deep vignette mask to maintain 100% crystal-clear foreground legibility.
 */
export default function BackgroundAura({ colorMode = 'dark', themeStyle = 'apple' }) {
  const isLight = colorMode === 'light';

  if (isLight) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#edd9cc]">
        {/* Editorial Warm Beige & Crimson Light Atmosphere */}
        <div className="absolute -top-[15%] left-[10%] h-[600px] w-[700px] rounded-full bg-[#f7ede5]/70 blur-[120px]" />
        <div className="absolute top-[25%] right-[5%] h-[550px] w-[650px] rounded-full bg-[#b20808]/5 blur-[150px]" />
        <div className="absolute -bottom-[15%] left-[25%] h-[500px] w-[750px] rounded-full bg-[#806350]/8 blur-[140px]" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(128, 99, 80, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(128, 99, 80, 0.4) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#edd9cc]/20 via-transparent to-[#edd9cc]/50" />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#1c232d]">
      {/* Subtle, architectural quiet-luxury ambient atmosphere */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Layer 1: Deep slate tone */}
        <div 
          className="absolute -top-[10%] left-[8%] h-[750px] w-[950px] rounded-full bg-[#283341] opacity-35 blur-[140px]"
        />

        {/* Layer 2: Subtle warm cashmere breath */}
        <div 
          className="absolute top-[25%] right-[5%] h-[650px] w-[850px] rounded-full bg-[#958a7a]/10 opacity-25 blur-[150px]"
        />

        {/* Layer 3: Muted base anchor */}
        <div 
          className="absolute -bottom-[20%] left-[20%] h-[550px] w-[900px] rounded-full bg-[#222b37] opacity-40 blur-[130px]"
        />
      </div>

      {/* Subtle Editorial Micro-Grid Texture */}
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(rgba(224, 209, 185, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(224, 209, 185, 0.3) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Dark Vignette: Smooth center contrast with organic edge refraction */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-[#1c232d]/40 via-transparent to-[#1c232d]/80"
      />
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 95% 85% at 50% 30%, transparent 40%, #1c232d 95%)',
        }}
      />
    </div>
  );
}
