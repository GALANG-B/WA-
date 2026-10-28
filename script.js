/* Whisper Chat
 * Catatan keamanan:
 * Versi ini menggunakan tabel profiles sebagai profil aplikasi, bukan Google OAuth.
 * Aktifkan RLS dan kebijakan Supabase yang benar sebelum dipakai untuk data pribadi.
 */
const SUPABASE_URL = "https://pmtjequlrdxpjaeeswhd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdGplcXVscmR4cGphZWVzd2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzE1MTYsImV4cCI6MjEwODEwNzUxNn0.Xm9hlw-iWtvho3uHavQ4A3I53hivewoYHaPJB6oYEws";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const state = {
  users: {},
  currentEmail: localStorage.getItem("whisper_logged_email"),
  messages: [],
  activeContactEmail: null,
  filterMode: "all",
  searchQuery: "",
  isSending: false,
  onlineUsers: {},
  messagesChannel: null,
  presenceChannel: null,
  toastTimer: null
};

const el = {
  authModal: $("auth-modal"),
  existingAccountsList: $("existing-accounts-list"),
  createAccountForm: $("create-account-form"),
  newEmail: $("new-email"),
  newName: $("new-name"),
  newAvatar: $("new-avatar-url"),
  loggedEmail: $("logged-email"),
  btnLogout: $("btn-logout"),
  currentAvatar: $("current-user-avatar"),
  currentName: $("current-user-name"),
  currentEmail: $("current-user-email-display"),
  contactList: $("contact-list"),
  chatHeader: $("chat-header"),
  messages: $("messages-container"),
  chatForm: $("chat-form"),
  messageInput: $("message-input"),
  emptyState: $("empty-state"),
  activeAvatar: $("active-contact-avatar-header"),
  activeName: $("active-contact-name-header"),
  activeEmail: $("active-contact-email-header"),
  activeStatus: $("active-contact-status-header"),
  search: $("search-input"),
  btnTheme: $("btn-theme"),
  themeIcon: $("theme-icon"),
  btnReset: $("btn-reset"),
  btnBack: $("btn-back"),
  sidebar: $("sidebar"),
  filterAll: $("filter-all"),
  filterUnread: $("filter-unread"),
  btnOpenAddFriend: $("btn-open-add-friend"),
  addFriendModal: $("add-friend-modal"),
  addFriendForm: $("add-friend-form"),
  btnCloseAddFriend: $("btn-close-add-friend"),
  friendTarget: $("friend-target-input"),
  addFriendError: $("add-friend-error"),
  toast: $("toast")
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}

function safeAvatar(url, seed = "Whisper") {
  const value = String(url || "").trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("toast-error", isError);
  el.toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 3000);
}

function setModal(modal, open) {
  modal.classList.toggle("hidden", !open);
}

function setTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("wa_theme", dark ? "dark" : "light");
  el.themeIcon.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

async function initApp() {
  setTheme(localStorage.getItem("wa_theme") || "light");
  setupMobileViewport();

  if (!window.supabase) {
    showToast("Supabase gagal dimuat. Periksa koneksi internet.", true);
    return;
  }

  await loadUsersFromSupabase();

  if (!state.currentEmail || !state.users[state.currentEmail]) {
    await openAuthModal();
  } else {
    await loadMessagesFromSupabase();
    startSession();
  }

  setupEventListeners();
  subscribeToMessages();
}

function setupEventListeners() {
  el.btnLogout.addEventListener("click", openAuthModal);
  el.createAccountForm.addEventListener("submit", handleCreateAccount);
  el.btnOpenAddFriend.addEventListener("click", () => {
    el.friendTarget.value = "";
    el.addFriendError.classList.add("hidden");
    setModal(el.addFriendModal, true);
    setTimeout(() => el.friendTarget.focus(), 50);
  });
  el.btnCloseAddFriend.addEventListener("click", () => setModal(el.addFriendModal, false));
  el.addFriendForm.addEventListener("submit", handleAddFriend);
  el.chatForm.addEventListener("submit", handleSendMessage);
  el.search.addEventListener("input", () => {
    state.searchQuery = el.search.value.trim().toLowerCase();
    renderContactList();
  });
  el.filterAll.addEventListener("click", () => setFilter("all"));
  el.filterUnread.addEventListener("click", () => setFilter("unread"));
  el.btnTheme.addEventListener("click", () => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  });
  el.btnReset.addEventListener("click", () => {
    if (!confirm("Reset sesi Whisper di perangkat ini? Profil dan pesan di cloud tidak akan dihapus.")) return;
    localStorage.removeItem("whisper_logged_email");
    state.currentEmail = null;
    state.activeContactEmail = null;
    if (state.presenceChannel) supabaseClient.removeChannel(state.presenceChannel);
    openAuthModal();
  });
  el.btnBack.addEventListener("click", () => el.sidebar.classList.remove("sidebar-hidden"));
  el.messages.addEventListener("click", () => {});
  [el.authModal, el.addFriendModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal && modal === el.addFriendModal) setModal(modal, false);
    });
  });
}

async function loadUsersFromSupabase() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,email,name,avatar,friends");

  if (error) {
    console.error("loadUsersFromSupabase:", error);
    showToast("Gagal memuat profil. Periksa tabel dan kebijakan Supabase.", true);
    return;
  }

  state.users = {};
  (data || []).forEach((profile) => {
    const email = String(profile.email || "").trim().toLowerCase();
    if (!email) return;
    state.users[email] = {
      id: profile.id,
      email,
      name: profile.name || email.split("@")[0],
      avatar: safeAvatar(profile.avatar, profile.name || email),
      friends: Array.isArray(profile.friends) ? profile.friends : []
    };
  });
}

async function loadMessagesFromSupabase() {
  if (!state.currentEmail) {
    state.messages = [];
    return;
  }

  // Mengambil pesan lalu menyaring di browser agar email tidak merusak sintaks filter .or().
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("loadMessagesFromSupabase:", error);
    showToast("Gagal memuat pesan. Periksa tabel messages dan kebijakan RLS.", true);
    return;
  }

  state.messages = (data || []).filter((message) =>
    message.sender_email === state.currentEmail || message.receiver_email === state.currentEmail
  );
}

async function openAuthModal() {
  await loadUsersFromSupabase();
  renderExistingAccounts();
  setModal(el.authModal, true);
}

function renderExistingAccounts() {
  el.existingAccountsList.replaceChildren();

  const accounts = Object.values(state.users);
  if (!accounts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = "Belum ada profil. Buat profil baru di bawah.";
    el.existingAccountsList.appendChild(empty);
    return;
  }

  accounts.forEach((account) => {
    const row = document.createElement("div");
    row.className = "account-row";

    const info = document.createElement("div");
    info.className = "account-row-info";
    const avatar = document.createElement("img");
    avatar.className = "mini-avatar";
    avatar.src = account.avatar;
    avatar.alt = "";
    const copy = document.createElement("div");
    copy.className = "account-row-copy";
    const name = document.createElement("strong");
    name.textContent = account.name;
    const email = document.createElement("span");
    email.textContent = account.email;
    copy.append(name, email);
    info.append(avatar, copy);

    const login = document.createElement("button");
    login.type = "button";
    login.className = "primary-button small-button";
    login.textContent = "Pilih";
    login.addEventListener("click", () => selectLogin(account.email));

    row.append(info, login);
    el.existingAccountsList.appendChild(row);
  });
}

async function selectLogin(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!state.users[normalizedEmail]) {
    showToast("Profil tidak ditemukan.", true);
    await loadUsersFromSupabase();
    renderExistingAccounts();
    return;
  }

  state.currentEmail = normalizedEmail;
  localStorage.setItem("whisper_logged_email", normalizedEmail);
  state.activeContactEmail = null;
  await loadMessagesFromSupabase();
  setModal(el.authModal, false);
  startSession();
  initPresenceChannel();
}

async function handleCreateAccount(event) {
  event.preventDefault();
  const email = el.newEmail.value.trim().toLowerCase();
  const name = el.newName.value.trim();
  const avatarInput = el.newAvatar.value.trim();

  if (!email || !name) return;
  if (state.users[email]) {
    showToast("Email ini sudah terdaftar.", true);
    return;
  }

  const avatar = safeAvatar(avatarInput, name);
  const { error } = await supabaseClient.from("profiles").insert([{
    email,
    name,
    avatar,
    friends: []
  }]);

  if (error) {
    console.error("handleCreateAccount:", error);
    showToast(`Gagal membuat profil: ${error.message}`, true);
    return;
  }

  el.createAccountForm.reset();
  await loadUsersFromSupabase();
  await selectLogin(email);
  showToast("Profil berhasil dibuat.");
}

async function handleAddFriend(event) {
  event.preventDefault();
  const targetEmail = el.friendTarget.value.trim().toLowerCase();
  el.addFriendError.classList.add("hidden");

  if (!targetEmail) return showAddFriendError("Masukkan alamat email.");
  if (targetEmail === state.currentEmail) return showAddFriendError("Kamu tidak bisa menambahkan diri sendiri.");
  if (!state.users[targetEmail]) return showAddFriendError("Profil dengan email itu tidak ditemukan.");

  const me = state.users[state.currentEmail];
  if (!me) return showAddFriendError("Pilih profil terlebih dahulu.");
  if (me.friends.includes(targetEmail)) return showAddFriendError("Profil ini sudah ada di daftar teman.");

  const updatedFriends = [...me.friends, targetEmail];
  const { error } = await supabaseClient
    .from("profiles")
    .update({ friends: updatedFriends })
    .eq("email", state.currentEmail);

  if (error) {
    console.error("handleAddFriend:", error);
    return showAddFriendError("Gagal menambahkan teman. Periksa izin update tabel profiles.");
  }

  me.friends = updatedFriends;
  setModal(el.addFriendModal, false);
  renderContactList();
  showToast(`Berhasil menambahkan ${state.users[targetEmail].name}.`);
}

function showAddFriendError(message) {
  el.addFriendError.textContent = message;
  el.addFriendError.classList.remove("hidden");
}

function startSession() {
  const me = state.users[state.currentEmail];
  if (!me) {
    openAuthModal();
    return;
  }

  el.loggedEmail.textContent = me.email;
  el.currentAvatar.src = me.avatar;
  el.currentName.textContent = me.name;
  el.currentEmail.textContent = me.email;
  renderContactList();
  renderChatArea();
  initPresenceChannel();
}

function subscribeToMessages() {
  if (state.messagesChannel) supabaseClient.removeChannel(state.messagesChannel);

  state.messagesChannel = supabaseClient
    .channel("whisper-messages")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async (payload) => {
      const row = payload.new || payload.old;
      if (!row || (row.sender_email !== state.currentEmail && row.receiver_email !== state.currentEmail)) return;

      await loadMessagesFromSupabase();
      renderContactList();
      renderChatArea();
    })
    .subscribe();
}

function initPresenceChannel() {
  if (!state.currentEmail) return;
  if (state.presenceChannel) supabaseClient.removeChannel(state.presenceChannel);

  state.presenceChannel = supabaseClient.channel("whisper-online", {
    config: { presence: { key: state.currentEmail } }
  });

  state.presenceChannel
    .on("presence", { event: "sync" }, () => {
      const presence = state.presenceChannel.presenceState();
      state.onlineUsers = {};
      Object.keys(presence).forEach((email) => { state.onlineUsers[email] = true; });
      renderContactList();
      renderChatArea();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await state.presenceChannel.track({
          email: state.currentEmail,
          online_at: new Date().toISOString()
        });
      }
    });
}

function getConversation(friendEmail) {
  return state.messages.filter((message) =>
    (message.sender_email === state.currentEmail && message.receiver_email === friendEmail) ||
    (message.sender_email === friendEmail && message.receiver_email === state.currentEmail)
  );
}

function getMessageTime(message) {
  return message.timestamp || message.created_at || "";
}

function renderContactList() {
  el.contactList.replaceChildren();
  const me = state.users[state.currentEmail];
  if (!me) return;

  const friendEmails = [...new Set(me.friends)];
  friendEmails.forEach((friendEmail) => {
    const friend = state.users[friendEmail];
    if (!friend) return;

    const conversation = getConversation(friendEmail);
    const lastMessage = conversation[conversation.length - 1];
    const unreadCount = conversation.filter((message) =>
      message.sender_email === friendEmail &&
      message.receiver_email === state.currentEmail &&
      !message.read
    ).length;
    const online = Boolean(state.onlineUsers[friendEmail]);

    if (state.searchQuery &&
        !friend.name.toLowerCase().includes(state.searchQuery) &&
        !friend.email.includes(state.searchQuery)) return;
    if (state.filterMode === "unread" && unreadCount === 0) return;

    const card = document.createElement("button");
    card.type = "button";
    card.className = `contact-card ${friendEmail === state.activeContactEmail ? "contact-active" : ""}`;
    card.addEventListener("click", async () => {
      state.activeContactEmail = friendEmail;
      await markMessagesAsRead(friendEmail);
      renderContactList();
      renderChatArea();
      if (window.innerWidth <= 767) el.sidebar.classList.add("sidebar-hidden");
    });

    const avatarWrap = document.createElement("div");
    avatarWrap.className = "contact-avatar-wrap";
    const avatar = document.createElement("img");
    avatar.className = "avatar contact-avatar";
    avatar.src = friend.avatar;
    avatar.alt = "";
    const dot = document.createElement("span");
    dot.className = `online-dot ${online ? "online" : ""}`;
    avatarWrap.append(avatar, dot);

    const body = document.createElement("div");
    body.className = "contact-body";
    const top = document.createElement("div");
    top.className = "contact-top";
    const name = document.createElement("strong");
    name.textContent = friend.name;
    const time = document.createElement("span");
    time.className = "contact-time";
    time.textContent = lastMessage ? getMessageTime(lastMessage) : "";
    top.append(name, time);

    const bottom = document.createElement("div");
    bottom.className = "contact-bottom";
    const preview = document.createElement("span");
    preview.className = "contact-preview";
    preview.textContent = lastMessage ? lastMessage.text : (online ? "Online" : "Offline");
    bottom.appendChild(preview);
    if (unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = String(unreadCount);
      bottom.appendChild(badge);
    }

    body.append(top, bottom);
    card.append(avatarWrap, body);
    el.contactList.appendChild(card);
  });

  if (!el.contactList.children.length) {
    const empty = document.createElement("p");
    empty.className = "empty-contacts";
    empty.textContent = state.filterMode === "unread"
      ? "Tidak ada pesan yang belum dibaca."
      : "Belum ada teman. Tekan Add Friend untuk memulai.";
    el.contactList.appendChild(empty);
  }
}

function renderChatArea() {
  const friend = state.users[state.activeContactEmail];
  if (!friend) {
    el.chatHeader.classList.add("hidden");
    el.messages.classList.add("hidden");
    el.chatForm.classList.add("hidden");
    el.emptyState.classList.remove("hidden");
    return;
  }

  el.chatHeader.classList.remove("hidden");
  el.messages.classList.remove("hidden");
  el.chatForm.classList.remove("hidden");
  el.emptyState.classList.add("hidden");

  el.activeAvatar.src = friend.avatar;
  el.activeName.textContent = friend.name;
  el.activeEmail.textContent = friend.email;
  const online = Boolean(state.onlineUsers[friend.email]);
  el.activeStatus.textContent = online ? "Online" : "Offline";
  el.activeStatus.classList.toggle("status-online", online);

  const conversation = getConversation(friend.email);
  el.messages.replaceChildren();

  conversation.forEach((message) => {
    const mine = message.sender_email === state.currentEmail;
    const row = document.createElement("div");
    row.className = `message-row ${mine ? "message-mine" : "message-theirs"}`;
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${mine ? "bubble-mine" : "bubble-theirs"}`;
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text || "";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const time = document.createElement("span");
    time.textContent = getMessageTime(message);
    meta.appendChild(time);
    if (mine) {
      const check = document.createElement("i");
      check.className = `fa-solid fa-check-double ${message.read ? "read-check" : ""}`;
      check.setAttribute("aria-label", message.read ? "Dibaca" : "Terkirim");
      meta.appendChild(check);
    }
    bubble.append(text, meta);
    row.appendChild(bubble);
    el.messages.appendChild(row);
  });

  el.messages.scrollTop = el.messages.scrollHeight;
}

async function handleSendMessage(event) {
  event.preventDefault();
  if (state.isSending) return;

  const text = el.messageInput.value.trim();
  const receiver = state.activeContactEmail;
  if (!text || !receiver || !state.currentEmail) return;

  state.isSending = true;
  el.btnSend.disabled = true;

  const now = new Date();
  const payload = {
    sender_email: state.currentEmail,
    receiver_email: receiver,
    text,
    timestamp: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    read: false
  };

  const { data, error } = await supabaseClient.from("messages").insert([payload]).select();

  state.isSending = false;
  el.btnSend.disabled = false;

  if (error) {
    console.error("handleSendMessage:", error);
    showToast("Pesan gagal dikirim. Periksa izin tabel messages.", true);
    return;
  }

  if (data && data[0] && !state.messages.some((message) => message.id === data[0].id)) {
    state.messages.push(data[0]);
  }
  el.messageInput.value = "";
  renderContactList();
  renderChatArea();
  el.messageInput.focus({ preventScroll: true });
}

async function markMessagesAsRead(friendEmail) {
  const unreadIds = state.messages
    .filter((message) =>
      message.sender_email === friendEmail &&
      message.receiver_email === state.currentEmail &&
      !message.read
    )
    .map((message) => message.id)
    .filter((id) => id !== undefined && id !== null);

  if (!unreadIds.length) return;

  const { error } = await supabaseClient
    .from("messages")
    .update({ read: true })
    .in("id", unreadIds);

  if (error) {
    console.error("markMessagesAsRead:", error);
    return;
  }

  state.messages.forEach((message) => {
    if (unreadIds.includes(message.id)) message.read = true;
  });
}

function setFilter(mode) {
  state.filterMode = mode;
  el.filterAll.classList.toggle("active", mode === "all");
  el.filterUnread.classList.toggle("active", mode === "unread");
  renderContactList();
}

/* Penyesuaian tinggi aplikasi saat keyboard seluler terbuka */
function setupMobileViewport() {
  const viewport = window.visualViewport;
  const updateHeight = () => {
    if (window.innerWidth > 767) {
      document.documentElement.style.setProperty("--app-height", "100dvh");
      return;
    }
    const height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
  };

  window.addEventListener("resize", updateHeight);
  window.addEventListener("orientationchange", updateHeight);
  if (viewport) viewport.addEventListener("resize", updateHeight);

  el.messageInput.addEventListener("focus", () => {
    window.setTimeout(() => {
      updateHeight();
      el.messageInput.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.messages.scrollTop = el.messages.scrollHeight;
    }, 150);
  });

  document.querySelectorAll('#auth-modal input, #add-friend-modal input').forEach((input) => {
    input.addEventListener("focus", () => {
      window.setTimeout(() => {
        updateHeight();
        input.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 150);
    });
  });

  updateHeight();
}

document.addEventListener("DOMContentLoaded", initApp);
