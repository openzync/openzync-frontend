"use client";

import { useEffect, useState } from "react";
import {
  Save,
  Lock,
  User,
  Shield,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { patch, post, ApiError } from "@/lib/api-client";
import { useUser, type CurrentUser } from "@/contexts/user-context";
import { useConfigDirty } from "@/contexts/config-dirty";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PageGuide, GuideSettings } from "@/components/guides";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogCloseButton } from "@/components/ui/dialog";
import { PasswordField } from "@/components/shared/password-field";

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // ── Profile (owned by UserProvider — no local /auth/me refetch) ────────────
  const { user, loading: profileLoading } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Password state ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // ── Unsaved-changes guard ──────────────────────────────────────────────────
  const { setDirty } = useConfigDirty();
  // Last values known to be persisted — the dirty baseline. Seeded with the
  // profile and updated after each successful save.
  const [savedProfile, setSavedProfile] = useState({ name: "", email: "" });
  const isProfileDirty =
    name.trim() !== savedProfile.name || email.trim() !== savedProfile.email;
  const isPasswordDirty = currentPassword !== "" || newPassword !== "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirty(isProfileDirty || isPasswordDirty);
  }, [isProfileDirty, isPasswordDirty, setDirty]);

  // ── MFA dialog state ──────────────────────────────────────────────────────
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [localMfaEnabled, setLocalMfaEnabled] = useState(false);
  const [mfaIntent, setMfaIntent] = useState<"enable" | "disable">("enable");
  const [dialogPassword, setDialogPassword] = useState("");
  const [dialogOtp, setDialogOtp] = useState("");
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Seed the editable form + MFA toggle whenever the provider lands the
  // profile. Render-phase adjustment (React's documented prop→state pattern)
  // instead of an effect, so the inputs are never a render behind.
  const [seededUser, setSeededUser] = useState<CurrentUser | null>(null);
  if (user && user !== seededUser) {
    setSeededUser(user);
    setName(user.name ?? "");
    setEmail(user.email ?? "");
    setSavedProfile({ name: user.name ?? "", email: user.email ?? "" });
    setLocalMfaEnabled(user.mfa_enabled);
  }

  // ── Save profile ───────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload: Record<string, string> = {};
      if (name.trim()) payload.name = name.trim();
      if (email.trim()) payload.email = email.trim();

      await patch("/v1/auth/me", payload);
      // Mirror the payload semantics — omitted (empty) fields keep their
      // previously saved value as the dirty baseline.
      setSavedProfile((prev) => ({
        name: name.trim() ? name.trim() : prev.name,
        email: email.trim() ? email.trim() : prev.email,
      }));
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Update password ────────────────────────────────────────────────────────

  const handleUpdatePassword = async () => {
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Current password is required");
      return;
    }
    if (!newPassword) {
      setPasswordError("New password is required");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    setUpdatingPassword(true);
    try {
      await patch("/v1/auth/me", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated successfully");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Failed to update password");
    } finally {
      setUpdatingPassword(false);
    }
  };

  // ── MFA ───────────────────────────────────────────────────────────────────

  const handleToggleMfa = (checked: boolean) => {
    const intent = checked ? "enable" : "disable";
    setLocalMfaEnabled(checked);  // optimistic — revert on cancel
    setMfaIntent(intent);
    setDialogPassword("");
    setDialogOtp("");
    setDialogError(null);
    setMfaDialogOpen(true);
  };

  const handleCancelMfa = () => {
    // Revert the optimistic flip from handleToggleMfa — localMfaEnabled is
    // this page's source of truth (UserContext has no refetch), so reverting
    // from user.mfa_enabled would undo an MFA change confirmed this session.
    setLocalMfaEnabled(mfaIntent !== "enable");
    setMfaDialogOpen(false);
  };

  const confirmEnableMfa = async () => {
    setDialogError(null);
    if (!dialogPassword) {
      setDialogError("Current password is required");
      return;
    }

    setDialogSubmitting(true);
    try {
      await post("/v1/auth/mfa/enable", { password: dialogPassword });

      setMfaDialogOpen(false);
      setLocalMfaEnabled(true);
      toast.success("MFA has been enabled");
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Connection error. Please try again.",
      );
    } finally {
      setDialogSubmitting(false);
    }
  };

  const confirmDisableMfa = async () => {
    setDialogError(null);
    if (!dialogPassword) {
      setDialogError("Current password is required");
      return;
    }
    if (!dialogOtp || dialogOtp.length !== 6) {
      setDialogError("A valid 6-digit MFA code is required");
      return;
    }

    setDialogSubmitting(true);
    try {
      await post("/v1/auth/mfa/disable", { password: dialogPassword, otp: dialogOtp });

      setMfaDialogOpen(false);
      setLocalMfaEnabled(false);
      toast.success("MFA has been disabled");
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Connection error. Please try again.",
      );
    } finally {
      setDialogSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-surface-400 mt-1">Manage your profile and organization</p>
      </div>

      <PageGuide title="Account settings" illustration={<GuideSettings />}>
        <p>Manage your personal account settings — update your profile name and email, change your password, and configure multi-factor authentication for enhanced security.</p>
      </PageGuide>

      {/* ── Profile Card ────────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <User size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Profile</h2>
            <p className="text-xs text-surface-400">Your personal information</p>
          </div>
        </div>

        {profileLoading ? (
          <div className="space-y-4">
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
          </div>
        ) : (
          <div className="space-y-4 max-w-md">
            {/* Name */}
            <Field label="Name" htmlFor="settings-name">
              <input
                id="settings-name"
                className="input-base"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            {/* Email */}
            <Field label="Email" htmlFor="settings-email">
              <input
                id="settings-email"
                className="input-base"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            {/* Role — disabled (composite: icon overlay manages its own wiring) */}
            <div>
              <label htmlFor="settings-role" className="block text-sm font-medium text-surface-300 mb-1">Role</label>
              <div className="relative">
                <input
                  id="settings-role"
                  className="input-base pr-10 cursor-not-allowed opacity-60"
                  value={user?.role ?? "member"}
                  disabled
                  readOnly
                />
                <Shield size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
              </div>
              <p className="text-xs text-surface-500 mt-1">Role is assigned by your organization administrator.</p>
            </div>

            {/* Save button */}
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="text-sm"
              >
                <Save size={14} />
                {savingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Change Password Card ─────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
            <Lock size={20} className="text-warning" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Change Password</h2>
            <p className="text-xs text-surface-400">Update your account password</p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {/* Current Password */}
          <Field label="Current Password" htmlFor="settings-current-password">
            <input
              id="settings-current-password"
              className="input-base"
              type="password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
            />
          </Field>

          {/* New Password */}
          <div>
            <PasswordField
              id="settings-new-password"
              label="New Password"
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v);
                if (passwordError) setPasswordError(null);
              }}
              placeholder="Enter new password (min 8 characters)"
            />
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-warning mt-1">
                Password must be at least 8 characters ({newPassword.length}/8)
              </p>
            )}
            {newPassword.length >= 8 && (
              <p className="text-xs text-success mt-1">
                Password meets minimum length requirement
              </p>
            )}
          </div>

          {/* Error */}
          {passwordError && (
            <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
              <AlertCircle size={14} />
              {passwordError}
            </div>
          )}

          {/* Update button */}
          <div className="pt-2">
            <Button
              variant="primary"
              onClick={handleUpdatePassword}
              disabled={updatingPassword || !currentPassword || !newPassword || newPassword.length < 8}
              className="text-sm"
            >
              <Lock size={14} />
              {updatingPassword ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── MFA Card ──────────────────────────────────────────────────────────── */}
      {!profileLoading && (
        <div className="card-base p-6">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
              localMfaEnabled ? "bg-success/10" : "bg-info/10",
            )}>
              <Shield size={20} className={localMfaEnabled ? "text-success" : "text-info"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">Multi-Factor Authentication</h2>
                {localMfaEnabled && (
                  <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/30 shrink-0">
                    Enabled
                  </span>
                )}
              </div>
              <p className="text-xs text-surface-400">
                {localMfaEnabled
                  ? "Your account is protected with email-based MFA"
                  : "Add an extra layer of security to your account"
                }
              </p>
            </div>
            <Switch
              checked={localMfaEnabled}
              onCheckedChange={handleToggleMfa}
              disabled={profileLoading}
            />
          </div>
        </div>
      )}

      {/* ── MFA confirmation dialog ────────────────────────────────────────── */}
      <Dialog
        open={mfaDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelMfa();
        }}
        title={mfaIntent === "disable" ? "Disable MFA" : "Enable MFA"}
        description={
          mfaIntent === "disable"
            ? "Enter your password and the MFA code from your email to disable."
            : "Enter your password to enable email-based MFA."
        }
        footer={
          <>
            <DialogCloseButton disabled={dialogSubmitting} />
            <Button
              variant={mfaIntent === "disable" ? "secondary" : "primary"}
              loading={dialogSubmitting}
              onClick={mfaIntent === "disable" ? confirmDisableMfa : confirmEnableMfa}
              className={mfaIntent === "disable" ? "border-error/40 text-error hover:bg-error/10 hover:border-error/60" : ""}
            >
              {/* Dialog-flow label mirrors the variant/onClick above — both
                  derive from mfaIntent, not localMfaEnabled, which is
                  optimistically flipped while this dialog is open. */}
              {mfaIntent === "disable" ? "Disable MFA" : "Enable MFA"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Current Password" htmlFor="mfa-dialog-password">
            <input
              id="mfa-dialog-password"
              className="input-base w-full"
              type="password"
              placeholder="Enter your current password"
              value={dialogPassword}
              onChange={(e) => {
                setDialogPassword(e.target.value);
                if (dialogError) setDialogError(null);
              }}
            />
          </Field>

          {mfaIntent === "disable" && (
            <Field label="MFA Code" htmlFor="mfa-dialog-otp" hint="A valid 6-digit code is required">
              <input
                id="mfa-dialog-otp"
                className="input-base w-full text-center text-lg tracking-[0.3em] font-mono"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={dialogOtp}
                onChange={(e) => {
                  setDialogOtp(e.target.value.replace(/\D/g, ""));
                  if (dialogError) setDialogError(null);
                }}
              />
            </Field>
          )}

          {dialogError && (
            <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
              <AlertCircle size={14} />
              {dialogError}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
