interface MetadataRowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

/**
 * Icon + label + value row for detail metadata cards
 * (session detail, user detail). Shared so both stay in sync.
 */
export function MetadataRow({ icon, label, children }: MetadataRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-surface-500 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-surface-500 mb-0.5">{label}</div>
        <div className="text-sm text-surface-200">{children}</div>
      </div>
    </div>
  );
}
