"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface StickySaveBarProps {
  saving: boolean;
  hasChanges: boolean;
  hasSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * Inline save bar for config save/discard actions.
 * Renders as a normal block element at the bottom of the form flow.
 */
export function StickySaveBar({ saving, hasChanges, hasSaved, onSave, onDiscard }: StickySaveBarProps) {
  const t = useTranslations("components.stickySaveBar");
  const visible = hasChanges || hasSaved;

  if (!visible) return null;

  return (
    <div className="border-t border-surface-700/60 bg-surface-900/90 px-6 py-3 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-surface-400">
          {hasSaved && (
            <span className="text-emerald-400">{t("saved")}</span>
          )}
          {hasChanges && !saving && (
            <span className="text-amber-400">{t("unsaved")}</span>
          )}
          {saving && (
            <span className="text-surface-400">{t("saving")}</span>
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
            disabled={saving || !hasChanges}
            onClick={onSave}
          >
            {saving ? t("saving") : t("saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
