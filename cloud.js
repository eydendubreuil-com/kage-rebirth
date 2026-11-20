/* KAGE: REBIRTH — compte par adresse e-mail (lien magique) et sauvegarde en ligne */
import { SUPABASE } from './config.js';
export const CLOUD = { ready: false, user: null, client: null, last: null, error: null };
const listeners = [];
export const onCloud = (f) => listeners.push(f);
const emit = () => listeners.forEach(f => f(CLOUD));
export async function cloudInit() {
  if (!SUPABASE.url || !SUPABASE.anonKey) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    CLOUD.client = createClient(SUPABASE.url, SUPABASE.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
    CLOUD.ready = true;
    const { data } = await CLOUD.client.auth.getSession(); CLOUD.user = data.session?.user || null;
    CLOUD.client.auth.onAuthStateChange((_e, s) => { CLOUD.user = s?.user || null; emit(); });
    if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
  } catch (e) { CLOUD.error = 'Service de connexion injoignable.'; }
  emit();
}
export async function signIn(email) {
  if (!CLOUD.ready) return { error: 'La connexion n\'est pas encore activée sur ce jeu.' };
  const { error } = await CLOUD.client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  return { error: error ? error.message : null };
}
export async function signOut() { if (CLOUD.ready) await CLOUD.client.auth.signOut(); CLOUD.user = null; emit(); }
let pending = null, timer = null;
export function cloudSave(data) {
  if (!CLOUD.user) return; pending = data; clearTimeout(timer);
  timer = setTimeout(async () => { const d = pending; pending = null;
    const { error } = await CLOUD.client.from('saves').upsert({ user_id: CLOUD.user.id, data: d, updated_at: new Date().toISOString() });
    CLOUD.last = error ? null : Date.now(); CLOUD.error = error ? 'Sauvegarde en ligne impossible : ' + error.message : null; emit(); }, 1500);
}
export async function cloudLoad() {
  if (!CLOUD.user) return null;
  const { data, error } = await CLOUD.client.from('saves').select('data, updated_at').eq('user_id', CLOUD.user.id).maybeSingle();
  if (error) { CLOUD.error = error.message; return null; } return data ? data.data : null;
}
