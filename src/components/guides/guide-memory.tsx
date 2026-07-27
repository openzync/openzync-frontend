export function GuideMemory() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Radiating connection lines */}
      <line x1="100" y1="70" x2="30" y2="30" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="170" y2="30" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="20" y2="80" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="180" y2="80" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="40" y2="120" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="160" y2="120" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="100" y1="70" x2="100" y2="15" stroke="var(--color-accent-300)" strokeOpacity="0.2" strokeWidth="1" />

      {/* Outer glow dots (satellite memories) */}
      <circle cx="30" cy="30" r="4" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="170" cy="30" r="4" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="20" cy="80" r="3" fill="var(--color-surface-400)" fillOpacity="0.25" />
      <circle cx="180" cy="80" r="3" fill="var(--color-surface-400)" fillOpacity="0.25" />
      <circle cx="40" cy="120" r="4" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="160" cy="120" r="4" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="100" cy="15" r="3" fill="var(--color-surface-400)" fillOpacity="0.25" />

      {/* Central node — layered circles for brain-like feel */}
      <circle cx="100" cy="70" r="24" fill="var(--color-brand-500)" fillOpacity="0.12" stroke="var(--color-brand-500)" strokeOpacity="0.3" strokeWidth="1.5" />
      <circle cx="100" cy="70" r="16" fill="var(--color-brand-500)" fillOpacity="0.2" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="1" />
      <circle cx="100" cy="70" r="8" fill="var(--color-brand-500)" fillOpacity="0.5" />

      {/* Inner brain-starburst lines */}
      <line x1="100" y1="58" x2="100" y2="82" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="0.8" />
      <line x1="88" y1="70" x2="112" y2="70" stroke="var(--color-brand-500)" strokeOpacity="0.4" strokeWidth="0.8" />
      <line x1="91" y1="61" x2="109" y2="79" stroke="var(--color-brand-500)" strokeOpacity="0.3" strokeWidth="0.8" />
      <line x1="109" y1="61" x2="91" y2="79" stroke="var(--color-brand-500)" strokeOpacity="0.3" strokeWidth="0.8" />
    </svg>
  );
}
