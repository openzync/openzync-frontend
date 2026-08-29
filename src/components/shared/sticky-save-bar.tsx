"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StickySaveBarProps {
  saving: boolean;
  hasChanges: boolean;
  hasSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveDisabled?: boolean;
}

/**
 * Inline save bar for config save/discard actions.
 * Renders as a normal block element at the bottom of the form flow.
 */
export function StickySaveBar({ saving, hasChanges, hasSaved, onSave, onDiscard, saveDisabled = false }: StickySaveBarProps) {
  const visible = hasChanges || hasSaved;

  if (!visible) return null;

  return (
    <div className="border-t border-surface-700/60 bg-surface-900/90 px-6 py-3 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-surface-400">
          {hasSaved && (
            <span className="text-emerald-400">Changes saved successfully</span>
          )}
          {hasChanges && !saving && (
            <span className="text-amber-400">You have unsaved changes</span>
          )}
          {saving && (
            <span className="text-surface-400">Saving&hellip;</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onDiscard}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            loading={saving}
            disabled={saving || !hasChanges || saveDisabled}
            onClick={onSave}
          >
            {saving ? "Saving\u2026" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
