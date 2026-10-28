
/* =========================================================
   WHISPER — Email/Password + Supabase Auth + Realtime Chat
   Ganti URL dan publishable/anon key dengan milikmu.
   JANGAN gunakan service_role atau secret key di browser.
========================================================= */

const SUPABASE_URL = "https://pmtjequlrdxpjaeeswhd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdGplcXVscmR4cGphZWVzd2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzE1MTYsImV4cCI6MjEwODEwNzUxNn0.Xm9hlw-iWtvho3uHavQ4A3I53hivewoYHaPJB6oYEws";

const $ = (id) => document.getElementById(id);

const ui = {
  accountChip: $("account-chip"),
  topAvatar: $("top-avatar"),
  loggedEmail: $("logged-email"),
  btnTheme: $("btn-theme"),
  themeIcon: $("theme-icon"),
  btnLogout: $("btn-logout"),

  sidebar: $("sidebar"),
  currentAvatar: $("current-user-avatar"),
  currentName: $("current-user-name"),
  currentEmail: $("current-user-email-display"),

  btnAdd: $("btn-open-add-friend"),
  search: $("search-input"),
  filterAll: $("filter-all"),
  filterUnread: $("filter-unread"),
  contacts: $("contact-list"),

  chatArea: $("chat-area"),
  empty: $("empty-state"),
  emptyLogin: $("empty-login"),
  chatHeader: $("chat-header"),
  back: $("btn-back"),

  activeAvatar: $("active-contact-avatar-header"),
  activeName: $("active-contact-name-header"),
  activeEmail: $("active-contact-email-header"),
  activeStatus: $("active-contact-status-header"),

  messages: $("messages-container"),
  chatForm: $("chat-form"),
  messageInput: $("message-input"),
  send: $("btn-send"),

  // Elemen login dan pendaftaran
  authScreen: $("auth-screen"),
  authForm: $("auth-form"),
  authEmail: $("auth-email"),
  authPassword: $("auth-password"),
  authDisplayName: $("auth-display-name"),
  authNameField: $("auth-name-field"),
  authSubmit: $("auth-submit"),
  authSwitch: $("auth-switch"),
  authTitle: $("auth-title"),
  authDescription: $("auth-description"),
  authError: $("auth-error"),
  authSuccess: $("auth-success"),

  addModal: $("add-friend-modal"),
  closeAdd: $("btn-close-add-friend"),
  friendSearch: $("friend-target-input"),
  searchResults: $("user-search-results"),
  toast: $("toast")
};

const state = {
  session: null,
  user: null,
  profile: null,
  profiles: [],
  conversations: [],
  activeId: null,
  messages: [],
  filter: "all",
  query: "",
  realtime: null,
  presence: null,
  online: new Set(),
  loading: false,
  toastTimer: null,
  authMode: "login"
};

const configured =
  !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_");

let sb = null;

if (window.supabase?.createClient && configured) {
  sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}

/* ===================== UTILITAS ===================== */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

function avatarUrl(url, seed = "Whisper") {
  const value = String(url || "");

  return /^https:\/\//i.test(value)
    ? value
    : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

function showToast(message, error = false) {
  if (!ui.toast) return;

  ui.toast.textContent = message;
  ui.toast.classList.toggle("toast-error", error);
  ui.toast.classList.remove("hidden");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    ui.toast.classList.add("hidden");
  }, 3600);
}

function showAuthError(message) {
  if (!ui.authError) return;

  ui.authError.textContent = message;
  ui.authError.classList.toggle("hidden", !message);
}

function setAuthVisible(show) {
  ui.authScreen?.classList.toggle("hidden", !show);
}

function setLoading(button, loading) {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.innerHTML;
    }

    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML =
      '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");

    if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
    }
  }
}

function timeLabel(iso) {
  if (!iso) return "";

  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return timeLabel(iso);
  }

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short"
  });
}

function currentProfile() {
  return state.profiles.find(
    (profile) => profile.id === state.user?.id
  ) || state.profile;
}

function personById(id) {
  return state.profiles.find((profile) => profile.id === id);
}

/* ===================== LOGIN & PENDAFTARAN ===================== */

function updateAuthMode() {
  const isRegister = state.authMode === "register";

  if (ui.authTitle) {
    ui.authTitle.textContent = isRegister
      ? "Buat akun Whisper"
      : "Selamat datang kembali";
  }

  if (ui.authDescription) {
    ui.authDescription.textContent = isRegister
      ? "Daftar untuk mulai mengobrol."
      : "Masuk menggunakan email dan password.";
  }

  ui.authNameField?.classList.toggle("hidden", !isRegister);

  if (ui.authDisplayName) {
    ui.authDisplayName.required = isRegister;
  }

  if (ui.authSubmit) {
    ui.authSubmit.textContent = isRegister ? "Daftar" : "Masuk";
  }

  if (ui.authSwitch) {
    ui.authSwitch.textContent = isRegister
      ? "Sudah punya akun? Masuk"
      : "Belum punya akun? Daftar";
  }

  showAuthError("");

  ui.authSuccess?.classList.add("hidden");
}

async function handleEmailAuth(event) {
  event.preventDefault();

  if (!sb) {
    showAuthError(
      "Konfigurasi Supabase belum benar. Periksa URL dan API key."
    );
    return;
  }

  const email = ui.authEmail.value.trim();
  const password = ui.authPassword.value;
  const displayName = ui.authDisplayName.value.trim();

  if (!email || !password) {
    showAuthError("Email dan password wajib diisi.");
    return;
  }

  if (password.length < 6) {
    showAuthError("Password minimal 6 karakter.");
    return;
  }

  if (state.authMode === "register" && !displayName) {
    showAuthError("Nama pengguna wajib diisi.");
    return;
  }

  showAuthError("");
  ui.authSuccess?.classList.add("hidden");
  setLoading(ui.authSubmit, true);

  try {
    if (state.authMode === "register") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          }
        }
      });

      if (error) throw error;

      if (!data.session) {
        if (ui.authSuccess) {
          ui.authSuccess.textContent =
            "Pendaftaran berhasil. Periksa email untuk konfirmasi akun sebelum masuk.";
          ui.authSuccess.classList.remove("hidden");
        } else {
          showToast(
            "Pendaftaran berhasil. Periksa email untuk konfirmasi akun."
          );
        }

        return;
      }

      showToast("Pendaftaran berhasil!");
    } else {
      const { error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    }
  } catch (error) {
    showAuthError(error.message || "Autentikasi gagal.");
  } finally {
    setLoading(ui.authSubmit, false);
  }
}

/* ===================== SESI AUTENTIKASI ===================== */

async function handleAuthSession(session) {
  state.session = session;
  state.user = session?.user || null;

  if (!state.user) {
    state.profile = null;
    state.profiles = [];
    state.messages = [];
    state.conversations = [];
    state.activeId = null;

    cleanupRealtime();
    renderSignedOut();
    return;
  }

  setAuthVisible(false);

  ui.accountChip?.classList.remove("hidden");
  ui.btnLogout?.classList.remove("hidden");
  ui.btnAdd?.classList.remove("hidden");

  await loadProfileAndUsers();
  await loadContactsAndMessages();

  subscribeRealtime();
  subscribePresence();

  renderProfile();
  renderContacts();
  renderChat();
}

async function loadProfileAndUsers() {
  const [
    { data: mine, error: mineError },
    { data: people, error: peopleError }
  ] = await Promise.all([
    sb.from("profiles")
      .select("id,email,display_name,avatar_url,created_at")
      .eq("id", state.user.id)
      .maybeSingle(),

    sb.from("profiles")
      .select("id,email,display_name,avatar_url,created_at")
      .order("display_name", { ascending: true })
      .limit(500)
  ]);

  if (mineError) throw mineError;
  if (peopleError) throw peopleError;

  state.profile = mine;
  state.profiles = people || [];

  if (!state.profile) {
    showToast(
      "Profil belum tersedia. Periksa trigger pembuatan profil di Supabase.",
      true
    );
  }
}

async function loadContactsAndMessages() {
  const { data, error } = await sb
    .from("messages")
    .select("id,sender_id,receiver_id,content,created_at,read_at")
    .or(
      `sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`
    )
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) throw error;

  state.messages = data || [];

  const latest = new Map();

  for (const message of state.messages) {
    const otherId =
      message.sender_id === state.user.id
        ? message.receiver_id
        : message.sender_id;

    const old = latest.get(otherId);

    if (
      !old ||
      new Date(message.created_at) > new Date(old.created_at)
    ) {
      latest.set(otherId, message);
    }
  }

  state.conversations = [...latest.entries()].map(
    ([id, message]) => ({ id, message })
  );
}

/* ===================== PROFIL ===================== */

function renderProfile() {
  const profile = currentProfile();

  if (!profile) return;

  const name =
    profile.display_name ||
    profile.email?.split("@")[0] ||
    "Pengguna Whisper";

  const avatar = avatarUrl(profile.avatar_url, name);

  ui.currentAvatar.src = avatar;
  ui.topAvatar.src = avatar;
  ui.currentName.textContent = name;
  ui.currentEmail.textContent = profile.email || "";
  ui.loggedEmail.textContent = profile.email || name;
}

function renderSignedOut() {
  ui.accountChip?.classList.add("hidden");
  ui.btnLogout?.classList.add("hidden");
  ui.btnAdd?.classList.add("hidden");

  ui.currentAvatar.src = avatarUrl("", "Whisper");
  ui.currentName.textContent = "Selamat datang";
  ui.currentEmail.textContent = "Masuk untuk mulai chat";
  ui.loggedEmail.textContent = "Belum login";

  ui.contacts.innerHTML =
    '<div class="list-placeholder">Masuk untuk menemukan pengguna dan mulai chat.</div>';

  ui.empty?.classList.remove("hidden");
  ui.chatHeader?.classList.add("hidden");
  ui.messages?.classList.add("hidden");
  ui.chatForm?.classList.add("hidden");

  setAuthVisible(true);
}

/* ===================== DAFTAR KONTAK ===================== */

function getLastMessage(otherId) {
  let latest = null;

  for (const message of state.messages) {
    const related =
      (message.sender_id === state.user.id &&
        message.receiver_id === otherId) ||
      (message.sender_id === otherId &&
        message.receiver_id === state.user.id);

    if (
      related &&
      (!latest ||
        new Date(message.created_at) >
          new Date(latest.created_at))
    ) {
      latest = message;
    }
  }

  return latest;
}

function getUnread(otherId) {
  return state.messages.filter(
    (message) =>
      message.sender_id === otherId &&
      message.receiver_id === state.user.id &&
      !message.read_at
  ).length;
}

function renderContacts() {
  if (!state.user) return;

  const query = state.query.trim().toLowerCase();

  const people = state.profiles
    .filter((profile) => profile.id !== state.user.id)
    .map((profile) => ({
      p: profile,
      last: getLastMessage(profile.id),
      unread: getUnread(profile.id)
    }))
    .filter((item) => {
      const matchesQuery =
        !query ||
        `${item.p.display_name || ""} ${item.p.email || ""}`
          .toLowerCase()
          .includes(query);

      const matchesFilter =
        state.filter !== "unread" || item.unread > 0;

      return matchesQuery && matchesFilter;
    });

  people.sort((a, b) => {
    const timeA = a.last
      ? new Date(a.last.created_at).getTime()
      : 0;

    const timeB = b.last
      ? new Date(b.last.created_at).getTime()
      : 0;

    return (
      timeB - timeA ||
      (a.p.display_name || a.p.email || "").localeCompare(
        b.p.display_name || b.p.email || ""
      )
    );
  });

  if (!people.length) {
    ui.contacts.innerHTML =
      `<div class="list-placeholder">${
        state.filter === "unread"
          ? "Tidak ada pesan yang belum dibaca."
          : query
            ? "Pengguna tidak ditemukan."
            : "Belum ada pengguna lain. Minta teman mendaftar ke Whisper!"
      }</div>`;

    return;
  }

  ui.contacts.innerHTML = people.map(({ p, last, unread }) => `
    <button class="contact-card ${
      state.activeId === p.id ? "selected" : ""
    }" data-user-id="${escapeHTML(p.id)}" type="button">

      <img class="avatar"
        src="${escapeHTML(avatarUrl(p.avatar_url, p.display_name || p.email))}"
        alt="">

      <span class="contact-copy">
        <span class="contact-top">
          <strong>${escapeHTML(p.display_name || p.email || "Pengguna")}</strong>
          <time>${last ? dayLabel(last.created_at) : ""}</time>
        </span>

        <span class="contact-bottom">
          <span>${
            last
              ? `${last.sender_id === state.user.id ? "Kamu: " : ""}${escapeHTML(last.content)}`
              : escapeHTML(p.email || "Pengguna Whisper")
          }</span>

          ${unread ? `<b class="unread-badge">${unread}</b>` : ""}
        </span>
      </span>
    </button>
  `).join("");
}

/* ===================== TAMPILAN CHAT ===================== */

function renderChat() {
  const profile = personById(state.activeId);

  if (!profile) {
    ui.chatHeader.classList.add("hidden");
    ui.messages.classList.add("hidden");
    ui.chatForm.classList.add("hidden");
    ui.empty.classList.remove("hidden");
    return;
  }

  ui.empty.classList.add("hidden");
  ui.chatHeader.classList.remove("hidden");
  ui.messages.classList.remove("hidden");
  ui.chatForm.classList.remove("hidden");

  ui.activeAvatar.src = avatarUrl(
    profile.avatar_url,
    profile.display_name || profile.email
  );

  ui.activeName.textContent =
    profile.display_name || profile.email || "Pengguna";

  ui.activeEmail.textContent = profile.email || "";

  ui.activeStatus.textContent = state.online.has(profile.id)
    ? "Online"
    : "Pengguna terdaftar";

  const conversation = state.messages.filter(
    (message) =>
      (message.sender_id === state.user.id &&
        message.receiver_id === profile.id) ||
      (message.sender_id === profile.id &&
        message.receiver_id === state.user.id)
  );

  if (!conversation.length) {
    ui.messages.innerHTML =
      '<div class="conversation-start">Ini awal percakapan. Sapa temanmu 👋</div>';
  } else {
    ui.messages.innerHTML = conversation.map((message) => {
      const mine = message.sender_id === state.user.id;

      return `
        <div class="message-row ${mine ? "mine" : "theirs"}">
          <div class="bubble">
            <p>${escapeHTML(message.content)}</p>

            <div class="message-meta">
              <time>${timeLabel(message.created_at)}</time>

              ${mine ? `
                <i class="fa-solid ${
                  message.read_at
                    ? "fa-check-double"
                    : "fa-check"
                }"
                aria-label="${message.read_at ? "Dibaca" : "Terkirim"}"></i>
              ` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  requestAnimationFrame(() => {
    ui.messages.scrollTop = ui.messages.scrollHeight;
  });
}

async function selectContact(id) {
  if (!state.user) return;

  state.activeId = id;

  renderContacts();
  renderChat();

  ui.sidebar.classList.add("mobile-hidden");

  const unread = state.messages
    .filter(
      (message) =>
        message.sender_id === id &&
        message.receiver_id === state.user.id &&
        !message.read_at
    )
    .map((message) => message.id);

  if (unread.length) {
    const readAt = new Date().toISOString();

    const { error } = await sb
      .from("messages")
      .update({ read_at: readAt })
      .in("id", unread);

    if (!error) {
      const unreadSet = new Set(unread);

      state.messages = state.messages.map((message) =>
        unreadSet.has(message.id)
          ? { ...message, read_at: readAt }
          : message
      );

      renderContacts();
      renderChat();
    }
  }

  if (window.matchMedia("(max-width: 760px)").matches) {
    setTimeout(() => {
      ui.messageInput.focus({ preventScroll: true });
    }, 120);
  }
}

/* ===================== KIRIM PESAN ===================== */

async function sendMessage(event) {
  event.preventDefault();

  if (state.loading || !state.activeId || !state.user) return;

  const content = ui.messageInput.value.trim();

  if (!content) return;

  state.loading = true;
  ui.send.disabled = true;

  try {
    const { data, error } = await sb
      .from("messages")
      .insert({
        sender_id: state.user.id,
        receiver_id: state.activeId,
        content
      })
      .select("id,sender_id,receiver_id,content,created_at,read_at")
      .single();

    if (error) throw error;

    if (!state.messages.some((message) => message.id === data.id)) {
      state.messages.push(data);
    }

    ui.messageInput.value = "";

    renderContacts();
    renderChat();
  } catch (error) {
    showToast(`Pesan gagal dikirim: ${error.message}`, true);
  } finally {
    state.loading = false;
    ui.send.disabled = false;
    ui.messageInput.focus({ preventScroll: true });
  }
}

/* ===================== REALTIME MESSAGES ===================== */

function subscribeRealtime() {
  cleanupRealtime();

  state.realtime = sb
    .channel(`messages:${state.user.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        const message = payload.new;

        if (
          message.sender_id !== state.user.id &&
          message.receiver_id !== state.user.id
        ) {
          return;
        }

        if (!state.messages.some((item) => item.id === message.id)) {
          state.messages.push(message);
        }

        renderContacts();

        if (
          state.activeId === message.sender_id ||
          state.activeId === message.receiver_id
        ) {
          renderChat();
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        const message = payload.new;

        const index = state.messages.findIndex(
          (item) => item.id === message.id
        );

        if (index >= 0) {
          state.messages[index] = message;
        }

        renderContacts();

        if (
          state.activeId === message.sender_id ||
          state.activeId === message.receiver_id
        ) {
          renderChat();
        }
      }
    )
    .subscribe();
}

/* ===================== STATUS ONLINE ===================== */

function subscribePresence() {
  if (state.presence) {
    sb.removeChannel(state.presence);
  }

  state.presence = sb.channel("whisper-presence", {
    config: {
      presence: {
        key: state.user.id
      }
    }
  });

  state.presence
    .on("presence", { event: "sync" }, () => {
      const presenceState = state.presence.presenceState();

      state.online = new Set(Object.keys(presenceState));

      if (state.activeId) {
        ui.activeStatus.textContent = state.online.has(state.activeId)
          ? "Online"
          : "Pengguna terdaftar";
      }
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await state.presence.track({
          user_id: state.user.id,
          online_at: new Date().toISOString()
        });
      }
    });
}

function cleanupRealtime() {
  if (state.realtime && sb) {
    sb.removeChannel(state.realtime);
  }

  if (state.presence && sb) {
    sb.removeChannel(state.presence);
  }

  state.realtime = null;
  state.presence = null;
  state.online = new Set();
}

/* ===================== CARI PENGGUNA ===================== */

async function searchUsers() {
  if (!state.user) return;

  const query = ui.friendSearch.value.trim();

  if (query.length < 2) {
    ui.searchResults.innerHTML =
      '<p class="muted">Ketik minimal 2 karakter untuk mencari.</p>';
    return;
  }

  ui.searchResults.innerHTML =
    '<p class="muted">Mencari pengguna…</p>';

  const safeQuery = query.replace(/[,%()]/g, " ");

  const { data, error } = await sb
    .from("profiles")
    .select("id,email,display_name,avatar_url")
    .neq("id", state.user.id)
    .or(
      `display_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`
    )
    .limit(20);

  if (error) {
    ui.searchResults.innerHTML =
      '<p class="error-text">Pencarian gagal. Periksa kebijakan RLS.</p>';
    return;
  }

  if (!data?.length) {
    ui.searchResults.innerHTML =
      '<p class="muted">Pengguna tidak ditemukan.</p>';
    return;
  }

  ui.searchResults.innerHTML = data.map((profile) => `
    <button class="user-result"
      data-user-id="${escapeHTML(profile.id)}"
      type="button">

      <img class="avatar"
        src="${escapeHTML(avatarUrl(profile.avatar_url, profile.display_name || profile.email))}"
        alt="">

      <span>
        <strong>${escapeHTML(profile.display_name || profile.email)}</strong>
        <small>${escapeHTML(profile.email || "")}</small>
      </span>

      <i class="fa-regular fa-message"></i>
    </button>
  `).join("");
}

/* ===================== TEMA ===================== */

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);

  localStorage.setItem(
    "whisper_theme",
    dark ? "dark" : "light"
  );

  if (ui.themeIcon) {
    ui.themeIcon.className = dark
      ? "fa-solid fa-sun"
      : "fa-solid fa-moon";
  }
}

/* ===================== EVENT LISTENERS ===================== */

function wireEvents() {
  ui.authForm.addEventListener("submit", handleEmailAuth);

  ui.authSwitch.addEventListener("click", () => {
    state.authMode =
      state.authMode === "login" ? "register" : "login";

    updateAuthMode();
  });

  ui.emptyLogin?.addEventListener("click", () => {
    state.authMode = "login";
    updateAuthMode();
    setAuthVisible(true);
  });

  ui.btnLogout.addEventListener("click", async () => {
    if (!sb) return;

    cleanupRealtime();

    const { error } = await sb.auth.signOut();

    if (error) {
      showToast(error.message, true);
    }
  });

  ui.btnTheme.addEventListener("click", () => {
    applyTheme(
      !document.documentElement.classList.contains("dark")
    );
  });

  ui.search.addEventListener("input", () => {
    state.query = ui.search.value;
    renderContacts();
  });

  ui.filterAll.addEventListener("click", () => {
    state.filter = "all";
    ui.filterAll.classList.add("active");
    ui.filterUnread.classList.remove("active");
    renderContacts();
  });

  ui.filterUnread.addEventListener("click", () => {
    state.filter = "unread";
    ui.filterUnread.classList.add("active");
    ui.filterAll.classList.remove("active");
    renderContacts();
  });

  ui.contacts.addEventListener("click", (event) => {
    const button = event.target.closest("[data-user-id]");

    if (button) {
      selectContact(button.dataset.userId);
    }
  });

  ui.chatForm.addEventListener("submit", sendMessage);

  ui.btnAdd.addEventListener("click", () => {
    ui.addModal.classList.remove("hidden");
    ui.friendSearch.value = "";

    ui.searchResults.innerHTML =
      '<p class="muted">Mulai mengetik untuk mencari pengguna.</p>';

    setTimeout(() => ui.friendSearch.focus(), 100);
  });

  ui.closeAdd.addEventListener("click", () => {
    ui.addModal.classList.add("hidden");
  });

  ui.addModal.addEventListener("click", (event) => {
    if (event.target === ui.addModal) {
      ui.addModal.classList.add("hidden");
    }
  });

  let searchTimer;

  ui.friendSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchUsers, 250);
  });

  ui.searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-user-id]");

    if (button) {
      ui.addModal.classList.add("hidden");
      selectContact(button.dataset.userId);
    }
  });

  ui.back.addEventListener("click", () => {
    ui.sidebar.classList.remove("mobile-hidden");
  });

  // Penyesuaian tampilan saat keyboard HP terbuka.
  if (window.visualViewport) {
    const adjustViewport = () => {
      document.documentElement.style.setProperty(
        "--visual-height",
        `${window.visualViewport.height}px`
      );
    };

    window.visualViewport.addEventListener("resize", adjustViewport);
    window.visualViewport.addEventListener("scroll", adjustViewport);

    adjustViewport();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && sb) {
      sb.auth.getSession().then(({ data, error }) => {
        if (error) return;

        const session = data.session;

        if (session?.user.id !== state.user?.id) {
          handleAuthSession(session).catch((err) => {
            showToast(err.message, true);
          });
        }
      });
    }
  });
}

/* ===================== MULAI APLIKASI ===================== */

async function boot() {
  applyTheme(localStorage.getItem("whisper_theme") === "dark");

  updateAuthMode();
  wireEvents();

  if (!configured || !sb) {
    setAuthVisible(true);

    showAuthError(
      "Konfigurasi Supabase belum diisi. Perbarui SUPABASE_URL dan SUPABASE_ANON_KEY di script.js."
    );

    return;
  }

  try {
    const { data, error } = await sb.auth.getSession();

    if (error) throw error;

    await handleAuthSession(data.session);

    sb.auth.onAuthStateChange((_event, session) => {
      state.session = session;

      if (!session) {
        handleAuthSession(null).catch((err) => {
          showToast(err.message, true);
        });
      } else if (
        session.user.id !== state.user?.id ||
        !state.profile
      ) {
        setTimeout(() => {
          handleAuthSession(session).catch((err) => {
            showToast(`Gagal memuat Whisper: ${err.message}`, true);
          });
        }, 0);
      }
    });
  } catch (error) {
    showAuthError(
      `Koneksi Supabase gagal: ${error.message}. Periksa URL, API key, dan tabel Supabase.`
    );

    setAuthVisible(true);
  }
}

document.addEventListener("DOMContentLoaded", boot);
