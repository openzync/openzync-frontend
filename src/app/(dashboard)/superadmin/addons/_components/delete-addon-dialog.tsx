"use client";

import { useState } from "react";
import type { AddonResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCloseButton } from "@/components/ui/dialog";

interface DeleteAddonDialogProps {
  addon: AddonResponse | null;
  busy: boolean;
  onConfirm: (id: string, removeData: boolean) => void;
  onClose: () => void;
}

/**
 * Two-step delete: type the add-on id to arm the button, optional data wipe.
 * `key` on the id resets typed/checkbox state per target (see callers).
 */
export function DeleteAddonDialog({
  addon,
  busy,
  onConfirm,
  onClose,
}: DeleteAddonDialogProps) {
  const [typed, setTyped] = useState("");
  const [removeData, setRemoveData] = useState(false);

  const matches = !!addon && typed === addon.id;

  return (
    <Dialog
      open={!!addon}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`Delete ${addon?.id ?? ""}?`}
      description="Uninstalls the add-on. This cannot be undone."
      persistent={busy}
      footer={
        <>
          <DialogCloseButton disabled={busy}>Cancel</DialogCloseButton>
          <Button
            variant="danger"
            loading={busy}
            disabled={!matches}
            onClick={() => {
              if (addon && matches) onConfirm(addon.id, removeData);
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm text-surface-400">
          Type <code className="font-mono text-text-primary">{addon?.id}</code> to confirm
          <input
            className="input-base mt-1.5"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={addon?.id ?? ""}
            aria-label="Type the add-on id to confirm deletion"
            autoFocus
          />
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-surface-300">
          <input
            type="checkbox"
            checked={removeData}
            onChange={(e) => setRemoveData(e.target.checked)}
            className="accent-error mt-1"
          />
          <span>
            Also remove add-on data
            {removeData && (
              <span className="mt-1 block text-xs text-error">
                Warning: this drops the add-on&apos;s tables — all of its stored
                data is permanently deleted.
              </span>
            )}
          </span>
        </label>
      </div>
    </Dialog>
  );
}
