var els = window.els;
var state = window.state;
var esc = window.esc;
var toast = window.toast;
var apiFetch = window.apiFetch;
var loadGroups = window.loadGroups;
const broadcastBtn = document.getElementById('open-broadcast-btn');
const broadcastModal = document.getElementById('broadcast-modal');
const closeBroadcastBtn = document.getElementById('close-broadcast');

// === ОБРАБОТЧИКИ НОВЫХ МЕНЮ И ИНСТРУМЕНТОВ ===
  // Пытаемся найти кнопку и само окно Инструментов (названия могут немного отличаться в твоем html)
  var btnOpenTools = document.getElementById("btn-open-tools") || document.querySelector(".tools-btn"); 
  var modalTools = document.getElementById("tools-modal") || document.getElementById("modal-tools");

  if (btnOpenTools && modalTools) {
      btnOpenTools.addEventListener("click", function() { modalTools.hidden = false; });
  }
  if (els.btnCloseTools && modalTools) {
      els.btnCloseTools.addEventListener("click", function() { modalTools.hidden = true; });
  }
 if (els.btnOpenAddAccount) {
      els.btnOpenAddAccount.addEventListener("click", function() { 
          els.modalOverlay.hidden = false; 
          
          // Скрываем главное меню инструментов
          var modalTools = document.getElementById("modal-tools") || document.getElementById("tools-modal");
          if (modalTools) modalTools.hidden = true;
      });
  }
  if (els.btnOpenAddGroup) {
    els.btnOpenAddGroup.addEventListener("click", function() { 
        els.modalAddGroup.hidden = false; 
        
        // --- Находим нашу новую рамку и рисуем внутри аккаунты ---
        var accountsList = document.getElementById("add-group-accounts-list");
        if (accountsList) {
            accountsList.innerHTML = ""; // Очищаем список от старых галочек
            
            if (!state.accounts || state.accounts.length === 0) {
                accountsList.innerHTML = "<div style='color: var(--text-muted); font-size: 13px;'>Нет доступных аккаунтов</div>";
                return;
            }

            // Проходимся по всем аккаунтам из памяти
            state.accounts.forEach(function(acc) {
                var lbl = document.createElement("label");
                lbl.style.display = "flex";
                lbl.style.alignItems = "center";
                lbl.style.gap = "8px";
                lbl.style.cursor = "pointer";
                lbl.style.padding = "2px 0";
                
                // Собираем красивое имя: Имя Фамилия (если есть) или просто номер
                var displayName = acc.first + (acc.last ? " " + acc.last : "") || acc.name;

                // Создаем сам квадратик чекбокса и текст рядом
                lbl.innerHTML = '<input type="checkbox" value="' + esc(acc.name) + '" style="accent-color: var(--accent); width: 16px; height: 16px;">' + esc(displayName);
                accountsList.appendChild(lbl);
            });
        }
    });
}
  if (els.btnCancelGroup) {
      els.btnCancelGroup.addEventListener("click", function() { els.modalAddGroup.hidden = true; });
  }
  if (els.btnCancelGroupIcon) {
      els.btnCancelGroupIcon.addEventListener("click", function() { els.modalAddGroup.hidden = true; });
  }

// === НАСТРОЙКИ ПРОКСИ ===
var modalProxy = document.getElementById("modal-proxy");
var btnCloseProxy = document.getElementById("btn-close-proxy");

if (els.btnOpenProxy && modalProxy) {
    els.btnOpenProxy.addEventListener("click", function() { 
        modalProxy.hidden = false; 
        // Скрываем основное меню инструментов, чтобы не мешало
        var modalTools = document.getElementById("modal-tools") || document.getElementById("tools-modal");
        if (modalTools) modalTools.hidden = true; 
        
        // ЗАГРУЖАЕМ СПИСОК ПРОКСИ КАЖДЫЙ РАЗ ПРИ ОТКРЫТИИ ОКНА:
        if (typeof window.loadProxies === "function") {
            window.loadProxies();
        }
    });
}

if (btnCloseProxy && modalProxy) {
    btnCloseProxy.addEventListener("click", function() {
        modalProxy.hidden = true;
        
        // Return to proxy manager
        var pmModal = document.getElementById("modal-proxy-manager");
        if (pmModal) pmModal.hidden = false;
    });
}

// Переключение вкладок "Поштучно" и "Списком"
var tabSingleProxy = document.getElementById("tab-single-proxy");
var tabBulkProxy = document.getElementById("tab-bulk-proxy");
var formSingleProxy = document.getElementById("form-single-proxy");
var formBulkProxy = document.getElementById("form-bulk-proxy");

if (tabSingleProxy && tabBulkProxy) {
    tabSingleProxy.addEventListener("click", function() {
        tabSingleProxy.className = "btn btn-primary";
        tabBulkProxy.className = "btn btn-light";
        formSingleProxy.hidden = false;
        formBulkProxy.hidden = true;
    });
    
    tabBulkProxy.addEventListener("click", function() {
        tabBulkProxy.className = "btn btn-primary";
        tabSingleProxy.className = "btn btn-light";
        formBulkProxy.hidden = false;
        formSingleProxy.hidden = true;
    });
}

// Отправка ОДНОГО прокси
var btnSaveSingleProxy = document.getElementById("btn-save-single-proxy");
if (btnSaveSingleProxy) {
    btnSaveSingleProxy.addEventListener("click", function() {
        var host = document.getElementById("proxy-host").value.trim();
        var port = document.getElementById("proxy-port").value.trim();
        var user = document.getElementById("proxy-user").value.trim();
        var pass = document.getElementById("proxy-pass").value.trim();

        if (!host || !port) {
            toast("IP и Порт обязательны!");
            return;
        }

        btnSaveSingleProxy.disabled = true;
        var fd = new FormData();
        fd.append("host", host);
        fd.append("port", port);
        fd.append("username", user);
        fd.append("password", pass);

        apiFetch("/api/add_proxy", { method: "POST", body: fd })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.ok) {
                    toast("Прокси добавлен!");
                    document.getElementById("proxy-host").value = "";
                    document.getElementById("proxy-port").value = "";
                    document.getElementById("proxy-user").value = "";
                    document.getElementById("proxy-pass").value = "";
                    if (typeof window.loadProxies === "function") window.loadProxies();
                    if (typeof loadProxyManager === "function") loadProxyManager();
                }
            })
            .catch(function() { toast("Ошибка сети"); })
            .finally(function() { btnSaveSingleProxy.disabled = false; });
    });
}

// Отправка СПИСКА прокси
var btnSaveBulkProxy = document.getElementById("btn-save-bulk-proxy");
if (btnSaveBulkProxy) {
    btnSaveBulkProxy.addEventListener("click", function() {
        var bulkText = document.getElementById("proxy-bulk-text").value.trim();
        if (!bulkText) {
            toast("Вставьте список прокси!");
            return;
        }

        btnSaveBulkProxy.disabled = true;
        var fd = new FormData();
        fd.append("bulk_text", bulkText);

        apiFetch("/api/add_proxy", { method: "POST", body: fd })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.ok) {
                    toast("Добавлено прокси: " + data.added);
                    document.getElementById("proxy-bulk-text").value = "";
                    if (typeof window.loadProxies === "function") window.loadProxies();
                    if (typeof loadProxyManager === "function") loadProxyManager();
                }
            })
            .catch(function() { toast("Ошибка сети"); })
            .finally(function() { btnSaveBulkProxy.disabled = false; });
    });
}

// Функция для загрузки и отрисовки списка прокси
window.loadProxies = function() {
    var proxyList = document.getElementById("proxy-list");
    var dropdowns = document.querySelectorAll(".proxy-dropdown"); // Ищем все выпадающие списки
    
    apiFetch("/api/proxies")
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok && data.proxies) {
                
                // 1. Заполняем настройки прокси (текстовый список)
                if (proxyList) {
                    proxyList.innerHTML = "";
                    if (data.proxies.length === 0) {
                        proxyList.innerHTML = "<div style='color: var(--text-muted); font-size: 13px;'>Нет добавленных прокси</div>";
                    } else {
                        data.proxies.forEach(function(p) {
                            var div = document.createElement("div");
                            div.style.padding = "5px";
                            div.style.borderBottom = "1px solid var(--line)";
                            div.textContent = "🌐 " + p.host + ":" + p.port + (p.username ? " (" + p.username + ")" : "");
                            proxyList.appendChild(div);
                        });
                    }
                }

                // 2. Заполняем ВСЕ выпадающие списки в формах добавления аккаунта
                dropdowns.forEach(function(select) {
                    var currentVal = select.value; // Запоминаем, что было выбрано
                    
                    // Очищаем и ставим дефолтный пункт
                    select.innerHTML = '<option value="">Без прокси (свой IP)</option>';
                    
                    data.proxies.forEach(function(p) {
                        var opt = document.createElement("option");
                        opt.value = p.id; // Передаем на сервер именно ID прокси
                        opt.textContent = p.host + ":" + p.port;
                        select.appendChild(opt);
                    });
                    
                    select.value = currentVal; // Восстанавливаем выбор
                });
            }
        });
};

// Открываем модальное окно при клике на кнопку
if (broadcastBtn && broadcastModal) {
    broadcastBtn.addEventListener('click', () => {
        broadcastModal.classList.remove('hidden');
    });
}

// Закрываем окно при клике на крестик
if (closeBroadcastBtn && broadcastModal) {
    closeBroadcastBtn.addEventListener('click', () => {
        broadcastModal.classList.add('hidden');
    });
}

// 3. Сохранение новой группы
if (els.btnSaveGroup) {
    els.btnSaveGroup.addEventListener("click", function () {
    // Читаем текст, который ввел пользователь
    var title = els.newGroupTitle.value.trim();

    // --- НОВЫЙ КОД: Ищем все включенные галочки и собираем их значения ---
    var checkedBoxes = document.querySelectorAll('#add-group-accounts-list input[type="checkbox"]:checked');
    // Превращаем галочки в удобный список (массив) с именами аккаунтов
    var selectedAccounts = Array.prototype.slice.call(checkedBoxes).map(function(b) { return b.value; });

    if (!title) {
    toast("Введите название группы!");
    return;
    }

els.btnSaveGroup.disabled = true;
toast("Создание группы...");

var fd = new FormData();
fd.append("title", title);
// Склеиваем список аккаунтов через запятую и кладем в посылку для сервера
fd.append("accounts", selectedAccounts.join(","));

        apiFetch("/api/add_group", { method: "POST", body: fd })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.ok) {
                    toast("Группа успешно создана!");
                    els.modalAddGroup.hidden = true;
                    els.newGroupTitle.value = ""; 
                    
                    // --- МГНОВЕННОЕ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ---
                    // Перезапрашиваем с сервера свежий список аккаунтов...
                    apiFetch("/api/accounts").then(function(r) { return r.json(); }).then(function(accData) {
                        state.accounts = accData.accounts || [];
                        // ...и свежий список групп, а затем перерисовываем левое меню
                        if (typeof window.loadGroups === "function") window.loadGroups();
                        if (typeof window.renderAccounts === "function") window.renderAccounts(); 
                    });
                } else {
                    toast(data.error || "Ошибка при создании группы");
                }
            })
            .catch(function () { toast("Ошибка сети"); })
            .finally(function () { els.btnSaveGroup.disabled = false; });
    });
}

// === УДАЛЕНИЕ ГРУППЫ ===
var btnOpenDeleteGroup = document.getElementById("btn-open-delete-group");
var modalDeleteGroup = document.getElementById("modal-delete-group");
var btnCancelDeleteGroup = document.getElementById("btn-cancel-delete-group");
var btnCancelDeleteGroupIcon = document.getElementById("btn-cancel-delete-group-icon");
var deleteGroupSelect = document.getElementById("delete-group-select");
var btnConfirmDeleteGroup = document.getElementById("btn-confirm-delete-group");

// Новые элементы для списка
var deleteGroupAccountsBlock = document.getElementById("delete-group-accounts-block");
var deleteGroupAccountsList = document.getElementById("delete-group-accounts-list");
var btnSelectAllDelete = document.getElementById("btn-select-all-delete");

// Функция: рисует аккаунты, относящиеся к выбранной в списке группе
function renderDeleteGroupAccounts() {
    var groupId = parseInt(deleteGroupSelect.value);
    deleteGroupAccountsList.innerHTML = "";
    
    // Ищем аккаунты этой группы
    var groupAccounts = state.accounts.filter(function(a) { return a.work_group_id === groupId; });
    
    if (groupAccounts.length === 0) {
        deleteGroupAccountsBlock.hidden = true;
        return;
    }
    
    deleteGroupAccountsBlock.hidden = false;
    groupAccounts.forEach(function(acc) {
        var lbl = document.createElement("label");
        lbl.style.display = "flex";
        lbl.style.alignItems = "center";
        lbl.style.gap = "8px";
        lbl.style.cursor = "pointer";
        
        var displayName = acc.first + (acc.last ? " " + acc.last : "") || acc.name;
        lbl.innerHTML = '<input type="checkbox" value="' + esc(acc.name) + '" style="accent-color: var(--danger); width: 16px; height: 16px;">' + esc(displayName);
        deleteGroupAccountsList.appendChild(lbl);
    });
}

// Если выбрали другую группу в выпадающем списке - перерисовываем аккаунты
if (deleteGroupSelect) deleteGroupSelect.addEventListener("change", renderDeleteGroupAccounts);

// Выбрать все чекбоксы разом
if (btnSelectAllDelete) {
    btnSelectAllDelete.addEventListener("click", function() {
        var boxes = deleteGroupAccountsList.querySelectorAll('input[type="checkbox"]');
        var allChecked = Array.prototype.slice.call(boxes).every(function(b) { return b.checked; });
        boxes.forEach(function(b) { b.checked = !allChecked; });
    });
}

// Открытие окна
if (btnOpenDeleteGroup && modalDeleteGroup) {
    btnOpenDeleteGroup.addEventListener("click", function() {
        deleteGroupSelect.innerHTML = "";
        
        if (!state.groups || state.groups.length === 0) {
            deleteGroupSelect.innerHTML = "<option value=''>Нет созданных групп</option>";
            btnConfirmDeleteGroup.disabled = true;
            deleteGroupAccountsBlock.hidden = true;
        } else {
            btnConfirmDeleteGroup.disabled = false;
            state.groups.forEach(function(group) {
                var opt = document.createElement("option");
                opt.value = group.id;
                opt.textContent = group.title;
                deleteGroupSelect.appendChild(opt);
            });
            // Сразу рисуем аккаунты для первой группы в списке
            renderDeleteGroupAccounts();
        }
        modalDeleteGroup.hidden = false;
    });
}

// Закрытие
function closeDeleteGroupModal() { if (modalDeleteGroup) modalDeleteGroup.hidden = true; }
if (btnCancelDeleteGroup) btnCancelDeleteGroup.addEventListener("click", closeDeleteGroupModal);
if (btnCancelDeleteGroupIcon) btnCancelDeleteGroupIcon.addEventListener("click", closeDeleteGroupModal);

// Отправка на сервер
if (btnConfirmDeleteGroup) {
    btnConfirmDeleteGroup.addEventListener("click", function() {
        var groupId = deleteGroupSelect.value;
        
        // Собираем имена аккаунтов, которые пользователь отметил галочкой
        var checkedBoxes = deleteGroupAccountsList.querySelectorAll('input[type="checkbox"]:checked');
        var accountsToDelete = Array.prototype.slice.call(checkedBoxes).map(function(b) { return b.value; });

        if (!groupId) return;

        btnConfirmDeleteGroup.disabled = true;
        toast("Удаление...");

        var fd = new FormData();
        fd.append("group_id", groupId);
        fd.append("accounts_to_delete", accountsToDelete.join(","));

        apiFetch("/api/delete_group", { method: "POST", body: fd })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.ok) {
                    toast("Успешно удалено!");
                    closeDeleteGroupModal();
                    
                    if (state.selectedGroupId == groupId) state.selectedGroupId = null;
                    
                    // --- МГНОВЕННОЕ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ---
                    // Перезапрашиваем с сервера свежий список аккаунтов...
                    apiFetch("/api/accounts").then(function(r) { return r.json(); }).then(function(accData) {
                        state.accounts = accData.accounts || [];
                        // ...и свежий список групп
                        if (typeof loadGroups === "function") loadGroups();
                        renderAccounts(); 
                    });
                } else {
                    toast(data.error || "Ошибка при удалении");
                }
            })
            .catch(function () { toast("Ошибка сети"); })
            .finally(function () { btnConfirmDeleteGroup.disabled = false; });
    });
}

// ==========================================
// Proxy Manager
// ==========================================
var elsPm = {
    modal: document.getElementById("modal-proxy-manager"),
    btnClose: document.getElementById("btn-pm-close"),
    btnAdd: document.getElementById("btn-pm-add-table"),
    list: document.getElementById("pm-list"),
    
    assignModal: document.getElementById("modal-proxy-assign"),
    assignClose: document.getElementById("btn-pa-close"),
    assignSave: document.getElementById("btn-pa-save"),
    assignList: document.getElementById("pa-accounts-list"),
    assignProxyId: document.getElementById("pa-proxy-id"),
    
    openManagerBtn: document.getElementById("btn-open-proxy-manager")
};

if (elsPm.openManagerBtn) {
    elsPm.openManagerBtn.addEventListener("click", function() {
        var mt = document.getElementById("modal-tools");
        if (mt) mt.hidden = true;
        elsPm.modal.hidden = false;
        loadProxyManager();
    });
}
if (elsPm.btnClose) elsPm.btnClose.addEventListener("click", function() { elsPm.modal.hidden = true; });
if (elsPm.assignClose) elsPm.assignClose.addEventListener("click", function() { elsPm.assignModal.hidden = true; });
if (elsPm.btnAdd) {
    elsPm.btnAdd.addEventListener("click", function() {
        elsPm.modal.hidden = true; // hide proxy manager
        var pModal = document.getElementById("modal-proxy");
        if (pModal) pModal.hidden = false;
    });
}

function loadProxyManager() {
    if (!elsPm.list) return;
    elsPm.list.innerHTML = "<tr><td colspan='4' style='padding:15px; text-align:center;'>Загрузка...</td></tr>";
    
    apiFetch("/api/proxies")
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok && data.proxies) {
                elsPm.list.innerHTML = "";
                // Inject Direct IP pseudo-proxy
                data.proxies.unshift({
                    id: 0, host: "Прямой IP", port: "", username: "", 
                    status: "working", ping_ms: 0, last_check: 0, accounts_count: "?" 
                });

                data.proxies.forEach(function(p) {
                    var tr = document.createElement("tr");
                    tr.style.borderBottom = "1px solid var(--line)";
                    
                    var statusColor = "gray";
                    var statusText = "Неизвестно";
                    if (p.status === "working") { statusColor = "green"; statusText = "ОК (" + p.ping_ms + " ms)"; }
                    else if (p.status === "failed") { statusColor = "red"; statusText = "Ошибка"; }
                    
                    var checkTime = p.last_check ? new Date(p.last_check * 1000).toLocaleTimeString() : "Никогда";
                    
                    tr.innerHTML = 
                        "<td style='padding: 10px;'>" + p.host + ":" + p.port + "<br><span style='font-size:11px; color:var(--text-muted);'>" + (p.username || "Без авторизации") + "</span></td>" +
                        "<td style='padding: 10px;'><span style='display:inline-block; width:8px; height:8px; border-radius:50%; background:" + statusColor + "; margin-right:5px;'></span>" + statusText + "<br><span style='font-size:11px; color:var(--text-muted);'>" + checkTime + "</span></td>" +
                        "<td style='padding: 10px;'>" + p.accounts_count + "</td>" +
                        "<td style='padding: 10px; text-align: right;'>" +
                            (p.id !== 0 ? "<button class='btn btn-light btn-sm btn-check' data-id='" + p.id + "' style='margin-right:5px;'>Проверить</button>" : "") +
                            "<button class='btn btn-light btn-sm btn-assign' data-id='" + p.id + "' style='margin-right:5px;'>Привязать</button>" +
                            (p.id !== 0 ? "<button class='btn btn-danger btn-sm btn-del' data-id='" + p.id + "'>Удалить</button>" : "") +
                        "</td>";
                    elsPm.list.appendChild(tr);
                });
                
                // Attach events
                var checks = elsPm.list.querySelectorAll(".btn-check");
                checks.forEach(function(btn) {
                    btn.addEventListener("click", function() {
                        btn.disabled = true;
                        btn.textContent = "...";
                        var fd = new FormData();
                        fd.append("proxy_id", btn.getAttribute("data-id"));
                        apiFetch("/api/proxy/check", { method: "POST", body: fd })
                            .then(function() { loadProxyManager(); });
                    });
                });
                
                var dels = elsPm.list.querySelectorAll(".btn-del");
                dels.forEach(function(btn) {
                    btn.addEventListener("click", function() {
                        if (!confirm("Удалить этот прокси? Аккаунты будут отвязаны.")) return;
                        var fd = new FormData();
                        fd.append("proxy_id", btn.getAttribute("data-id"));
                        apiFetch("/api/proxy/delete", { method: "POST", body: fd })
                            .then(function() { loadProxyManager(); window.loadProxies(); });
                    });
                });
                
                var assigns = elsPm.list.querySelectorAll(".btn-assign");
                assigns.forEach(function(btn) {
                    btn.addEventListener("click", function() {
                        openAssignModal(btn.getAttribute("data-id"));
                    });
                });
            }
        });
}

function openAssignModal(proxyId) {
    elsPm.assignProxyId.value = proxyId;
    elsPm.assignList.innerHTML = "Загрузка...";
    elsPm.assignModal.hidden = false;
    
    // We need to fetch all accounts to let user select them.
    // Wait, state.accounts is globally available from app_v3.js!
    if (typeof state !== 'undefined' && state.accounts) {
        elsPm.assignList.innerHTML = "";
        
        // We also need to know which accounts ALREADY have this proxy.
        // We can fetch accounts from backend? We don't have an endpoint returning proxy_id per account.
        // Let's just list all accounts, and the user selects the ones they want.
        state.accounts.forEach(function(acc) {
            var label = document.createElement("label");
            label.className = "checkbox-row";
            label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "8px"; label.style.padding = "5px 0";
            
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = acc.name;
            cb.checked = (acc.proxy_id != null && String(acc.proxy_id) === String(proxyId));
            
            var span = document.createElement("span");
            span.textContent = (acc.first ? acc.first + " " : "") + (acc.last ? acc.last + " " : "") + "(" + acc.name + (acc.phone ? " / " + acc.phone : "") + ")";
            
            label.appendChild(cb);
            label.appendChild(span);
            elsPm.assignList.appendChild(label);
        });
    }
}
window.openAssignModal = openAssignModal;

if (elsPm.assignSave) {
    elsPm.assignSave.addEventListener("click", function() {
        var proxyId = elsPm.assignProxyId.value;
        var checked = [];
        var cbs = elsPm.assignList.querySelectorAll("input[type='checkbox']:checked");
        cbs.forEach(function(cb) { checked.push(cb.value); });
        
        if (checked.length === 0) {
            if (!confirm("Вы сняли выбор со всех аккаунтов. Отвязать все аккаунты от этого прокси?")) {
                return;
            }
        }
        
        elsPm.assignSave.disabled = true;
        elsPm.assignSave.textContent = "Сохранение...";
        
        var fd = new FormData();
        fd.append("proxy_id", proxyId);
        fd.append("accounts", checked.join(","));
        
        apiFetch("/api/proxy/assign", { method: "POST", body: fd })
            .then(function() {
                elsPm.assignModal.hidden = true;
                elsPm.assignSave.disabled = false;
                elsPm.assignSave.textContent = "Сохранить привязку";
                loadProxyManager();
                if (typeof window.reloadProxyManagerLarge === 'function') window.reloadProxyManagerLarge();
            });
    });
}
