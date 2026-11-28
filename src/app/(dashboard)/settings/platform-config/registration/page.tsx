"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { useUser } from "@/contexts/user-context";
import { useApiQuery } from "@/hooks/use-api-query";
import { useConfigDirty } from "@/contexts/config-dirty";
import { ErrorState } from "@/components/shared/error-state";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";

// ─── Registration (GET/PATCH /admin/system/registration; falls back to ──────
// ─── GET /v1/auth/registration-status on backends without the admin endpoint) ─
const REGISTRATION_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "invite_only", label: "Invite only" },
  { value: "approval", label: "Approval" },
];

export default function PlatformConfigRegistrationPage() {
  const { can, loading: userLoading } = useUser();
  // Registration is platform-scoped — gated on platform:manage (admins hold
  // it via wildcard), not on the raw admin role.
  const canManage = can("platform:manage");
  const router = useRouter();
  const [registration, setRegistration] = useState<string>("invite_only");
  const [initialRegistration, setInitialRegistration] = useState<string>("invite_only");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const { setDirty } = useConfigDirty();

  useEffect(() => {
    if (!userLoading && !canManage) {
      router.replace("/overview");
    }
  }, [canManage, userLoading, router]);

  // Admin endpoint first; old backends 404 → fall back to the public status
  // endpoint. Missing mode defaults to invite_only.
  const registrationQuery = useApiQuery<{ registration_mode: string }>(async () => {
    try {
      return await get<{ registration_mode: string }>("/admin/system/registration");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return await get<{ registration_mode: string }>("/v1/auth/registration-status");
      }
      throw err;
    }
  });
  const loading = registrationQuery.isLoading;
  // Save failures share the banner with load errors; retry re-runs the GET.
  const error = registrationQuery.error ?? actionError;

  const [seededRegistration, setSeededRegistration] =
    useState<{ registration_mode: string } | null>(null);
  if (registrationQuery.data && registrationQuery.data !== seededRegistration) {
    setSeededRegistration(registrationQuery.data);
    const mode = registrationQuery.data.registration_mode ?? "invite_only";
    setRegistration(mode);
    setInitialRegistration(mode);
  }

  const hasChanged = () => registration !== initialRegistration;

  function updateRegistration(mode: string) {
    setRegistration(mode);
    setDirty(mode !== initialRegistration);
  }

  const handleSave = async () => {
    if (!hasChanged()) return;
    setSaving(true);
    setActionError(null);
    try {
      await patch("/admin/system/registration", { registration_mode: registration });
      toast.success("Registration mode saved");
      setDirty(false);
      setInitialRegistration(registration);
      registrationQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save registration mode";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  function handleDiscard() {
    setRegistration(initialRegistration);
    setDirty(false);
  }

  if (userLoading || !canManage) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} onRetry={registrationQuery.refetch} />}

      {/* ── Registration ──────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">Registration</h2>
          <p className="text-xs text-surface-400">
            Who can create an account on this platform
          </p>
        </div>

        <div className="space-y-4 max-w-md">
          {registrationQuery.error ? (
            <ErrorState
              message={registrationQuery.error}
              onRetry={registrationQuery.refetch}
            />
          ) : (
            <Field
              label="Registration mode"
              htmlFor="registration-mode"
              hint="Open lets anyone sign up; invite only needs an invite; approval needs admin sign-off."
            >
              <SimpleSelect
                id="registration-mode"
                className="w-full"
                options={REGISTRATION_OPTIONS}
                value={registration}
                onValueChange={updateRegistration}
              />
            </Field>
          )}
        </div>
      </div>

      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={() => void handleSave()}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );
}
