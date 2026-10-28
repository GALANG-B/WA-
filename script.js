// Konfigurasi Supabase Anda
const SUPABASE_URL = 'https://pmtjequlrdxpjaeeswhd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdGplcXVscmR4cGphZWVzd2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzE1MTYsImV4cCI6MjEwODEwNzUxNn0.Xm9hlw-iWtvho3uHavQ4A3I53hivewoYHaPJB6oYEws';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usersData = {}; 
let currentEmail = localStorage.getItem("whisper_logged_email") || null;
let messages = [];

let activeContactEmail = null;
let filterMode = "all";
let searchQuery = "";
let isSending = false;
let onlineUsers = {}; 
let globalChannel = null;

// Elemen DOM
const authModal = document.getElementById("auth-modal");
const existingAccountsList = document.getElementById("existing-accounts-list");
const createAccountForm = document.getElementById("create-account-form");
const newEmailInput = document.getElementById("new-email");
const newNameInput = document.getElementById("new-name");
const newUserAvatarInput = document.getElementById("new-avatar-url");

const loggedEmailEl = document.getElementById("logged-email");
const btnLogout = document.getElementById("btn-logout");
const currentUserAvatar = document.getElementById("current-user-avatar");
const currentUserName = document.getElementById("current-user-name");
const currentUserEmailDisplay = document.getElementById("current-user-email-display");

const contactListEl = document.getElementById("contact-list");
const chatHeader = document.getElementById("chat-header");
const messagesContainer = document.getElementById("messages-container");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const emptyState = document.getElementById("empty-state");
const activeContactAvatarHeader = document.getElementById("active-contact-avatar-header");
const activeContactNameHeader = document.getElementById("active-contact-name-header");
const activeContactEmailHeader = document.getElementById("active-contact-email-header");
const activeContactStatusHeader = document.getElementById("active-contact-status-header") || createStatusEl();
const searchInput = document.getElementById("search-input");

const btnTheme = document.getElementById("btn-theme");
const themeIcon = document.getElementById("theme-icon");
const btnReset = document.getElementById("btn-reset");
const btnBack = document.getElementById("btn-back");
const sidebar = document.getElementById("sidebar");

const filterAllBtn = document.getElementById("filter-all");
const filterUnreadBtn = document.getElementById("filter-unread");

const btnOpenAddFriend = document.getElementById("btn-open-add-friend");
const addFriendModal = document.getElementById("add-friend-modal");
const btnCloseAddFriend = document.getElementById("btn-close-add-friend");
const btnSubmitAddFriend = document.getElementById("btn-submit-add-friend");
const friendTargetInput = document.getElementById("friend-target-input");
const addFriendError = document.getElementById("add-friend-error");

function createStatusEl() {
  const target = document.getElementById("active-contact-email-header");
  if (target && target.parentNode) {
    const p = document.createElement("p");
    p.id = "active-contact-status-header";
    p.className = "text-[10px] font-semibold text-slate-400";
    target.parentNode.appendChild(p);
    return p;
  }
  return null;
}

// Inisialisasi Aplikasi
async function initApp() {
  const savedTheme = localStorage.getItem("wa_theme");
  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
    themeIcon.className = "fa-solid fa-sun text-sm text-amber-300";
  }

  await loadUsersFromSupabase();

  if (!currentEmail || !usersData[currentEmail]) {
    openAuthModal();
  } else {
    await loadMessagesFromSupabase();
    startSession();
    initPresenceChannel();
  }

  // Realtime subscription pesan
  supabaseClient
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const newMsg = payload.new;
      if (newMsg.sender_email === currentEmail || newMsg.receiver_email === currentEmail) {
        if (!messages.some(m => m.id === newMsg.id)) {
          messages.push(newMsg);
          renderContactList();
          if (activeContactEmail === newMsg.sender_email || activeContactEmail === newMsg.receiver_email) {
            renderChatArea();
          }
        }
      }
    })
    .subscribe();

  btnLogout.onclick = openAuthModal;
  createAccountForm.onsubmit = handleCreateAccount;

  btnOpenAddFriend.onclick = () => { addFriendModal.classList.remove("hidden"); friendTargetInput.value = ""; addFriendError.classList.add("hidden"); };
  btnCloseAddFriend.onclick = () => addFriendModal.classList.add("hidden");
  btnSubmitAddFriend.onclick = handleAddFriend;

  chatForm.onsubmit = handleSendMessage;
  searchInput.oninput = (e) => { searchQuery = e.target.value.toLowerCase(); renderContactList(); };

  filterAllBtn.onclick = () => setFilter("all");
  filterUnreadBtn.onclick = () => setFilter("unread");

  btnTheme.onclick = toggleDarkMode;
  btnReset.onclick = () => {
    localStorage.clear();
    location.reload();
  };
  btnBack.onclick = () => sidebar.classList.remove("-translate-x-full");
}

function initPresenceChannel() {
  if (!currentEmail) return;

  if (globalChannel) {
    supabaseClient.removeChannel(globalChannel);
  }

  globalChannel = supabaseClient.channel('room_online_users', {
    config: { presence: { key: currentEmail } }
  });

  globalChannel
    .on('presence', { event: 'sync' }, () => {
      const state = globalChannel.presenceState();
      onlineUsers = {};
      Object.keys(state).forEach(email => {
        onlineUsers[email] = true;
      });
      renderContactList();
      if (activeContactEmail) renderChatArea();
    });

  globalChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await globalChannel.track({ email: currentEmail, online_at: new Date().toISOString() });
    }
  });
}

async function loadUsersFromSupabase() {
  const { data, error } = await supabaseClient.from('profiles').select('*');
  if (!error && data) {
    usersData = {};
    data.forEach(p => {
      usersData[p.email] = { id: p.id, email: p.email, name: p.name, avatar: p.avatar, friends: p.friends || [] };
    });
  }
}

async function loadMessagesFromSupabase() {
  if (!currentEmail) return;
  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .or(`sender_email.eq.${currentEmail},receiver_email.eq.${currentEmail}`);
  
  if (!error && data) {
    messages = data;
  }
}

async function openAuthModal() {
  await loadUsersFromSupabase();
  authModal.classList.remove("hidden");
  existingAccountsList.innerHTML = "";

  Object.keys(usersData).forEach(email => {
    const acc = usersData[email];
    const div = document.createElement("div");
    div.className = "flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700";
    
    div.innerHTML = `
      <div class="flex items-center space-x-2.5 cursor-pointer flex-1 min-w-0" onclick="selectLogin('${email}')">
        <img src="${acc.avatar}" class="w-8 h-8 rounded-lg object-cover shrink-0">
        <div class="min-w-0">
          <span class="font-bold text-xs text-slate-800 dark:text-white block truncate">${acc.name}</span>
          <span class="text-[10px] text-slate-400 block truncate">${email}</span>
        </div>
      </div>
      <div class="flex space-x-1 shrink-0 ml-2">
        <button onclick="selectLogin('${email}')" class="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-bold">Login</button>
        <button onclick="deleteAccount('${acc.id}', '${email}')" class="px-2 py-1 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded-lg text-[10px]" title="Hapus Akun"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    existingAccountsList.appendChild(div);
  });
}

async function selectLogin(email) {
  currentEmail = email;
  localStorage.setItem("whisper_logged_email", currentEmail);
  authModal.classList.add("hidden");
  activeContactEmail = null;
  await loadMessagesFromSupabase();
  startSession();
  initPresenceChannel();
}

async function handleCreateAccount(e) {
  e.preventDefault();
  const email = newEmailInput.value.trim().toLowerCase();
  const name = newNameInput.value.trim();
  let avatar = newUserAvatarInput.value.trim();

  if (!email || !name) return;
  if (usersData[email]) {
    alert("Email ini sudah terdaftar di cloud!");
    return;
  }
  if (!avatar) avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`;

  const { data, error } = await supabaseClient
    .from('profiles')
    .insert([{ email: email, name: name, avatar: avatar, friends: [] }])
    .select();

  if (error) {
    alert("Gagal mendaftar: " + error.message);
    return;
  }

  await loadUsersFromSupabase();
  newEmailInput.value = "";
  newNameInput.value = "";
  newUserAvatarInput.value = "";
  selectLogin(email);
}

async function deleteAccount(id, email) {
  if (confirm(`Hapus akun dengan email "${email}" dari Cloud?`)) {
    await supabaseClient.from('profiles').delete().eq('id', id);
    await loadUsersFromSupabase();
    openAuthModal();
  }
}

function startSession() {
  const me = usersData[currentEmail];
  if (!me) { openAuthModal(); return; }
  loggedEmailEl.textContent = me.email;
  currentUserAvatar.src = me.avatar;
  currentUserName.textContent = me.name;
  currentUserEmailDisplay.textContent = me.email;
  renderContactList();
  renderChatArea();
}

async function handleAddFriend() {
  const targetEmail = friendTargetInput.value.trim().toLowerCase();
  addFriendError.classList.add("hidden");

  if (!targetEmail) { showAddFriendError("Masukkan alamat email!"); return; }
  if (targetEmail === currentEmail) { showAddFriendError("Tidak bisa menambah email sendiri."); return; }
  if (!usersData[targetEmail]) { showAddFriendError("Akun dengan email tersebut tidak ditemukan."); return; }

  const me = usersData[currentEmail];
  let myFriends = me.friends || [];
  if (myFriends.includes(targetEmail)) { showAddFriendError("Kalian sudah berteman!"); return; }

  myFriends.push(targetEmail);

  const { error } = await supabaseClient
    .from('profiles')
    .update({ friends: myFriends })
    .eq('email', currentEmail);

  if (!error) {
    me.friends = myFriends;
    addFriendModal.classList.add("hidden");
    renderContactList();
    alert(`Berhasil berteman dengan ${usersData[targetEmail].name}!`);
  } else {
    showAddFriendError("Gagal menambahkan teman.");
  }
}

function showAddFriendError(msg) {
  addFriendError.textContent = msg;
  addFriendError.classList.remove("hidden");
}

function renderContactList() {
  contactListEl.innerHTML = "";
  const me = usersData[currentEmail];
  if (!me) return;
  const myFriends = me.friends || [];

  myFriends.forEach(friendEmail => {
    const friendObj = usersData[friendEmail];
    if (!friendObj) return;

    const isOnline = !!onlineUsers[friendEmail];

    const conversation = messages.filter(
      m => (m.sender_email === currentEmail && m.receiver_email === friendEmail) ||
           (m.sender_email === friendEmail && m.receiver_email === currentEmail)
    );

    const lastMsg = conversation[conversation.length - 1];
    const unreadCount = conversation.filter(
      m => m.sender_email === friendEmail && m.receiver_email === currentEmail && !m.read
    ).length;

    if (searchQuery && !friendObj.name.toLowerCase().includes(searchQuery) && !friendEmail.includes(searchQuery)) return;
    if (filterMode === "unread" && unreadCount === 0) return;

    const isActive = friendEmail === activeContactEmail;
    const contactCard = document.createElement("div");
    contactCard.className = `p-3 rounded-2xl flex items-center space-x-3 cursor-pointer transition-all ${
      isActive ? "bg-teal-50 dark:bg-slate-800 border border-teal-100 dark:border-slate-700 shadow-2xs" : "hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent"
    }`;

    contactCard.onclick = async () => {
      activeContactEmail = friendEmail;
      await markMessagesAsRead(friendEmail);
      renderContactList();
      renderChatArea();
      sidebar.classList.add("-translate-x-full");
    };

    contactCard.innerHTML = `
      <div class="relative shrink-0">
        <img src="${friendObj.avatar}" alt="${friendObj.name}" class="w-11 h-11 rounded-xl object-cover shadow-2xs">
        <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'} rounded-full border-2 border-white dark:border-slate-900 transition-colors"></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-baseline mb-0.5">
          <h4 class="font-bold text-xs sm:text-sm truncate text-slate-800 dark:text-slate-100">${friendObj.name}</h4>
          <span class="text-[10px] text-slate-400 font-medium">${lastMsg ? lastMsg.timestamp : ''}</span>
        </div>
        <div class="flex justify-between items-center">
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate pr-2 font-normal">${lastMsg ? lastMsg.text : (isOnline ? 'Online' : 'Offline')}</p>
          ${unreadCount > 0 ? `<span class="bg-teal-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 shadow-2xs">${unreadCount}</span>` : ''}
        </div>
      </div>
    `;
    contactListEl.appendChild(contactCard);
  });
}

function renderChatArea() {
  if (!activeContactEmail) {
    chatHeader.classList.add("hidden");
    messagesContainer.classList.add("hidden");
    chatForm.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  const friendObj = usersData[activeContactEmail];
  const isOnline = !!onlineUsers[activeContactEmail];

  chatHeader.classList.remove("hidden");
  messagesContainer.classList.remove("hidden");
  chatForm.classList.remove("hidden");
  emptyState.classList.add("hidden");

  activeContactAvatarHeader.src = friendObj.avatar;
  activeContactNameHeader.textContent = friendObj.name;
  if (activeContactStatusHeader) {
    activeContactStatusHeader.textContent = isOnline ? "Online" : "Offline";
    activeContactStatusHeader.className = `text-[10px] font-semibold ${isOnline ? 'text-emerald-500' : 'text-slate-400'}`;
  }

  const activeConversation = messages.filter(
    m => (m.sender_email === currentEmail && m.receiver_email === activeContactEmail) ||
         (m.sender_email === activeContactEmail && m.receiver_email === currentEmail)
  );

  messagesContainer.innerHTML = "";
  activeConversation.forEach(msg => {
    const isMe = msg.sender_email === currentEmail;
    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.className = `flex ${isMe ? "justify-end" : "justify-start"} message-bubble`;

    bubbleWrapper.innerHTML = `
      <div class="max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 relative group shadow-2xs ${
        isMe ? "bg-teal-600 text-white rounded-tr-xs" : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-100 dark:border-slate-800"
      }">
        <p class="text-xs sm:text-sm leading-relaxed break-words font-medium">${escapeHTML(msg.text)}</p>
        <div class="flex items-center justify-end space-x-1.5 mt-1 text-[10px] ${isMe ? 'text-teal-100' : 'text-slate-400'} font-semibold select-none">
          <span>${msg.timestamp}</span>
          ${isMe ? `<i class="fa-solid fa-check-double ${msg.read ? 'text-teal-200' : 'text-teal-300/60'} text-[11px]"></i>` : ''}
        </div>
      </div>
    `;
    messagesContainer.appendChild(bubbleWrapper);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function handleSendMessage(e) {
  e.preventDefault();
  if (isSending) return;

  const text = messageInput.value.trim();
  if (!text || !activeContactEmail) return;

  isSending = true;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newMsg = {
    sender_email: currentEmail,
    receiver_email: activeContactEmail,
    text: text,
    timestamp: timeStr,
    read: false
  };

  const { data, error } = await supabaseClient.from('messages').insert([newMsg]).select();
  if (!error && data) {
    if (!messages.some(m => m.id === data[0].id)) {
      messages.push(data[0]);
    }
    messageInput.value = "";
    renderContactList();
    renderChatArea();
  }

  isSending = false;
}

async function markMessagesAsRead(friendEmail) {
  const unreadIds = messages
    .filter(m => m.sender_email === friendEmail && m.receiver_email === currentEmail && !m.read)
    .map(m => m.id);

  if (unreadIds.length > 0) {
    await supabaseClient.from('messages').update({ read: true }).in('id', unreadIds);
    messages.forEach(m => {
      if (unreadIds.includes(m.id)) m.read = true;
    });
  }
}

function setFilter(filter) {
  filterMode = filter;
  filterAllBtn.classList.toggle("active", filter === "all");
  filterUnreadBtn.classList.toggle("active", filter === "unread");
  renderContactList();
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle("dark");
  if (isDark) {
    localStorage.setItem("wa_theme", "dark");
    themeIcon.className = "fa-solid fa-sun text-sm text-amber-300";
  } else {
    localStorage.setItem("wa_theme", "light");
    themeIcon.className = "fa-solid fa-moon text-sm";
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Perbaikan event listener agar berjalan normal kembali
document.addEventListener("DOMContentLoaded", initApp);
