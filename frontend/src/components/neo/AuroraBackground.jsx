import React from 'react';
import { motion } from 'framer-motion';

export default function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#03050c]">
      {/* 1. Deep Cosmic Indigo/Violet Glow */}
      <motion.div
        animate={{
          x: [0, 60, -40, 0],
          y: [0, -60, 40, 0],
          scale: [1, 1.25, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -left-32 -top-32 h-[650px] w-[650px] rounded-full bg-gradient-to-br from-indigo-600/25 via-purple-900/20 to-transparent blur-[160px]"
      />

      {/* 2. Electric Cyan / Horizon Turquoise Glow */}
      <motion.div
        animate={{
          x: [0, -70, 50, 0],
          y: [0, 50, -50, 0],
          scale: [1, 0.9, 1.2, 1],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -right-32 top-1/4 h-[700px] w-[700px] rounded-full bg-gradient-to-bl from-cyan-500/20 via-blue-600/15 to-transparent blur-[180px]"
      />

      {/* 3. Vivid Mint & Emerald Accent */}
      <motion.div
        animate={{
          x: [0, 40, -50, 0],
          y: [0, -40, 60, 0],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute bottom-10 left-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-tr from-emerald-500/15 via-teal-900/10 to-transparent blur-[160px]"
      />

      {/* 4. Electric Fuchsia / Violet Accent */}
      <motion.div
        animate={{
          x: [0, -30, 40, 0],
          y: [0, 40, -30, 0],
          scale: [0.9, 1.15, 1, 0.9],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-20 right-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-tl from-fuchsia-600/15 via-pink-900/10 to-transparent blur-[150px]"
      />

      {/* 5. Cosmic High-Tech Grid & Dot Matrix */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      
      {/* 6. Subtle Radial Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,5,12,0.6)_100%)]" />
    </div>
  );
}

