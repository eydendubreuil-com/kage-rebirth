/* KAGE: REBIRTH — compte par adresse e-mail (lien de connexion) et sauvegarde en ligne (Firebase) */
import { FIREBASE } from './config.js';
export const CLOUD = { ready: false, user: null, client: null, last: null, error: null };
const listeners = [];
export const onCloud = (f) => listeners.push(f);
const emit = () => listeners.forEach(f => f(CLOUD));
let A = null, F = null, db = null;
const V = '10.14.1', B = `https://www.gstatic.com/firebasejs/${V}/`;
export async function cloudInit() {
  if (!FIREBASE.apiKey || !FIREBASE.projectId) return;
  try {
    const app = await import(B + 'firebase-app.js'); A = await import(B + 'firebase-auth.js'); F = await import(B + 'firebase-firestore.js');
    const a = app.initializeApp(FIREBASE); CLOUD.client = A.getAuth(a); db = F.getFirestore(a);
    CLOUD.ready = true;
    if (A.isSignInWithEmailLink(CLOUD.client, location.href)) {
      let email = null; try { email = localStorage.getItem('kage-email'); } catch (_) {}
      if (!email) email = prompt('Confirme ton adresse e-mail pour terminer la connexion :');
      if (email) { try { await A.signInWithEmailLink(CLOUD.client, email, location.href); try { localStorage.removeItem('kage-email'); } catch (_) {} } catch (e) { CLOUD.error = 'Lien invalide ou expiré.'; } }
      history.replaceState(null, '', location.pathname);
    }
    await CLOUD.client.authStateReady();
    CLOUD.user = CLOUD.client.currentUser;
    A.onAuthStateChanged(CLOUD.client, (u) => { CLOUD.user = u; emit(); });
  } catch (e) { CLOUD.error = 'Service de connexion injoignable.'; }
  emit();
}
export async function signIn(email) {
  if (!CLOUD.ready) return { error: 'La connexion n\'est pas encore activée sur ce jeu.' };
  try { await A.sendSignInLinkToEmail(CLOUD.client, email, { url: location.origin + location.pathname, handleCodeInApp: true }); try { localStorage.setItem('kage-email', email); } catch (_) {} return { error: null }; }
  catch (e) { return { error: e.message }; }
}
export async function signOut() { if (CLOUD.ready) await A.signOut(CLOUD.client); CLOUD.user = null; emit(); }
let pending = null, timer = null;
export function cloudSave(data) {
  if (!CLOUD.user) return; pending = data; clearTimeout(timer);
  timer = setTimeout(async () => { const d = pending; pending = null;
    try { await F.setDoc(F.doc(db, 'saves', CLOUD.user.uid), { data: JSON.stringify(d), updated_at: Date.now() }); CLOUD.last = Date.now(); CLOUD.error = null; }
    catch (e) { CLOUD.last = null; CLOUD.error = 'Sauvegarde en ligne impossible : ' + e.message; } emit(); }, 1500);
}
export async function cloudLoad() {
  if (!CLOUD.user) return null;
  try { const s = await F.getDoc(F.doc(db, 'saves', CLOUD.user.uid)); return s.exists() ? JSON.parse(s.data().data) : null; }
  catch (e) { CLOUD.error = e.message; return null; }
}
