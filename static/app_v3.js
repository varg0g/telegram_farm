(function () {
  "use strict";

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  window.$ = $;
  window.$$ = $$;

  // Безопасные обертки для функций из media.js
  function pauseAllVoice() {
    if (typeof window.pauseAllVoice === "function") window.pauseAllVoice();
  }
  function cancelRec() {
    if (typeof window.cancelRec === "function") window.cancelRec();
  }
  function initVoicePlayers() {
    if (typeof window.initVoicePlayers === "function") window.initVoicePlayers();
  }
  function playLazyVideo(v) {
    if (typeof window.playLazyVideo === "function") window.playLazyVideo(v);
  }
  function updateComposerMode() {
    if (typeof window.updateComposerMode === "function" && window.updateComposerMode !== updateComposerMode) {
      try { window.updateComposerMode(); return; } catch(e) {}
    }
    if (els && els.composerInput) {
      var hasText = !!els.composerInput.value.trim();
      if (els.micBtn) els.micBtn.hidden = hasText;
      if (els.videoNoteBtn) els.videoNoteBtn.hidden = hasText;
      if (els.sendBtn) els.sendBtn.hidden = !hasText;
    }
  }

  function normAcc(val) {
    if (!val) return "";
    if (typeof val === "object") {
      val = val.name || val.phone || "";
    }
    return String(val).trim().replace(/^\+/, "");
  }
  window.normAcc = normAcc;

var els = {
    layout: $("#layout"),
    brandSub: $("#brandSub"),
    btnAllInbox: document.getElementById("btn-all-inbox"),
    themeToggleBtn: $("#themeToggleBtn"),
    soundToggleBtn: $("#soundToggleBtn"),
    accountSearch: $("#accountSearch"),
    accountList: $("#accountList"),
    dialogSearch: $("#dialogSearch"),
    dialogList: $("#dialogList"),
    dialogHeadTitle: $("#dialogHeadTitle"),
    dialogHeadSub: $("#dialogHeadSub"),
    btnGetTelegramCode: $("#btnGetTelegramCode"),
    deleteAccountHeaderBtn: $("#deleteAccountHeaderBtn"),
    groupsList: document.getElementById("groups-list"),
    backAccounts: $("#backAccounts"),
    reloadDialogs: $("#reloadDialogs"),
    chatAvatar: $("#chatAvatar"),
    chatTitle: $("#chatTitle"),
    chatSub: $("#chatSub"),
    messages: $("#messages"),
    chatEmpty: $("#chatEmpty"),
    composer: $("#composer"),
    replyBar: $("#replyBar"),
    replyBarTitle: $("#replyBarTitle"),
    replyBarText: $("#replyBarText"),
    replyBarClose: $("#replyBarClose"),
    attachBtn: $("#attachBtn"),
    attachInput: $("#attachInput"),
    composerInput: $("#composerInput"),
    sendBtn: $("#sendBtn"),
    micBtn: $("#micBtn"),
    recBar: $("#recBar"),
    recTime: $("#recTime"),
    recCancel: $("#recCancel"),
    backDialogs: $("#backDialogs"),
    reloadChat: $("#reloadChat"),
    modalOverlay: $("#modalOverlay"),
    modalClose: $("#modalClose"),
    uploadForm: $("#uploadForm"),
    uploadNote: $("#uploadNote"),
    deleteModalOverlay: $("#deleteModalOverlay"),
    deleteModalClose: $("#deleteModalClose"),
    deleteModalCancel: $("#deleteModalCancel"),
    deleteModalConfirm: $("#deleteModalConfirm"),
    deleteAccountName: $("#deleteAccountName"),
    videoNoteBtn: $("#videoNoteBtn"),
    vnoteModalOverlay: $("#vnoteModalOverlay"),
    vnoteModalClose: $("#vnoteModalClose"),
    vnotePreview: $("#vnotePreview"),
    vnoteTimer: $("#vnoteTimer"),
    vnoteRecordBtn: $("#vnoteRecordBtn"),
    vnoteStopBtn: $("#vnoteStopBtn"),
    vnoteSendBtn: $("#vnoteSendBtn"),
    toast: $("#toast"),

    // === НОВЫЕ ЭЛЕМЕНТЫ: МЕНЮ ИНСТРУМЕНТОВ ===
    btnOpenTools: $("#btn-open-tools"),
    modalTools: $("#modal-tools"),
    btnCloseTools: $("#btn-close-tools"),
    btnOpenAddAccount: $("#btn-open-add-account"),
    btnOpenAddGroup: $("#btn-open-add-group"),
    btnOpenProxy: $("#btn-open-proxy"),
    btnOpenSpam: $("#btn-open-spam"),
    btnDeleteAccountsMenu: $("#btn-delete-accounts-menu"),

    // === НОВЫЕ ЭЛЕМЕНТЫ: СОЗДАНИЕ ГРУППЫ ===
    modalAddGroup: $("#modal-add-group"),
    btnCancelGroupIcon: $("#btn-cancel-group-icon"),
    btnCancelGroup: $("#btn-cancel-group"),
    btnSaveGroup: $("#btn-save-group"),
    newGroupTitle: $("#new-group-title"),

    // === НОВЫЕ ЭЛЕМЕНТЫ: РАССЫЛКА ===
    broadcastModal: $("#broadcast-modal"),
    closeBroadcast: $("#close-broadcast"),
    sendBroadcastBtn: $("#send-broadcast-btn"),
    broadcastChatsList: $("#broadcast-chats-list"),
    broadcastText: $("#broadcast-text")
  };

  window.els = els;
  window.toast = toast;
  window.apiFetch = apiFetch;
  window.pollMessages = pollMessages;
  window.setReplyTarget = setReplyTarget;
  window.renderAccounts = renderAccounts;
  window.selectDialog = selectDialog;
  window.selectAccount = selectAccount;
  window.renderDialogs = renderDialogs;
  window.loadGroups = loadGroups;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

window.esc = esc;

  var state = {
    accounts: [],
    accountFilter: "",
    account: null,
    dialogs: [],
    dialogFilter: "", showArchive: false,
    dialog: null,
    lastId: 0,
    olderDone: false,
    selectedGroupId: null,
    loadingOlder: false,
    pollTimer: null,
    accountRendered: 0,
    dialogOffset: 0,
    dialogTotal: 0,
    accountDialogsCache: {},
    chatCache: {},
    chatGen: 0,
    chatAbort: null,
    replyTarget: null,
    soundEnabled: localStorage.getItem("tf_sound") !== "0",
    theme: localStorage.getItem("tf_theme") || "dark"
  };

window.state = state;

  var ACCOUNT_PAGE = 300;
  var POLL_MS = 8000;

  // ---------- sound notification ----------
  function playMessageSound() {
    if (!state.soundEnabled) return;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function updateSoundUI() {
    var onIco = $(".sound-on-ico", els.soundToggleBtn);
    var offIco = $(".sound-off-ico", els.soundToggleBtn);
    if (onIco && offIco) {
      onIco.hidden = !state.soundEnabled;
      offIco.hidden = state.soundEnabled;
    }
    els.soundToggleBtn.title = state.soundEnabled ? "Звук включён" : "Звук выключен";
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem("tf_sound", state.soundEnabled ? "1" : "0");
    updateSoundUI();
    if (state.soundEnabled) playMessageSound();
  }

  // ---------- theme switcher ----------
  function setTheme(t) {
    state.theme = t;
    localStorage.setItem("tf_theme", t);
    document.documentElement.setAttribute("data-theme", t);
    var darkIco = $(".theme-dark-ico", els.themeToggleBtn);
    var lightIco = $(".theme-light-ico", els.themeToggleBtn);
    if (darkIco && lightIco) {
      darkIco.hidden = t === "light";
      lightIco.hidden = t !== "light";
    }
  }

  function toggleTheme() {
    setTheme(state.theme === "dark" ? "light" : "dark");
  }

  function setView(v) { els.layout.dataset.view = v; }

  function scrollBottom() { els.messages.scrollTop = els.messages.scrollHeight; }

  function nearBottom() {
    return els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 90;
  }

  function maxMsgId() {
    var m = 0;
    $$(".msg", els.messages).forEach(function (el) {
      m = Math.max(m, Number(el.dataset.idmax) || Number(el.dataset.id) || 0);
    });
    return m;
  }

  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(pollMessages, POLL_MS);
  }

  // ---------- reply / quoting ----------
  function setReplyTarget(target) {
    state.replyTarget = target;
    if (!target) {
      els.replyBar.hidden = true;
      els.replyBarTitle.textContent = "Ответ";
      els.replyBarText.textContent = "...";
    } else {
      els.replyBarTitle.textContent = "Ответ на сообщение " + (target.author ? target.author : "");
      els.replyBarText.textContent = target.text || "Медиа";
      els.replyBar.hidden = false;
      els.composerInput.focus();
    }
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 3500);
  }

  // ---------- accounts ----------
function filteredAccounts() {
    var q = state.accountFilter.trim().toLowerCase();

    return state.accounts.filter(function (a) {
        // 1. Проверяем папку: если папка выбрана, но ID группы аккаунта не совпадает — отсеиваем его
        if (state.selectedGroupId !== null && a.work_group_id !== state.selectedGroupId) {
            return false;
        }

        // 2. Проверяем текст поиска: если поиска нет, аккаунт нам подходит (он уже прошел проверку папки)
        if (!q) {
            return true;
        }

        // 3. Если текст есть, ищем совпадения в имени или номере
        var d = accountDisplay(a);
        return d.full.toLowerCase().indexOf(q) !== -1 ||
               d.sub.toLowerCase().indexOf(q) !== -1 ||
               (a.username || "").toLowerCase().indexOf(q) !== -1;
    });
}

  function accountRow(a) {
    var d = accountDisplay(a);
    var active = state.account && state.account.name === a.name ? " active" : "";
    var isErr = a.status === "error" || a.status === "quarantined";
    var isConn = a.status === "connecting";
    var extraClass = isErr ? " is-error" : (isConn ? " is-connecting" : "");
    var badgeHtml = "";
    if (isErr) {
      badgeHtml = '<span class="acc-badge-err" title="' + esc(a.error || "Ошибка") + '">' + (a.status === "quarantined" ? "Заморожен" : "Ошибка") + '</span>';
    } else if (isConn) {
      badgeHtml = '<span class="acc-badge-connecting">Запуск...</span>';
    }
    return '<a class="acc-row' + active + extraClass + '" href="#" data-account="' + esc(a.name) + '" data-status="' + esc(a.status || "active") + '">' +
      '<span class="av av-sm av-' + hashColor(a.name) + '">' + esc((d.full[0] || "?").toUpperCase()) +
      avatarImg(a.name, a.id) + "</span>" +
      '<span class="acc-mid"><span class="acc-name">' + esc(d.full) + badgeHtml + "</span>" +
      '<span class="acc-sub">' + esc(d.sub || a.phone || a.name) + "</span></span>" +
      '<span class="acc-status" aria-hidden="true"></span></a>';
  }

function renderGroups() {
    if (!els.groupsList) return; 
    els.groupsList.innerHTML = "";
    if (!state.groups || state.groups.length === 0) return;

    state.groups.forEach(function(group) {
        var btn = document.createElement("button");
        
        if (state.selectedGroupId == group.id) {
            btn.className = "nav-btn active";
        } else {
            btn.className = "nav-btn";
        }
        
        var icon = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
        btn.innerHTML = icon + " " + window.esc(group.title);
        
                btn.addEventListener("click", function() {
                var btnAllInbox = document.getElementById("btn-all-inbox");
                if (btnAllInbox) btnAllInbox.classList.remove("active");
            if (state.selectedGroupId == group.id) {
                state.selectedGroupId = null; 
                renderGroups(); 
                renderAccounts();
            } else {
                state.selectedGroupId = group.id; 
                renderGroups(); 
                renderAccounts();
                state.account = null;
                state.dialog = null;
                els.dialogList.hidden = false;
                loadDialogs(true);
            }
        });

        els.groupsList.appendChild(btn);
    });
}

  function updateAccountsCounter(total, active) {
    var badge = document.getElementById("accountsCounter");
    if (!badge) return;
    var t = (total !== undefined) ? total : (state.totalSessions !== undefined ? state.totalSessions : state.accounts.length);
    var a = (active !== undefined) ? active : (state.activeSessions !== undefined ? state.activeSessions : state.accounts.filter(function(x) { return x.status !== "error" && x.status !== "quarantined"; }).length);
    badge.innerHTML = '<span class="cnt-total">' + t + '</span><span class="cnt-slash">/</span><span class="cnt-active' + (a < t ? ' has-errors' : '') + '">' + a + '</span>';
    badge.title = "Всего сессий в проекте: " + t + " | Успешно загружено: " + a;
  }

  function renderAccounts() {
    state.accountRendered = 0;
    var titleEl = document.getElementById("col2-title");
    if (titleEl) {
        if (state.selectedGroupId && state.groups) {
            var g = state.groups.find(x => x.id == state.selectedGroupId);
            titleEl.textContent = g ? g.title : "Аккаунты";
        } else {
            titleEl.textContent = "Все аккаунты";
        }
    }
    updateAccountsCounter();
    var list = filteredAccounts();
    if (!list.length) {
      els.accountList.innerHTML = '<div class="list-empty">' +
        (state.accounts.length ? "Ничего не найдено" : "Нет аккаунтов. Добавьте через кнопку ниже") + "</div>";
      return;
    }
    els.accountList.innerHTML = "";
    appendAccounts();
  }

  function appendAccounts() {
    var list = filteredAccounts();
    var slice = list.slice(state.accountRendered, state.accountRendered + ACCOUNT_PAGE);
    state.accountRendered += slice.length;
    els.accountList.insertAdjacentHTML("beforeend", slice.map(accountRow).join(""));
  }

  function onAccountScroll() {
    if (els.accountList.scrollTop + els.accountList.clientHeight >= els.accountList.scrollHeight - 300) {
      if (state.accountRendered < filteredAccounts().length) appendAccounts();
    }
  }

  function onAccountClick(e) {
    var row = e.target.closest ? e.target.closest("[data-account]") : null;
    if (!row) return;
    e.preventDefault();
    var accName = row.dataset.account;

    if (row.dataset.status === "error" || row.dataset.status === "quarantined") {
      var accObj = state.accounts.find(function(x) { return x.name === accName; });
      toast("Сессия недоступна: " + (accObj && accObj.error ? accObj.error : "ошибка авторизации"));
      return;
    }
    if (row.dataset.status === "connecting") {
      toast("Сессия подключается к Telegram, пожалуйста подождите...");
      return;
    }
    
    // Если кликнули на уже активный аккаунт — отменяем выбор и показываем ленту
    if (state.account && state.account.name === accName) {
      state.account = null;
      renderAccounts();
      var feedWrap = document.getElementById("globalFeedWrap");
      if (feedWrap) feedWrap.style.display = "none";
      els.dialogList.hidden = false;
      state.dialogs = [];
      renderDialogs();
    
      els.dialogHeadTitle.textContent = "Диалоги";
      els.dialogHeadSub.textContent = "";
      els.deleteAccountHeaderBtn.hidden = true;
      if (els.btnGetTelegramCode) els.btnGetTelegramCode.hidden = true;
      resetChat();
      return;
    }
    selectAccount(accName);
  }

  // ---------- dialogs ----------
  function filteredDialogs() {
    var q = state.dialogFilter.trim().toLowerCase();
    var tab = state.dialogFilterTab || 'all';
    var list = state.dialogs;

    var seenKeys = new Set();
    list = list.filter(function (d) {
      var k = (d.account_name || (state.account ? state.account.name : "") || "") + ":" + d.id;
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });

    if (tab === 'archive' || state.showArchive) {
      list = list.filter(function(d) { return d.folder_id === 1; });
    } else {
      list = list.filter(function(d) { return d.folder_id !== 1; });
      if (tab === 'private') {
        list = list.filter(function(d) { return d.type === 'private' || d.type === 'saved'; });
      } else if (tab === 'group') {
        list = list.filter(function(d) { return d.type === 'group' || d.type === 'supergroup'; });
      } else if (tab === 'channel') {
        list = list.filter(function(d) { return d.type === 'channel'; });
      } else if (tab === 'bot') {
        list = list.filter(function(d) { return d.type === 'bot'; });
      }
    }

    if (q) {
      list = list.filter(function (d) {
        return (d.title + " " + d.preview).toLowerCase().indexOf(q) !== -1;
      });
    }

    // Закрепленные чаты ВСЕГДА первыми, внутри - по свежести сообщений
    return list.slice().sort(function(a, b) {
      var aPin = a.pinned ? 1 : 0;
      var bPin = b.pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  var MUTE_ICO = '<svg class="svg-ico mute-ico" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M23 9l-6 6M17 9l6 6"/></svg>';

  function dialogRow(d) {
    var active = state.dialog && state.dialog.id === d.id ? " active" : "";
    var unread = d.unread ? '<span class="unread">' + (d.unread > 99 ? "99+" : d.unread) + "</span>" : "";
    var muted = d.muted ? MUTE_ICO : "";
    var pinnedIco = d.pinned ? '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true" style="margin-left:4px; opacity:0.6;"><path d="M16 3H8l-1 9 2 2v6l3 2 3-2v-6l2-2-1-9z"/></svg>' : "";
    
    var accNameDisplay = d.account_name;
    if (d.account_name && !state.account) {
        var acc = state.accounts.find(function(x) { return x.name === d.account_name; });
        if (acc) {
            accNameDisplay = typeof accountDisplay !== "undefined" ? accountDisplay(acc).full : (acc.first || acc.name);
        }
    }

    var isSaved = d.type === "saved";
    var rawPreview = d.preview || "";
    var isOut = Boolean(d.is_outgoing);
    if (rawPreview.indexOf("Вы: ") === 0) {
      isOut = true;
      rawPreview = rawPreview.substring(4);
    }

    var previewPrefix = "";
    if (isOut) {
      var tick = d.out_status === "read" ? "✓✓" : "✓";
      var tickClass = d.out_status === "read" ? "out-read" : "out-sent";
      previewPrefix = '<span class="dlg-tick ' + tickClass + '">' + tick + '</span><span class="dlg-prefix">Вы: </span>';
    } else if (d.author_name) {
      previewPrefix = '<span class="dlg-author">' + esc(d.author_name) + ': </span>';
    }
    
    var onlineDot = d.online && !isSaved ? '<span class="online-dot" title="В сети"></span>' : '';
    var avInner = isSaved 
      ? '<svg viewBox="0 0 24 24" style="width:17px; height:17px; fill:#fff; margin:auto;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      : esc((d.title[0] || "?").toUpperCase()) + avatarImg(d.account_name || (state.account && state.account.name), d.id);
    var avStyle = isSaved ? ' style="background: linear-gradient(135deg, #00a8ff, #0052cc); display: flex; align-items: center; justify-content: center;"' : '';
    var avClass = isSaved ? 'av av-md is-saved' : 'av av-md av-' + hashColor(String(d.id));

    return '<a class="dlg-row' + active + (isSaved ? ' is-saved-row' : '') + '" href="#" data-id="' + d.id + '">' +
      '<span class="' + avClass + '"' + avStyle + '>' + avInner + onlineDot + "</span>" +
      '<span class="dlg-mid"><span class="dlg-title">' + esc(d.title) + pinnedIco + "</span>" +
      (d.account_name && !state.account ? '<span class="dlg-acc-tag">> ' + esc(accNameDisplay) + '</span>' : '') +
      '<span class="dlg-preview">' + previewPrefix + esc(rawPreview) + "</span></span>" +
      '<span class="dlg-side"><span class="dlg-time">' + esc(timeLabel(d.ts)) + "</span>" + unread + muted + "</span></a>";
  }

  function renderDialogs() {
    var list = filteredDialogs();
    var st = els.dialogList.scrollTop;
    if (!list.length) {
      els.dialogList.innerHTML = '<div class="list-empty">' + (state.dialogs.length ? "Ничего не найдено" : "Нет диалогов") + "</div>";
    } else {
      els.dialogList.innerHTML = list.map(dialogRow).join("");
    }
    els.dialogList.scrollTop = st;
  }

  function onDialogClick(e) {
    var row = e.target.closest ? e.target.closest("[data-id]") : null;
    if (!row) return;
    e.preventDefault();
    var id = Number(row.dataset.id);
    var d = state.dialogs.find(function (x) { return x.id === id; });
    if (d) {
        if (d.account_name) {
            var acc = state.accounts && state.accounts.find(function (x) {
                var xn = String(x.name || "").replace(/^\+/, "");
                var xp = String(x.phone || "").replace(/^\+/, "");
                var dn = String(d.account_name || "").replace(/^\+/, "");
                return xn === dn || xp === dn;
            });
            if (acc && (!state.account || state.account.name !== acc.name)) {
                state.account = acc;
                try { renderAccounts(); } catch(err){}
            }
        }
        selectDialog(d);
    }
  }

  async function loadDialogs(fresh, silent) {
    if (!state.account && !state.selectedGroupId && (!document.getElementById("btn-all-inbox") || !document.getElementById("btn-all-inbox").classList.contains("active"))) {
        return;
    }
    
    if (fresh) { state.dialogs = []; state.dialogOffset = 0; state.dialogTotal = 0; }
    if (!silent) els.dialogList.classList.add("loading");
    try {
      var url = "/api/dialogs?fresh=" + (fresh ? 1 : 0) + "&offset=" + state.dialogOffset + "&limit=9999&_t=" + Date.now();
      var isAllInbox = document.getElementById("btn-all-inbox") && document.getElementById("btn-all-inbox").classList.contains("active");
      if (state.account) {
          url += "&account=" + encodeURIComponent(state.account.name);
      } else if (state.selectedGroupId) {
          url += "&group_id=" + encodeURIComponent(state.selectedGroupId);
      } else if (isAllInbox) {
          url += "&account=*";
      } else {
          return;
      }
      var r = await apiFetch(url);
      var data = await r.json();
      var incoming = data.items || [];
      if (fresh) {
        state.dialogs = incoming;
      } else {
        var existingMap = new Map();
        state.dialogs.forEach(function (d) {
          var k = (d.account_name || (state.account ? state.account.name : "") || "") + ":" + d.id;
          existingMap.set(k, d);
        });
        incoming.forEach(function (d) {
          var k = (d.account_name || (state.account ? state.account.name : "") || "") + ":" + d.id;
          existingMap.set(k, d);
        });
        state.dialogs = Array.from(existingMap.values());
      }
      state.dialogOffset = data.offset || state.dialogOffset;
      state.dialogTotal = data.total || 0;

      if (state.account && state.account.name) {
        var entry = {
          items: state.dialogs,
          offset: state.dialogOffset,
          total: state.dialogTotal
        };
        state.accountDialogsCache[state.account.name] = entry;
        state.accountDialogsCache[normAcc(state.account.name)] = entry;
      }

      renderDialogs();
      if (state.dialogs && state.dialogs.length) {
        setTimeout(function() {
          var topDlgs = state.dialogs.slice(0, 4);
          var accN = normAcc(state.account ? state.account.name : "");
          topDlgs.forEach(function(td) {
            var a = normAcc(td.account_name || accN);
            if (a && td.id) prefetchDialog(td.id, a);
          });
        }, 60);
      }
    
    } finally {
      if (!silent) els.dialogList.classList.remove("loading");
    }
  }

  // ---------- Профиль пользователя ----------
  async function openUserProfile(userId) {
    if (!state.account) return;
    $("#profileName").textContent = "Загрузка...";
    $("#profileUsername").textContent = "";
    $("#profilePhone").textContent = "";
    $("#profileStatus").textContent = "";
    $("#profileAvatar").hidden = true;
    $("#profileAvatarPlaceholder").hidden = true;
    $("#profileModalOverlay").hidden = false;

    var avatarUrl = "/api/avatar?account=" + encodeURIComponent(state.account.name) + "&chat_id=" + userId;
    var img = new Image();
    img.onload = function() {
        $("#profileAvatar").src = avatarUrl;
        $("#profileAvatar").hidden = false;
        $("#profileAvatarPlaceholder").hidden = true;
    };
    img.onerror = function() {
        $("#profileAvatar").hidden = true;
        $("#profileAvatarPlaceholder").hidden = false;
    };
    img.src = avatarUrl;

    try {
      var r = await apiFetch("/api/user?account=" + encodeURIComponent(state.account.name) + "&user_id=" + userId);
      if (r.ok) {
        var u = await r.json();
        $("#profileName").textContent = u.name;
        if (u.username) $("#profileUsername").textContent = "@" + u.username;
        if (u.phone) $("#profilePhone").textContent = "+" + u.phone;
        $("#profileStatus").textContent = u.status;
        if ($("#profileAvatarPlaceholder").hidden === false) {
            $("#profileAvatarPlaceholder").textContent = u.name.charAt(0).toUpperCase();
        }
      } else {
        $("#profileName").textContent = "Ошибка загрузки";
      }
    } catch (e) {
      $("#profileName").textContent = "Ошибка загрузки";
    }
  }
  $("#profileModalClose").addEventListener("click", function() { $("#profileModalOverlay").hidden = true; });
  $("#profileModalOverlay").addEventListener("click", function(e) { if (e.target === $("#profileModalOverlay")) $("#profileModalOverlay").hidden = true; });

  // ---------- Удаление аккаунта ----------
  function resetChat() {
    cancelRec();
    pauseAllVoice();
    delete els.composerInput.dataset.editId; setReplyTarget(null);
    els.messages.innerHTML = "";
    if (els.chatEmpty) els.chatEmpty.hidden = false;
    els.messages.hidden = true;
    els.composer.hidden = true;
    els.composer.classList.remove("recording");
    els.recBar.hidden = true;
    state.lastId = 0;
    state.olderDone = false;
    els.chatAvatar.textContent = "?";
    els.chatAvatar.className = "conv-avatar av av-lg av-0";
    els.chatTitle.textContent = "Чат";
    els.chatSub.textContent = "Выберите диалог слева";
  }

  var prefetchQueue = new Set();
  function prefetchDialog(chatId, accName) {
    if (!chatId || !accName) return;
    var key = accName + ":" + chatId;
    if (prefetchQueue.has(key) || (state.chatCache && state.chatCache[key])) return;
    prefetchQueue.add(key);
    var url = "/get_messages/?account=" + encodeURIComponent(accName) +
      "&chat_id=" + encodeURIComponent(chatId) + "&limit=60";
    apiFetch(url).then(function(r) {
      if (!r || !r.ok) return;
      return r.text();
    }).then(function(html) {
      if (html && html.trim() && html.indexOf("msg") !== -1 && (!state.chatCache[key])) {
        state.chatCache[key] = {
          html: html,
          lastId: 0,
          olderDone: false,
          ts: Date.now()
        };
        try {
          sessionStorage.setItem("tf_chat_cache_" + key, JSON.stringify(state.chatCache[key]));
        } catch(e) {}
      }
    }).catch(function(){});
  }

  function saveChatCache() {
    if (!state.dialog) return;
    var acc = normAcc(state.dialog.account_name || (state.account && state.account.name));
    if (!acc) return;
    if (!els.messages || !els.messages.querySelector(".msg")) return;
    var key = acc + ":" + state.dialog.id;
    var cacheObj = {
      html: els.messages.innerHTML,
      lastId: state.lastId,
      olderDone: state.olderDone,
      ts: Date.now()
    };
    state.chatCache[key] = cacheObj;
    try {
      sessionStorage.setItem("tf_chat_cache_" + key, JSON.stringify(cacheObj));
    } catch (e) {}
  }

  function restoreChatCache(key) {
    var cached = state.chatCache[key];
    if (!cached) {
      try {
        var s = sessionStorage.getItem("tf_chat_cache_" + key);
        if (s) {
          cached = JSON.parse(s);
          state.chatCache[key] = cached;
        }
      } catch (e) {}
    }
    if (!cached || !cached.html || !cached.html.trim()) return false;
    if (cached.html.indexOf("chat-no-messages") !== -1 || cached.html.indexOf("Загрузка...") !== -1) {
      return false;
    }
    els.messages.innerHTML = cached.html;
    els.messages.classList.remove("loading");
    if (els.chatEmpty) els.chatEmpty.hidden = true;
    try { groupMessages(); } catch(e) {}
    try { renderChips(); } catch(e) {}
    state.lastId = cached.lastId;
    state.olderDone = cached.olderDone;
    try { initVoicePlayers(); } catch(e) {}
    els.messages.scrollTop = els.messages.scrollHeight;
    return true;
  }

  function groupMessages() {
    var all = $$(".msg", els.messages);
    all.forEach(function (m) { m.classList.remove("in-row", "has-next"); });
    for (var i = 1; i < all.length; i++) {
      var c = all[i], p = all[i - 1];
      if (c.dataset.side === p.dataset.side &&
          c.dataset.date === p.dataset.date &&
          (Number(c.dataset.ts) - Number(p.dataset.ts)) <= 300) {
        if (c.dataset.sender || p.dataset.sender) {
          if (c.dataset.sender === p.dataset.sender) {
              c.classList.add("in-row");
              p.classList.add("has-next");
          }
        } else {
          c.classList.add("in-row");
          p.classList.add("has-next");
        }
      }
    }
  }

  function renderChips() {
    var all = $$(".msg", els.messages);
    $$(".chat-date", els.messages).forEach(function (ch) { ch.remove(); });
    var prev = null;
    all.forEach(function (m) {
      if (m.dataset.date !== prev) {
        var chip = document.createElement("div");
        chip.className = "chat-date";
        chip.innerHTML = "<span>" + esc(m.dataset.date) + "</span>";
        els.messages.insertBefore(chip, m);
        prev = m.dataset.date;
      }
    });
  }

  function updateMessageTicks(readMaxId) {
    if (!readMaxId) return;
    readMaxId = Number(readMaxId);
    if (!readMaxId || isNaN(readMaxId)) return;
    if (state.dialog) {
      state.dialog.read_outbox_max_id = Math.max(state.dialog.read_outbox_max_id || 0, readMaxId);
    }
    var outs = els.messages.querySelectorAll(".msg-out");
    outs.forEach(function(m) {
      var mid = Number(m.dataset.id);
      if (mid && mid <= readMaxId) {
        var tick = m.querySelector(".msg-tick");
        if (tick) {
          tick.textContent = "✓✓";
          tick.classList.add("read");
        }
      }
    });
  }

  async function loadMessages(showLoading) {
    if (!state.dialog) return;
    var chatId = state.dialog.id;

    // Robust account resolution:
    var accName = "";
    if (state.dialog && state.dialog.account_name) {
      accName = state.dialog.account_name;
    } else if (state.account) {
      accName = typeof state.account === "string" ? state.account : (state.account.name || state.account.phone || "");
    }
    if (!accName && state.accounts && state.accounts.length) {
      accName = state.accounts[0].name || state.accounts[0].phone || "";
    }
    accName = String(accName || "").trim().replace(/^\+/, "");

    // Normalize state.account
    if ((!state.account || typeof state.account === "string") && state.accounts && state.accounts.length) {
      var foundAcc = state.accounts.find(function (x) {
        var xn = String(x.name || "").replace(/^\+/, "");
        var xp = String(x.phone || "").replace(/^\+/, "");
        return xn === accName || xp === accName;
      });
      if (foundAcc) state.account = foundAcc;
      else if (!state.account) state.account = state.accounts[0];
    }

    if (!accName) return;

    if (state.chatAbort) {
      try { state.chatAbort.abort(); } catch (e) {}
    }
    var ac = new AbortController();
    state.chatAbort = ac;
    if (showLoading !== false && !els.messages.querySelector(".msg")) els.messages.classList.add("loading");
    els.messages.hidden = false;
    if (els.chatEmpty) els.chatEmpty.hidden = true;

    try {
      var url = "/get_messages/?account=" + encodeURIComponent(accName) +
        "&chat_id=" + encodeURIComponent(chatId) + "&limit=60";
      var r = await apiFetch(url, { signal: ac.signal });
      if (!r.ok) {
        if (r.status === 401) location.href = "/login";
        return;
      }
      var html = await r.text();
      var readMax = r.headers.get("X-Read-Outbox-Max-Id");

      // Verify user is still in this chat
      if (!state.dialog || String(state.dialog.id) !== String(chatId)) return;

      if (html && html.trim()) {
        els.messages.innerHTML = html;
        saveChatCache();
      } else {
        if (!els.messages.querySelector(".msg")) {
          els.messages.innerHTML = '<div class="chat-no-messages" style="margin: auto; text-align: center; color: var(--text-3); font-size: 13.5px; padding: 40px 20px;">Нет сообщений в этой переписке</div>';
        }
      }
      els.messages.hidden = false;
      if (els.chatEmpty) els.chatEmpty.hidden = true;

      try { groupMessages(); } catch (e) { console.error("groupMessages:", e); }
      try { renderChips(); } catch (e) { console.error("renderChips:", e); }
      try { if (readMax) updateMessageTicks(readMax); } catch (e) { console.error("updateMessageTicks:", e); }
      try { state.lastId = maxMsgId(); } catch (e) { console.error("maxMsgId:", e); }
      state.olderDone = false;
      try { initVoicePlayers(); } catch (e) { console.error("initVoicePlayers:", e); }
      try { scrollBottom(); } catch (e) { console.error("scrollBottom:", e); }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.error("loadMessages error:", err);
    } finally {
      if (state.chatAbort === ac) state.chatAbort = null;
      els.messages.classList.remove("loading");
    }
  }

  async function pollMessages() {
    if (document.hidden) return;
    if (!state.dialog) return;
    var chatId = state.dialog.id;
    var accName = normAcc((state.account && (state.account.name || state.account.phone || state.account)) || (state.dialog && state.dialog.account_name));
    if (!accName) return;

    var lastId = state.lastId || 0;
    try {
      var url = "/get_messages/?account=" + encodeURIComponent(accName) +
        "&chat_id=" + encodeURIComponent(chatId);
      if (lastId > 0) url += "&since_id=" + lastId;

      var r = await apiFetch(url);
      if (!r.ok) {
        if (r.status === 401) location.href = "/login";
        return;
      }
      var html = await r.text();
      var readMax = r.headers.get("X-Read-Outbox-Max-Id");
      if (readMax) updateMessageTicks(readMax);

      if (!state.dialog || String(state.dialog.id) !== String(chatId)) return;

      if (html && html.trim()) {
        var atBottom = nearBottom();
        var tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        var hasIncoming = tempDiv.querySelector(".msg-in") !== null;

        var emptyPlaceholder = els.messages.querySelector(".chat-no-messages");
        if (emptyPlaceholder) emptyPlaceholder.remove();

        els.messages.insertAdjacentHTML("beforeend", html);
        groupMessages();
        renderChips();
        state.lastId = maxMsgId();
        initVoicePlayers();
        saveChatCache();
        if (hasIncoming) playMessageSound();
        if (atBottom) {
          scrollBottom();
        } else {
          state.unreadWhileScrolled = (state.unreadWhileScrolled || 0) + 1;
          updateScrollBottomBtn();
        }
      }
    } catch (err) { /* сеть недоступна */ }
  }

  async function loadOlder() {
    if (!state.dialog || state.loadingOlder || state.olderDone) return;
    var first = $(".msg", els.messages);
    if (!first) { state.olderDone = true; return; }
    var chatId = state.dialog.id;
    var accName = normAcc((state.account && (state.account.name || state.account.phone || state.account)) || (state.dialog && state.dialog.account_name));
    if (!accName) return;

    state.loadingOlder = true;
    var offsetId = Number(first.dataset.id);
    var h = els.messages.scrollHeight;
    try {
      var r = await apiFetch("/get_messages/?account=" + encodeURIComponent(accName) +
        "&chat_id=" + encodeURIComponent(chatId) + "&offset_id=" + offsetId + "&limit=50");
      if (!r.ok) {
        if (r.status === 401) location.href = "/login";
        return;
      }
      var html = await r.text();
      var readMax = r.headers.get("X-Read-Outbox-Max-Id");
      if (!state.dialog || String(state.dialog.id) !== String(chatId)) return;
      if (!html.trim()) {
        state.olderDone = true;
      } else {
        els.messages.insertAdjacentHTML("afterbegin", html);
        groupMessages();
        renderChips();
        if (readMax) updateMessageTicks(readMax);
        els.messages.scrollTop = els.messages.scrollHeight - h;
        state.lastId = Math.max(state.lastId, maxMsgId());
        initVoicePlayers();
        saveChatCache();
      }
    } catch (err) { /* повтор на скролле */ } finally {
      state.loadingOlder = false;
    }
  }

  // ---------- Helpers for Column 5 / Media / CRM ----------
  function formatDuration(sec) {
    sec = Math.floor(sec || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  }

  function updateScrollBottomBtn() {
    var btn = document.getElementById("btn-scroll-bottom");
    var badge = document.getElementById("scroll-unread-badge");
    if (!btn || !els.messages) return;
    var dist = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
    if (dist > 150) {
      btn.hidden = false;
      if (badge) {
        if (state.unreadWhileScrolled > 0) {
          badge.textContent = state.unreadWhileScrolled > 99 ? "99+" : state.unreadWhileScrolled;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
    } else {
      btn.hidden = true;
      state.unreadWhileScrolled = 0;
      if (badge) badge.hidden = true;
    }
  }

  function onMessagesScroll() {
    if (els.messages.scrollTop < 60 && state.dialog && !state.olderDone && !state.loadingOlder) {
      loadOlder();
    }
    updateScrollBottomBtn();
  }

  var descNotesTimer = null;

  async function updateDescriptionPanel(d) {
    if (!d) return;
    var accName = normAcc(d.account_name || (state.account && state.account.name));
    
    // 1. Parallel background tasks for Column 5
    try { loadSharedMedia(state.activeMediaKind || "photo"); } catch(e) {}
    try { loadLeadProfile(d.id, accName, d.title); } catch(e) {}

    // 2. Initial UI setup from dialog object
    var avatarEl = document.getElementById("desc-avatar");
    var titleEl = document.getElementById("desc-title");
    var statusEl = document.getElementById("desc-status");
    var typeBadge = document.getElementById("desc-type-badge");
    
    if (avatarEl) {
      avatarEl.className = "desc-avatar av av-lg av-" + hashColor(String(d.id));
      avatarEl.innerHTML = esc((d.title[0] || "?").toUpperCase()) + avatarImg(accName, d.id);
    }
    if (titleEl) titleEl.textContent = d.title;
    
    var typeLabels = {
      private: "Личный чат",
      bot: "Бот",
      group: "Группа",
      supergroup: "Супергруппа",
      channel: "Канал"
    };
    if (typeBadge) typeBadge.textContent = typeLabels[d.type] || "Диалог";
    if (statusEl) {
      if (d.status_text) {
        statusEl.textContent = d.status_text;
        if (d.online) statusEl.classList.add("online");
        else statusEl.classList.remove("online");
      } else {
        statusEl.textContent = chatTypeLabel(d.type);
        statusEl.classList.remove("online");
      }
    }

    // Hide optional rows initially
    var rowUser = document.getElementById("desc-row-username");
    var rowPhone = document.getElementById("desc-row-phone");
    var rowBirthday = document.getElementById("desc-row-birthday");
    var rowBio = document.getElementById("desc-row-bio");
    var rowWorkhours = document.getElementById("desc-row-workhours");
    var rowLocation = document.getElementById("desc-row-location");
    var rowMembers = document.getElementById("desc-row-members");
    var rowInvite = document.getElementById("desc-row-invite");
    var cardChannel = document.getElementById("desc-channel-card");

    if (cardChannel) cardChannel.hidden = true;
    if (rowBirthday) rowBirthday.hidden = true;
    if (rowBio) rowBio.hidden = true;
    if (rowWorkhours) rowWorkhours.hidden = true;
    if (rowLocation) rowLocation.hidden = true;
    if (rowMembers) rowMembers.hidden = true;
    if (rowInvite) rowInvite.hidden = true;

    if (rowUser) {
      if (d.username) {
        var uLink = document.getElementById("desc-username");
        if (uLink) {
          uLink.textContent = "@" + d.username;
          uLink.href = "https://t.me/" + d.username;
        }
        rowUser.hidden = false;
      } else {
        rowUser.hidden = true;
      }
    }
    if (rowPhone) {
      if (d.phone) {
        var pLink = document.getElementById("desc-phone");
        var cleanP = String(d.phone).trim();
        var formattedP = cleanP.startsWith("+") ? cleanP : "+" + cleanP;
        if (pLink) {
          pLink.textContent = formattedP;
          pLink.href = "tel:" + formattedP;
        }
        rowPhone.hidden = false;
      } else {
        rowPhone.hidden = true;
      }
    }

    // 2. Load full chat info from backend
    if (accName) {
      try {
        var r = await apiFetch("/api/chat_info?account=" + encodeURIComponent(accName) + "&chat_id=" + d.id);
        if (r.ok) {
          var res = await r.json();
          var info = res.info || res;
          if (info.title && titleEl) titleEl.textContent = info.title;
          
          if (info.status_text && statusEl) {
            statusEl.textContent = info.status_text;
            if (info.online) statusEl.classList.add("online");
            else statusEl.classList.remove("online");

            // Also update main chat header subtitle if still on this dialog
            if (state.dialog && state.dialog.id === d.id && els.chatSub) {
              els.chatSub.textContent = info.status_text;
              if (info.online) {
                els.chatSub.style.color = "var(--accent)";
              } else {
                els.chatSub.style.color = "";
              }
            }
          }

          if (typeof info.online !== "undefined") {
            d.online = !!info.online;
            if (info.status_text) d.status_text = info.status_text;
            if (state.dialog && state.dialog.id === d.id) {
              state.dialog.online = !!info.online;
              if (info.status_text) state.dialog.status_text = info.status_text;
            }
            var dRow = els.dialogList.querySelector('.dlg-row[data-id="' + d.id + '"]');
            if (dRow) {
              var dAv = dRow.querySelector('.av');
              if (dAv) {
                var dDot = dAv.querySelector('.online-dot');
                if (d.online && d.type !== "saved") {
                  if (!dDot) {
                    dDot = document.createElement("span");
                    dDot.className = "online-dot";
                    dDot.setAttribute("title", "В сети");
                    dAv.appendChild(dDot);
                  }
                } else if (dDot) {
                  dDot.remove();
                }
              }
            }
          }

          if (info.username && rowUser) {
            var uLink = document.getElementById("desc-username");
            if (uLink) {
              uLink.textContent = "@" + info.username;
              uLink.href = "https://t.me/" + info.username;
            }
            rowUser.hidden = false;
          }

          if (info.phone && rowPhone) {
            var phoneEl = document.getElementById("desc-phone");
            var cleanPhone = String(info.phone).trim();
            var formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : "+" + cleanPhone;
            if (phoneEl) {
              phoneEl.textContent = formattedPhone;
              phoneEl.href = "tel:" + formattedPhone;
            }
            rowPhone.hidden = false;
          }

          if (info.birthday && rowBirthday) {
            var bdayEl = document.getElementById("desc-birthday");
            if (bdayEl) bdayEl.textContent = info.birthday;
            rowBirthday.hidden = false;
          } else if (rowBirthday) {
            rowBirthday.hidden = true;
          }

          if (info.work_hours && rowWorkhours) {
            var whEl = document.getElementById("desc-workhours");
            if (whEl) whEl.textContent = info.work_hours;
            rowWorkhours.hidden = false;
          } else if (rowWorkhours) {
            rowWorkhours.hidden = true;
          }

          if (info.location && rowLocation) {
            var locEl = document.getElementById("desc-location");
            if (locEl) locEl.textContent = info.location;
            rowLocation.hidden = false;
          } else if (rowLocation) {
            rowLocation.hidden = true;
          }

          if (info.personal_channel && cardChannel) {
            var ch = info.personal_channel;
            var chTitle = document.getElementById("desc-channel-title");
            var chSnippet = document.getElementById("desc-channel-snippet");
            var chSub = document.getElementById("desc-channel-sub");
            var chLink = document.getElementById("desc-channel-link");
            var chAv = document.getElementById("desc-channel-avatar");
            if (chTitle) chTitle.textContent = ch.title || "Канал";
            if (chSnippet) {
              if (ch.snippet) {
                chSnippet.textContent = ch.snippet;
                chSnippet.hidden = false;
              } else {
                chSnippet.hidden = true;
              }
            }
            if (chSub) chSub.textContent = ch.subscribers || "Канал";
            if (chLink) chLink.href = ch.link || ("https://t.me/" + (ch.username || ""));
            if (chAv) {
              var initial = (ch.title ? ch.title[0] : "К").toUpperCase();
              chAv.className = "desc-channel-avatar av av-" + hashColor(String(ch.id));
              chAv.innerHTML = esc(initial) + avatarImg(accName, ch.id);
            }
            cardChannel.onclick = function(e) {
              var targetLink = ch.link || ("https://t.me/" + (ch.username || ""));
              if (targetLink && !e.target.closest("a")) {
                window.open(targetLink, "_blank");
              }
            };
            cardChannel.hidden = false;
          } else if (cardChannel) {
            cardChannel.onclick = null;
            cardChannel.hidden = true;
          }

          var bioText = info.bio || info.description;
          if (bioText && rowBio) {
            var bioEl = document.getElementById("desc-bio");
            if (bioEl) {
              // Convert URLs to clickable links and preserve linebreaks
              var urlPattern = /(https?:\/\/[^\s<]+|t\.me\/[^\s<]+)/gi;
              bioEl.innerHTML = esc(bioText).replace(urlPattern, function(url) {
                var href = url.startsWith("http") ? url : "https://" + url;
                return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="text-accent">' + url + '</a>';
              });
            }
            rowBio.hidden = false;
          } else if (rowBio) {
            rowBio.hidden = true;
          }

          if (info.members_count && rowMembers) {
            var memEl = document.getElementById("desc-members");
            if (memEl) memEl.textContent = Number(info.members_count).toLocaleString("ru-RU") + " участников";
            rowMembers.hidden = false;
          } else if (rowMembers) {
            rowMembers.hidden = true;
          }

          if (info.invite_link && rowInvite) {
            var invEl = document.getElementById("desc-invite");
            if (invEl) {
              invEl.textContent = info.invite_link;
              invEl.href = info.invite_link;
            }
            rowInvite.hidden = false;
          } else if (rowInvite) {
            rowInvite.hidden = true;
          }
        }
      } catch (err) {
        console.error("Error fetching chat info:", err);
      }
    }
  }

  var updateCrmPanel = updateDescriptionPanel;

  async function loadLeadProfile(chatId, accName, title) {
    try {
      if (!state.leadGroups || !state.leadGroups.length) {
        await loadLeadGroups();
      }

      var r = await apiFetch("/api/lead_profile?chat_id=" + chatId);
      var profile = { notes: "", group_ids: [] };
      if (r.ok) {
        profile = await r.json();
      }
      state.currentLeadProfile = profile;

      var notesEl = document.getElementById("desc-notes");
      var statusEl = document.getElementById("desc-notes-status");
      if (notesEl) notesEl.value = profile.notes || "";
      if (statusEl) statusEl.textContent = "Сохранено";

      renderLeadGroupsChips();
      updateAddGroupSelect();
    } catch (err) {
      console.error("Error loading lead profile:", err);
    }
  }

  function renderLeadGroupsChips() {
    var chipsContainer = document.getElementById("desc-lead-groups-chips");
    if (!chipsContainer) return;
    
    var profile = state.currentLeadProfile;
    var assignedIds = (profile && profile.group_ids) || [];
    var allGroups = state.leadGroups || [];

    if (!assignedIds.length) {
      chipsContainer.innerHTML = '<span class="lead-chip-empty" style="font-size: 12px; color: var(--text-3);">Группы не присвоены</span>';
      return;
    }

    var html = "";
    assignedIds.forEach(function(gid) {
      var g = allGroups.find(function(x) { return x.id === gid; });
      if (g) {
        var color = g.color || "#00a8ff";
        html += '<span class="lead-group-chip" style="--chip-color:' + esc(color) + '; border-color:' + esc(color) + '; background:' + esc(color) + '22;">' +
          esc(g.name) + ' <span class="lead-chip-remove" data-group-id="' + g.id + '" title="Удалить из группы">×</span></span>';
      }
    });
    chipsContainer.innerHTML = html;
  }

  function updateAddGroupSelect() {
    var select = document.getElementById("desc-add-group-select");
    if (!select) return;

    var profile = state.currentLeadProfile;
    var assignedIds = (profile && profile.group_ids) || [];
    var allGroups = state.leadGroups || [];

    var unassigned = allGroups.filter(function(g) {
      return assignedIds.indexOf(g.id) === -1;
    });

    var html = '<option value="">+ Добавить в группу...</option>';
    unassigned.forEach(function(g) {
      html += '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    });
    select.innerHTML = html;
  }

  async function saveLeadProfile(newGroupIds, newNotes) {
    if (!state.dialog) return;
    var accName = state.dialog.account_name || (state.account && state.account.name);
    var profile = state.currentLeadProfile || { group_ids: [], notes: "" };
    
    if (newGroupIds !== undefined) profile.group_ids = newGroupIds;
    if (newNotes !== undefined) profile.notes = newNotes;

    var statusEl = document.getElementById("desc-notes-status");
    if (statusEl) statusEl.textContent = "Сохранение...";

    try {
      var r = await apiFetch("/api/lead_profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: state.dialog.id,
          account_name: accName,
          title: state.dialog.title,
          notes: profile.notes || "",
          group_ids: profile.group_ids || []
        })
      });
      if (r.ok) {
        state.currentLeadProfile = profile;
        if (statusEl) statusEl.textContent = "Сохранено ✓";
        renderLeadGroupsChips();
        updateAddGroupSelect();
      } else {
        if (statusEl) statusEl.textContent = "Ошибка сохранения";
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = "Ошибка сети";
    }
  }

  async function loadLeadGroups() {
    try {
      var r = await apiFetch("/api/lead_groups");
      if (r.ok) {
        var data = await r.json();
        state.leadGroups = data.groups || [];
        updateAddGroupSelect();
      }
    } catch (err) {
      console.error("Error loading lead groups:", err);
    }
  }

  function openLeadGroupsModal() {
    var modal = document.getElementById("modal-lead-groups");
    if (!modal) return;
    modal.hidden = false;
    renderLeadGroupsManageList();
  }

  function closeLeadGroupsModal() {
    var modal = document.getElementById("modal-lead-groups");
    if (modal) modal.hidden = true;
  }

  async function renderLeadGroupsManageList() {
    await loadLeadGroups();
    var listEl = document.getElementById("lead-groups-manage-list");
    if (!listEl) return;

    if (!state.leadGroups || !state.leadGroups.length) {
      listEl.innerHTML = '<div style="color: var(--text-3); font-size: 13px; text-align: center; padding: 15px 0;">Групп пока нет</div>';
      return;
    }

    var html = "";
    state.leadGroups.forEach(function(g) {
      var countStr = g.count ? ' (' + g.count + ' лидов)' : '';
      html += '<div class="lead-group-row-item">' +
        '<div class="lead-group-row-badge">' +
        '<span class="lead-group-row-dot" style="background:' + esc(g.color || '#00a8ff') + ';"></span>' +
        '<span style="color:#fff;">' + esc(g.name) + '</span>' +
        '<span style="color:var(--text-3); font-size:11px; font-weight:400;">' + countStr + '</span>' +
        '</div>' +
        '<button type="button" class="icon-btn btn-delete-lead-group" data-id="' + g.id + '" title="Удалить группу" style="color:var(--danger); width:28px; height:28px;">' +
        '<svg class="svg-ico" viewBox="0 0 24 24" style="width:16px; height:16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
        '</button>' +
        '</div>';
    });
    listEl.innerHTML = html;
  }

  function renderSharedMediaItems(listContainer, items, kind, accName, chatId) {
    if (!items || !items.length) {
      var emptyLabels = {
        photo: "Нет фото и видео",
        document: "Нет файлов",
        url: "Нет ссылок",
        voice: "Нет голосовых"
      };
      listContainer.innerHTML = '<div class="sm-empty" style="text-align: center; color: var(--text-3); font-size: 12px; padding: 15px 0;">' +
        (emptyLabels[kind] || "Нет вложений") + '</div>';
      return;
    }

    if (kind === "photo") {
      var html = '<div class="sm-grid">';
      items.forEach(function(item) {
        var mediaSrc = "/api/media?account=" + encodeURIComponent(accName) + "&chat_id=" + chatId + "&message_id=" + item.id + (item.type === "video" ? "&kind=video" : "&kind=photo");
        html += '<div class="sm-grid-item media-preview-trigger" data-type="' + esc(item.type) + '" data-src="' + esc(mediaSrc) + '" data-msg-id="' + item.id + '" data-caption="' + esc(item.caption || "") + '" title="' + esc(item.caption || timeLabel(item.date)) + '">';
        if (item.type === "video") {
          html += '<video src="' + esc(mediaSrc) + '#t=0.1" preload="metadata" muted playsinline onerror="window.onSharedMediaItemError && window.onSharedMediaItemError(this)"></video>';
        } else {
          html += '<img src="' + esc(mediaSrc) + '" loading="lazy" alt="Media" onerror="window.onSharedMediaItemError && window.onSharedMediaItemError(this)">';
        }
        html += '</div>';
      });
      html += '</div>';
      listContainer.innerHTML = html;
    } else if (kind === "document") {
      var html = '<div class="sm-list">';
      items.forEach(function(item) {
        var downloadUrl = "/api/media?account=" + encodeURIComponent(accName) + "&chat_id=" + chatId + "&message_id=" + item.id + "&kind=document&download=1";
        var sizeStr = item.file_size ? formatFileSize(item.file_size) : "";
        html += '<a class="sm-list-item" href="' + esc(downloadUrl) + '" download target="_blank">' +
          '<div class="sm-list-ico"><svg class="svg-ico" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>' +
          '<div class="sm-list-meta">' +
          '<div class="sm-list-title">' + esc(item.file_name || "Документ") + '</div>' +
          '<div class="sm-list-sub">' + esc(sizeStr ? sizeStr + ' · ' : '') + esc(timeLabel(item.date)) + '</div>' +
          '</div></a>';
      });
      html += '</div>';
      listContainer.innerHTML = html;
    } else if (kind === "url") {
      var html = '<div class="sm-list">';
      items.forEach(function(item) {
        var linkUrl = item.url || item.web_url || "";
        var linkTitle = item.web_title || item.title || linkUrl;
        var linkDesc = item.caption || item.text || "";
        html += '<a class="sm-list-item" href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<div class="sm-list-ico" style="background: rgba(181, 60, 255, 0.12); color: var(--accent-purple);"><svg class="svg-ico" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>' +
          '<div class="sm-list-meta">' +
          '<div class="sm-list-title">' + esc(linkTitle) + '</div>' +
          '<div class="sm-list-sub">' + esc(linkDesc ? linkDesc.substring(0, 40) + ' · ' : '') + esc(timeLabel(item.date)) + '</div>' +
          '</div></a>';
      });
      html += '</div>';
      listContainer.innerHTML = html;
    } else if (kind === "voice") {
      var html = '<div class="sm-list">';
      items.forEach(function(item) {
        var voiceSrc = "/api/media?account=" + encodeURIComponent(accName) + "&chat_id=" + chatId + "&message_id=" + item.id;
        var durStr = item.duration ? formatDuration(item.duration) : "";
        html += '<div class="sm-list-item" style="cursor: pointer;" onclick="var a = new Audio(\'' + esc(voiceSrc) + '\'); a.play();">' +
          '<div class="sm-list-ico" style="background: rgba(46, 213, 115, 0.12); color: #2ed573;"><svg class="svg-ico" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg></div>' +
          '<div class="sm-list-meta">' +
          '<div class="sm-list-title">Голосовое сообщение ' + esc(durStr) + '</div>' +
          '<div class="sm-list-sub">' + esc(timeLabel(item.date)) + '</div>' +
          '</div></div>';
      });
      html += '</div>';
      listContainer.innerHTML = html;
    }
  }

  async function loadSharedMedia(kind) {
    state.activeMediaKind = kind || "photo";
    var listContainer = document.getElementById("desc-shared-media-list");
    if (!listContainer) return;
    if (!state.dialog) {
      listContainer.innerHTML = '<div class="sm-empty" style="text-align: center; color: var(--text-3); font-size: 12px; padding: 15px 0;">Выберите диалог</div>';
      return;
    }

    var accName = normAcc(state.dialog.account_name || (state.account && state.account.name));
    if (!accName) return;

    var curChatId = state.dialog.id;
    state.sharedMediaCache = state.sharedMediaCache || {};
    var smKey = accName + ":" + curChatId + ":" + state.activeMediaKind;
    var cached = state.sharedMediaCache[smKey];

    if (cached) {
      renderSharedMediaItems(listContainer, cached, state.activeMediaKind, accName, curChatId);
    } else {
      listContainer.innerHTML = '<div style="text-align: center; color: var(--text-2); font-size: 12px; padding: 15px 0;"><span class="spin-mini" style="margin-right:6px;">⏳</span> Загрузка...</div>';
    }

    try {
      var r = await apiFetch("/api/shared_media?account=" + encodeURIComponent(accName) +
        "&chat_id=" + curChatId + "&kind=" + encodeURIComponent(state.activeMediaKind));
      if (!r.ok) {
        if (!cached) listContainer.innerHTML = '<div class="sm-empty" style="text-align: center; color: var(--text-3); font-size: 12px; padding: 15px 0;">Нет данных</div>';
        return;
      }
      var data = await r.json();
      var items = data.items || [];
      if (!state.dialog || String(state.dialog.id) !== String(curChatId)) return;

      if (items.length) {
        state.sharedMediaCache[smKey] = items;
      }
      renderSharedMediaItems(listContainer, items, state.activeMediaKind, accName, curChatId);
    } catch (err) {
      if (!cached) listContainer.innerHTML = '<div class="sm-empty" style="text-align: center; color: var(--text-3); font-size: 12px; padding: 15px 0;">Ошибка загрузки</div>';
    }
  }

  function selectDialog(d) {
    if (!d) return;
    if (state.dialog && state.dialog.id !== d.id) {
      try { saveChatCache(); } catch (e) {}
    }
    if (d.account_name) {
      var acc = state.accounts && state.accounts.find(function (x) {
        var xn = String(x.name || "").replace(/^\+/, "");
        var xp = String(x.phone || "").replace(/^\+/, "");
        var dn = String(d.account_name || "").replace(/^\+/, "");
        return xn === dn || xp === dn;
      });
      if (acc && (!state.account || state.account.name !== acc.name)) {
        state.account = acc;
        try { renderAccounts(); } catch(err){}
      }
    }
    state.dialog = d;
    state.chatGen++;
    if (state.chatAbort) { state.chatAbort.abort(); state.chatAbort = null; }
    pauseAllVoice();
    stopPolling();
    delete els.composerInput.dataset.editId; setReplyTarget(null);

    if (d.type === "saved") {
      els.chatAvatar.className = "conv-avatar av av-lg";
      els.chatAvatar.style.background = "linear-gradient(135deg, #00a8ff, #0052cc)";
      els.chatAvatar.style.display = "flex";
      els.chatAvatar.style.alignItems = "center";
      els.chatAvatar.style.justifyContent = "center";
      els.chatAvatar.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px; height:22px; fill:#fff;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
      els.chatTitle.textContent = "Избранное";
      els.chatSub.textContent = "ваши сохраненные сообщения";
      els.chatSub.style.color = "";
    } else {
      els.chatAvatar.style.background = "";
      els.chatAvatar.style.display = "";
      els.chatAvatar.className = "conv-avatar av av-lg av-" + hashColor(String(d.id));
      els.chatAvatar.innerHTML = esc((d.title[0] || "?").toUpperCase()) +
        avatarImg(d.account_name || (state.account && state.account.name), d.id);
      els.chatTitle.textContent = d.title;
      if (d.status_text) {
        els.chatSub.textContent = d.status_text;
        if (d.online) els.chatSub.style.color = "var(--accent)";
        else els.chatSub.style.color = "";
      } else {
        els.chatSub.textContent = (d.unread ? d.unread + " новых · " : "") + chatTypeLabel(d.type);
        els.chatSub.style.color = "";
      }
    }

    var curAccName = normAcc(d.account_name || (state.account ? state.account.name : ""));

    // Мгновенное переключение активного диалога без лишней перерисовки всего списка
    d.unread = 0;
    var prevActive = els.dialogList.querySelector(".dlg-row.active");
    if (prevActive) prevActive.classList.remove("active");
    var curActiveRow = els.dialogList.querySelector('.dlg-row[data-id="' + d.id + '"]');
    if (curActiveRow) {
      curActiveRow.classList.add("active");
      var unreadBadge = curActiveRow.querySelector(".unread");
      if (unreadBadge) unreadBadge.remove();
    }

    setView("chat");
    els.composer.hidden = false;
    els.messages.hidden = false;
    if (els.chatEmpty) els.chatEmpty.hidden = true;
    els.composerInput.value = "";
    try { autoSize(); } catch (e) {}
    try { updateComposerMode(); } catch (e) {}

    // Мгновенное отображение из кэша (0 мс)
    var key = curAccName + ":" + d.id;
    var hasCachedHtml = restoreChatCache(key);
    if (hasCachedHtml) {
      loadMessages(false);
    } else {
      els.messages.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px;"><span class="spin-mini" style="margin-right:8px;">⏳</span> Загрузка...</div>';
      loadMessages(true);
    }

    // Фоновые неблокирующие задачи
    if (curAccName) {
      try {
        var fd = new FormData();
        fd.append("account", curAccName);
        fd.append("chat_id", d.id);
        apiFetch("/api/read_history", { method: "POST", body: fd }).catch(function(){});
      } catch (e) {}
    }
    setTimeout(function() {
      try { loadPinnedMessage(curAccName, d.id); } catch (e) {}
      if (typeof updateCrmPanel === "function") {
        try { updateCrmPanel(d); } catch (e) {}
      }
    }, 10);

    try { startPolling(); } catch (e) {}
    try { els.composerInput.focus(); } catch (e) {}
  }

  // ---------- composer ----------
  function autoSize() {
    if (!els.composerInput) return;
    els.composerInput.style.height = "auto";
    var sh = els.composerInput.scrollHeight;
    var h = Math.min(Math.max(sh, 24), 140);
    els.composerInput.style.height = h + "px";
  }

  function onSend(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!state.account || !state.dialog) return;
    var text = els.composerInput.value.trim();
    if (!text) return;
    var fd = new FormData();
    fd.append("account", state.account.name);
    fd.append("chat_id", state.dialog.id);
    
      var editId = els.composerInput.dataset.editId;
      if (editId) {
          apiFetch("/api/edit_message", {
              method: "POST",
              body: new URLSearchParams({
                  account: state.account.name,
                  chat_id: state.dialog.id,
                  message_id: editId,
                  message_text: text
              })
          }).then(function(r) { return r.json(); }).then(function(data) {
              if (data.ok) {
                  delete els.composerInput.dataset.editId;
                  els.composerInput.value = "";
                  delete els.composerInput.dataset.editId; setReplyTarget(null);
                  loadMessages();
              } else {
                  toast(data.error);
              }
          });
          return;
      }

      fd.append("message_text", text);
    if (state.replyTarget && state.replyTarget.id) {
      fd.append("reply_to_message_id", state.replyTarget.id);
    }
    els.composerInput.value = "";
    delete els.composerInput.dataset.editId; setReplyTarget(null);
    autoSize();
    updateComposerMode();
    els.sendBtn.classList.add("sending");
    apiFetch("/api/send_message", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { toast(data.error || "Не удалось отправить"); els.composerInput.value = text; }
        else { pollMessages(); }
      })
      .catch(function () { toast("Соединение с сервером потеряно"); els.composerInput.value = text; })
      .finally(function () {
        els.sendBtn.classList.remove("sending");
        updateComposerMode();
      });
  }

  // ---------- удаление аккаунта ----------
  function openDeleteModal() {
    if (!state.account) return;
    els.deleteAccountName.textContent = state.account.name;
    els.deleteModalOverlay.hidden = false;
  }

  function closeDeleteModal() {
    els.deleteModalOverlay.hidden = true;
  }

  function confirmDeleteAccount() {
    if (!state.account) return;
    var accName = state.account.name;
    closeDeleteModal();
    toast("Удаление аккаунта " + accName + "…");
    var fd = new FormData();
    fd.append("account", accName);
    apiFetch("/api/delete_account", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) toast(data.error || "Не удалось удалить аккаунт");
        else {
          toast(data.message || "Аккаунт удалён");
          state.accounts = state.accounts.filter(function (a) { return a.name !== accName; });
          state.account = null;
          state.dialog = null;
          delete state.chatCache[accName];
          renderAccounts();
          setView("accounts");
          els.deleteAccountHeaderBtn.hidden = true;
          if (els.btnGetTelegramCode) els.btnGetTelegramCode.hidden = true;
        }
      })
      .catch(function () { toast("Ошибка сети при удалении аккаунта"); });
  }

  // ---------- навигация ----------
async function selectAccount(name) {
    var normN = normAcc(name);
    var a = state.accounts.find(function (x) {
        return normAcc(x.name) === normN || normAcc(x.phone) === normN;
    });
    if (!a) return;
    state.account = a;
    state.dialog = null;

    var btnAllInbox = document.getElementById("btn-all-inbox");
    if (btnAllInbox) btnAllInbox.classList.remove("active");

    // Надежно скрываем общую ленту через изменение стиля
    var feedWrap = document.getElementById("globalFeedWrap");
    if (feedWrap) feedWrap.style.display = "none";
    els.dialogList.hidden = false;

    state.chatGen++;
    if (state.chatAbort) { state.chatAbort.abort(); state.chatAbort = null; }
    stopPolling();
    resetChat();

    // Мгновенный показ из кэша (0 мс задержки!)
    var cacheEntry = state.accountDialogsCache ? (state.accountDialogsCache[normN] || state.accountDialogsCache[name] || state.accountDialogsCache[a.name]) : null;
    var hasCache = !!cacheEntry;
    if (hasCache) {
        state.dialogs = cacheEntry.items || [];
        state.dialogOffset = cacheEntry.offset || 0;
        state.dialogTotal = cacheEntry.total || 0;
        renderDialogs();
    } else {
        state.dialogs = [];
        state.dialogOffset = 0;
        renderDialogs();
    }

    renderAccounts();
    var d = accountDisplay(a);
    els.dialogHeadTitle.textContent = d.full;
    els.dialogHeadSub.textContent = d.sub || a.name;
    els.deleteAccountHeaderBtn.hidden = false;
    if (els.btnGetTelegramCode) els.btnGetTelegramCode.hidden = false;
    setView("dialogs");

    // Фоновая подгрузка без мерцания, если кэш уже был отрисован
    await loadDialogs(false, hasCache);
}

  function closeModal() {
    els.modalOverlay.hidden = true;
  }

  // ---------- обработка ошибок загрузки медиа ----------
  window.retryMediaLoad = function(btn) {
    var box = btn.closest(".media-unavailable-box") || btn.closest(".media-unavailable");
    if (!box) return;
    var tag = box._originalTag || "IMG";
    var src = box._originalSrc || "";
    if (!src) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spin-mini">⏳</span> Загрузка...';

    var newEl = document.createElement(tag);
    if (box._originalClass) newEl.className = box._originalClass;
    if (box._originalStyle) newEl.setAttribute("style", box._originalStyle);
    if (tag === "VIDEO") {
      newEl.controls = true;
      newEl.preload = "metadata";
      newEl.playsInline = true;
    } else {
      newEl.loading = "lazy";
      newEl.alt = "Медиа";
    }
    newEl._retryCount = 0;
    var cleanSrc = src.replace(/([?&])_retry=\d+/g, "");
    var sep = cleanSrc.indexOf("?") === -1 ? "?" : "&";
    newEl.src = cleanSrc + sep + "_retry=" + Date.now();
    box.replaceWith(newEl);
  };

  window.onSharedMediaItemError = function(el) {
    if (!el) return;
    el._retryCount = (el._retryCount || 0) + 1;
    if (el._retryCount <= 2) {
      var src = el.currentSrc || el.src || "";
      if (src) {
        setTimeout(function() {
          if (!el.isConnected) return;
          var cleanSrc = src.replace(/([?&])_retry=\d+/g, "");
          var sep = cleanSrc.indexOf("?") === -1 ? "?" : "&";
          el.src = cleanSrc + sep + "_retry=" + Date.now();
          if (el.tagName === "VIDEO" && typeof el.load === "function") {
            try { el.load(); } catch(err){}
          }
        }, el._retryCount * 1200);
        return;
      }
    }
    var parent = el.closest(".sm-grid-item");
    if (parent && !parent.querySelector(".sm-item-fallback")) {
      var fallback = document.createElement("div");
      fallback.className = "sm-item-fallback";
      fallback.title = "Ошибка загрузки. Нажмите чтобы повторить";
      fallback._originalTag = el.tagName;
      fallback._originalSrc = el.currentSrc || el.src || "";
      fallback.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><span style="font-size:10px; margin-top:2px;">Повторить</span>';
      fallback.onclick = function(ev) {
        ev.stopPropagation();
        window.retrySharedMediaItem(fallback);
      };
      el.replaceWith(fallback);
    }
  };

  window.retrySharedMediaItem = function(fallback) {
    var tag = fallback._originalTag || "IMG";
    var src = fallback._originalSrc || "";
    if (!src) return;
    var newEl = document.createElement(tag);
    if (tag === "VIDEO") {
      newEl.preload = "metadata";
      newEl.muted = true;
      newEl.playsInline = true;
    } else {
      newEl.loading = "lazy";
      newEl.alt = "Media";
    }
    newEl.onerror = function() { window.onSharedMediaItemError(this); };
    newEl._retryCount = 0;
    var cleanSrc = src.replace(/([?&])_retry=\d+/g, "");
    var sep = cleanSrc.indexOf("?") === -1 ? "?" : "&";
    newEl.src = cleanSrc + sep + "_retry=" + Date.now();
    fallback.replaceWith(newEl);
  };

  function onMediaError(e) {
    var el = e.target;
    if (!el || (el.tagName !== "IMG" && el.tagName !== "VIDEO")) return;
    if (e.currentTarget && !e.currentTarget.contains(el)) return;

    // Аватарки не заменяем на заглушку ошибки, а просто скрываем
    if (el.classList.contains("msg-avatar") || el.classList.contains("avatar") || el.classList.contains("dialog-avatar")) {
      el.style.display = "none";
      return;
    }

    // Превью ссылок: если картинка не загрузилась, убираем только картинку (текст и ссылка остаются)
    if (el.classList.contains("webpage-thumb")) {
      el.remove();
      return;
    }

    // Авто-повтор до 2 раз с задержкой 1.2s, 2.4s (пока бэкенд выкачивает файл с MTProto)
    el._retryCount = (el._retryCount || 0) + 1;
    if (el._retryCount <= 2) {
      var currentSrc = el.currentSrc || el.src || "";
      if (currentSrc) {
        var delay = el._retryCount * 1200;
        setTimeout(function() {
          if (!el.isConnected) return;
          var cleanSrc = currentSrc.replace(/([?&])_retry=\d+/g, "");
          var sep = cleanSrc.indexOf("?") === -1 ? "?" : "&";
          el.src = cleanSrc + sep + "_retry=" + Date.now();
          if (el.tagName === "VIDEO" && typeof el.load === "function") {
            try { el.load(); } catch(err){}
          }
        }, delay);
        return;
      }
    }

    if (el._mediaErrorHandled) return;
    el._mediaErrorHandled = true;

    var holder = document.createElement("div");
    holder.className = "media-unavailable-box";
    if (el.classList.contains("bubble-video-note")) holder.className += " media-unavailable-circle";
    holder._originalTag = el.tagName;
    holder._originalSrc = el.currentSrc || el.src || "";
    holder._originalClass = el.className;
    holder._originalStyle = el.getAttribute("style") || "";
    
    holder.innerHTML = '<div class="media-err-title">Медиа недоступно</div>' +
      '<button type="button" class="media-retry-btn" onclick="window.retryMediaLoad(this)">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> ' +
      'Повторить</button>';
    el.replaceWith(holder);
  }

// Загрузка списка групп с сервера
async function loadGroups() {
    try {
        var r = await apiFetch("/api/groups");
        var data = await r.json();
        if (data.ok) {
            state.groups = data.groups || []; // Сохраняем группы в общую память
            
             renderGroups(); 
        }
    } catch (e) {
        console.error("Ошибка при загрузке групп:", e);
    }
}


// === INJECTED FINAL ===
  // === QUICK REACTIONS POPOVER ===
  var qrPopover = document.getElementById("quick-reactions-popover");
  var activeReactMsgId = null;

  function openQuickReactions(anchorEl, msgId) {
    if (!qrPopover) qrPopover = document.getElementById("quick-reactions-popover");
    if (!qrPopover) return;
    activeReactMsgId = msgId;
    qrPopover.hidden = false;

    var rect = anchorEl.getBoundingClientRect();
    var popRect = qrPopover.getBoundingClientRect();
    var popW = popRect.width || 480;
    var popH = popRect.height || 44;

    // Center horizontally over anchorEl
    var left = rect.left + (rect.width / 2) - (popW / 2);
    // Clamp horizontally to stay within viewport
    var pad = 12;
    if (left < pad) left = pad;
    if (left + popW > window.innerWidth - pad) {
      left = window.innerWidth - popW - pad;
    }

    // Position above anchorEl, or flip below if near viewport top
    var top = rect.top - popH - 10;
    if (top < 10) {
      top = rect.bottom + 10;
    }
    qrPopover.style.top = Math.round(top) + "px";
    qrPopover.style.left = Math.round(left) + "px";
  }

  function closeQuickReactions() {
    if (qrPopover) qrPopover.hidden = true;
    activeReactMsgId = null;
  }

  document.addEventListener("click", function (e) {
    if (!qrPopover || qrPopover.hidden) return;
    var emojiBtn = e.target.closest ? e.target.closest(".qr-emoji-btn") : null;
    if (emojiBtn && activeReactMsgId && (state.dialog || state.account)) {
      var em = emojiBtn.dataset.emoji;
      var mId = activeReactMsgId;
      var curAcc = (state.dialog && state.dialog.account_name) || (state.account ? state.account.name : "");
      var curChatId = state.dialog ? state.dialog.id : null;
      if (!curAcc || !curChatId) return;
      closeQuickReactions();
      apiFetch("/api/react_message", {
        method: "POST",
        body: new URLSearchParams({ account: curAcc, chat_id: curChatId, message_id: mId, emoji: em })
      }).then(function () { loadMessages(); });
      return;
    }
    if (!e.target.closest("#quick-reactions-popover") && !e.target.closest(".msg-quick-react-btn")) {
      closeQuickReactions();
    }
  });

  // === CONTEXT MENU ===
  var currentMenu = null;
  function closeContextMenu() {
    if (currentMenu) { currentMenu.remove(); currentMenu = null; }
  }
  document.addEventListener("click", closeContextMenu);

  function openContextMenu(e, msgEl) {
    e.preventDefault();
    closeContextMenu();

    var msgId = msgEl.dataset.id;
    var side = msgEl.dataset.side; // 'out' or 'in'
    var textEl = msgEl.querySelector(".msg-text");
    var isTextOnly = textEl && !msgEl.querySelector(".msg-media"); // naive check

    var menu = document.createElement("div");
    menu.className = "context-menu";

    // Reactions
    var reactions = document.createElement("div");
    reactions.className = "context-menu-reactions";
    var emojis = ["👍", "❤️", "🔥", "🎉", "🤩", "👏", "😁", "🤔", "🤯", "😱", "🙏", "👎", "💩", "💯"];
    emojis.forEach(function(em) {
        var rel = document.createElement("div");
        rel.className = "context-menu-reaction";
        rel.textContent = em;
        rel.onclick = function(ev) {
            ev.stopPropagation();
            closeContextMenu();
            apiFetch("/api/react_message", {
                method: "POST",
                body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, message_id: msgId, emoji: em })
            }).then(()=> loadMessages());
        };
        reactions.appendChild(rel);
    });
    menu.appendChild(reactions);

    // Select
    var selectItem = document.createElement("div");
    selectItem.className = "context-menu-item";
    selectItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> Выбрать';
    selectItem.onclick = function() { toggleSelectionMode(msgId); closeContextMenu(); };
    menu.appendChild(selectItem);

    // Forward
    var fwdItem = document.createElement("div");
    fwdItem.className = "context-menu-item";
    fwdItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M14 5v4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11v-4.1l7 7-7 7z"/></svg> Переслать';
    fwdItem.onclick = function() {
        closeContextMenu();
        toggleSelectionMode(msgId);
        document.getElementById("btn-sel-forward").click();
    };
    menu.appendChild(fwdItem);

    // Save to quick replies / scripts if voice or video note
    var vVoice = msgEl.querySelector(".tg-voice");
    var vNote = msgEl.querySelector(".bubble-video-note, .vnote-wrap");
    if (vVoice || vNote) {
        var qrType = vNote ? "video_note" : "voice";
        var dur = 0;
        if (vVoice && vVoice.dataset.dur) dur = parseInt(vVoice.dataset.dur, 10);
        else if (vNote) {
            var qrBtnEl = msgEl.querySelector(".btn-save-qr");
            if (qrBtnEl && qrBtnEl.dataset.dur) dur = parseInt(qrBtnEl.dataset.dur, 10);
        }
        var saveQrItem = document.createElement("div");
        saveQrItem.className = "context-menu-item";
        saveQrItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> В скрипты (заготовки)';
        saveQrItem.onclick = function() {
            closeContextMenu();
            if (window.openSaveToQrModal) {
                window.openSaveToQrModal(msgId, qrType, dur);
            }
        };
        menu.appendChild(saveQrItem);
    }
    
    // Pin
    var pinItem = document.createElement("div");
    pinItem.className = "context-menu-item";
    pinItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M16 11V5.5C16 4.67 15.33 4 14.5 4h-5C8.67 4 8 4.67 8 5.5V11l-2 3v2h5.5v5l.5 1 .5-1v-5H18v-2l-2-3z"/></svg> Закрепить';
    pinItem.onclick = function() {
        closeContextMenu();
        apiFetch("/api/pin_message", {
            method: "POST",
            body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, message_id: msgId })
        }).then(r=>r.json()).then(res=>{
            if (res.ok) toast("Сообщение закреплено");
            else toast("Ошибка: " + res.error);
        });
    };
    menu.appendChild(pinItem);

    // Unpin
    var unpinItem = document.createElement("div");
    unpinItem.className = "context-menu-item";
    unpinItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M2.38 1.73L1.11 3l4.5 4.5V11l-2 3v2h5.5v5l.5 1 .5-1v-5H18l-1.5-1.5 4.25-4.25 1.27-1.27-19.64-19.64z"/></svg> Открепить';
    unpinItem.onclick = function() {
        closeContextMenu();
        apiFetch("/api/unpin_message", {
            method: "POST",
            body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, message_id: msgId })
        }).then(r=>r.json()).then(res=>{
            if (res.ok) toast("Сообщение откреплено");
            else toast("Ошибка: " + res.error);
        });
    };
    menu.appendChild(unpinItem);

    // Delete
    var delItem = document.createElement("div");
    delItem.className = "context-menu-item danger";
    delItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Удалить';
    delItem.onclick = function() {
        closeContextMenu();
        if (!confirm("Удалить сообщение?")) return;
        apiFetch("/api/delete_message", {
            method: "POST",
            body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, message_ids: msgId })
        }).then(() => loadMessages());
    };
    menu.appendChild(delItem);

    // Reply
    var replyItem = document.createElement("div");
    replyItem.className = "context-menu-item";
    replyItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg> Ответить';
    replyItem.onclick = function() {
        var senderEl = msgEl.querySelector(".msg-sender");
        var authorName = senderEl ? senderEl.textContent : (side === "out" ? "Вы" : "");
        var text = textEl ? textEl.innerText.split("\n")[0] : "";
        setReplyTarget({ id: msgId, author: authorName, text: text });
        els.composerInput.focus();
        closeContextMenu();
    };
    menu.appendChild(replyItem);

    if (side === "out") {
        var editItem = document.createElement("div");
        editItem.className = "context-menu-item";
        editItem.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Изменить';
        editItem.onclick = function() {
            if (!isTextOnly) { toast("Можно редактировать только текстовые сообщения"); return; }
            var rawText = "";
            var textNodes = textEl.childNodes;
            for (var i=0; i<textNodes.length; i++) {
                if (textNodes[i].nodeType === 3) rawText += textNodes[i].nodeValue; // naive text extraction
                if (textNodes[i].tagName === "BR") rawText += "\n";
            }
            els.composerInput.value = rawText;
            els.composerInput.dataset.editId = msgId;
            els.replyBarTitle.textContent = "Редактирование";
            els.replyBarText.textContent = rawText;
            els.replyBar.hidden = false;
            updateComposerMode();
            closeContextMenu();
        };
        menu.appendChild(editItem);
    }

    var x = e.clientX;
    var y = e.clientY;
    // ensure menu stays within viewport
    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x -= rect.width;
    if (y + rect.height > window.innerHeight) y -= rect.height;

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    currentMenu = menu;
  }

  // === SELECTION MODE ===
  state.selectionMode = false;
  state.selectedMsgs = new Set();

  function toggleSelectionMode(forceMsgId) {
      state.selectionMode = !state.selectionMode;
      if (!state.selectionMode) {
          state.selectedMsgs.clear();
          document.querySelectorAll(".msg.selected").forEach(el => el.classList.remove("selected"));
      } else {
          if (forceMsgId) toggleMsgSelection(forceMsgId);
      }
      
      document.body.classList.toggle("selection-mode", state.selectionMode);
      document.getElementById("selection-bar").hidden = !state.selectionMode;
  }

  function toggleMsgSelection(msgId) {
      if (!state.selectionMode) return;
      var msgEl = document.querySelector('.msg[data-id="'+msgId+'"]');
      if (!msgEl) return;
      if (state.selectedMsgs.has(msgId)) {
          state.selectedMsgs.delete(msgId);
          msgEl.classList.remove("selected");
      } else {
          state.selectedMsgs.add(msgId);
          msgEl.classList.add("selected");
      }
      document.getElementById("sel-count-val").textContent = state.selectedMsgs.size;
  }

  function renderForwardDialogs(query="") {
      var list = document.getElementById("forward-dialogs-list");
      list.innerHTML = "";
      query = query.toLowerCase();
      state.accounts.forEach(acc => {
          if (!state.dialogsCache[acc.name]) return;
          state.dialogsCache[acc.name].forEach(d => {
              if (query && !d.name.toLowerCase().includes(query)) return;
              var div = document.createElement("div");
              div.className = "dialog-item";
              div.style.padding = "10px";
              div.innerHTML = `<strong>${d.name}</strong> <small style="color:var(--text-2);">(${acc.name})</small>`;
              div.onclick = function() {
                  var ids = Array.from(state.selectedMsgs).join(",");
                  apiFetch("/api/forward_messages", {
                      method: "POST",
                      body: new URLSearchParams({ 
                          account: state.account.name, 
                          from_chat_id: state.dialog.id,
                          to_chat_id: d.id,
                          message_ids: ids
                      })
                  }).then(r=>r.json()).then(res=> {
                      if (res.ok) {
                          toast("Успешно переслано!");
                          document.getElementById("forward-modal").hidden = true;
                          toggleSelectionMode();
                      } else toast(res.error);
                  });
              };
              list.appendChild(div);
          });
      });
  }

  function renderStickersTab(tabName) {
      var contentEl = document.getElementById("stickers-content");
      if (tabName === "emoji") {
          var emojis = ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","🥹","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😮‍💨","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🫣","🤗","🫡","🤔","🫢","🤭","🤫","🤥","😶","😶‍🌫️","😐","😑","😬","🫨","🫠","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","😵‍💫","🫥","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","🎃","😺","😸","😹","😻","😼","😽","🙀","😿","😾","🙈","🙉","🙊","💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","💔","❤️","🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍","💯","💢","💥","💫","💦","💨","🕳️","💣","💬","👁️‍🗨️","🗨️","🗯️","💭","💤"];
          var html = '<div style="display: flex; flex-wrap: wrap; gap: 4px; font-size: 24px;">';
          emojis.forEach(function(em) {
              html += `<span style="cursor:pointer; padding: 4px; border-radius: 4px;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" onclick="els.composerInput.value += '${em}'">${em}</span>`;
          });
          html += '</div>';
          contentEl.innerHTML = html;

      } else if (tabName === "stickers") {
          contentEl.innerHTML = '<div class="stickers-loading">Стикеры пока недоступны. Используйте GIF.</div>';
      } else if (tabName === "gif") {
          contentEl.innerHTML = '<div style="display:flex; gap:10px; margin-bottom:10px;"><input type="text" id="gifSearchInput" placeholder="Поиск GIF..." style="flex-grow:1; background:var(--bg-1); border:1px solid var(--line); border-radius:6px; padding:4px 8px; color:var(--text);"><button id="gifSearchBtn" class="send-btn" style="width:28px; height:28px; border-radius:6px;"><svg class="svg-ico" viewBox="0 0 24 24" style="width:14px; height:14px; stroke:#fff"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></div><div id="gifResults" style="display:flex; flex-wrap:wrap; gap:4px; max-height:200px; overflow-y:auto; justify-content:center;"></div>';
          
          function searchGifs() {
              var q = document.getElementById("gifSearchInput").value || "smile";
              var resEl = document.getElementById("gifResults");
              resEl.innerHTML = '<div class="stickers-loading">Поиск...</div>';
              apiFetch("/api/search_gifs", {
                  method: "POST",
                  body: new URLSearchParams({ account: state.account.name, query: q })
              }).then(r=>r.json()).then(res => {
                  resEl.innerHTML = "";
                  if (!res.ok) { resEl.innerHTML = '<div class="stickers-loading" style="color:red;">Ошибка</div>'; return; }
                  res.gifs.forEach(g => {
                      var img = document.createElement("video");
                      img.src = g.url;
                      img.autoplay = true;
                      img.loop = true;
                      img.muted = true;
                      img.style.width = "80px";
                      img.style.height = "80px";
                      img.style.objectFit = "cover";
                      img.style.cursor = "pointer";
                      img.style.borderRadius = "6px";
                      img.onclick = function() {
                          apiFetch("/api/send_inline_result", {
                              method: "POST",
                              body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, query_id: g.query_id, result_id: g.id })
                          }).then(r=>r.json()).then(res2 => {
                              if(res2.ok) {
                                  document.getElementById("stickers-popover").hidden = true;
                                  loadMessages();
                              } else toast("Ошибка отправки GIF: " + res2.error);
                          });
                      };
                      resEl.appendChild(img);
                  });
              });
          }
          document.getElementById("gifSearchBtn").onclick = searchGifs;
          document.getElementById("gifSearchInput").onkeypress = function(e) { if(e.key==="Enter") searchGifs(); };
          searchGifs();
      }

  }

  function setupCustomUI() {

      var toggleArchiveBtn = document.getElementById("toggleArchiveBtn");
      if (toggleArchiveBtn) {
          toggleArchiveBtn.addEventListener("click", function() {
              var isArchiveNow = (state.dialogFilterTab === "archive" || state.showArchive);
              state.showArchive = !isArchiveNow;
              state.dialogFilterTab = state.showArchive ? "archive" : "all";
              toggleArchiveBtn.style.color = state.showArchive ? "var(--primary)" : "";
              var tabsWrap = document.getElementById("dialogTabs");
              if (tabsWrap) {
                  tabsWrap.querySelectorAll(".dialog-tab").forEach(function(b) {
                      b.classList.toggle("active", b.dataset.filter === state.dialogFilterTab);
                  });
              }
              renderDialogs();
              if (typeof window.renderFeed === "function") window.renderFeed();
          });
      }


      var searchBtn = document.getElementById("searchChatBtn");
      var searchBox = document.getElementById("chatSearchBox");
      var closeSearchBtn = document.getElementById("closeSearchBtn");
      var searchInput = document.getElementById("chatSearchInput");
      var searchDoBtn = document.getElementById("chatSearchDoBtn");
      var searchResults = document.getElementById("chatSearchResults");

      if (searchBtn && searchBox) {
          searchBtn.addEventListener("click", function() {
              searchBox.hidden = !searchBox.hidden;
              if (!searchBox.hidden) {
                  searchInput.focus();
                  searchResults.innerHTML = "";
              }
          });
          closeSearchBtn.addEventListener("click", function() {
              searchBox.hidden = true;
          });
          
          function performSearch() {
              var q = searchInput.value.trim();
              if (!q) return;
              searchResults.innerHTML = '<div style="text-align:center; padding: 10px; color: var(--text-2);">Поиск...</div>';
              
              apiFetch("/api/search_chat", {
                  method: "POST",
                  body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, query: q, limit: 30 })
              }).then(r=>r.json()).then(res => {
                  searchResults.innerHTML = "";
                  if (!res.ok) {
                      searchResults.innerHTML = '<div style="color:var(--danger); padding:10px;">Ошибка: ' + res.error + '</div>';
                      return;
                  }
                  if (res.messages.length === 0) {
                      searchResults.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text-2);">Ничего не найдено</div>';
                      return;
                  }
                  res.messages.forEach(m => {
                      var div = document.createElement("div");
                      div.className = "dialog-item";
                      div.style.padding = "8px";
                      div.style.borderRadius = "8px";
                      div.style.background = "var(--bg-1)";
                      div.style.cursor = "pointer";
                      div.innerHTML = `
                          <div style="font-size: 11px; color: var(--accent); margin-bottom: 2px;">
                              ${new Date(m.date * 1000).toLocaleString()}
                          </div>
                          <div style="color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                              ${m.text}
                          </div>
                      `;
                      div.onclick = function() {
                          var targetMsg = document.querySelector('.msg[data-id="' + m.id + '"]');
                          if (targetMsg) {
                              targetMsg.scrollIntoView({ behavior: "smooth", block: "center" });
                              targetMsg.classList.add("highlight");
                              setTimeout(function () { targetMsg.classList.remove("highlight"); }, 1500);
                          } else {
                              toast("Сообщение слишком далеко, прокрутите историю вверх.");
                          }
                      };
                      searchResults.appendChild(div);
                  });
              });
          }

          searchDoBtn.addEventListener("click", performSearch);
          searchInput.addEventListener("keypress", function(e) {
              if (e.key === "Enter") performSearch();
          });
      }


      var muteBtn = document.getElementById("muteChatBtn");
      if (muteBtn) {
          muteBtn.addEventListener("click", function() {
              var until = prompt("Введите количество минут для отключения звука (0 = навсегда):", "0");
              if (until === null) return;
              var date = 0;
              if (until !== "0") {
                  date = Math.floor(Date.now() / 1000) + (parseInt(until) * 60);
              } else {
                  date = 2147483647; // Max int32 (forever in TG API)
              }
              apiFetch("/api/mute_chat", {
                  method: "POST",
                  body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, until_date: date })
              }).then(r=>r.json()).then(res => {
                  if(res.ok) toast("Настройки уведомлений обновлены");
                  else toast("Ошибка: " + res.error);
              });
          });
      }

      var btnCancel = document.getElementById("btn-sel-cancel");
      if (btnCancel) {
          btnCancel.addEventListener("click", function() { toggleSelectionMode(); });
      }

      var btnDel = document.getElementById("btn-sel-delete");
      if (btnDel) {
          btnDel.addEventListener("click", function() {
              if (state.selectedMsgs.size === 0) return;
              if (!confirm("Удалить выбранные сообщения (" + state.selectedMsgs.size + ")?")) return;
              var ids = Array.from(state.selectedMsgs).join(",");
              apiFetch("/api/delete_message", {
                  method: "POST",
                  body: new URLSearchParams({ account: state.account.name, chat_id: state.dialog.id, message_ids: ids })
              }).then(r => r.json()).then(d => {
                  if (d.ok) {
                      toggleSelectionMode();
                      loadMessages();
                  }
              });
          });
      }

      var btnFwd = document.getElementById("btn-sel-forward");
      if (btnFwd) {
          btnFwd.addEventListener("click", function() {
              var fwdModal = document.getElementById("forward-modal");
              if (fwdModal) fwdModal.hidden = false;
              renderForwardDialogs();
          });
      }

      var btnCloseFwd = document.getElementById("btn-close-forward");
      if (btnCloseFwd) {
          btnCloseFwd.addEventListener("click", function() {
              var fwdModal = document.getElementById("forward-modal");
              if (fwdModal) fwdModal.hidden = true;
          });
      }

      var fwdSearch = document.getElementById("forward-search");
      if (fwdSearch) {
          fwdSearch.addEventListener("input", function(e) {
              renderForwardDialogs(e.target.value);
          });
      }

      var smileBtn = document.getElementById("smileBtn");
      var stickersPopover = document.getElementById("stickers-popover");
      if (smileBtn && stickersPopover) {
          smileBtn.addEventListener("click", function(e) {
              e.stopPropagation();
              stickersPopover.hidden = !stickersPopover.hidden;
              if (!stickersPopover.hidden) renderStickersTab("emoji"); // default tab
          });
      }

      document.addEventListener("click", function(e) {
          if (stickersPopover && !stickersPopover.hidden && !stickersPopover.contains(e.target) && (!smileBtn || !smileBtn.contains(e.target))) {
              stickersPopover.hidden = true;
          }
      });

      var stickerTabs = document.querySelectorAll(".sticker-tab");
      stickerTabs.forEach(function(tab) {
          tab.addEventListener("click", function() {
              stickerTabs.forEach(t => t.classList.remove("active"));
              this.classList.add("active");
              renderStickersTab(this.dataset.tab);
          });
      });

      setupDialogTabsUI();
      setupPinnedMessageUI();
      setupQuickRepliesUI();
  }
// === END INJECTED FINAL ===
  
  var ws = null;
  function connectWebSocket() {
      var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      var wsUrl = protocol + "//" + window.location.host + "/ws";
      ws = new WebSocket(wsUrl);
      
      ws.onopen = function() {
          apiFetch("/api/accounts")
              .then(function(r) { return r.json(); })
              .then(function(accData) {
                  if (accData && accData.accounts) {
                      state.accounts = accData.accounts;
                      state.totalSessions = accData.total_count;
                      state.activeSessions = accData.active_count;
                      if (els.brandSub) els.brandSub.textContent = "CRM · " + state.accounts.length + " акк.";
                      renderAccounts();
                  }
              }).catch(function(){});
      };

      ws.onmessage = function(event) {
          try {
              var data = JSON.parse(event.data);
              window.dispatchEvent(new CustomEvent("ws_message", { detail: data }));
                              if (data.type === "new_message") {
                    if (state.account && state.account.name == data.account) {
                        if (state.dialog && state.dialog.id == data.chat_id) {
                              loadMessages(false);
                              var fd = new FormData();
                              fd.append('account', state.account.name);
                              fd.append('chat_id', data.chat_id);
                              apiFetch('/api/read_history', { method: 'POST', body: fd }).catch(function(){});
                          }
                        
                        loadDialogs(false, true);
                    }
                    if (typeof loadFeed === "function") loadFeed();
                } else if (data.type === "deleted_messages") {
                  if (state.dialog && state.dialog.id == data.chat_id && state.account && state.account.name == data.account) {
                      data.message_ids.forEach(id => {
                          var msgEl = document.querySelector('.msg[data-id="' + id + '"]');
                          if (msgEl) msgEl.remove();
                      });
                  }
                } else if (data.type === "read_history_outbox") {
                    if (state.account && state.account.name === data.account && state.dialog && state.dialog.id == data.chat_id) {
                        updateMessageTicks(data.max_id);
                    }
                    var dItem = state.dialogs.find(function(x) { return x.id == data.chat_id && (!x.account_name || x.account_name === data.account); });
                    if (dItem) {
                        dItem.read_outbox_max_id = Math.max(dItem.read_outbox_max_id || 0, data.max_id);
                        var row = els.dialogList.querySelector('.dlg-row[data-id="' + data.chat_id + '"]');
                        if (row) {
                            var dTick = row.querySelector('.dlg-tick');
                            if (dTick) {
                                dTick.textContent = "✓✓";
                                dTick.className = "dlg-tick out-read";
                            }
                        }
                    }
                } else if (data.type === "user_status") {
                    var dMatch = state.dialogs.find(function(x) { return x.id == data.user_id; });
                    if (dMatch) {
                        dMatch.status_text = data.status_text;
                        dMatch.online = data.online;
                        var row = els.dialogList.querySelector('.dlg-row[data-id="' + data.user_id + '"]');
                        if (row) {
                            var av = row.querySelector('.av');
                            if (av) {
                                var dot = av.querySelector('.online-dot');
                                if (data.online) {
                                    if (!dot) {
                                        dot = document.createElement("span");
                                        dot.className = "online-dot";
                                        dot.setAttribute("title", "В сети");
                                        av.appendChild(dot);
                                    }
                                } else if (dot) {
                                    dot.remove();
                                }
                            }
                        }
                    }
                    if (state.dialog && state.dialog.id == data.user_id) {
                        state.dialog.status_text = data.status_text;
                        state.dialog.online = data.online;
                        if (els.chatSub) {
                            els.chatSub.textContent = data.status_text;
                            if (data.online) els.chatSub.style.color = "var(--accent)";
                            else els.chatSub.style.color = "";
                        }
                        var descStatus = document.getElementById("desc-status");
                        if (descStatus) {
                            descStatus.textContent = data.status_text;
                            if (data.online) descStatus.classList.add("online");
                            else descStatus.classList.remove("online");
                        }
                    }
                } else if (data.type === "accounts_updated") {
                  apiFetch("/api/accounts")
                      .then(function(r) { return r.json(); })
                      .then(function(accData) {
                          if (accData && accData.accounts) {
                              state.accounts = accData.accounts;
                              state.totalSessions = accData.total_count;
                              state.activeSessions = accData.active_count;
                              if (els.brandSub) els.brandSub.textContent = "CRM · " + state.accounts.length + " акк.";
                              renderAccounts();
                          }
                      }).catch(function(){});
              }
          } catch(e) {}
      };
      
      ws.onclose = function() {
          setTimeout(connectWebSocket, 3000); // reconnect
      };
  }

  // ==============================================================================
  // ЗАКРЕПЛЕННЫЕ СООБЩЕНИЯ (PINNED MESSAGES)
  // ==============================================================================
  function loadPinnedMessage(account, chatId) {
    var bar = document.getElementById("pinnedMessageBar");
    if (!bar) return;
    if (!account || !chatId) {
      bar.hidden = true;
      return;
    }
    state.pinnedMessageId = null;
    apiFetch("/api/chat/pinned_message?account=" + encodeURIComponent(account) + "&chat_id=" + chatId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok && data.has_pinned) {
          state.pinnedMessageId = data.id;
          var titleEl = document.getElementById("pinnedBarTitle");
          var textEl = document.getElementById("pinnedBarText");
          if (titleEl) titleEl.textContent = data.sender_name || "Закрепленное сообщение";
          if (textEl) textEl.textContent = data.text || "...";
          bar.hidden = false;
        } else {
          bar.hidden = true;
        }
      })
      .catch(function() {
        bar.hidden = true;
      });
  }

  function scrollToMessage(msgId) {
    if (!msgId) return;
    var msgEl = els.messages.querySelector('.msg[data-id="' + msgId + '"]');
    if (msgEl) {
      msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
      msgEl.classList.remove("msg-highlight");
      void msgEl.offsetWidth;
      msgEl.classList.add("msg-highlight");
      setTimeout(function() { msgEl.classList.remove("msg-highlight"); }, 2200);
    } else {
      toast("Закрепленное сообщение находится выше в истории переписки");
    }
  }

  function setupPinnedMessageUI() {
    var barTarget = document.getElementById("pinnedBarClickTarget");
    if (barTarget) {
      barTarget.addEventListener("click", function() {
        if (state.pinnedMessageId) {
          scrollToMessage(state.pinnedMessageId);
        }
      });
    }
    var unpinBtn = document.getElementById("unpinChatBtn");
    if (unpinBtn) {
      unpinBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (!state.account || !state.dialog) return;
        var fd = new FormData();
        fd.append("account", state.account.name);
        fd.append("chat_id", state.dialog.id);
        if (state.pinnedMessageId) fd.append("message_id", state.pinnedMessageId);
        apiFetch("/api/unpin_message", { method: "POST", body: fd })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.ok) {
              toast("Сообщение откреплено");
              var bar = document.getElementById("pinnedMessageBar");
              if (bar) bar.hidden = true;
              state.pinnedMessageId = null;
            } else {
              toast(data.error || "Ошибка открепления");
            }
          })
          .catch(function() { toast("Ошибка сети"); });
      });
    }
  }

  // ==============================================================================
  // ВКЛАДКИ/ФИЛЬТРЫ ДИАЛОГОВ (CHAT TABS / FOLDERS)
  // ==============================================================================
  function setupDialogTabsUI() {
    var tabsWrap = document.getElementById("dialogTabs");
    if (!tabsWrap) return;
    tabsWrap.addEventListener("click", function(e) {
      var tabBtn = e.target.closest(".dialog-tab");
      if (!tabBtn) return;
      tabsWrap.querySelectorAll(".dialog-tab").forEach(function(b) { b.classList.remove("active"); });
      tabBtn.classList.add("active");
      state.dialogFilterTab = tabBtn.dataset.filter || "all";
      state.showArchive = (state.dialogFilterTab === "archive");
      var toggleArchiveBtn = document.getElementById("toggleArchiveBtn");
      if (toggleArchiveBtn) {
        toggleArchiveBtn.style.color = state.showArchive ? "var(--primary)" : "";
      }
      renderDialogs();
      if (typeof window.renderFeed === "function") window.renderFeed();
    });
  }

  // ==============================================================================
  // ЗАГОТОВКИ И СКРИПТЫ (QUICK REPLIES & PRESETS)
  // ==============================================================================
  var currentQrAudio = null;
  var quickRepliesCache = [];

  function loadQuickReplies(activeTab) {
    activeTab = activeTab || "text";
    var listEl = document.getElementById("qr-list");
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Загрузка заготовок...</div>';
    
    apiFetch("/api/quick_replies")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          quickRepliesCache = data.replies || [];
          renderQuickRepliesList(activeTab);
        } else {
          listEl.innerHTML = '<div style="color:var(--danger); padding:10px;">Ошибка загрузки</div>';
        }
      })
      .catch(function() {
        listEl.innerHTML = '<div style="color:var(--danger); padding:10px;">Ошибка сети</div>';
      });
  }

  function renderQuickRepliesList(activeTab) {
    var listEl = document.getElementById("qr-list");
    var searchInput = document.getElementById("qrSearchInput");
    if (!listEl) return;
    var q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    
    var filtered = quickRepliesCache.filter(function(r) {
      if (activeTab && r.reply_type !== activeTab) return false;
      if (q) {
        var match = (r.title + " " + (r.content_text || "") + " " + (r.category || "")).toLowerCase();
        if (match.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div style="text-align:center; padding: 25px; color: var(--text-muted); font-size: 12px;">Заготовок пока нет.<br>Нажмите ➕, чтобы добавить</div>';
      return;
    }

    var html = "";
    filtered.forEach(function(r) {
      var isVoice = r.reply_type === "voice";
      var isVideoNote = r.reply_type === "video_note";
      var isText = r.reply_type === "text";

      var playBtn = (isVoice || isVideoNote) ? '<button class="qr-btn-play" data-qr-id="' + r.id + '">▶ Слушать</button>' : '';
      var insertBtn = isText ? '<button class="qr-btn-insert" data-qr-id="' + r.id + '">Вставить</button>' : '';
      var sendBtn = '<button class="qr-btn-send" data-qr-id="' + r.id + '">Отправить ⚡</button>';
      var delBtn = '<button class="qr-btn-del" data-qr-id="' + r.id + '" title="Удалить">🗑</button>';

      var bodyText = isText ? esc(r.content_text) : ('<span style="color:var(--accent); font-size:11px;">' + (isVoice ? '🎙 Голосовое сообщение' : '🔘 Видеосообщение (кружок)') + '</span>');

      html += '<div class="qr-item" data-id="' + r.id + '">' +
        '<div class="qr-item-head">' +
          '<span class="qr-item-title">' + esc(r.title) + '</span>' +
          '<span class="qr-item-cat">' + esc(r.category) + '</span>' +
        '</div>' +
        '<div class="qr-item-text">' + bodyText + '</div>' +
        '<div class="qr-item-actions">' +
          delBtn + playBtn + insertBtn + sendBtn +
        '</div>' +
      '</div>';
    });

    listEl.innerHTML = html;
  }

  function setupQuickRepliesUI() {
    var qrBtn = document.getElementById("quickRepliesBtn");
    var popover = document.getElementById("quick-replies-popover");
    var tabsWrap = popover ? popover.querySelector(".qr-tabs") : null;
    var searchInput = document.getElementById("qrSearchInput");
    var addBtn = document.getElementById("qrOpenAddBtn");
    var modal = document.getElementById("modal-add-quick-reply");
    var modalClose = document.getElementById("modal-add-quick-reply-close");
    var btnCancelAdd = document.getElementById("btn-cancel-add-qr");
    var formAdd = document.getElementById("form-create-quick-reply");
    var currentTab = "text";

    if (qrBtn && popover) {
      qrBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        popover.hidden = !popover.hidden;
        if (!popover.hidden) {
          loadQuickReplies(currentTab);
        }
      });
    }

    if (tabsWrap) {
      tabsWrap.addEventListener("click", function(e) {
        var btn = e.target.closest(".qr-tab");
        if (!btn) return;
        tabsWrap.querySelectorAll(".qr-tab").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        currentTab = btn.dataset.tab;
        renderQuickRepliesList(currentTab);
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function() {
        renderQuickRepliesList(currentTab);
      });
    }

    // Обработка действий внутри списка
    var listEl = document.getElementById("qr-list");
    if (listEl) {
      listEl.addEventListener("click", function(e) {
        var insertBtn = e.target.closest(".qr-btn-insert");
        var sendBtn = e.target.closest(".qr-btn-send");
        var playBtn = e.target.closest(".qr-btn-play");
        var delBtn = e.target.closest(".qr-btn-del");

        if (insertBtn) {
          var id = Number(insertBtn.dataset.qrId);
          var r = quickRepliesCache.find(function(x) { return x.id === id; });
          if (r && r.content_text) {
            els.composerInput.value = (els.composerInput.value ? (els.composerInput.value + " ") : "") + r.content_text;
            autoSize();
            updateComposerMode();
            els.composerInput.focus();
            if (popover) popover.hidden = true;
          }
        } else if (sendBtn) {
          var sId = Number(sendBtn.dataset.qrId);
          if (!state.account || !state.dialog) {
            toast("Выберите чат для отправки");
            return;
          }
          var emCheck = document.getElementById("qrEmulateCheck");
          var delay = (emCheck && emCheck.checked) ? 3 : 0;
          
          sendBtn.disabled = true;
          sendBtn.textContent = "Отправка...";
          var fd = new FormData();
          fd.append("account", state.account.name);
          fd.append("chat_id", state.dialog.id);
          fd.append("reply_id", sId);
          fd.append("emulate_delay", delay);
          if (state.replyTarget && state.replyTarget.id) {
            fd.append("reply_to_message_id", state.replyTarget.id);
          }

          apiFetch("/api/quick_replies/send", { method: "POST", body: fd })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data.ok) {
                toast("Заготовка отправлена!");
                setReplyTarget(null);
                if (popover) popover.hidden = true;
                pollMessages();
              } else {
                toast(data.error || "Ошибка отправки заготовки");
              }
            })
            .catch(function() { toast("Ошибка сети"); })
            .finally(function() {
              sendBtn.disabled = false;
              sendBtn.textContent = "Отправить ⚡";
            });
        } else if (playBtn) {
          var pId = Number(playBtn.dataset.qrId);
          if (currentQrAudio) {
            currentQrAudio.pause();
            currentQrAudio = null;
          }
          if (playBtn.classList.contains("playing")) {
            playBtn.classList.remove("playing");
            playBtn.textContent = "▶ Слушать";
            return;
          }
          listEl.querySelectorAll(".qr-btn-play").forEach(function(b) {
            b.classList.remove("playing");
            b.textContent = "▶ Слушать";
          });
          var audio = new Audio("/api/quick_replies/audio/" + pId);
          playBtn.classList.add("playing");
          playBtn.textContent = "⏹ Стоп";
          currentQrAudio = audio;
          audio.play().catch(function() {
            toast("Не удалось воспроизвести аудио");
            playBtn.classList.remove("playing");
            playBtn.textContent = "▶ Слушать";
          });
          audio.onended = function() {
            playBtn.classList.remove("playing");
            playBtn.textContent = "▶ Слушать";
            currentQrAudio = null;
          };
        } else if (delBtn) {
          var dId = Number(delBtn.dataset.qrId);
          if (!confirm("Удалить эту заготовку?")) return;
          apiFetch("/api/quick_replies/" + dId, { method: "DELETE" })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data.ok) {
                toast("Заготовка удалена");
                loadQuickReplies(currentTab);
              } else {
                toast("Ошибка при удалении");
              }
            });
        }
      });
    }

    // Модальное окно создания заготовки
    if (addBtn && modal) {
      addBtn.addEventListener("click", function() {
        modal.hidden = false;
      });
    }
    if (modalClose && modal) {
      modalClose.addEventListener("click", function() { modal.hidden = true; });
    }
    if (btnCancelAdd && modal) {
      btnCancelAdd.addEventListener("click", function() { modal.hidden = true; });
    }

    // Переключение полей в форме создания
    if (formAdd) {
      var radioInputs = formAdd.querySelectorAll('input[name="qr-type-radio"]');
      var textWrap = document.getElementById("qr-text-field-wrap");
      var fileWrap = document.getElementById("qr-file-field-wrap");

      radioInputs.forEach(function(r) {
        r.addEventListener("change", function() {
          var val = this.value;
          if (val === "text") {
            if (textWrap) textWrap.hidden = false;
            if (fileWrap) fileWrap.hidden = true;
          } else {
            if (textWrap) textWrap.hidden = true;
            if (fileWrap) fileWrap.hidden = false;
          }
        });
      });

      formAdd.addEventListener("submit", function(e) {
        e.preventDefault();
        var selectedType = formAdd.querySelector('input[name="qr-type-radio"]:checked').value;
        var title = document.getElementById("new-qr-title").value.trim();
        var category = document.getElementById("new-qr-category").value.trim() || "Общее";
        var text = document.getElementById("new-qr-text").value.trim();
        var fileInput = document.getElementById("new-qr-file");

        if (!title) { toast("Укажите название заготовки"); return; }
        if (selectedType === "text" && !text) { toast("Введите текст заготовки"); return; }
        if (selectedType !== "text" && (!fileInput.files || !fileInput.files.length)) {
          toast("Выберите аудиофайл или видеозапись кружка");
          return;
        }

        var fd = new FormData();
        fd.append("title", title);
        fd.append("reply_type", selectedType);
        fd.append("category", category);
        if (selectedType === "text") {
          fd.append("content_text", text);
        } else if (fileInput.files && fileInput.files[0]) {
          fd.append("audio_file", fileInput.files[0]);
        }

        var submitBtn = formAdd.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Сохранение..."; }

        apiFetch("/api/quick_replies", { method: "POST", body: fd })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.ok) {
              toast("Заготовка сохранена!");
              modal.hidden = true;
              formAdd.reset();
              if (textWrap) textWrap.hidden = false;
              if (fileWrap) fileWrap.hidden = true;
              loadQuickReplies(selectedType);
            } else {
              toast(data.error || "Ошибка сохранения");
            }
          })
          .catch(function() { toast("Ошибка сети"); })
          .finally(function() {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Сохранить заготовку"; }
          });
      });
    }

    // Закрытие popover при клике вне его
    document.addEventListener("click", function(e) {
      if (popover && !popover.hidden) {
        if (!popover.contains(e.target) && e.target !== qrBtn && !qrBtn.contains(e.target)) {
          popover.hidden = true;
          if (currentQrAudio) {
            currentQrAudio.pause();
            currentQrAudio = null;
          }
        }
      }
    });

    // === Быстрое сохранение голосового / кружка из чата в скрипты ===
    var saveMsgModal = document.getElementById("modal-save-msg-to-qr");
    var saveMsgClose = document.getElementById("modal-save-msg-to-qr-close");
    var saveMsgCancel = document.getElementById("btn-cancel-save-msg-qr");
    var saveMsgForm = document.getElementById("form-save-msg-to-qr");
    var saveMsgTitle = document.getElementById("save-msg-qr-title");
    var saveMsgCat = document.getElementById("save-msg-qr-category");
    var saveMsgId = document.getElementById("save-msg-qr-id");
    var saveMsgType = document.getElementById("save-msg-qr-type");
    var saveMsgCatList = document.getElementById("save-msg-qr-cat-list");
    var saveMsgIcon = document.getElementById("save-msg-qr-icon");
    var saveMsgTypeLabel = document.getElementById("save-msg-qr-type-label");
    var saveMsgSubmitBtn = document.getElementById("btn-submit-save-msg-qr");

    function closeSaveMsgModal() {
      if (saveMsgModal) saveMsgModal.hidden = true;
    }

    if (saveMsgClose) saveMsgClose.addEventListener("click", closeSaveMsgModal);
    if (saveMsgCancel) saveMsgCancel.addEventListener("click", closeSaveMsgModal);

    window.openSaveToQrModal = function(msgId, type, dur) {
      if (!saveMsgModal) return;
      type = type || "voice";
      dur = parseInt(dur || "0", 10);
      saveMsgId.value = msgId;
      saveMsgType.value = type;

      var durStr = "";
      if (dur > 0) {
        var m = Math.floor(dur / 60);
        var s = dur % 60;
        durStr = (m > 0 ? m + ":" + (s < 10 ? "0" : "") + s : s + "с");
      }

      var isVnote = (type === "video_note");
      if (saveMsgIcon) saveMsgIcon.textContent = isVnote ? "🔘" : "🎙";
      if (saveMsgTypeLabel) saveMsgTypeLabel.textContent = isVnote ? "Кружок" : "Голосовое";

      var defaultTitle = (isVnote ? "Кружок" : "Голосовое") + (durStr ? " (" + durStr + ")" : "");
      if (saveMsgTitle) {
        saveMsgTitle.value = defaultTitle;
      }

      if (saveMsgCat) {
        saveMsgCat.value = "Общее";
      }

      // Заполняем подсказки категорий
      if (saveMsgCatList) {
        var cats = {};
        quickRepliesCache.forEach(function(r) {
          if (r.category) cats[r.category] = true;
        });
        saveMsgCatList.innerHTML = Object.keys(cats).map(function(c) {
          return '<option value="' + esc(c) + '">';
        }).join("");
      }

      saveMsgModal.hidden = false;
      setTimeout(function() {
        if (saveMsgTitle) {
          saveMsgTitle.focus();
          saveMsgTitle.select();
        }
      }, 50);
    };

    if (saveMsgForm) {
      saveMsgForm.addEventListener("submit", function(e) {
        e.preventDefault();
        var accName = (state.account && (state.account.name || state.account.phone || state.account)) || (state.dialog && state.dialog.account_name) || "";
        accName = String(accName || "").trim().replace(/^\+/, "");
        if (!accName) {
          toast("Ошибка: аккаунт не выбран");
          return;
        }
        if (!state.dialog) {
          toast("Ошибка: диалог не выбран");
          return;
        }

        var mId = saveMsgId.value;
        var rType = saveMsgType.value;
        var title = (saveMsgTitle ? saveMsgTitle.value.trim() : "") || (rType === "video_note" ? "Кружок" : "Голосовое");
        var category = (saveMsgCat ? saveMsgCat.value.trim() : "") || "Общее";

        var fd = new FormData();
        fd.append("account", accName);
        fd.append("chat_id", state.dialog.id);
        fd.append("message_id", mId);
        fd.append("title", title);
        fd.append("category", category);

        if (saveMsgSubmitBtn) {
          saveMsgSubmitBtn.disabled = true;
          saveMsgSubmitBtn.textContent = "Сохранение...";
        }

        apiFetch("/api/quick_replies/save_from_message", { method: "POST", body: fd })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.ok) {
              closeSaveMsgModal();
              toast("✅ " + (rType === "video_note" ? "Кружок" : "Голосовое") + " успешно сохранено в скрипты!");
              loadQuickReplies(rType);
            } else {
              toast("Ошибка: " + (data.error || "Не удалось сохранить"));
            }
          })
          .catch(function(err) {
            console.error("save_from_message error:", err);
            toast("Ошибка сети при сохранении");
          })
          .finally(function() {
            if (saveMsgSubmitBtn) {
              saveMsgSubmitBtn.disabled = false;
              saveMsgSubmitBtn.textContent = "⚡ Сохранить";
            }
          });
      });
    }

    // Делегирование клика по кнопкам "В скрипты" (.btn-save-qr)
    document.addEventListener("click", function(e) {
      var btn = e.target.closest(".btn-save-qr");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      var msgId = btn.dataset.msgId;
      var type = btn.dataset.type || "voice";
      var dur = btn.dataset.dur || 0;
      if (!dur) {
        var msgEl = btn.closest(".msg");
        if (msgEl) {
          var voiceEl = msgEl.querySelector(".tg-voice");
          if (voiceEl && voiceEl.dataset.dur) dur = voiceEl.dataset.dur;
        }
      }
      if (window.openSaveToQrModal) {
        window.openSaveToQrModal(msgId, type, dur);
      }
    });
  }

  async function init() {
    setupCustomUI();
    connectWebSocket();
setTheme(state.theme);
    updateSoundUI();

    els.themeToggleBtn.addEventListener("click", toggleTheme);
    els.soundToggleBtn.addEventListener("click", toggleSound);

    
    var btnAllInbox = document.getElementById("btn-all-inbox");
    if (btnAllInbox) {
        btnAllInbox.addEventListener("click", function() {
            var feedWrap = document.getElementById("globalFeedWrap");
            if (btnAllInbox.classList.contains("active") || (feedWrap && feedWrap.style.display === "flex")) {
                btnAllInbox.classList.remove("active");
                if (feedWrap) feedWrap.style.display = "none";
                els.dialogList.hidden = false;
                els.dialogHeadTitle.textContent = "Диалоги";
                els.dialogHeadSub.textContent = "";
                state.dialogs = [];
                renderDialogs();
                resetChat();
                return;
            }

            state.selectedGroupId = null;
            state.account = null;
            state.dialog = null;
            renderGroups();
            renderAccounts();
            btnAllInbox.classList.add("active");
            
            if (feedWrap) feedWrap.style.display = "flex";
            els.dialogList.hidden = true;
            els.deleteAccountHeaderBtn.hidden = true;
            els.dialogHeadTitle.textContent = state.selectedGroupId ? "Лента группы" : "Все входящие (Общая лента)";
            els.dialogHeadSub.textContent = "";
            resetChat();
            if (typeof window.loadFeed === "function") window.loadFeed(true);
        });
    }

    els.accountSearch.addEventListener("input", function () {
      state.accountFilter = els.accountSearch.value;
      renderAccounts();
    });

   renderAccounts();
    await loadGroups(); // <-- Добавляем загрузку групп сюда

    els.dialogSearch.addEventListener("input", function () {
      state.dialogFilter = els.dialogSearch.value;
      renderDialogs();
      if (typeof window.renderFeed === "function") window.renderFeed();
    });
    els.accountList.addEventListener("scroll", onAccountScroll);
    els.accountList.addEventListener("click", onAccountClick);
    els.dialogList.addEventListener("click", onDialogClick);
    els.dialogList.addEventListener("pointerover", function (e) {
      var row = e.target.closest ? e.target.closest("[data-id]") : null;
      if (!row) return;
      var id = Number(row.dataset.id);
      var d = state.dialogs.find(function (x) { return x.id === id; });
      if (!d) return;
      var a = normAcc(d.account_name || (state.account ? state.account.name : ""));
      if (a && d.id) prefetchDialog(d.id, a);
    });

    els.messages.addEventListener("scroll", onMessagesScroll);
    els.messages.addEventListener("error", onMediaError, true);
    els.chatAvatar.addEventListener("click", function () {
      if (state.dialog && state.dialog.id) {
          openUserProfile(state.dialog.id);
      }
    });

    
    els.messages.addEventListener("contextmenu", function(e) {
        var msgEl = e.target.closest ? e.target.closest(".msg") : null;
        e.preventDefault();
          if (msgEl) {
            openContextMenu(e, msgEl);
        }
    });

    els.messages.addEventListener("click", function (e) {
      // 1. Полноэкранный просмотрщик медиа (фото / видео / альбомы)
      var mediaTrigger = e.target.closest ? e.target.closest(".media-preview-trigger") : null;
      if (mediaTrigger) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.triggerMediaPreview === "function") {
          window.triggerMediaPreview(mediaTrigger);
        }
        return;
      }

      // 2. Клик по существующей реакции (переключение)
      var reactPill = e.target.closest ? e.target.closest(".msg-reaction") : null;
      if (reactPill) {
        e.preventDefault();
        e.stopPropagation();
        var emoji = reactPill.dataset.emoji;
        var msgEl = reactPill.closest(".msg");
        var msgId = reactPill.dataset.msgId || (msgEl ? msgEl.dataset.id : null);
        if (emoji && msgId && state.account && state.dialog) {
          reactPill.classList.toggle("chosen");
          apiFetch("/api/react_message", {
            method: "POST",
            body: new URLSearchParams({
              account: state.account.name,
              chat_id: state.dialog.id,
              message_id: msgId,
              emoji: emoji
            })
          }).then(function () {
            loadMessages();
          });
        }
        return;
      }

      // 3. Быстрая реакция на сообщении (всплывающая панелька эмодзи)
      var quickReactBtn = e.target.closest ? e.target.closest(".msg-quick-react-btn") : null;
      if (quickReactBtn) {
        e.preventDefault();
        e.stopPropagation();
        var msgEl = quickReactBtn.closest(".msg");
        var msgId = quickReactBtn.dataset.msgId || (msgEl ? msgEl.dataset.id : null);
        openQuickReactions(quickReactBtn, msgId);
        return;
      }

      // 4. Инлайн-кнопки ботов (Inline Keyboard)
      var kbBtn = e.target.closest ? e.target.closest(".inline-kb-btn") : null;
      if (kbBtn) {
        if (kbBtn.dataset.action === "callback") {
          e.preventDefault();
          e.stopPropagation();
          var msgId = kbBtn.dataset.msgId;
          var cbData = decodeURIComponent(kbBtn.dataset.cb || "");
          if (state.account && state.dialog) {
            kbBtn.disabled = true;
            kbBtn.style.opacity = "0.6";
            apiFetch("/api/bot_callback", {
              method: "POST",
              body: new URLSearchParams({
                account: state.account.name,
                chat_id: state.dialog.id,
                message_id: msgId,
                callback_data: cbData
              })
            }).then(function (r) { return r.json(); })
              .then(function (data) {
                kbBtn.disabled = false;
                kbBtn.style.opacity = "";
                if (data.ok) {
                  if (data.alert && data.message) {
                    alert(data.message);
                  } else if (data.message) {
                    if (window.toast) window.toast(data.message);
                  }
                  if (data.url) {
                    window.open(data.url, "_blank");
                  }
                  loadMessages();
                } else {
                  if (window.toast) window.toast("Ошибка: " + (data.error || "не удалось выполнить"));
                }
              }).catch(function () {
                kbBtn.disabled = false;
                kbBtn.style.opacity = "";
                if (window.toast) window.toast("Сетевая ошибка при нажатии кнопки");
              });
          }
          return;
        } else if (kbBtn.dataset.action === "switch_inline") {
          e.preventDefault();
          e.stopPropagation();
          var q = decodeURIComponent(kbBtn.dataset.query || "");
          if (els.composerInput) {
            var dName = (state.dialog && state.dialog.username) ? ("@" + state.dialog.username + " ") : "";
            els.composerInput.value = dName + q;
            els.composerInput.focus();
          }
          return;
        }
      }
      
    if (state.selectionMode) {
        var msgEl = e.target.closest(".msg");
        e.preventDefault();
          if (msgEl) {
            toggleMsgSelection(msgEl.dataset.id);
            return;
        }
    }

        var replyQuote = e.target.closest ? e.target.closest(".msg-reply-quote") : null;
      if (replyQuote && replyQuote.dataset.replyId) {
        var targetMsg = $('.msg[data-id="' + replyQuote.dataset.replyId + '"]', els.messages);
        if (targetMsg) {
          targetMsg.scrollIntoView({ behavior: "smooth", block: "center" });
          targetMsg.classList.add("highlight");
          setTimeout(function () { targetMsg.classList.remove("highlight"); }, 1500);
          return;
        }
      }
      
      var vnoteCircle = e.target.closest ? e.target.closest(".vnote-circle") : null;
      if (vnoteCircle) {
        if (e.target.closest && e.target.closest(".vnote-expand-btn")) return;
        var v = vnoteCircle.querySelector("video");
        if (v) {
          e.stopPropagation();
          if (v.paused) {
            if (typeof window.pauseAllVoice === "function") window.pauseAllVoice();
            v.muted = false;
            if (v.ended || (v.duration && v.currentTime >= v.duration - 0.2)) {
              v.currentTime = 0;
            }
            v.play().catch(function () {});
          } else {
            v.pause();
          }
          return;
        }
      }
      
      
      var menuBtn = e.target.closest ? e.target.closest(".msg-menu-btn") : null;
      if (menuBtn) {
          openContextMenu(e, menuBtn.closest(".msg"));
          return;
      }

      var replyBtn = e.target.closest ? e.target.closest(".msg-reply-btn") : null;
      if (replyBtn) {
        var msgEl = replyBtn.closest(".msg");
        e.preventDefault();
          if (msgEl) {
          var msgId = Number(msgEl.dataset.id);
          var senderEl = $(".msg-sender", msgEl);
          var authorName = senderEl ? senderEl.textContent : (msgEl.dataset.side === "out" ? "Вы" : "");
          var textEl = $(".msg-text", msgEl);
          var text = textEl ? textEl.textContent.trim() : "";
          setReplyTarget({ id: msgId, author: authorName, text: text });
          els.composerInput.focus();
        }
        return;
      }

      var avatarOrSender = e.target.closest ? (e.target.closest(".msg-avatar") || e.target.closest(".msg-sender")) : null;
      if (avatarOrSender) {
        var msgEl = avatarOrSender.closest(".msg");
        if (msgEl && msgEl.dataset.sender) {
            openUserProfile(Number(msgEl.dataset.sender));
            return;
        }
      }

      if (e.target.closest && (e.target.closest("video") || e.target.closest("audio") || e.target.closest("a") || e.target.closest("button"))) return;
      var lazy = e.target.closest ? e.target.closest(".video-lazy") : null;
      if (!lazy) return;
      var v = lazy.querySelector("video");
      if (!v) return;
      if (v.paused) { playLazyVideo(v); } else { v.pause(); }
    });

    els.messages.addEventListener("dblclick", function (e) {
      var msgEl = e.target.closest ? e.target.closest(".msg") : null;
      if (!msgEl) return;
      var msgId = Number(msgEl.dataset.id);
      var senderEl = $(".msg-sender", msgEl);
      var authorName = senderEl ? senderEl.textContent : (msgEl.dataset.side === "out" ? "Вы" : "");
      var textEl = $(".msg-text", msgEl);
      var text = textEl ? textEl.innerText.split("\n")[0] : "";
      setReplyTarget({ id: msgId, author: authorName, text: text });
    });

    els.replyBarClose.addEventListener("click", function () { delete els.composerInput.dataset.editId; setReplyTarget(null); });

    els.attachBtn.addEventListener("click", function () { els.attachInput.click(); });
    els.attachInput.addEventListener("change", function () {
      if (els.attachInput.files && els.attachInput.files.length) {
        sendFiles(els.attachInput.files);
        els.attachInput.value = "";
      }
    });

    els.deleteAccountHeaderBtn.addEventListener("click", openDeleteModal);
    els.deleteModalClose.addEventListener("click", closeDeleteModal);
    els.deleteModalCancel.addEventListener("click", closeDeleteModal);
    els.deleteModalConfirm.addEventListener("click", confirmDeleteAccount);
    els.deleteModalOverlay.addEventListener("click", function (e) { if (e.target === els.deleteModalOverlay) closeDeleteModal(); });

    if (els.videoNoteBtn) els.videoNoteBtn.addEventListener("click", function(e) { if (typeof window.openVnoteModal === "function") window.openVnoteModal(e); });
    if (els.vnoteModalClose) els.vnoteModalClose.addEventListener("click", function(e) { if (typeof window.closeVnoteModal === "function") window.closeVnoteModal(e); });
    if (els.vnoteRecordBtn) els.vnoteRecordBtn.addEventListener("click", function(e) { if (typeof window.startVnoteRecord === "function") window.startVnoteRecord(e); });
    if (els.vnoteStopBtn) els.vnoteStopBtn.addEventListener("click", function(e) { if (typeof window.stopVnoteRecord === "function") window.stopVnoteRecord(e); });
    if (els.vnoteSendBtn) els.vnoteSendBtn.addEventListener("click", function(e) { if (typeof window.sendVnote === "function") window.sendVnote(e); });
    if (els.vnoteModalOverlay) els.vnoteModalOverlay.addEventListener("click", function (e) { if (e.target === els.vnoteModalOverlay && typeof window.closeVnoteModal === "function") window.closeVnoteModal(); });

    els.composer.addEventListener("submit", onSend);
    els.composerInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
      if (e.key === "Escape") {
        setReplyTarget(null);
        var qrPop = document.getElementById("quick-replies-popover");
        if (qrPop) qrPop.hidden = true;
      }
    });
    var lastTypingTs = 0;
    els.composerInput.addEventListener("input", function () {
      autoSize();
      updateComposerMode();
      if (state.account && state.dialog) {
        var now = Date.now();
        if (now - lastTypingTs > 4000 && els.composerInput.value.trim().length > 0) {
          lastTypingTs = now;
          var tfd = new FormData();
          tfd.append("account", state.account.name);
          tfd.append("chat_id", state.dialog.id);
          tfd.append("action", "typing");
          apiFetch("/api/chat_action", { method: "POST", body: tfd }).catch(function () {});
        }
      }
    });
    els.micBtn.addEventListener("click", function(e) { if (typeof window.onMic === "function") window.onMic(e); });
    els.recCancel.addEventListener("click", function(e) { if (typeof window.cancelRec === "function") window.cancelRec(e); });

    els.reloadDialogs.addEventListener("click", function () { loadDialogs(true); });
    els.reloadChat.addEventListener("click", function () { if (state.account && state.dialog) loadMessages(); });
    els.backAccounts.addEventListener("click", function () { setView("accounts"); });
    els.backDialogs.addEventListener("click", function () {
      stopPolling();
      cancelRec();
      pauseAllVoice();
      delete els.composerInput.dataset.editId; setReplyTarget(null);
      state.dialog = null;
      state.chatGen++;
      if (state.chatAbort) { state.chatAbort.abort(); state.chatAbort = null; }
      renderDialogs();
    
      setView("dialogs");
    });
    els.modalClose.addEventListener("click", closeModal);
    els.modalOverlay.addEventListener("click", function (e) { if (e.target === els.modalOverlay) closeModal(); });

    
    // --- Column 5 (Описание / Lead CRM / Shared Media) Event Listeners ---
    var btnOpenLeadGroups = document.getElementById("btn-open-lead-groups-modal");
    if (btnOpenLeadGroups) {
      btnOpenLeadGroups.addEventListener("click", openLeadGroupsModal);
    }
    var btnOpenLeadGroupsNav = document.getElementById("btn-open-lead-groups-nav");
    if (btnOpenLeadGroupsNav) {
      btnOpenLeadGroupsNav.addEventListener("click", openLeadGroupsModal);
    }
    var btnCloseLeadGroups = document.getElementById("modal-lead-groups-close");
    if (btnCloseLeadGroups) {
      btnCloseLeadGroups.addEventListener("click", closeLeadGroupsModal);
    }
    var modalLeadGroups = document.getElementById("modal-lead-groups");
    if (modalLeadGroups) {
      modalLeadGroups.addEventListener("click", function(e) {
        if (e.target === modalLeadGroups) closeLeadGroupsModal();
      });
    }

    var formCreateLeadGroup = document.getElementById("form-create-lead-group");
    if (formCreateLeadGroup) {
      formCreateLeadGroup.addEventListener("submit", async function(e) {
        e.preventDefault();
        var nameInput = document.getElementById("new-lead-group-name");
        var colorInput = document.getElementById("new-lead-group-color");
        var name = nameInput ? nameInput.value.trim() : "";
        var color = colorInput ? colorInput.value : "#00a8ff";
        if (!name) return;

        try {
          var r = await apiFetch("/api/lead_groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, color: color })
          });
          if (r.ok) {
            if (nameInput) nameInput.value = "";
            await renderLeadGroupsManageList();
            if (state.dialog) {
              renderLeadGroupsChips();
              updateAddGroupSelect();
            }
          }
        } catch(err) {
          console.error("Error creating lead group:", err);
        }
      });
    }

    var leadGroupsManageList = document.getElementById("lead-groups-manage-list");
    if (leadGroupsManageList) {
      leadGroupsManageList.addEventListener("click", async function(e) {
        var delBtn = e.target.closest(".btn-delete-lead-group");
        if (!delBtn) return;
        var gid = delBtn.dataset.id;
        if (!gid) return;
        if (!confirm("Удалить эту группу лидов? Она будет удалена у всех привязанных диалогов.")) return;

        try {
          var r = await apiFetch("/api/lead_groups/" + gid, { method: "DELETE" });
          if (r.ok) {
            await renderLeadGroupsManageList();
            if (state.dialog && state.currentLeadProfile) {
              state.currentLeadProfile.group_ids = (state.currentLeadProfile.group_ids || []).filter(function(x) { return x !== Number(gid); });
              renderLeadGroupsChips();
              updateAddGroupSelect();
            }
          }
        } catch(err) {
          console.error("Error deleting lead group:", err);
        }
      });
    }

    // Lead notes autosave
    var descNotes = document.getElementById("desc-notes");
    if (descNotes) {
      descNotes.addEventListener("input", function() {
        var statusEl = document.getElementById("desc-notes-status");
        if (statusEl) statusEl.textContent = "Сохранение...";
        clearTimeout(descNotesTimer);
        descNotesTimer = setTimeout(function() {
          saveLeadProfile(undefined, descNotes.value);
        }, 600);
      });
    }

    // Lead group assignment dropdown
    var descAddGroupSelect = document.getElementById("desc-add-group-select");
    if (descAddGroupSelect) {
      descAddGroupSelect.addEventListener("change", function() {
        var gid = Number(this.value);
        if (!gid || !state.dialog) return;
        var currentIds = (state.currentLeadProfile && state.currentLeadProfile.group_ids) ? state.currentLeadProfile.group_ids.slice() : [];
        if (currentIds.indexOf(gid) === -1) {
          currentIds.push(gid);
          saveLeadProfile(currentIds, undefined);
        }
        this.value = "";
      });
    }

    // Lead group chip removal
    var descChipsContainer = document.getElementById("desc-lead-groups-chips");
    if (descChipsContainer) {
      descChipsContainer.addEventListener("click", function(e) {
        var removeBtn = e.target.closest(".lead-chip-remove");
        if (!removeBtn || !state.dialog) return;
        var gid = Number(removeBtn.dataset.groupId);
        if (!gid) return;
        var currentIds = (state.currentLeadProfile && state.currentLeadProfile.group_ids) ? state.currentLeadProfile.group_ids.slice() : [];
        var newIds = currentIds.filter(function(x) { return x !== gid; });
        saveLeadProfile(newIds, undefined);
      });
    }

    // Shared media tabs
    var sharedMediaTabs = document.querySelector(".shared-media-tabs");
    if (sharedMediaTabs) {
      sharedMediaTabs.addEventListener("click", function(e) {
        var tab = e.target.closest(".sm-tab");
        if (!tab) return;
        var allTabs = sharedMediaTabs.querySelectorAll(".sm-tab");
        allTabs.forEach(function(t) { t.classList.remove("active"); });
        tab.classList.add("active");
        loadSharedMedia(tab.dataset.kind);
      });
    }

    // Shared media preview clicks (trigger lightbox)
    var sharedMediaList = document.getElementById("desc-shared-media-list");
    if (sharedMediaList) {
      sharedMediaList.addEventListener("click", function(e) {
        var trigger = e.target.closest(".media-preview-trigger");
        if (trigger) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.triggerMediaPreview === "function") {
            window.triggerMediaPreview(trigger);
          }
        }
      });
    }

    // Floating scroll-to-bottom button
    var btnScrollBottom = document.getElementById("btn-scroll-bottom");
    if (btnScrollBottom) {
      btnScrollBottom.addEventListener("click", function() {
        if (els.messages) {
          els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: "smooth" });
          state.unreadWhileScrolled = 0;
          var badge = document.getElementById("scroll-unread-badge");
          if (badge) badge.hidden = true;
          btnScrollBottom.hidden = true;
        }
      });
    }

    // Load initial lead groups
    loadLeadGroups();

    // --- NEW NAV MODALS ---
    var btnMA = document.getElementById("btn-open-manage-accounts");
    var modMA = document.getElementById("modal-manage-accounts");
    var clsMA = document.getElementById("btn-close-manage-accounts");
    if (btnMA && modMA) btnMA.addEventListener("click", function() {
        modMA.hidden = false;
        if (state.manageAccountsGroupId === undefined) {
            state.manageAccountsGroupId = state.selectedGroupId !== null && state.selectedGroupId !== undefined ? String(state.selectedGroupId) : "all";
        }
        renderManageAccountsList();
        if (typeof window.loadProxies === "function") window.loadProxies();
        if (typeof window.populateUploadSelectors === "function") window.populateUploadSelectors();
    });
    if (clsMA && modMA) clsMA.addEventListener("click", function() { modMA.hidden = true; });
    if (modMA) modMA.addEventListener("click", function(e) { if (e.target === modMA) modMA.hidden = true; });

    function renderManageAccountsList() {
        var listEl = document.getElementById("ma-accounts-list");
        var pillsEl = document.getElementById("ma-group-pills-bar");
        var searchEl = document.getElementById("ma-search-input");
        var selectAllEl = document.getElementById("ma-select-all");
        var deleteBtn = document.getElementById("btn-ma-delete-selected");
        if (!listEl) return;

        var activeGroupId = state.manageAccountsGroupId !== undefined ? state.manageAccountsGroupId : 
            (state.selectedGroupId !== null && state.selectedGroupId !== undefined ? String(state.selectedGroupId) : "all");

        var query = (searchEl && searchEl.value || "").toLowerCase().trim();
        var accounts = state.accounts || [];

        // Render Group Filter Pills
        if (pillsEl) {
            var groups = state.groups || [];
            var counts = {};
            var noGroupCount = 0;
            accounts.forEach(function(a) {
                if (a.work_group_id !== null && a.work_group_id !== undefined) {
                    var gid = String(a.work_group_id);
                    counts[gid] = (counts[gid] || 0) + 1;
                } else {
                    noGroupCount++;
                }
            });

            var htmlPills = '<div class="group-pills-bar" style="padding: 4px 0 8px 0;">';
            var isAllActive = activeGroupId === "all";
            htmlPills += '<button type="button" class="group-pill' + (isAllActive ? ' active' : '') + '" data-group-id="all">' +
                '<span class="group-pill-ico">🌐</span>' +
                '<span class="group-pill-title">Все</span>' +
                '<span class="group-pill-count">' + accounts.length + '</span>' +
            '</button>';

            groups.forEach(function(g) {
                var gid = String(g.id);
                var c = counts[gid] || 0;
                var isActive = activeGroupId === gid;
                htmlPills += '<button type="button" class="group-pill' + (isActive ? ' active' : '') + '" data-group-id="' + gid + '">' +
                    '<span class="group-pill-ico">📁</span>' +
                    '<span class="group-pill-title">' + esc(g.title) + '</span>' +
                    '<span class="group-pill-count">' + c + '</span>' +
                '</button>';
            });

            if (noGroupCount > 0) {
                var isNoneActive = activeGroupId === "none";
                htmlPills += '<button type="button" class="group-pill' + (isNoneActive ? ' active' : '') + '" data-group-id="none">' +
                    '<span class="group-pill-ico">📁</span>' +
                    '<span class="group-pill-title">Без группы</span>' +
                    '<span class="group-pill-count">' + noGroupCount + '</span>' +
                '</button>';
            }
            htmlPills += '</div>';
            pillsEl.innerHTML = htmlPills;

            pillsEl.querySelectorAll(".group-pill").forEach(function(pill) {
                pill.addEventListener("click", function() {
                    state.manageAccountsGroupId = pill.dataset.groupId;
                    renderManageAccountsList();
                });
            });
        }

        var filtered = accounts.filter(function(a) {
            var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
            if (activeGroupId !== "all") {
                if (activeGroupId === "none" && agid !== "none") return false;
                if (activeGroupId !== "none" && agid !== activeGroupId) return false;
            }
            if (!query) return true;
            var nameMatch = (a.name || "").toLowerCase().includes(query);
            var phoneMatch = (a.phone || "").toLowerCase().includes(query);
            var firstMatch = (a.first || "").toLowerCase().includes(query);
            var lastMatch = (a.last || "").toLowerCase().includes(query);
            return nameMatch || phoneMatch || firstMatch || lastMatch;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-2);">' + 
                (accounts.length === 0 ? 'Нет подключённых аккаунтов' : 'Аккаунты не найдены в данной группе') + '</div>';
            if (deleteBtn) {
                deleteBtn.textContent = 'Удалить выбранные (0)';
                deleteBtn.disabled = true;
            }
            if (selectAllEl) selectAllEl.checked = false;
            return;
        }

        listEl.innerHTML = "";
        filtered.forEach(function(acc) {
            var row = document.createElement("div");
            row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 12px; cursor: pointer; transition: background 0.15s;";
            row.onmouseover = function() { row.style.background = "rgba(255,255,255,0.07)"; };
            row.onmouseout = function() { row.style.background = "rgba(255,255,255,0.03)"; };

            var displayName = [acc.first, acc.last].filter(Boolean).join(" ") || acc.name;
            var initial = (displayName[0] || acc.name[0] || "?").toUpperCase();
            var colorIdx = Math.abs(acc.id || 0) % 8;

            row.innerHTML = 
                '<div style="display: flex; align-items: center; gap: 12px;">' +
                    '<input type="checkbox" class="ma-account-cb" value="' + esc(acc.name) + '" style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;">' +
                    '<div class="crm-avatar color-' + colorIdx + '" style="width: 36px; height: 36px; font-size: 14px; margin: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: 600;">' + esc(initial) + '</div>' +
                    '<div>' +
                        '<div style="font-weight: 600; font-size: 14px; color: #fff;">' + esc(displayName) + '</div>' +
                        '<div style="font-size: 12px; color: var(--text-2);">' + esc(acc.phone || acc.name) + '</div>' +
                    '</div>' +
                '</div>' +
                (acc.work_group_id ? '<span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: rgba(0,168,255,0.12); color: var(--accent); border: 1px solid rgba(0,168,255,0.3);">Группа ' + acc.work_group_id + '</span>' : '');

            var cb = row.querySelector(".ma-account-cb");
            row.addEventListener("click", function(e) {
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                    updateDeleteCount();
                }
            });
            cb.addEventListener("change", updateDeleteCount);

            listEl.appendChild(row);
        });

        function updateDeleteCount() {
            var checked = listEl.querySelectorAll(".ma-account-cb:checked");
            if (deleteBtn) {
                deleteBtn.textContent = "Удалить выбранные (" + checked.length + ")";
                deleteBtn.disabled = (checked.length === 0);
            }
            if (selectAllEl) {
                var allCbs = listEl.querySelectorAll(".ma-account-cb");
                selectAllEl.checked = (allCbs.length > 0 && checked.length === allCbs.length);
            }
        }

        updateDeleteCount();

        if (selectAllEl) {
            selectAllEl.onchange = function() {
                var cbs = listEl.querySelectorAll(".ma-account-cb");
                cbs.forEach(function(c) { c.checked = selectAllEl.checked; });
                updateDeleteCount();
            };
        }

        if (searchEl) {
            searchEl.oninput = function() {
                renderManageAccountsList();
            };
        }

        if (deleteBtn) {
            deleteBtn.onclick = async function() {
                var checked = listEl.querySelectorAll(".ma-account-cb:checked");
                var names = Array.from(checked).map(function(c) { return c.value; });
                if (names.length === 0) return;
                if (!confirm("Вы действительно хотите удалить выбранные аккаунты (" + names.length + ")? Их сессии будут удалены.")) return;

                deleteBtn.disabled = true;
                deleteBtn.textContent = "Удаление...";
                try {
                    for (var i = 0; i < names.length; i++) {
                        var fd = new FormData();
                        fd.append("account", names[i]);
                        await apiFetch("/api/delete_account", { method: "POST", body: fd });
                    }
                    toast("Аккаунты успешно удалены");
                    var r = await apiFetch("/api/accounts");
                    var data = await r.json();
                    state.accounts = data.accounts || [];
                    renderAccounts();
                    renderManageAccountsList();
                } catch(err) {
                    toast("Ошибка при удалении аккаунтов");
                } finally {
                    deleteBtn.disabled = false;
                }
            };
        }
    }

    var btnPM = document.getElementById("btn-open-proxy-manager-main");
    var modPM = document.getElementById("modal-proxy-manager-large");
    var clsPM = document.getElementById("btn-close-proxy-manager-large");
    if (btnPM && modPM) btnPM.addEventListener("click", function() { modPM.hidden = false; });
    if (clsPM && modPM) clsPM.addEventListener("click", function() { modPM.hidden = true; });
    if (modPM) modPM.addEventListener("click", function(e) { if (e.target === modPM) modPM.hidden = true; });

    var btnFT = document.getElementById("btn-open-farm-tools-main");
    var modFT = document.getElementById("modal-farm-tools");
    var clsFT = document.getElementById("btn-close-farm-tools");
    if (btnFT && modFT) btnFT.addEventListener("click", function() { modFT.hidden = false; });
    if (clsFT && modFT) clsFT.addEventListener("click", function() { modFT.hidden = true; });
    if (modFT) modFT.addEventListener("click", function(e) { if (e.target === modFT) modFT.hidden = true; });

    var btnAA = document.getElementById("btn-open-add-account-inner");
    if (btnAA) btnAA.addEventListener("click", function() {
        if (modMA) modMA.hidden = true;
        if (els.modalOverlay) els.modalOverlay.hidden = false;
    });

    // --- Табы добавления аккаунтов в modal-manage-accounts ---
    var tabAddPhone = document.getElementById("tab-btn-add-phone");
    var tabAddSession = document.getElementById("tab-btn-add-session");
    var paneAddPhone = document.getElementById("tab-pane-add-phone");
    var paneAddSession = document.getElementById("tab-pane-add-session");

    if (tabAddPhone && tabAddSession) {
        tabAddPhone.addEventListener("click", function() {
            tabAddPhone.classList.add("active");
            tabAddSession.classList.remove("active");
            if (paneAddPhone) paneAddPhone.style.display = "block";
            if (paneAddSession) paneAddSession.style.display = "none";
        });
        tabAddSession.addEventListener("click", function() {
            tabAddSession.classList.add("active");
            tabAddPhone.classList.remove("active");
            if (paneAddSession) paneAddSession.style.display = "block";
            if (paneAddPhone) paneAddPhone.style.display = "none";
        });
    }

    // --- Переключение режимов прокси (Без прокси / Пул / Один IP) ---
    var maPmTabs = document.querySelectorAll(".ma-pm-tab");
    var maProxyModeInput = document.getElementById("ma-proxy-mode");
    var maGroupBlock = document.getElementById("ma-proxy-group-block");
    var maSingleBlock = document.getElementById("ma-proxy-single-block");
    var maRatioInput = document.getElementById("ma-upload-ratio");
    var maRatioHint = document.getElementById("ma-ratio-hint");

    if (maPmTabs.length) {
        maPmTabs.forEach(function(btn) {
            btn.addEventListener("click", function() {
                maPmTabs.forEach(function(b) {
                    b.classList.remove("btn-primary", "active");
                    b.classList.add("btn-light");
                });
                btn.classList.remove("btn-light");
                btn.classList.add("btn-primary", "active");
                var mode = btn.dataset.mode || "none";
                if (maProxyModeInput) maProxyModeInput.value = mode;

                if (maGroupBlock) maGroupBlock.style.display = (mode === "group" ? "block" : "none");
                if (maSingleBlock) maSingleBlock.style.display = (mode === "single" ? "block" : "none");
            });
        });
    }

    if (maRatioInput && maRatioHint) {
        maRatioInput.addEventListener("input", function() {
            var val = parseInt(maRatioInput.value, 10) || 1;
            if (val <= 1) {
                maRatioHint.textContent = "1 аккаунт = 1 прокси (1:1)";
            } else {
                maRatioHint.textContent = "По " + val + " акк. на 1 прокси (" + val + ":1)";
            }
        });
    }

    async function populateUploadSelectors() {
        var wgSelect = document.getElementById("ma-upload-work-group");
        var pgSelect = document.getElementById("ma-upload-proxy-group");
        var spSelect = document.getElementById("ma-upload-single-proxy");

        // 1. Группы фермы
        if (wgSelect) {
            try {
                var r = await apiFetch("/api/groups");
                var d = await r.json();
                var groups = d.groups || [];
                wgSelect.innerHTML = '<option value="">Без группы (общий список)</option>' +
                    groups.map(function(g) {
                        return '<option value="' + g.id + '">📁 ' + esc(g.title) + '</option>';
                    }).join("");
            } catch(e) {}
        }

        // 2. Группы прокси
        if (pgSelect) {
            try {
                var pr = await apiFetch("/api/proxy_groups");
                var pd = await pr.json();
                var pgroups = pd.groups || [];
                if (pgroups.length) {
                    pgSelect.innerHTML = pgroups.map(function(g) {
                        var onlineStr = g.working_count ? (' (работает: ' + g.working_count + '/' + g.proxies_count + ')') : (' (' + g.proxies_count + ' прокси)');
                        return '<option value="' + g.id + '">🛡️ ' + esc(g.title) + onlineStr + '</option>';
                    }).join("");
                } else {
                    pgSelect.innerHTML = '<option value="">Нет созданных групп (создайте в Менеджере)</option>';
                }
            } catch(e) {}
        }

        // 3. Одиночные прокси
        if (spSelect) {
            try {
                var sr = await apiFetch("/api/proxies");
                var sd = await sr.json();
                var proxies = sd.proxies || [];
                spSelect.innerHTML = '<option value="">Выберите прокси...</option>' +
                    proxies.map(function(p) {
                        var st = p.status === 'working' ? ('🟢 ' + p.ping_ms + 'ms') : (p.status === 'failed' ? '🔴 Ошибка' : '⚪');
                        return '<option value="' + p.id + '">' + esc(p.host) + ':' + p.port + ' ' + st + ' (акк: ' + p.accounts_count + ')</option>';
                    }).join("");
            } catch(e) {}
        }
    }
    window.populateUploadSelectors = populateUploadSelectors;

    // --- Загрузка файлов сессий в modal-manage-accounts ---
    var maUploadForm = document.getElementById("ma-upload-form");
    var maUploadNote = document.getElementById("ma-upload-note");
    var btnMaUploadSubmit = document.getElementById("btn-ma-upload-submit");
    if (maUploadForm) {
        maUploadForm.addEventListener("submit", function(e) {
            e.preventDefault();
            var filesInput = document.getElementById("ma-session-files");
            if (!filesInput || !filesInput.files || filesInput.files.length === 0) {
                toast("Выберите файлы (.session, .json или .zip)");
                return;
            }
            if (maUploadNote) {
                maUploadNote.style.display = "block";
                maUploadNote.style.background = "rgba(0, 168, 255, 0.1)";
                maUploadNote.style.border = "1px solid rgba(0, 168, 255, 0.3)";
                maUploadNote.style.color = "#00a8ff";
                maUploadNote.textContent = "⏳ Загрузка и активация сессий…";
            }
            if (btnMaUploadSubmit) btnMaUploadSubmit.disabled = true;

            var fd = new FormData(maUploadForm);
            apiFetch("/upload_session/", { method: "POST", body: fd })
                .then(function(r) { return r.json(); })
                .then(async function(data) {
                    if (maUploadNote) {
                        maUploadNote.style.display = "block";
                        maUploadNote.style.background = "rgba(46, 213, 115, 0.1)";
                        maUploadNote.style.border = "1px solid rgba(46, 213, 115, 0.3)";
                        maUploadNote.style.color = "#2ed573";
                        maUploadNote.textContent = "✅ " + (data.message || "Сессии успешно добавлены и активированы!");
                    }
                    toast(data.message || "Сессии успешно добавлены!");
                    maUploadForm.reset();
                    try {
                        var accResp = await apiFetch("/api/accounts");
                        var accData = await accResp.json();
                        state.accounts = accData.accounts || [];
                        if (els.brandSub) els.brandSub.textContent = "CRM · " + state.accounts.length + " акк.";
                        renderAccounts();
                        renderManageAccountsList();
                    } catch(e) {}
                })
                .catch(function(err) {
                    if (maUploadNote) {
                        maUploadNote.style.display = "block";
                        maUploadNote.style.background = "rgba(255, 71, 87, 0.1)";
                        maUploadNote.style.border = "1px solid rgba(255, 71, 87, 0.3)";
                        maUploadNote.style.color = "#ff4757";
                        maUploadNote.textContent = "❌ Ошибка: " + (err.message || "не удалось загрузить файлы");
                    }
                    toast("Ошибка при загрузке сессий");
                })
                .finally(function() {
                    if (btnMaUploadSubmit) btnMaUploadSubmit.disabled = false;
                });
        });
    }

    // --- Переход в Менеджер прокси из Управления аккаунтами ---
    var btnMaPM = document.getElementById("btn-ma-open-proxy-manager");
    if (btnMaPM) {
        btnMaPM.addEventListener("click", function() {
            if (modMA) modMA.hidden = true;
            if (modPM) {
                modPM.hidden = false;
                if (typeof window.loadProxyManager === "function") window.loadProxyManager();
            }
        });
    }

    if (els.btnGetTelegramCode) {
      els.btnGetTelegramCode.addEventListener("click", async function() {
        if (!state.account) return;
        toast("Запрос кода от Telegram (777000)...");
        try {
          var r = await apiFetch("/api/accounts/" + encodeURIComponent(state.account.name) + "/telegram_code");
          var data = await r.json();
          if (data.success && data.code) {
            navigator.clipboard.writeText(data.code).catch(function(){});
            toast("Код скопирован: " + data.code);
            alert("🔐 Код авторизации Telegram для +" + state.account.name + ":\n\n" + data.code + "\n\nКод автоматически скопирован в буфер обмена!\n\nВремя: " + (data.date || "только что") + "\n\nТекст:\n" + data.text);
          } else if (data.success && data.text) {
            alert("✉️ Сообщение от Telegram (777000):\n\n" + data.text);
          } else {
            toast(data.message || "Код от Telegram не найден");
          }
        } catch(err) {
          toast("Ошибка при получении кода");
        }
      });
    }

    els.uploadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      els.uploadNote.textContent = "Загрузка и активация сессий…";
      els.uploadNote.className = "form-note";
      var fd = new FormData(els.uploadForm);
      apiFetch("/upload_session/", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(async function (data) {
          els.uploadNote.textContent = data.message || "Файлы загружены и активированы.";
          els.uploadNote.classList.add("ok");
          toast(data.message || "Сессии успешно добавлены!");
          // Мгновенно обновляем список аккаунтов на клиенте
          try {
            var accResp = await apiFetch("/api/accounts");
            var accData = await accResp.json();
            state.accounts = accData.accounts || [];
            if (els.brandSub) els.brandSub.textContent = "CRM · " + state.accounts.length + " акк.";
            renderAccounts();
          } catch(e) {}
        })
        .catch(function (err) {
          els.uploadNote.textContent = "Не удалось загрузить файлы: " + (err.message || "ошибка сети");
          els.uploadNote.classList.add("err");
        });
    });

    var data;
    try {
      var r = await apiFetch("/api/accounts");
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      data = await r.json();
    } catch (err) {
      toast("Не удалось загрузить аккаунты");
      return;
    }
    state.accounts = data.accounts || [];
    state.totalSessions = data.total_count !== undefined ? data.total_count : state.accounts.length;
    state.activeSessions = data.active_count !== undefined ? data.active_count : state.accounts.filter(function(x) { return x.status !== "error" && x.status !== "quarantined"; }).length;
    state.chatCache = {};
    if (els.brandSub) els.brandSub.textContent = "CRM · " + state.accounts.length + " акк.";
    renderAccounts();

    // Защита от холодного старта (когда бэкенд ещё поднимает MTProto соединения в фоне)
    if (!state.accounts.length) {
      setTimeout(async function() {
        if (!state.accounts.length) {
          try {
            var retryR = await apiFetch("/api/accounts");
            var retryData = await retryR.json();
            if (retryData && retryData.accounts && retryData.accounts.length) {
              state.accounts = retryData.accounts;
              state.totalSessions = retryData.total_count;
              state.activeSessions = retryData.active_count;
              renderAccounts();
            }
          } catch(e) {}
        }
      }, 1200);
      setTimeout(async function() {
        try {
          var retryR = await apiFetch("/api/accounts");
          var retryData = await retryR.json();
          if (retryData && retryData.accounts) {
            state.accounts = retryData.accounts;
            state.totalSessions = retryData.total_count;
            state.activeSessions = retryData.active_count;
            renderAccounts();
          }
        } catch(e) {}
      }, 3000);
    }

    var params = new URLSearchParams(location.search);
    var acc = params.get("account");
    var chatId = params.get("chat_id");

    if (acc && state.accounts.find(function (x) { return x.name === acc; })) {
      await selectAccount(acc);
      if (chatId) {
        var target = state.dialogs.find(function (x) { return x.id === Number(chatId); });
        if (target) selectDialog(target);
        else {
          apiFetch("/api/dialog?account=" + encodeURIComponent(acc) + "&chat_id=" + chatId)
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d && d.id) selectDialog(d); })
            .catch(function () {});
        }
      }
    }
  }

  if (document.readyState === "loading") {
    
    

    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



// ==========================================
// PROXY MANAGER LOGIC (3-COLUMN COCKPIT)
// ==========================================
(function() {
    function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    let pmState = {
        proxies: [],
        groups: [],
        nogroupStats: { count: 0, working_count: 0 },
        accounts: [],
        activeGroupId: "all", // "all", "none", or numeric group ID
        selectedProxyId: null
    };

    const els = {
        btnOpen: document.getElementById("btn-open-proxy-manager-main"),
        btnOpenFromMa: document.getElementById("btn-ma-open-proxy-manager"),
        modal: document.getElementById("modal-proxy-manager-large"),
        btnClose: document.getElementById("btn-close-proxy-manager-large"),
        totalBadge: document.getElementById("pm-total-badge"),

        // Col 1: Groups
        groupsList: document.getElementById("pm-groups-list"),
        btnNewGroup: document.getElementById("btn-pm-new-group"),

        // Col 2: Proxies list & tools
        btnAdd: document.getElementById("btn-pm-add"),
        btnCheckAll: document.getElementById("btn-pm-check-all"),
        btnOpenDistribute: document.getElementById("btn-pm-open-distribute"),
        searchInput: document.getElementById("pm-search"),
        groupTitle: document.getElementById("pm-current-group-title"),
        groupStats: document.getElementById("pm-current-group-stats"),
        groupActions: document.getElementById("pm-group-actions"),
        btnRenameGroup: document.getElementById("btn-pm-rename-group"),
        btnDeleteGroup: document.getElementById("btn-pm-delete-group"),
        listContainer: document.getElementById("pm-list-container"),

        // Col 3: Details
        detailTitle: document.getElementById("pm-detail-title"),
        detailMeta: document.getElementById("pm-detail-meta"),
        detailGroupWrap: document.getElementById("pm-detail-group-select-wrap"),
        detailGroupSelect: document.getElementById("pm-detail-move-group-select"),
        detailAccCount: document.getElementById("pm-detail-acc-count"),
        detailAccounts: document.getElementById("pm-detail-accounts"),
        btnCheckSelected: document.getElementById("btn-pm-check-selected"),
        btnBind: document.getElementById("btn-pm-bind"),
        btnDelete: document.getElementById("btn-pm-delete"),

        // Modal: Add Proxy
        modalAdd: document.getElementById("modal-add-proxy"),
        btnAddClose: document.getElementById("btn-pm-add-close"),
        addGroupSelect: document.getElementById("pm-add-group-select"),
        addInput: document.getElementById("pm-add-input"),
        btnAddCancel: document.getElementById("btn-pm-add-cancel"),
        btnAddConfirm: document.getElementById("btn-pm-add-confirm"),

        // Modal: Create Group
        modalCreateGroup: document.getElementById("modal-create-proxy-group"),
        inputNewGroupTitle: document.getElementById("pm-new-group-title"),
        btnCreateGroupCancel: document.getElementById("btn-pm-create-group-cancel"),
        btnCreateGroupConfirm: document.getElementById("btn-pm-create-group-confirm"),

        // Modal: Distribute Pool
        modalDistribute: document.getElementById("modal-distribute-proxies"),
        btnDistributeClose: document.getElementById("btn-pm-distribute-close"),
        distProxyGroupSelect: document.getElementById("pm-dist-proxy-group-select"),
        distWorkGroupSelect: document.getElementById("pm-dist-work-group-select"),
        distRatio: document.getElementById("pm-dist-ratio"),
        distHint: document.getElementById("pm-dist-preview-hint"),
        btnDistributeCancel: document.getElementById("btn-pm-distribute-cancel"),
        btnDistributeConfirm: document.getElementById("btn-pm-distribute-confirm")
    };

    if (!els.modal) return;

    // Load Data
    async function loadData() {
        if (els.listContainer) {
            els.listContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-2);"><svg class="svg-ico" viewBox="0 0 24 24" style="animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; width: 18px; height: 18px; margin-right: 8px;"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30" stroke-dashoffset="10"/></svg>Загрузка прокси и пулов...</div>';
        }
        try {
            const [pRes, gRes, aRes] = await Promise.all([
                apiFetch("/api/proxies"),
                apiFetch("/api/proxy_groups"),
                apiFetch("/api/accounts")
            ]);

            if (pRes.ok) {
                const pData = await pRes.json();
                pmState.proxies = pData.proxies || [];
            }
            if (gRes.ok) {
                const gData = await gRes.json();
                pmState.groups = gData.groups || [];
                pmState.nogroupStats = gData.nogroup || { count: 0, working_count: 0 };
            }
            if (aRes.ok) {
                const aData = await aRes.json();
                pmState.accounts = aData.accounts || [];
            }

            updateTotalBadge();
            renderGroups();
            renderList();
            if (pmState.selectedProxyId) {
                renderDetails(pmState.selectedProxyId);
            } else {
                renderDetails(null);
            }
        } catch(err) {
            console.error("Failed to load proxy manager data:", err);
            if (els.listContainer) {
                els.listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4757;">Ошибка загрузки прокси</div>';
            }
        }
    }

    function updateTotalBadge() {
        if (!els.totalBadge) return;
        const total = pmState.proxies.length;
        const working = pmState.proxies.filter(p => p.status === 'working').length;
        els.totalBadge.textContent = `${total} прокси (${working} раб.)`;
    }

    // Col 1: Render Proxy Groups Sidebar
    function renderGroups() {
        if (!els.groupsList) return;
        els.groupsList.innerHTML = "";

        const totalAll = pmState.proxies.length;
        const workingAll = pmState.proxies.filter(p => p.status === 'working').length;

        const nogroupProxies = pmState.proxies.filter(p => !p.proxy_group_id);
        const nogroupTotal = nogroupProxies.length;
        const nogroupWorking = nogroupProxies.filter(p => p.status === 'working').length;

        // 1. "Все прокси"
        const btnAll = document.createElement("div");
        btnAll.className = "pm-group-btn" + (pmState.activeGroupId === "all" ? " active" : "");
        btnAll.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                <span style="font-size: 14px;">🌐</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">Все прокси</span>
            </div>
            <span class="badge ${workingAll > 0 ? 'badge-green' : 'badge-purple'}" style="font-size: 11px; padding: 2px 7px; border-radius: 6px;">${workingAll}/${totalAll}</span>
        `;
        btnAll.onclick = () => {
            pmState.activeGroupId = "all";
            renderGroups();
            renderList();
        };
        els.groupsList.appendChild(btnAll);

        // 2. "Без группы"
        const btnNoGroup = document.createElement("div");
        btnNoGroup.className = "pm-group-btn" + (pmState.activeGroupId === "none" ? " active" : "");
        btnNoGroup.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                <span style="font-size: 14px;">📦</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">Без группы</span>
            </div>
            <span class="badge ${nogroupWorking > 0 ? 'badge-green' : 'badge-purple'}" style="font-size: 11px; padding: 2px 7px; border-radius: 6px;">${nogroupWorking}/${nogroupTotal}</span>
        `;
        btnNoGroup.onclick = () => {
            pmState.activeGroupId = "none";
            renderGroups();
            renderList();
        };
        els.groupsList.appendChild(btnNoGroup);

        // 3. Custom Groups
        if (pmState.groups.length > 0) {
            const divDivider = document.createElement("div");
            divDivider.style.cssText = "height: 1px; background: var(--glass-border); margin: 6px 0;";
            els.groupsList.appendChild(divDivider);

            pmState.groups.forEach(g => {
                const grpProxies = pmState.proxies.filter(p => String(p.proxy_group_id) === String(g.id));
                const grpTotal = grpProxies.length;
                const grpWorking = grpProxies.filter(p => p.status === 'working').length;

                const btn = document.createElement("div");
                btn.className = "pm-group-btn" + (String(pmState.activeGroupId) === String(g.id) ? " active" : "");
                btn.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        <span style="font-size: 14px;">📁</span>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;" title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</span>
                    </div>
                    <span class="badge ${grpWorking > 0 ? 'badge-green' : 'badge-purple'}" style="font-size: 11px; padding: 2px 7px; border-radius: 6px;">${grpWorking}/${grpTotal}</span>
                `;
                btn.onclick = () => {
                    pmState.activeGroupId = g.id;
                    renderGroups();
                    renderList();
                };
                els.groupsList.appendChild(btn);
            });
        }
    }

    // Col 2: Render Proxy List
    function renderList() {
        // Update Column 2 Header Title & Actions
        if (pmState.activeGroupId === "all") {
            if (els.groupTitle) els.groupTitle.textContent = "Все прокси";
            if (els.groupActions) els.groupActions.style.display = "none";
        } else if (pmState.activeGroupId === "none") {
            if (els.groupTitle) els.groupTitle.textContent = "Без группы";
            if (els.groupActions) els.groupActions.style.display = "none";
        } else {
            const curGroup = pmState.groups.find(g => String(g.id) === String(pmState.activeGroupId));
            if (els.groupTitle) els.groupTitle.textContent = curGroup ? curGroup.title : "Группа прокси";
            if (els.groupActions) els.groupActions.style.display = "flex";
        }

        // Filter proxies by group
        let filtered = pmState.proxies;
        if (pmState.activeGroupId === "none") {
            filtered = filtered.filter(p => !p.proxy_group_id);
        } else if (pmState.activeGroupId !== "all") {
            filtered = filtered.filter(p => String(p.proxy_group_id) === String(pmState.activeGroupId));
        }

        const totalInGroup = filtered.length;

        // Search query filter
        const query = (els.searchInput ? els.searchInput.value : "").trim().toLowerCase();
        if (query) {
            filtered = filtered.filter(p =>
                (p.host && p.host.toLowerCase().includes(query)) ||
                (p.port && String(p.port).includes(query)) ||
                (p.username && p.username.toLowerCase().includes(query)) ||
                (p.group_title && p.group_title.toLowerCase().includes(query))
            );
        }

        if (els.groupStats) {
            els.groupStats.textContent = `(показано: ${filtered.length} из ${totalInGroup})`;
        }

        if (!els.listContainer) return;

        if (filtered.length === 0) {
            if (totalInGroup === 0) {
                els.listContainer.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center; color: var(--text-2);">
                        <div style="font-size: 32px; margin-bottom: 10px;">📦</div>
                        <div style="font-size: 14px; font-weight: 500; color: #fff; margin-bottom: 6px;">В этом пуле пока нет прокси</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Добавьте прокси в этот пул или распределите имеющиеся</div>
                        <button class="btn btn-primary btn-sm" id="btn-pm-empty-add" style="display: inline-flex;">+ Добавить прокси в пул</button>
                    </div>
                `;
                const btnEmptyAdd = document.getElementById("btn-pm-empty-add");
                if (btnEmptyAdd) {
                    btnEmptyAdd.onclick = () => {
                        openAddProxyModal();
                    };
                }
            } else {
                els.listContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-2);">Ничего не найдено по запросу</div>';
            }
            return;
        }

        els.listContainer.innerHTML = "";

        filtered.forEach(p => {
            const isSelected = p.id === pmState.selectedProxyId;
            const statusClass = p.status === 'working' ? 'badge-green' : (p.status === 'failed' ? 'badge-red' : 'badge-purple');
            const statusText = p.status === 'working' ? `Active (${p.ping_ms ? p.ping_ms + 'ms' : 'OK'})` : (p.status === 'failed' ? 'Dead' : 'Unknown');
            
            const accCount = Number(p.accounts_count) || 0;
            const accBadgeClass = accCount > 0 ? 'badge-cyan' : 'badge-purple';

            const card = document.createElement("div");
            card.className = "pm-proxy-card" + (isSelected ? " selected" : "");
            card.style.cssText = `
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 14px; margin-bottom: 6px;
                background: ${isSelected ? 'rgba(0, 168, 255, 0.12)' : 'rgba(255,255,255,0.02)'};
                border: 1px solid ${isSelected ? '#00a8ff' : 'var(--glass-border)'};
                border-radius: 10px; cursor: pointer; transition: all 0.2s;
            `;

            card.onmouseover = () => { if (!isSelected) card.style.background = 'rgba(255,255,255,0.06)'; };
            card.onmouseout = () => { if (!isSelected) card.style.background = 'rgba(255,255,255,0.02)'; };

            card.onclick = () => {
                pmState.selectedProxyId = p.id;
                renderList();
                renderDetails(p.id);
            };

            const groupPillHtml = (pmState.activeGroupId === "all" && p.group_title) ?
                `<span style="font-size: 10.5px; background: rgba(181,60,255,0.15); color: #c060ff; border: 1px solid rgba(181,60,255,0.3); padding: 1px 6px; border-radius: 4px; margin-left: 6px;">${escapeHtml(p.group_title)}</span>` : '';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg class="svg-ico" style="width: 17px; height: 17px; color: ${isSelected ? '#00a8ff' : 'var(--text-2)'};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="6" x2="6.01" y2="6"></line></svg>
                    </div>
                    <div style="min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                            <span class="text-cyan" style="font-size: 13.5px; font-weight: 600; font-family: monospace;">${escapeHtml(p.host)}:${p.port}</span>
                            ${groupPillHtml}
                        </div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
                            ${p.username ? 'SOCKS5' : 'HTTP'} • <span class="${accBadgeClass}" style="padding: 1px 5px; border-radius: 4px; font-weight: 600;">${accCount} акк.</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span class="${statusClass}" style="font-size: 11px; font-weight: 600; padding: 3px 7px; border-radius: 6px;">${statusText}</span>
                    <button class="icon-btn pm-single-check-btn" data-id="${p.id}" title="Проверить пинг" style="color: var(--text-2); padding: 4px;">
                        <svg class="svg-ico" viewBox="0 0 24 24" style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                </div>
            `;
            els.listContainer.appendChild(card);
        });

        // Single check buttons
        document.querySelectorAll(".pm-single-check-btn").forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                btn.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24" style="width: 14px; height: 14px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30" stroke-dashoffset="10"/></svg>';
                const fd = new FormData();
                fd.append("proxy_id", id);
                try {
                    await apiFetch("/api/proxy/check", { method: "POST", body: fd });
                    await loadData();
                } catch(err) {
                    console.error(err);
                }
            };
        });
    }

    // Col 3: Render Proxy Details
    function renderDetails(id) {
        const p = id ? pmState.proxies.find(x => x.id === id) : null;
        if (!p) {
            pmState.selectedProxyId = null;
            if (els.detailTitle) els.detailTitle.innerText = "Выберите прокси";
            if (els.detailMeta) els.detailMeta.innerHTML = "";
            if (els.detailGroupWrap) els.detailGroupWrap.style.display = "none";
            if (els.detailAccCount) els.detailAccCount.innerText = "0";
            if (els.detailAccounts) {
                els.detailAccounts.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 25px 0;">Выберите прокси в списке слева для просмотра деталей и привязанных аккаунтов</div>';
            }
            if (els.btnCheckSelected) els.btnCheckSelected.style.display = "none";
            if (els.btnBind) els.btnBind.style.display = "none";
            if (els.btnDelete) els.btnDelete.style.display = "none";
            return;
        }

        if (els.detailTitle) els.detailTitle.innerText = `${p.host}:${p.port}`;
        if (els.detailMeta) {
            const proto = p.username ? "SOCKS5 (с авторизацией)" : "HTTP / SOCKS";
            const pingStr = p.status === 'working' ? `Active (${p.ping_ms || 0} ms)` : (p.status === 'failed' ? 'Dead' : 'Unknown');
            els.detailMeta.innerHTML = `<span>${proto}</span><br><span style="color: ${p.status === 'working' ? '#2ed573' : (p.status === 'failed' ? '#ff4757' : '#c060ff')};">${pingStr}</span>`;
        }

        // Group Mover Select
        if (els.detailGroupWrap && els.detailGroupSelect) {
            els.detailGroupWrap.style.display = "block";
            els.detailGroupSelect.innerHTML = '<option value="">Без группы</option>';
            pmState.groups.forEach(g => {
                const opt = document.createElement("option");
                opt.value = g.id;
                opt.textContent = g.title;
                if (String(p.proxy_group_id) === String(g.id)) opt.selected = true;
                els.detailGroupSelect.appendChild(opt);
            });
            if (!p.proxy_group_id) {
                els.detailGroupSelect.value = "";
            }

            els.detailGroupSelect.onchange = async () => {
                const tgt = els.detailGroupSelect.value;
                const fd = new FormData();
                fd.append("proxy_ids", String(p.id));
                fd.append("target_group_id", tgt);
                try {
                    await apiFetch("/api/proxy/move_group", { method: "POST", body: fd });
                    if (typeof toast === 'function') toast("Группа прокси изменена");
                    await loadData();
                } catch(e) {
                    alert("Не удалось переместить прокси в группу");
                }
            };
        }

        // Action Buttons
        if (els.btnCheckSelected) els.btnCheckSelected.style.display = "block";
        if (els.btnBind) els.btnBind.style.display = "block";
        if (els.btnDelete) els.btnDelete.style.display = "block";

        // Bound Accounts
        const bound = pmState.accounts.filter(a => a.proxy_id === p.id);
        if (els.detailAccCount) els.detailAccCount.innerText = String(bound.length);

        if (els.detailAccounts) {
            els.detailAccounts.innerHTML = "";
            if (bound.length === 0) {
                els.detailAccounts.innerHTML = `<div style="padding: 15px 0; color: var(--text-muted); font-size: 12px; text-align: center; font-style: italic;">Нет привязанных аккаунтов</div>`;
            } else {
                bound.forEach(a => {
                    const row = document.createElement("div");
                    row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px;";
                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <div class="crm-avatar" style="width: 26px; height: 26px; font-size: 12px; margin: 0; display: flex; align-items: center; justify-content: center; background: var(--accent-deep); flex-shrink: 0;">${(a.name || "?")[0].toUpperCase()}</div>
                            <div style="min-width: 0;">
                                <div style="font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.name)}</div>
                                ${a.phone ? ('<div style="font-size: 10.5px; color: var(--text-muted);">' + escapeHtml(a.phone) + '</div>') : ''}
                            </div>
                        </div>
                        <button class="icon-btn pm-unbind-btn" data-name="${escapeHtml(a.name)}" title="Отвязать аккаунт от прокси" style="color: #ff4757; padding: 3px;">
                            <svg class="svg-ico" viewBox="0 0 24 24" style="width: 13px; height: 13px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    els.detailAccounts.appendChild(row);
                });

                els.detailAccounts.querySelectorAll(".pm-unbind-btn").forEach(btn => {
                    btn.onclick = async (e) => {
                        e.stopPropagation();
                        const accName = btn.getAttribute("data-name");
                        if (!confirm(`Отвязать аккаунт ${accName} от этого прокси?`)) return;
                        const fd = new FormData();
                        fd.append("proxy_id", "0");
                        fd.append("accounts", accName);
                        try {
                            await apiFetch("/api/proxy/assign", { method: "POST", body: fd });
                            if (typeof toast === 'function') toast(`Аккаунт ${accName} отвязан`);
                            await loadData();
                        } catch(err) {
                            alert("Ошибка при отвязке аккаунта");
                        }
                    };
                });
            }

            // Bottom Add More Button
            const bindRow = document.createElement("div");
            bindRow.style.cssText = "display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(0, 168, 255, 0.05); border: 1px dashed rgba(0, 168, 255, 0.3); border-radius: 8px; cursor: pointer; margin-top: 4px;";
            bindRow.innerHTML = '<span style="color: #00a8ff; font-weight: bold; font-size: 14px;">+</span><span style="font-size: 12px; color: #00a8ff; font-weight: 600;">Привязать ещё аккаунты...</span>';
            bindRow.onclick = () => {
                if (typeof window.openAssignModal === 'function') window.openAssignModal(p.id);
            };
            els.detailAccounts.appendChild(bindRow);
        }
    }

    // Modal: Add Proxy
    function openAddProxyModal() {
        if (!els.modalAdd) return;
        if (els.addInput) els.addInput.value = "";
        if (els.addGroupSelect) {
            els.addGroupSelect.innerHTML = '<option value="">Без группы</option>';
            pmState.groups.forEach(g => {
                const opt = document.createElement("option");
                opt.value = g.id;
                opt.textContent = g.title;
                if (String(pmState.activeGroupId) === String(g.id)) opt.selected = true;
                els.addGroupSelect.appendChild(opt);
            });
            if (pmState.activeGroupId === "none" || pmState.activeGroupId === "all") {
                els.addGroupSelect.value = "";
            }
        }
        els.modalAdd.hidden = false;
    }

    if (els.btnAdd) els.btnAdd.onclick = openAddProxyModal;
    if (els.btnAddClose && els.modalAdd) els.btnAddClose.onclick = () => { els.modalAdd.hidden = true; };
    if (els.btnAddCancel && els.modalAdd) els.btnAddCancel.onclick = () => { els.modalAdd.hidden = true; };
    if (els.btnAddConfirm) {
        els.btnAddConfirm.onclick = async () => {
            const text = (els.addInput ? els.addInput.value : "").trim();
            if (!text) {
                alert("Введите хотя бы одну строку прокси");
                return;
            }
            const grpId = els.addGroupSelect ? els.addGroupSelect.value : "";
            els.btnAddConfirm.disabled = true;
            els.btnAddConfirm.innerText = "Добавление...";

            const fd = new FormData();
            fd.append("bulk_text", text);
            if (grpId) fd.append("proxy_group_id", grpId);

            try {
                const r = await apiFetch("/api/add_proxy", { method: "POST", body: fd });
                const res = await r.json();
                if (res.ok || res.status === "ok") {
                    if (els.modalAdd) els.modalAdd.hidden = true;
                    if (els.addInput) els.addInput.value = "";
                    if (typeof toast === 'function') {
                        toast(`Добавлено прокси: ${res.added !== undefined ? res.added : (res.count || 0)}`);
                    }
                    await loadData();
                    if (typeof window.populateUploadProxyGroups === 'function') window.populateUploadProxyGroups();
                } else {
                    alert(res.error || res.message || "Ошибка добавления");
                }
            } catch(e) {
                alert("Ошибка добавления прокси");
            } finally {
                els.btnAddConfirm.disabled = false;
                els.btnAddConfirm.innerText = "Добавить прокси";
            }
        };
    }

    // Modal: Create Group
    if (els.btnNewGroup) {
        els.btnNewGroup.onclick = () => {
            if (els.inputNewGroupTitle) els.inputNewGroupTitle.value = "";
            if (els.modalCreateGroup) els.modalCreateGroup.hidden = false;
        };
    }
    if (els.btnCreateGroupCancel && els.modalCreateGroup) {
        els.btnCreateGroupCancel.onclick = () => { els.modalCreateGroup.hidden = true; };
    }
    if (els.btnCreateGroupConfirm) {
        els.btnCreateGroupConfirm.onclick = async () => {
            const title = (els.inputNewGroupTitle ? els.inputNewGroupTitle.value : "").trim();
            if (!title) {
                alert("Введите название группы");
                return;
            }
            els.btnCreateGroupConfirm.disabled = true;
            const fd = new FormData();
            fd.append("title", title);
            try {
                const r = await apiFetch("/api/proxy_group/create", { method: "POST", body: fd });
                const res = await r.json();
                if (res.ok || res.status === "ok") {
                    if (els.modalCreateGroup) els.modalCreateGroup.hidden = true;
                    if (typeof toast === 'function') toast(`Группа «${title}» создана`);
                    pmState.activeGroupId = res.group_id || (res.group && res.group.id);
                    await loadData();
                    if (typeof window.populateUploadProxyGroups === 'function') window.populateUploadProxyGroups();
                } else {
                    alert(res.error || res.message || "Ошибка создания группы");
                }
            } catch(e) {
                alert("Ошибка сети при создании группы");
            } finally {
                els.btnCreateGroupConfirm.disabled = false;
            }
        };
    }

    // Rename Group
    if (els.btnRenameGroup) {
        els.btnRenameGroup.onclick = async () => {
            if (pmState.activeGroupId === "all" || pmState.activeGroupId === "none") return;
            const curGroup = pmState.groups.find(g => String(g.id) === String(pmState.activeGroupId));
            if (!curGroup) return;
            const newTitle = prompt("Новое название группы:", curGroup.title);
            if (!newTitle || newTitle.trim() === curGroup.title) return;
            const fd = new FormData();
            fd.append("group_id", curGroup.id);
            fd.append("title", newTitle.trim());
            try {
                await apiFetch("/api/proxy_group/rename", { method: "POST", body: fd });
                if (typeof toast === 'function') toast("Группа переименована");
                await loadData();
            } catch(e) { alert("Ошибка при переименовании группы"); }
        };
    }

    // Delete Group
    if (els.btnDeleteGroup) {
        els.btnDeleteGroup.onclick = async () => {
            if (pmState.activeGroupId === "all" || pmState.activeGroupId === "none") return;
            const curGroup = pmState.groups.find(g => String(g.id) === String(pmState.activeGroupId));
            if (!curGroup) return;
            if (!confirm(`Удалить группу «${curGroup.title}»?\n\nПрокси не удалятся, а перейдут в «Без группы».`)) return;
            const fd = new FormData();
            fd.append("group_id", curGroup.id);
            try {
                await apiFetch("/api/proxy_group/delete", { method: "POST", body: fd });
                if (typeof toast === 'function') toast("Группа удалена");
                pmState.activeGroupId = "all";
                await loadData();
            } catch(e) { alert("Ошибка при удалении группы"); }
        };
    }

    // Check All / Group
    if (els.btnCheckAll) {
        els.btnCheckAll.onclick = async () => {
            const oldHtml = els.btnCheckAll.innerHTML;
            els.btnCheckAll.disabled = true;
            els.btnCheckAll.innerHTML = '<svg class="svg-ico" viewBox="0 0 24 24" style="animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; width: 14px; height: 14px; margin-right: 4px;"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Проверка...';

            const fd = new FormData();
            if (pmState.activeGroupId === "none") {
                fd.append("proxy_group_id", "nogroup");
            } else if (pmState.activeGroupId !== "all") {
                fd.append("proxy_group_id", String(pmState.activeGroupId));
            }

            try {
                const r = await apiFetch("/api/proxy/check_all", { method: "POST", body: fd });
                const res = await r.json();
                if (typeof toast === 'function') {
                    toast(`Проверено: ${res.total || 0} прокси, работают: ${res.working || 0}`);
                }
                await loadData();
            } catch(e) {
                console.error(e);
            } finally {
                els.btnCheckAll.disabled = false;
                els.btnCheckAll.innerHTML = oldHtml;
            }
        };
    }

    // Check Selected Proxy
    if (els.btnCheckSelected) {
        els.btnCheckSelected.onclick = async () => {
            if (!pmState.selectedProxyId) return;
            const oldHtml = els.btnCheckSelected.innerHTML;
            els.btnCheckSelected.disabled = true;
            els.btnCheckSelected.innerHTML = 'Проверка пинга...';
            const fd = new FormData();
            fd.append("proxy_id", String(pmState.selectedProxyId));
            try {
                const r = await apiFetch("/api/proxy/check", { method: "POST", body: fd });
                const res = await r.json();
                if (typeof toast === 'function') {
                    toast(res.status === 'working' ? `Прокси доступен! Пинг: ${res.ping_ms}ms` : 'Прокси не отвечает');
                }
                await loadData();
            } catch(e) {
                alert("Ошибка проверки");
            } finally {
                els.btnCheckSelected.disabled = false;
                els.btnCheckSelected.innerHTML = oldHtml;
            }
        };
    }

    // Distribute Proxies Modal
    if (els.btnOpenDistribute) {
        els.btnOpenDistribute.onclick = async () => {
            if (!els.modalDistribute) return;
            if (els.distProxyGroupSelect) {
                els.distProxyGroupSelect.innerHTML = '<option value="">Все прокси (без фильтра группы)</option>';
                pmState.groups.forEach(g => {
                    const opt = document.createElement("option");
                    opt.value = g.id;
                    opt.textContent = `📁 ${g.title} (${g.working_count || 0} раб. / ${g.proxies_count || 0} всего)`;
                    if (String(pmState.activeGroupId) === String(g.id)) opt.selected = true;
                    els.distProxyGroupSelect.appendChild(opt);
                });
            }
            if (els.distWorkGroupSelect) {
                els.distWorkGroupSelect.innerHTML = '<option value="">Все активные аккаунты без исключения</option>';
                try {
                    const wgRes = await apiFetch("/api/groups");
                    if (wgRes.ok) {
                        const wgData = await wgRes.json();
                        (wgData.groups || []).forEach(wg => {
                            const opt = document.createElement("option");
                            opt.value = wg.id;
                            opt.textContent = `Группа фермы: ${wg.title}`;
                            els.distWorkGroupSelect.appendChild(opt);
                        });
                    }
                } catch(e) {}
            }
            if (els.distRatio) els.distRatio.value = 1;
            updateDistHint();
            els.modalDistribute.hidden = false;
        };
    }

    function updateDistHint() {
        if (!els.distHint || !els.distRatio) return;
        const r = parseInt(els.distRatio.value, 10) || 1;
        if (r === 1) {
            els.distHint.textContent = "1 аккаунт = 1 отдельный прокси (1:1)";
        } else {
            els.distHint.textContent = `До ${r} аккаунтов будут делить 1 прокси (${r}:1)`;
        }
    }
    if (els.distRatio) {
        els.distRatio.addEventListener("input", updateDistHint);
    }
    if (els.btnDistributeClose && els.modalDistribute) {
        els.btnDistributeClose.onclick = () => { els.modalDistribute.hidden = true; };
    }
    if (els.btnDistributeCancel && els.modalDistribute) {
        els.btnDistributeCancel.onclick = () => { els.modalDistribute.hidden = true; };
    }
    if (els.btnDistributeConfirm) {
        els.btnDistributeConfirm.onclick = async () => {
            const pgId = els.distProxyGroupSelect ? els.distProxyGroupSelect.value : "";
            const wgId = els.distWorkGroupSelect ? els.distWorkGroupSelect.value : "";
            const ratio = parseInt(els.distRatio ? els.distRatio.value : 1, 10) || 1;

            if (!confirm(`Выполнить распределение пула прокси?\nАккаунты на 1 прокси: ${ratio}`)) return;

            els.btnDistributeConfirm.disabled = true;
            els.btnDistributeConfirm.textContent = "Распределение...";

            const fd = new FormData();
            if (pgId) fd.append("proxy_group_id", pgId);
            if (wgId) fd.append("work_group_id", wgId);
            fd.append("accounts_per_proxy", String(ratio));

            try {
                const r = await apiFetch("/api/proxy/distribute", { method: "POST", body: fd });
                const res = await r.json();
                if (res.ok || res.status === "ok") {
                    if (els.modalDistribute) els.modalDistribute.hidden = true;
                    const msg = `Распределено: ${res.distributed !== undefined ? res.distributed : (res.assigned_accounts || 0)} аккаунтов`;
                    if (typeof toast === 'function') toast(msg);
                    alert(`✅ ${msg}`);
                    await loadData();
                } else {
                    alert(res.error || res.message || "Ошибка распределения");
                }
            } catch(e) {
                alert("Ошибка запроса при распределении");
            } finally {
                els.btnDistributeConfirm.disabled = false;
                els.btnDistributeConfirm.textContent = "Применить распределение";
            }
        };
    }

    // Delete Proxy
    if (els.btnDelete) {
        els.btnDelete.onclick = async () => {
            if (!pmState.selectedProxyId) return;
            const p = pmState.proxies.find(x => x.id === pmState.selectedProxyId);
            const pTitle = p ? `${p.host}:${p.port}` : "выбранный прокси";
            if (!confirm(`Точно удалить ${pTitle}?\nПривязанные аккаунты будут отвязаны.`)) return;

            const fd = new FormData();
            fd.append("proxy_id", String(pmState.selectedProxyId));
            try {
                await apiFetch("/api/proxy/delete", { method: "POST", body: fd });
                if (typeof toast === 'function') toast("Прокси удален");
                pmState.selectedProxyId = null;
                await loadData();
            } catch(e) {
                alert("Ошибка удаления");
            }
        };
    }

    // Bind Button
    if (els.btnBind) {
        els.btnBind.onclick = () => {
            if (pmState.selectedProxyId && typeof window.openAssignModal === 'function') {
                window.openAssignModal(pmState.selectedProxyId);
            }
        };
    }

    // Search input
    if (els.searchInput) els.searchInput.addEventListener("input", renderList);

    // Open & Close Modal
    if (els.btnOpen) {
        els.btnOpen.addEventListener("click", () => {
            if (els.modal) els.modal.hidden = false;
            loadData();
        });
    }
    if (els.btnOpenFromMa) {
        els.btnOpenFromMa.addEventListener("click", () => {
            const modMA = document.getElementById("modal-manage-accounts");
            if (modMA) modMA.hidden = true;
            if (els.modal) els.modal.hidden = false;
            loadData();
        });
    }
    if (els.btnClose && els.modal) {
        els.btnClose.addEventListener("click", () => {
            els.modal.hidden = true;
        });
    }
    if (els.modal) {
        els.modal.addEventListener("click", (e) => {
            if (e.target === els.modal) els.modal.hidden = true;
        });
    }

    // Public window hooks
    window.reloadProxyManagerLarge = loadData;
    window.loadProxyManager = loadData;
})();

