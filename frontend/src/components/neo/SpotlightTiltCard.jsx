import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

export default function SpotlightTiltCard({
  children,
  className = '',
  spotlightColor = 'rgba(244, 63, 94, 0.15)',
  borderColor = 'rgba(244, 63, 94, 0.3)',
  tiltIntensity = 12,
  glow = true,
  onClick,
}) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mouse position inside card for spotlight
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Normalized coordinates for 3D tilt (-0.5 to 0.5)
  const normX = useMotionValue(0);
  const normY = useMotionValue(0);

  // Spring physics for tilt rotation
  const springConfig = { damping: 20, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(normY, [-0.5, 0.5], [tiltIntensity, -tiltIntensity]), springConfig);
  const rotateY = useSpring(useTransform(normX, [-0.5, 0.5], [-tiltIntensity, tiltIntensity]), springConfig);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mouseX.set(x);
    mouseY.set(y);
    normX.set(x / rect.width - 0.5);
    normY.set(y / rect.height - 0.5);
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    normX.set(0);
    normY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        transformStyle: 'preserve-3d',
        rotateX,
        rotateY,
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-5 backdrop-blur-xl transition-shadow duration-300 ${
        isHovered && glow ? 'shadow-2xl shadow-rose-950/40' : ''
      } ${className}`}
    >
      {/* 1. Mouse Spotlight Flashlight Overlay */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(450px circle at ${x}px ${y}px, ${spotlightColor}, transparent 70%)`
          ),
        }}
      />

      {/* 2. Interactive Shimmer Border Highlight */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(350px circle at ${x}px ${y}px, ${borderColor}, transparent 80%)`
          ),
          maskImage: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
          padding: '1px',
        }}
      />

      {/* 3. Card Inner Content (Raised in 3D space) */}
      <div style={{ transform: 'translateZ(20px)' }} className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
