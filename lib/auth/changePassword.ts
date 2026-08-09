import { hasSupabase, supabase } from '../supabase';
import { isValidPassword } from './validation';
import {
  getLocalSessionId,
  loadLocalAccounts,
  saveLocalAccounts,
  setRememberedLogin,
  getRememberedLogin,
} from './authStorage';

/** Change password — requires current password. Not a one-tap flow. */
export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  if (!currentPassword || !nextPassword) {
    throw new Error('Enter your current and new password.');
  }
  if (!isValidPassword(nextPassword)) {
    throw new Error('New password must be at least 6 characters.');
  }
  if (currentPassword === nextPassword) {
    throw new Error('New password must be different from your current one.');
  }

  if (hasSupabase && supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.email) {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (signErr) {
        throw new Error('Current password is incorrect.');
      }
      const { error } = await supabase.auth.updateUser({
        password: nextPassword,
      });
      if (error) throw new Error(error.message || 'Could not update password.');
      const remembered = await getRememberedLogin();
      if (remembered) {
        await setRememberedLogin({
          identifier: remembered.identifier,
        });
      }
      return;
    }
  }

  const localId = await getLocalSessionId();
  const accounts = await loadLocalAccounts();
  const account = accounts.find((a) => a.id === localId);
  if (!account) {
    throw new Error('No local account found. Try logging in again.');
  }
  if (account.password !== currentPassword) {
    throw new Error('Current password is incorrect.');
  }
  account.password = nextPassword;
  await saveLocalAccounts(accounts);
  const remembered = await getRememberedLogin();
  if (remembered) {
    await setRememberedLogin({
      identifier: remembered.identifier,
    });
  }
}
