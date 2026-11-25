'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Download, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { liveGet, post } from '@/lib/api';

interface TwoFactorStatus {
  enabled: boolean;
  remainingBackupCodes: number;
}

interface SetupData {
  secret: string;
  issuer: string;
  account: string;
  otpauthUri: string;
}

export function TwoFactorSecurityCard() {
  const toast = useToast();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await liveGet<TwoFactorStatus>('/auth/2fa/status'));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startSetup() {
    setBusy(true);
    try {
      const res = await post<SetupData>('/auth/2fa/setup');
      setSetupData(res);
      setVerifyCode('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await post<{ enabled: boolean; backupCodes: string[]; message: string }>('/auth/2fa/enable', {
        code: verifyCode.trim(),
      });
      setBackupCodes(res.backupCodes);
      setSetupData(null);
      setVerifyCode('');
      toast.success('Two-factor authentication enabled!');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/auth/2fa/disable', {
        password: disablePassword,
        ...(disableCode.trim() ? { code: disableCode.trim() } : {}),
      });
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      toast.success('Two-factor authentication disabled.');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disable 2FA.');
    } finally {
      setBusy(false);
    }
  }

  function downloadBackupCodes(codes: string[]) {
    const content = [
      'Yakunex Hub — Two-Factor Recovery Codes',
      `Generated: ${new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}`,
      'Each code can be used once if you lose access to your authenticator app:',
      '',
      ...codes.map((c, idx) => `${idx + 1}. ${c}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yakunex-hub-2fa-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader
        title="Two-Factor Authentication (Authenticator App)"
        description="Protect your account with Google Authenticator, Microsoft Authenticator, Authy, or 1Password (RFC 6238 TOTP)."
        badge={
          status?.enabled ? (
            <Badge tone="success">2FA Enabled · {status.remainingBackupCodes} recovery codes</Badge>
          ) : (
            <Badge tone="warning">Recommended</Badge>
          )
        }
        action={
          status?.enabled ? (
            <Button size="sm" variant="danger" onClick={() => setDisableOpen(true)} disabled={busy}>
              <ShieldOff className="h-3.5 w-3.5" /> Disable 2FA
            </Button>
          ) : !setupData ? (
            <Button size="sm" onClick={startSetup} disabled={busy}>
              <ShieldCheck className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : 'Enable 2FA'}
            </Button>
          ) : null
        }
      />

      {setupData && (
        <form onSubmit={confirmEnable} className="space-y-4 border-t border-line px-5 py-5 sm:px-6">
          <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 text-xs space-y-2.5">
            <p className="font-semibold text-ink">
              Step 1: Add this setup key to Google Authenticator, Microsoft Authenticator, or Apple Passwords
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-bold tracking-wider text-ink select-all">
                {setupData.secret.replace(/(.{4})/g, '$1 ').trim()}
              </code>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(setupData.secret).catch(() => undefined);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
              >
                {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey ? 'Copied' : 'Copy Key'}
              </Button>
              <a
                href={setupData.otpauthUri}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-info hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" /> Open in Authenticator App
              </a>
            </div>
            <p className="text-[11px] text-muted">
              Account: <strong>{setupData.account}</strong> · Time-based (TOTP · 6 digits · 30s)
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Step 2: Enter 6-digit code from your app" htmlFor="tf-verify">
              <Input
                id="tf-verify"
                inputMode="numeric"
                required
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="w-44 font-mono tracking-widest"
              />
            </Field>
            <Button type="submit" disabled={busy || verifyCode.trim().length < 6}>
              {busy ? 'Verifying…' : 'Verify & Activate 2FA'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetupData(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {backupCodes && (
        <div className="space-y-3 border-t border-line bg-emerald-500/5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Save Your 8 Single-Use Recovery Codes</p>
              <p className="text-xs text-muted">
                Store these safely offline. Each recovery code works once if your phone is lost.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => downloadBackupCodes(backupCodes)}>
                <Download className="h-3.5 w-3.5" /> Download .txt
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBackupCodes(null)}>
                Done
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {backupCodes.map((code) => (
              <div
                key={code}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-center font-mono text-xs font-bold tracking-wider text-ink select-all"
              >
                {code}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={disableOpen} title="Disable Two-Factor Authentication" onClose={() => setDisableOpen(false)}>
        <form onSubmit={confirmDisable} className="space-y-4">
          <p className="text-xs text-muted">
            Confirm your current password to turn off Authenticator App verification on your account.
          </p>
          <Field label="Current password" htmlFor="tf-dis-pw">
            <PasswordInput
              id="tf-dis-pw"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </Field>
          <Field label="Authenticator or backup code (optional)" htmlFor="tf-dis-code">
            <Input
              id="tf-dis-code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="123456"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? 'Disabling…' : 'Disable 2FA'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
