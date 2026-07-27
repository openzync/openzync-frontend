export function GuideSecurity() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Shield outline */}
      <path
        d="M100 18 L156 40 L156 76 C156 110 100 128 100 128 C100 128 44 110 44 76 L44 40 Z"
        fill="var(--color-brand-500)"
        fillOpacity="0.1"
        stroke="var(--color-brand-500)"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />

      {/* Shield inner glow */}
      <path
        d="M100 26 L148 44 L148 76 C148 106 100 122 100 122 C100 122 52 106 52 76 L52 44 Z"
        fill="var(--color-brand-500)"
        fillOpacity="0.08"
        stroke="var(--color-brand-500)"
        strokeOpacity="0.2"
        strokeWidth="1"
      />

      {/* Checkmark inside shield */}
      <path
        d="M84 76 L96 88 L118 62"
        stroke="var(--color-brand-500)"
        strokeOpacity="0.9"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Key icon — bow */}
      <circle cx="64" cy="100" r="10" stroke="var(--color-accent-300)" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="64" cy="100" r="4" fill="var(--color-accent-300)" fillOpacity="0.5" />

      {/* Key icon — shaft */}
      <line x1="72" y1="100" x2="94" y2="100" stroke="var(--color-accent-300)" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />

      {/* Key icon — teeth */}
      <line x1="86" y1="100" x2="86" y2="108" stroke="var(--color-accent-300)" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="100" x2="92" y2="106" stroke="var(--color-accent-300)" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />

      {/* Small decorative dots for ambiance */}
      <circle cx="170" cy="30" r="2" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="20" cy="24" r="2" fill="var(--color-surface-400)" fillOpacity="0.3" />
      <circle cx="180" cy="110" r="2" fill="var(--color-surface-400)" fillOpacity="0.3" />
    </svg>
  );
}
