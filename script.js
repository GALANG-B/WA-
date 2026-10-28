/* Whisper multi-account: Google OAuth + Supabase Auth + RLS-protected messages.
   Set SUPABASE_URL and SUPABASE_ANON_KEY below using your own project values.
   A publishable key or legacy anon key is safe to expose in a browser when RLS is enabled.
   NEVER use a service_role/secret key here. */
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";

const $ = (id) => document.getElementById(id);
const ui = {
  accountChip: $("account-chip"), topAvatar: $("top-avatar"), loggedEmail: $("logged-email"),
  btnTheme: $("btn-theme"), themeIcon: $("theme-icon"), btnLogout: $("btn-logout"),
  sidebar: $("sidebar"), currentAvatar: $("current-user-avatar"), currentName: $("current-user-name"), currentEmail: $("current-user-email-display"),
  btnAdd: $("btn-open-add-friend"), search: $("search-input"), filterAll: $("filter-all"), filterUnread: $("filter-unread"), contacts: $("contact-list"),
  chatArea: $("chat-area"), empty: $("empty-state"), emptyLogin: $("empty-login"), chatHeader: $("chat-header"), back: $("btn-back"),
  activeAvatar: $("active-contact-avatar-header"), activeName: $("active-contact-name-header"), activeEmail: $("active-contact-email-header"), activeStatus: $("active-contact-status-header"),
  messages: $("messages-container"), chatForm: $("chat-form"), messageInput: $("message-input"), send: $("btn-send"),
  authScreen: $("auth-screen"), googleLogin: $("btn-google-login"), authError: $("auth-error"),
  addModal: $("add-friend-modal"), closeAdd: $("btn-close-add-friend"), friendSearch: $("friend-target-input"), searchResults: $("user-search-results"), toast: $("toast")
};
const state = { session: null, user: null, profile: null, profiles: [], conversations: [], activeId: null, messages: [], filter: "all", query: "", realtime: null, presence: null, online: new Set(), loading: false, toastTimer: null };
const configured = !SUPABASE_URL.includes("YOUR_PROJECT_REF") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_");
let sb = null;
if (window.supabase?.createClient && configured) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

function escapeHTML(value = "") { return String(value).replace(/[&<>\'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function avatarUrl(url, seed = "Whisper") { const v = String(url || ""); return /^https:\/\//i.test(v) ? v : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`; }
function showToast(message, error = false) { ui.toast.textContent = message; ui.toast.classList.toggle("toast-error", error); ui.toast.classList.remove("hidden"); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 3600); }
function showAuthError(message) { ui.authError.textContent = message; ui.authError.classList.toggle("hidden", !message); }
function setAuthVisible(show) { ui.authScreen.classList.toggle("hidden", !show); }
function setLoading(button, loading, label) { button.disabled = loading; button.classList.toggle("is-loading", loading); if (label) button.dataset.originalLabel ||= button.innerHTML; button.innerHTML = loading ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Menghubungkan…' : (button.dataset.originalLabel || label || button.innerHTML); }
function timeLabel(iso) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"}); }
function dayLabel(iso) { const d = new Date(iso); const today = new Date(); if (d.toDateString() === today.toDateString()) return timeLabel(iso); return d.toLocaleDateString("id-ID", {day:"2-digit", month:"short"}); }
function currentProfile() { return state.profiles.find(p => p.id === state.user?.id) || state.profile; }
function personById(id) { return state.profiles.find(p => p.id === id); }

async function startGoogleLogin() {
  if (!sb) { showAuthError("Konfigurasi Supabase belum diisi. Periksa SUPABASE_URL dan SUPABASE_ANON_KEY di script.js."); return; }
  showAuthError(""); setLoading(ui.googleLogin, true);
  try {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
    if (error) throw error;
  } catch (e) { showAuthError(`Gagal memulai login: ${e.message}`); setLoading(ui.googleLogin, false); }
}
async function handleAuthSession(session) {
  state.session = session; state.user = session?.user || null;
  if (!state.user) { state.profile = null; state.profiles = []; state.messages = []; state.activeId = null; cleanupRealtime(); renderSignedOut(); return; }
  setAuthVisible(false); ui.accountChip.classList.remove("hidden"); ui.btnLogout.classList.remove("hidden"); ui.btnAdd.classList.remove("hidden");
  await loadProfileAndUsers(); await loadContactsAndMessages(); subscribeRealtime(); subscribePresence(); renderProfile(); renderContacts(); renderChat();
}
async function loadProfileAndUsers() {
  const [{ data: mine, error: mineError }, { data: people, error: peopleError }] = await Promise.all([
    sb.from("profiles").select("id,email,display_name,avatar_url,created_at").eq("id", state.user.id).maybeSingle(),
    sb.from("profiles").select("id,email,display_name,avatar_url,created_at").order("display_name", {ascending:true}).limit(500)
  ]);
  if (mineError) throw mineError; if (peopleError) throw peopleError;
  state.profile = mine; state.profiles = people || [];
  if (!state.profile) { showToast("Profil belum tersedia. Jalankan SQL setup Supabase lalu masuk ulang.", true); }
}
async function loadContactsAndMessages() {
  const { data, error } = await sb.from("messages").select("id,sender_id,receiver_id,content,created_at,read_at").or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`).order("created_at", {ascending:true}).limit(2000);
  if (error) throw error;
  state.messages = data || [];
  const latest = new Map();
  for (const m of state.messages) { const other = m.sender_id === state.user.id ? m.receiver_id : m.sender_id; const old = latest.get(other); if (!old || new Date(m.created_at) > new Date(old.created_at)) latest.set(other, m); }
  state.conversations = [...latest.entries()].map(([id, message]) => ({id, message}));
}
function renderProfile() {
  const p = currentProfile(); if (!p) return;
  const name = p.display_name || p.email?.split("@")[0] || "Pengguna Whisper";
  const avatar = avatarUrl(p.avatar_url, name);
  ui.currentAvatar.src = avatar; ui.topAvatar.src = avatar; ui.currentName.textContent = name; ui.currentEmail.textContent = p.email || ""; ui.loggedEmail.textContent = p.email || name;
}
function renderSignedOut() {
  ui.accountChip.classList.add("hidden"); ui.btnLogout.classList.add("hidden"); ui.btnAdd.classList.add("hidden");
  ui.currentAvatar.src = avatarUrl("", "Whisper"); ui.currentName.textContent = "Selamat datang"; ui.currentEmail.textContent = "Masuk untuk mulai chat"; ui.loggedEmail.textContent = "Belum login";
  ui.contacts.innerHTML = '<div class="list-placeholder">Masuk dengan Google untuk menemukan pengguna.</div>';
  ui.empty.classList.remove("hidden"); ui.chatHeader.classList.add("hidden"); ui.messages.classList.add("hidden"); ui.chatForm.classList.add("hidden");
  setAuthVisible(true);
}
function getLastMessage(otherId) { let latest = null; for (const m of state.messages) if ((m.sender_id === state.user.id && m.receiver_id === otherId) || (m.sender_id === otherId && m.receiver_id === state.user.id)) if (!latest || new Date(m.created_at) > new Date(latest.created_at)) latest = m; return latest; }
function getUnread(otherId) { return state.messages.filter(m => m.sender_id === otherId && m.receiver_id === state.user.id && !m.read_at).length; }
function renderContacts() {
  if (!state.user) return;
  const q = state.query.trim().toLowerCase();
  const people = state.profiles.filter(p => p.id !== state.user.id).map(p => ({p, last:getLastMessage(p.id), unread:getUnread(p.id)})).filter(x => (!q || `${x.p.display_name||""} ${x.p.email||""}`.toLowerCase().includes(q)) && (state.filter !== "unread" || x.unread > 0));
  people.sort((a,b) => { const ta = a.last ? new Date(a.last.created_at).getTime() : 0; const tb = b.last ? new Date(b.last.created_at).getTime() : 0; return tb-ta || (a.p.display_name||a.p.email||"").localeCompare(b.p.display_name||b.p.email||""); });
  if (!people.length) { ui.contacts.innerHTML = `<div class="list-placeholder">${state.filter === "unread" ? "Tidak ada pesan yang belum dibaca." : (q ? "Pengguna tidak ditemukan." : "Belum ada pengguna lain. Minta teman masuk ke Whisper!")}</div>`; return; }
  ui.contacts.innerHTML = people.map(({p,last,unread}) => `<button class="contact-card ${state.activeId===p.id?"selected":""}" data-user-id="${p.id}" type="button"><img class="avatar" src="${escapeHTML(avatarUrl(p.avatar_url,p.display_name||p.email))}" alt=""><span class="contact-copy"><span class="contact-top"><strong>${escapeHTML(p.display_name||p.email||"Pengguna")}</strong><time>${last?dayLabel(last.created_at):""}</time></span><span class="contact-bottom"><span>${last?`${last.sender_id===state.user.id?"Kamu: ":""}${escapeHTML(last.content)}`:escapeHTML(p.email||"Pengguna Whisper")}</span>${unread?`<b class="unread-badge">${unread}</b>`:""}</span></span></button>`).join("");
}
function renderChat() {
  const p = personById(state.activeId);
  if (!p) { ui.chatHeader.classList.add("hidden"); ui.messages.classList.add("hidden"); ui.chatForm.classList.add("hidden"); ui.empty.classList.remove("hidden"); return; }
  ui.empty.classList.add("hidden"); ui.chatHeader.classList.remove("hidden"); ui.messages.classList.remove("hidden"); ui.chatForm.classList.remove("hidden");
  ui.activeAvatar.src = avatarUrl(p.avatar_url,p.display_name||p.email); ui.activeName.textContent = p.display_name||p.email||"Pengguna"; ui.activeEmail.textContent = p.email||""; ui.activeStatus.textContent = "Pengguna terdaftar";
  const conversation = state.messages.filter(m => (m.sender_id===state.user.id && m.receiver_id===p.id)||(m.sender_id===p.id && m.receiver_id===state.user.id));
  if (!conversation.length) ui.messages.innerHTML = '<div class="conversation-start">Ini awal percakapan. Sapa temanmu 👋</div>';
  else ui.messages.innerHTML = conversation.map(m => { const mine = m.sender_id===state.user.id; return `<div class="message-row ${mine?"mine":"theirs"}"><div class="bubble"><p>${escapeHTML(m.content)}</p><div class="message-meta"><time>${timeLabel(m.created_at)}</time>${mine?`<i class="fa-solid ${m.read_at?"fa-check-double":"fa-check"}" aria-label="${m.read_at?"Dibaca":"Terkirim"}"></i>`:""}</div></div></div>`; }).join("");
  requestAnimationFrame(() => { ui.messages.scrollTop = ui.messages.scrollHeight; });
}
async function selectContact(id) {
  state.activeId = id; renderContacts(); renderChat(); ui.sidebar.classList.add("mobile-hidden");
  const unread = state.messages.filter(m => m.sender_id===id && m.receiver_id===state.user.id && !m.read_at).map(m=>m.id);
  if (unread.length) {
    const { error } = await sb.from("messages").update({read_at:new Date().toISOString()}).in("id", unread);
    if (!error) { const set = new Set(unread); state.messages = state.messages.map(m=>set.has(m.id)?{...m,read_at:new Date().toISOString()}:m); renderContacts(); renderChat(); }
  }
  if (window.matchMedia("(max-width: 760px)").matches) setTimeout(() => ui.messageInput.focus({preventScroll:true}), 120);
}
async function sendMessage(event) {
  event.preventDefault(); if (state.loading || !state.activeId || !state.user) return;
  const content = ui.messageInput.value.trim(); if (!content) return;
  state.loading = true; ui.send.disabled = true;
  try {
    const {data,error} = await sb.from("messages").insert({sender_id:state.user.id,receiver_id:state.activeId,content}).select("id,sender_id,receiver_id,content,created_at,read_at").single();
    if (error) throw error;
    if (!state.messages.some(m=>m.id===data.id)) state.messages.push(data);
    ui.messageInput.value = ""; renderContacts(); renderChat();
  } catch(e) { showToast(`Pesan gagal dikirim: ${e.message}`,true); }
  finally { state.loading=false; ui.send.disabled=false; ui.messageInput.focus({preventScroll:true}); }
}
function subscribeRealtime() {
  cleanupRealtime();
  state.realtime = sb.channel(`messages:${state.user.id}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"}, payload => { const m=payload.new; if (m.sender_id!==state.user.id && m.receiver_id!==state.user.id) return; if (!state.messages.some(x=>x.id===m.id)) state.messages.push(m); renderContacts(); if (state.activeId===m.sender_id || state.activeId===m.receiver_id) renderChat(); })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"}, payload => { const m=payload.new; const i=state.messages.findIndex(x=>x.id===m.id); if(i>=0) state.messages[i]=m; renderContacts(); if(state.activeId===m.sender_id||state.activeId===m.receiver_id)renderChat(); })
    .subscribe();
}
function subscribePresence() {
  if (state.presence) sb.removeChannel(state.presence);
  state.presence = sb.channel("whisper-presence",{config:{presence:{key:state.user.id}}})
    .on("presence",{event:"sync"},()=>{ const p=state.presence.presenceState(); state.online=new Set(Object.keys(p)); if(state.activeId) ui.activeStatus.textContent=state.online.has(state.activeId)?"Online":"Pengguna terdaftar"; })
    .subscribe(async status=>{if(status==="SUBSCRIBED") await state.presence.track({user_id:state.user.id,online_at:new Date().toISOString()});});
}
function cleanupRealtime() { if (state.realtime && sb) sb.removeChannel(state.realtime); if (state.presence && sb) sb.removeChannel(state.presence); state.realtime=null; state.presence=null; }
async function searchUsers() {
  const q=ui.friendSearch.value.trim(); if(q.length<2){ui.searchResults.innerHTML='<p class="muted">Ketik minimal 2 karakter untuk mencari.</p>';return;}
  ui.searchResults.innerHTML='<p class="muted">Mencari pengguna…</p>';
  const {data,error}=await sb.from("profiles").select("id,email,display_name,avatar_url").neq("id",state.user.id).or(`display_name.ilike.%${q.replace(/[,%()]/g," ")}%,email.ilike.%${q.replace(/[,%()]/g," ")}%`).limit(20);
  if(error){ui.searchResults.innerHTML='<p class="error-text">Pencarian gagal. Periksa kebijakan RLS.</p>';return;}
  if(!data?.length){ui.searchResults.innerHTML='<p class="muted">Pengguna tidak ditemukan.</p>';return;}
  ui.searchResults.innerHTML=data.map(p=>`<button class="user-result" data-user-id="${p.id}" type="button"><img class="avatar" src="${escapeHTML(avatarUrl(p.avatar_url,p.display_name||p.email))}" alt=""><span><strong>${escapeHTML(p.display_name||p.email)}</strong><small>${escapeHTML(p.email||"")}</small></span><i class="fa-regular fa-message"></i></button>`).join("");
}
async function refreshAfterAuth() { try { await handleAuthSession(state.session); } catch(e) { showToast(`Gagal memuat Whisper: ${e.message}`,true); } }
function applyTheme(dark) { document.documentElement.classList.toggle("dark",dark); localStorage.setItem("whisper_theme",dark?"dark":"light"); ui.themeIcon.className=dark?"fa-solid fa-sun":"fa-solid fa-moon"; }
function wireEvents() {
  ui.googleLogin.addEventListener("click",startGoogleLogin); ui.emptyLogin.addEventListener("click",startGoogleLogin);
  ui.btnLogout.addEventListener("click",async()=>{cleanupRealtime();const {error}=await sb.auth.signOut();if(error)showToast(error.message,true);});
  ui.btnTheme.addEventListener("click",()=>applyTheme(!document.documentElement.classList.contains("dark")));
  ui.search.addEventListener("input",()=>{state.query=ui.search.value;renderContacts();});
  ui.filterAll.addEventListener("click",()=>{state.filter="all";ui.filterAll.classList.add("active");ui.filterUnread.classList.remove("active");renderContacts();});
  ui.filterUnread.addEventListener("click",()=>{state.filter="unread";ui.filterUnread.classList.add("active");ui.filterAll.classList.remove("active");renderContacts();});
  ui.contacts.addEventListener("click",e=>{const b=e.target.closest("[data-user-id]");if(b)selectContact(b.dataset.userId);});
  ui.chatForm.addEventListener("submit",sendMessage);
  ui.btnAdd.addEventListener("click",()=>{ui.addModal.classList.remove("hidden");ui.friendSearch.value="";ui.searchResults.innerHTML='<p class="muted">Mulai mengetik untuk mencari pengguna.</p>';setTimeout(()=>ui.friendSearch.focus(),100);});
  ui.closeAdd.addEventListener("click",()=>ui.addModal.classList.add("hidden")); ui.addModal.addEventListener("click",e=>{if(e.target===ui.addModal)ui.addModal.classList.add("hidden");});
  let searchTimer; ui.friendSearch.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchUsers,250);});
  ui.searchResults.addEventListener("click",e=>{const b=e.target.closest("[data-user-id]");if(b){ui.addModal.classList.add("hidden");selectContact(b.dataset.userId);}});
  ui.back.addEventListener("click",()=>ui.sidebar.classList.remove("mobile-hidden"));
  // Recompute chat viewport when Android/iOS keyboard opens; do not lock the composer off-screen.
  if(window.visualViewport){const adjust=()=>document.documentElement.style.setProperty("--visual-height",`${window.visualViewport.height}px`);window.visualViewport.addEventListener("resize",adjust);window.visualViewport.addEventListener("scroll",adjust);adjust();}
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&sb)sb.auth.getSession().then(({data})=>{if(data.session&&data.session.user.id!==state.user?.id)handleAuthSession(data.session);});});
}
async function boot() {
  applyTheme(localStorage.getItem("whisper_theme")==="dark"); wireEvents();
  if(!configured){setAuthVisible(true);showAuthError("Konfigurasi belum diisi. Edit SUPABASE_URL dan SUPABASE_ANON_KEY di script.js, lalu deploy ulang.");return;}
  try {
    const {data,error}=await sb.auth.getSession(); if(error)throw error;
    await handleAuthSession(data.session);
    sb.auth.onAuthStateChange((_event,session)=>{state.session=session; if(!session){handleAuthSession(null);} else if(session.user.id!==state.user?.id || !state.profile){setTimeout(()=>handleAuthSession(session).catch(e=>showToast(e.message,true)),0);} });
  } catch(e) { showAuthError(`Koneksi Supabase gagal: ${e.message}. Periksa URL dan API key dari proyek yang sama.`); setAuthVisible(true); }
}
document.addEventListener("DOMContentLoaded",boot);
