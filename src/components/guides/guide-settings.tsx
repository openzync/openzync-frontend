export function GuideSettings() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Gear/cog icon — outer ring */}
      <circle cx="50" cy="70" r="22" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2" />
      {/* Gear teeth */}
      <line x1="50" y1="42" x2="50" y2="34" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="106" x2="50" y2="98" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="70" x2="30" y2="70" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="70" y1="70" x2="78" y2="70" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1="50" x2="36" y2="54" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="64" y1="86" x2="70" y2="90" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1="90" x2="36" y2="86" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="64" y1="54" x2="70" y2="50" stroke="var(--color-surface-400)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />

      {/* Gear inner ring */}
      <circle cx="50" cy="70" r="12" stroke="var(--color-brand-500)" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="50" cy="70" r="5" fill="var(--color-brand-500)" fillOpacity="0.4" />

      {/* Slider 1 */}
      <rect x="96" y="38" width="88" height="6" rx="3" fill="var(--color-surface-600)" fillOpacity="0.3" />
      <rect x="96" y="38" width="56" height="6" rx="3" fill="var(--color-brand-500)" fillOpacity="0.5" />
      <circle cx="152" cy="41" r="6" fill="var(--color-brand-500)" fillOpacity="0.7" stroke="var(--color-surface-800)" strokeWidth="2" />

      {/* Slider 2 */}
      <rect x="96" y="58" width="88" height="6" rx="3" fill="var(--color-surface-600)" fillOpacity="0.3" />
      <rect x="96" y="58" width="72" height="6" rx="3" fill="var(--color-accent-300)" fillOpacity="0.5" />
      <circle cx="168" cy="61" r="6" fill="var(--color-accent-300)" fillOpacity="0.7" stroke="var(--color-surface-800)" strokeWidth="2" />

      {/* Slider 3 */}
      <rect x="96" y="78" width="88" height="6" rx="3" fill="var(--color-surface-600)" fillOpacity="0.3" />
      <rect x="96" y="78" width="36" height="6" rx="3" fill="var(--color-surface-400)" fillOpacity="0.4" />
      <circle cx="132" cy="81" r="6" fill="var(--color-surface-400)" fillOpacity="0.6" stroke="var(--color-surface-800)" strokeWidth="2" />

      {/* Slider 4 */}
      <rect x="96" y="98" width="88" height="6" rx="3" fill="var(--color-surface-600)" fillOpacity="0.3" />
      <rect x="96" y="98" width="80" height="6" rx="3" fill="var(--color-brand-500)" fillOpacity="0.5" />
      <circle cx="176" cy="101" r="6" fill="var(--color-brand-500)" fillOpacity="0.7" stroke="var(--color-surface-800)" strokeWidth="2" />
    </svg>
  );
}
