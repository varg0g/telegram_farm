var els = window.els;
var state = window.state;
var toast = window.toast;
var esc = window.esc;
var renderAccounts = window.renderAccounts;
var selectDialog = window.selectDialog;
var renderDialogs = window.renderDialogs;
var $ = window.$;


// ---------- Общая лента (Feed) ----------
  var globalFeedWrap = document.getElementById("globalFeedWrap");
  var globalFeedList = document.getElementById("globalFeedList");
  window.globalFeedWrap = globalFeedWrap;
  window.globalFeedList = globalFeedList;

function renderFeedItem(item) {
      var date = new Date(item.date * 1000);
      var timeStr = ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);

      // Ищем понятное имя аккаунта нашей фермы
      var accObj = state.accounts.find(function(a) { return a.name === item.account; });
      var displayName = accObj ? (accObj.first + (accObj.last ? " " + accObj.last : "") || accObj.name) : item.account;

      // Получаем цвет заглушки и первую букву для аватарки
      var colorIdx = typeof hashColor === "function" ? hashColor(String(item.chat_id)) : Math.abs(item.chat_id) % 8;
      var initial = (item.chat_title[0] || "?").toUpperCase();
      
      // Пытаемся подтянуть реальную аватарку чата (как в обычном списке)
      var avatarHtml = typeof avatarImg === "function" ? avatarImg(item.account, item.chat_id) : "";

      // Формируем текст превью. Добавляем "Вы:" если сообщение исходящее.
      var previewText = (item.is_outgoing ? "Вы: " : "") + item.text;

      var onlineDot = (item.online && item.type === "private") ? '<span class="online-dot" title="В сети"></span>' : '';

      // Возвращаем HTML-структуру карточки диалога (dlg-row)
      return '<a class="dlg-row" style="cursor: pointer; margin-bottom: 2px;" onclick="window.openFeedDialog(\'' + esc(item.account) + '\', ' + item.chat_id + '); return false;">' +
          '<span class="av av-md av-' + colorIdx + '">' + esc(initial) + avatarHtml + onlineDot + '</span>' +
          '<span class="dlg-mid">' +
              '<span class="dlg-title">' + esc(item.chat_title) + '</span>' +
              '<span class="dlg-preview">' + 
                  // Красиво выделяем имя нашего аккаунта синим цветом перед текстом
                  '<span style="color: var(--accent); font-weight: 600; font-size: 11.5px; margin-right: 5px;">[' + esc(displayName) + ']</span>' + 
                  esc(previewText) + 
              '</span>' +
          '</span>' +
          '<span class="dlg-side">' +
              '<span class="dlg-time">' + timeStr + '</span>' +
              // Если сообщение входящее И оно еще не прочитано, показываем 1
              ((item.unread_count && item.unread_count > 0) ? '<span class="unread">' + item.unread_count + '</span>' : '') +
          '</span>' +
      '</a>';
  }

// Обновленная функция: открывает чат без переключения средней колонки
  window.openFeedDialog = async function(accName, chatId) {
      // Тихо устанавливаем аккаунт в память
      var a = state.accounts.find(function (x) { return x.name === accName; });
      if (!a) return;
      state.account = a;
      
      // Визуально подсвечиваем аккаунт в левом меню
      renderAccounts(); 
      
      var target = state.dialogs.find(function (x) { return x.id === Number(chatId); });
      
      if (target) {
          selectDialog(target); 
      } else {
          apiFetch("/api/dialog?account=" + encodeURIComponent(accName) + "&chat_id=" + chatId)
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d && d.id) selectDialog(d); })
              .catch(function () {});
      }
  };

  function filterFeedItems(items) {
    if (!items || !items.length) return [];
    var tab = state.dialogFilterTab || "all";
    var q = (state.dialogFilter || "").trim().toLowerCase();
    if (!q) {
      var sInput = document.getElementById("dialogSearch");
      if (sInput) q = sInput.value.trim().toLowerCase();
    }

    var list = items;

    if (state.selectedGroupId !== null) {
      list = list.filter(function(item) {
        var accObj = state.accounts.find(function(a) { return a.name === item.account; });
        return accObj && accObj.work_group_id === state.selectedGroupId;
      });
    }

    if (tab === "archive" || state.showArchive) {
      list = list.filter(function(item) { return item.folder_id === 1; });
    } else {
      list = list.filter(function(item) { return item.folder_id !== 1; });
      if (tab === "private") {
        list = list.filter(function(item) { return item.type === "private" || item.type === "saved"; });
      } else if (tab === "group") {
        list = list.filter(function(item) { return item.type === "group" || item.type === "supergroup"; });
      } else if (tab === "channel") {
        list = list.filter(function(item) { return item.type === "channel"; });
      } else if (tab === "bot") {
        list = list.filter(function(item) { return item.type === "bot"; });
      }
    }

    if (q) {
      list = list.filter(function(item) {
        return (String(item.chat_title || "") + " " + String(item.text || "") + " " + String(item.account || "")).toLowerCase().indexOf(q) !== -1;
      });
    }

    return list;
  }

  function renderFeed() {
    if (!globalFeedWrap) globalFeedWrap = document.getElementById("globalFeedWrap");
    if (!globalFeedList) globalFeedList = document.getElementById("globalFeedList");
    if (!globalFeedWrap || globalFeedWrap.style.display === "none") return;

    var items = state.feedItems || [];
    var filtered = filterFeedItems(items);
    if (filtered.length > 0) {
      globalFeedList.innerHTML = filtered.map(renderFeedItem).join("");
    } else {
      var emptyMsg = items.length ? "В этой категории пока нет сообщений..." : "Пока нет новых сообщений...";
      globalFeedList.innerHTML = '<div class="chat-empty">' + emptyMsg + '</div>';
    }
  }

function loadFeed(force) {
    if (!globalFeedWrap) globalFeedWrap = document.getElementById("globalFeedWrap");
    if (!globalFeedList) globalFeedList = document.getElementById("globalFeedList");
    if (!force && (!globalFeedWrap || globalFeedWrap.style.display === "none" || document.hidden)) {
        return;
    }
    var url = "/api/feed?limit=200";
    if (typeof state !== 'undefined' && state.selectedGroupId !== null) {
        var groupAccs = state.accounts.filter(function(a) { return a.work_group_id === state.selectedGroupId; }).map(function(a) { return a.name; });
        if (groupAccs.length > 0) {
            url += "&accounts=" + encodeURIComponent(groupAccs.join(","));
        } else {
            url += "&accounts=__NONE__";
        }
    }
    apiFetch(url)
        .then(function(r) { return r.json(); })
          .then(function(data) {
              if (!data.ok || !data.items) return;
              state.feedItems = data.items;
              renderFeed();
          })
          .catch(function() {});
  }

  window.loadFeed = loadFeed;
  window.renderFeed = renderFeed;
  window.renderFeedItem = renderFeedItem;

  // Опрос только когда лента активна
  setInterval(function() {
      loadFeed(false);
  }, 5000);

// ---------- Рассылка ----------
  var broadcastList = $("#broadcast-chats-list");
  var broadcastText = $("#broadcast-text");
  var sendBroadcastBtn = $("#send-broadcast-btn");
  var openBroadcastBtn = $("#open-broadcast-btn");

  if (openBroadcastBtn) {
    openBroadcastBtn.addEventListener("click", function () {
      if (!state.account || !state.dialogs.length) {
        toast("Сначала выберите аккаунт и дождитесь загрузки чатов!");
        return;
      }
      broadcastList.innerHTML = "";
      // Отрисовываем чекбокс для каждого загруженного чата
      state.dialogs.forEach(function (d) {
        var lbl = document.createElement("label");
        lbl.style.display = "block";
        lbl.style.marginBottom = "8px";
        lbl.style.color = "var(--text)";
        lbl.style.cursor = "pointer";
        lbl.innerHTML = '<input type="checkbox" value="' + d.id + '" checked style="margin-right:8px; accent-color: var(--accent);">' + esc(d.title);
        broadcastList.appendChild(lbl);
      });
    });
  }

  if (sendBroadcastBtn) {
    sendBroadcastBtn.addEventListener("click", function () {
      var text = broadcastText.value.trim();
      var boxes = broadcastList.querySelectorAll('input[type="checkbox"]:checked');
      var checked = Array.prototype.slice.call(boxes).map(function(b) { return b.value; });

      if (!text) { toast("Введите текст рассылки!"); return; }
      if (checked.length === 0) { toast("Выберите хотя бы один чат!"); return; }

      sendBroadcastBtn.disabled = true;
      toast("Рассылка (" + checked.length + " чатов)...");

      var fd = new FormData();
      fd.append("account", state.account.name);
      fd.append("chat_ids", checked.join(","));
      fd.append("message_text", text);

      apiFetch("/api/broadcast", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            toast("Успешно отправлено: " + data.sent + " из " + data.total);
            document.getElementById("broadcast-modal").classList.add("hidden");
            broadcastText.value = "";
          } else {
            toast(data.error || "Ошибка рассылки");
          }
        })
        .catch(function () { toast("Ошибка сети"); })
        .finally(function () { sendBroadcastBtn.disabled = false; });
    });
  }