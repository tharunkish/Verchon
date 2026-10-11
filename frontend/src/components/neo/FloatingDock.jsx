import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Layers, Briefcase, Search, Settings, Command } from 'lucide-react';

function DockItem({ mouseX, icon: Icon, label, hotkey, active, onClick }) {
  const ref = useRef(null);

  const distance = useTransform(mouseX, (val) => {
    if (!ref.current || !isFinite(val)) return 150;
    const bounds = ref.current.getBoundingClientRect();
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(distance, [-150, 0, 150], [44, 64, 44]);
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 180, damping: 12 });

  return (
    <motion.button
      ref={ref}
      style={{ width, height: width }}
      onClick={onClick}
      className={`group relative flex items-center justify-center rounded-2xl border transition-colors ${
        active
          ? 'border-rose-500/60 bg-gradient-to-b from-rose-500/25 to-rose-950/40 text-rose-200 shadow-lg shadow-rose-950/60'
          : 'border-white/[0.08] bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:bg-zinc-800/80 hover:text-zinc-100'
      }`}
    >
      <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />

      {/* Floating Tooltip Pill */}
      <div className="pointer-events-none absolute -top-11 left-1/2 flex -translate-x-1/2 items-center space-x-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-950/90 px-2.5 py-1 text-[11px] font-medium text-zinc-200 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 group-hover:-top-12 group-hover:opacity-100">
        <span>{label}</span>
        {hotkey && (
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-400">
            {hotkey}
          </kbd>
        )}
      </div>

      {/* Active Dot Indicator */}
      {active && (
        <motion.div
          layoutId="dock-active-dot"
          className="absolute -bottom-1.5 h-1 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
        />
      )}
    </motion.button>
  );
}

export default function FloatingDock({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenCommandK,
}) {
  const mouseX = useMotionValue(Infinity);

  const items = [
    { id: 'scanner', label: 'Market Scanner', icon: Layers, hotkey: '1' },
    { id: 'portfolio', label: 'Paper Vault', icon: Briefcase, hotkey: '2' },
    { id: 'deepdive', label: 'Deep Dive & Setup', icon: Search, hotkey: '3' },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="flex h-16 items-center gap-3 rounded-3xl border border-white/[0.12] bg-zinc-950/75 px-4 py-2.5 shadow-2xl shadow-black/80 backdrop-blur-2xl ring-1 ring-white/[0.05]"
      >
        {items.map((item) => (
          <DockItem
            key={item.id}
            mouseX={mouseX}
            icon={item.icon}
            label={item.label}
            hotkey={item.hotkey}
            active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
          />
        ))}

        <div className="h-6 w-px bg-white/10 mx-0.5" />

        {/* Quick Command K Launcher */}
        <DockItem
          mouseX={mouseX}
          icon={Command}
          label="Search Ticker"
          hotkey="⌘K"
          active={false}
          onClick={onOpenCommandK}
        />

        {/* Settings Launcher */}
        <DockItem
          mouseX={mouseX}
          icon={Settings}
          label="Workstation Settings"
          hotkey="S"
          active={false}
          onClick={onOpenSettings}
        />
      </motion.div>
    </div>
  );
}
