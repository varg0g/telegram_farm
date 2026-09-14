// ==========================================================================
// TELEGRAM FARM — FARM TOOLS & AUTOMATION (PARSER, BROADCAST, ACTIVITY CENTER)
// ==========================================================================

(function () {
    "use strict";

    // Элементы модалок
    var modalFarmTools = document.getElementById("modal-farm-tools");
    var modalParser = document.getElementById("modal-tool-parser");
    var modalBroadcast = document.getElementById("modal-tool-broadcast");
    var modalProfile = document.getElementById("modal-tool-profile");
    var modalTools = document.getElementById("modal-tools");

    var btnOpenProfileMain = document.getElementById("btn-open-profile-manager-main");
    var btnOpenProfileMenu = document.getElementById("btn-open-profile-manager");

    var cardParser = document.getElementById("card-tool-parser");
    var cardBroadcast = document.getElementById("card-tool-broadcast");
    var cardWarmup = document.getElementById("card-tool-warmup");
    var cardAging = document.getElementById("card-tool-aging");
    var cardNeuro = document.getElementById("card-tool-neuro");

    // Инициализация привязок
    function initTools() {
        // Клик по кнопкам "Автозаполнение и приватность"
        if (btnOpenProfileMain) {
            btnOpenProfileMain.addEventListener("click", function () {
                openProfileModal();
            });
        }
        if (btnOpenProfileMenu) {
            btnOpenProfileMenu.addEventListener("click", function () {
                if (modalTools) modalTools.hidden = true;
                openProfileModal();
            });
        }

        var closeProfileBtn = document.getElementById("btn-close-profile-tool");
        if (closeProfileBtn) {
            closeProfileBtn.addEventListener("click", function () {
                if (modalProfile) modalProfile.hidden = true;
            });
        }

        // Клик по карточке "Парсер"
        if (cardParser) {
            cardParser.addEventListener("click", function () {
                if (modalFarmTools) modalFarmTools.hidden = true;
                openParserModal();
            });
        }

        // Клик по карточке "Спам / Рассылка"
        if (cardBroadcast) {
            cardBroadcast.addEventListener("click", function () {
                if (modalFarmTools) modalFarmTools.hidden = true;
                openBroadcastModal();
            });
        }

        // Клик по карточке "Дайвинчик Bot"
        var cardLeomatch = document.getElementById("card-tool-leomatch");
        if (cardLeomatch) {
            cardLeomatch.addEventListener("click", function () {
                if (modalFarmTools) modalFarmTools.hidden = true;
                if (typeof window.openLeomatchModal === "function") {
                    window.openLeomatchModal();
                }
            });
        }

        // Карточки в разработке
        [cardWarmup, cardAging, cardNeuro].forEach(function(card) {
            if (card) {
                card.addEventListener("click", function() {
                    if (window.toast) window.toast("Данный модуль будет доступен в следующем обновлении");
                });
            }
        });

        // Закрытие модалок
        var closeParserBtn = document.getElementById("btn-close-parser");
        if (closeParserBtn) {
            closeParserBtn.addEventListener("click", function () {
                if (modalParser) modalParser.hidden = true;
            });
        }

        var closeBroadcastBtn = document.getElementById("btn-close-broadcast-tool");
        if (closeBroadcastBtn) {
            closeBroadcastBtn.addEventListener("click", function () {
                if (modalBroadcast) modalBroadcast.hidden = true;
            });
        }

        // Кнопки "Назад к инструментам"
        var backFromParser = document.getElementById("btn-back-from-parser");
        if (backFromParser) {
            backFromParser.addEventListener("click", function () {
                if (modalParser) modalParser.hidden = true;
                if (modalFarmTools) modalFarmTools.hidden = false;
            });
        }

        var backFromBroadcast = document.getElementById("btn-back-from-broadcast");
        if (backFromBroadcast) {
            backFromBroadcast.addEventListener("click", function () {
                if (modalBroadcast) modalBroadcast.hidden = true;
                if (modalFarmTools) modalFarmTools.hidden = false;
            });
        }

        // Настройка табов в парсере
        setupParserTabs();

        // Обработчики парсера
        setupParserActions();

        // Обработчики рассылки
        setupBroadcastActions();

        // Настройка автозаполнения профилей и конфиденциальности
        setupProfileTabs();
        setupProfileActions();

        // Activity Center (Центр активности)
        setupActivityCenter();
    }

    // ==========================================================================
    // ПАРСЕР
    // ==========================================================================

    function switchParserTab(tabName) {
        var tabBtnSettings = document.getElementById("tab-btn-parser-settings");
        var tabBtnLeads = document.getElementById("tab-btn-parser-leads");
        var tabContentSettings = document.getElementById("tab-parser-settings");
        var tabContentLeads = document.getElementById("tab-parser-leads");

        var isSettings = (tabName === "settings");

        if (tabBtnSettings) {
            if (isSettings) tabBtnSettings.classList.add("active");
            else tabBtnSettings.classList.remove("active");
        }
        if (tabBtnLeads) {
            if (!isSettings) tabBtnLeads.classList.add("active");
            else tabBtnLeads.classList.remove("active");
        }

        if (tabContentSettings) {
            tabContentSettings.hidden = !isSettings;
            tabContentSettings.style.display = isSettings ? "flex" : "none";
        }
        if (tabContentLeads) {
            tabContentLeads.hidden = isSettings;
            tabContentLeads.style.display = isSettings ? "none" : "flex";
        }

        if (!isSettings) {
            loadLeads(1);
        }
    }
    window.switchParserTab = switchParserTab;

    function openParserModal() {
        if (!modalParser) return;
        modalParser.hidden = false;
        switchParserTab("settings");

        // Заполняем список доступных аккаунтов
        var selectAcc = document.getElementById("parser-account-select");
        if (selectAcc && window.state && window.state.accounts) {
            selectAcc.innerHTML = "";
            window.state.accounts.forEach(function (acc) {
                var opt = document.createElement("option");
                opt.value = acc.name;
                var d = window.accountDisplay ? window.accountDisplay(acc) : { full: acc.name };
                opt.textContent = d.full + (acc.phone ? " (" + acc.phone + ")" : "");
                selectAcc.appendChild(opt);
            });
        }

        // Загружаем лиды
        loadLeads(1);
    }

    function setupParserTabs() {
        var tabBtnSettings = document.getElementById("tab-btn-parser-settings");
        var tabBtnLeads = document.getElementById("tab-btn-parser-leads");

        if (tabBtnSettings) tabBtnSettings.addEventListener("click", function () { switchParserTab("settings"); });
        if (tabBtnLeads) tabBtnLeads.addEventListener("click", function () { switchParserTab("leads"); });
    }

    function setupParserActions() {
        var btnStart = document.getElementById("btn-start-parse");
        if (btnStart) {
            btnStart.addEventListener("click", async function () {
                var accSelect = document.getElementById("parser-account-select");
                var targetInput = document.getElementById("parser-target-chat");
                var modeSelect = document.getElementById("parser-mode-select");
                var filterUser = document.getElementById("parser-filter-username");
                var filterNoBots = document.getElementById("parser-filter-no-bots");
                var maxCount = document.getElementById("parser-max-count");

                var acc = accSelect ? accSelect.value : "";
                var target = targetInput ? targetInput.value.trim() : "";

                if (!acc) {
                    if (window.toast) window.toast("Выберите аккаунт для парсинга");
                    return;
                }
                if (!target) {
                    if (window.toast) window.toast("Введите ссылку или юзернейм группы");
                    return;
                }

                btnStart.disabled = true;
                btnStart.textContent = "Запуск...";

                var fd = new FormData();
                fd.append("account_name", acc);
                fd.append("target_chat", target);
                fd.append("parse_mode", modeSelect ? modeSelect.value : "members");
                fd.append("filter_username", filterUser && filterUser.checked ? "true" : "false");
                fd.append("filter_no_bots", filterNoBots && filterNoBots.checked ? "true" : "false");
                fd.append("max_count", maxCount ? maxCount.value : "500");

                try {
                    var r = await fetch("/api/tools/parse", { method: "POST", body: fd });
                    var data = await r.json();
                    if (r.ok) {
                        if (window.toast) window.toast("⚡ Сбор запущен! Следите за прогрессом в правом нижнем углу");
                        // Переключаемся на вкладку базы лидов
                        switchParserTab("leads");
                    } else {
                        if (window.toast) window.toast("Ошибка: " + (data.detail || "не удалось запустить парсер"));
                    }
                } catch (e) {
                    if (window.toast) window.toast("Сетевая ошибка при запуске парсера");
                } finally {
                    btnStart.disabled = false;
                    btnStart.textContent = "Начать сбор лидов";
                }
            });
        }

        // Поиск по лидам
        var leadsSearch = document.getElementById("leads-search-input");
        if (leadsSearch) {
            var searchTimeout;
            leadsSearch.addEventListener("input", function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(function () {
                    loadLeads(1, leadsSearch.value.trim());
                }, 300);
            });
        }

        // Очистить базу лидов
        var btnClear = document.getElementById("btn-clear-leads");
        if (btnClear) {
            btnClear.addEventListener("click", async function () {
                if (!confirm("Вы уверены, что хотите удалить всех спарсенных лидов из базы?")) return;
                try {
                    await fetch("/api/tools/leads/clear", { method: "POST" });
                    if (window.toast) window.toast("База лидов очищена");
                    loadLeads(1);
                } catch (e) {
                    if (window.toast) window.toast("Ошибка очистки базы");
                }
            });
        }
    }

    async function loadLeads(page, query) {
        var tbody = document.getElementById("leads-table-body");
        var countEl = document.getElementById("leads-count-badge");
        if (!tbody) return;

        var url = "/api/tools/leads?page=" + (page || 1) + "&limit=50";
        if (query) url += "&q=" + encodeURIComponent(query);

        try {
            var r = await fetch(url);
            var data = await r.json();
            if (countEl) countEl.textContent = data.total || 0;

            if (!data.items || !data.items.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color: var(--text-2);">База пуста. Запустите сбор во вкладке «Параметры сбора»</td></tr>';
                return;
            }

            var html = "";
            data.items.forEach(function (l) {
                var statusBadge = '<span class="badge badge-purple">Новый</span>';
                if (l.status === "messaged") statusBadge = '<span class="badge badge-green">Отправлено</span>';
                if (l.status === "restricted") statusBadge = '<span class="badge badge-red">Приватный</span>';

                var nameDisplay = (l.first_name + " " + l.last_name).trim() || "—";
                var dateStr = l.created_at ? new Date(l.created_at * 1000).toLocaleDateString() : "—";

                html += '<tr>' +
                    '<td style="color: var(--accent); font-weight: 500;">' + window.esc(l.username || ("ID: " + l.user_id)) + '</td>' +
                    '<td>' + window.esc(nameDisplay) + '</td>' +
                    '<td>' + window.esc(l.phone || "—") + '</td>' +
                    '<td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + window.esc(l.source_chat || "—") + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                    '<td style="color: var(--text-2); font-size: 12px;">' + window.esc(dateStr) + '</td>' +
                '</tr>';
            });
            tbody.innerHTML = html;
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--warn); padding: 20px;">Ошибка загрузки данных</td></tr>';
        }
    }

    // ==========================================================================
    // МАССОВАЯ РАССЫЛКА (SMART BROADCAST)
    // ==========================================================================

    var broadcastSelector = null;
    function openBroadcastModal() {
        if (!modalBroadcast) return;
        modalBroadcast.hidden = false;

        if (typeof window.createGroupAccountSelector === "function") {
            if (!broadcastSelector) {
                broadcastSelector = window.createGroupAccountSelector({
                    pillsContainer: "broadcast-groups-bar",
                    gridContainer: "broadcast-accounts-checkboxes",
                    metaContainer: "broadcast-selector-meta",
                    inputName: "broadcast-acc",
                    colorTheme: "blue",
                    allowAllGroup: true
                });
            } else {
                broadcastSelector.refresh();
            }
        }

        // Обновляем счетчик доступных лидов из базы
        fetch("/api/tools/leads?status=new&limit=1").then(function(r) { return r.json(); }).then(function(data) {
            var leadCountEl = document.getElementById("broadcast-leads-available");
            if (leadCountEl) leadCountEl.textContent = data.total || 0;
        }).catch(function() {});
    }

    function setupBroadcastActions() {
        // Переключение источника базы (Лиды vs Свой список)
        var radioLeads = document.getElementById("broadcast-src-leads");
        var radioCustom = document.getElementById("broadcast-src-custom");
        var customWrap = document.getElementById("broadcast-custom-wrap");

        if (radioLeads && radioCustom && customWrap) {
            radioLeads.addEventListener("change", function () {
                if (radioLeads.checked) customWrap.hidden = true;
            });
            radioCustom.addEventListener("change", function () {
                if (radioCustom.checked) customWrap.hidden = false;
            });
        }

        // Проверка спинтакса (предпросмотр вариантов)
        var btnPreviewSpintax = document.getElementById("btn-preview-spintax");
        if (btnPreviewSpintax) {
            btnPreviewSpintax.addEventListener("click", async function () {
                var txtArea = document.getElementById("broadcast-message-text");
                var previewBox = document.getElementById("spintax-preview-box");
                var text = txtArea ? txtArea.value.trim() : "";
                if (!text) {
                    if (window.toast) window.toast("Введите текст сообщения");
                    return;
                }

                var fd = new FormData();
                fd.append("text", text);
                try {
                    var r = await fetch("/api/tools/spintax_preview", { method: "POST", body: fd });
                    var data = await r.json();
                    if (previewBox && data.samples) {
                        previewBox.hidden = false;
                        previewBox.innerHTML = '<div style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: var(--accent);">Примеры рандомизации:</div>' +
                            data.samples.map(function (s, idx) {
                                return '<div style="padding: 6px 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 4px; font-size: 12px; color: #fff;">' +
                                    '<span style="opacity: 0.5; margin-right: 6px;">#' + (idx + 1) + '</span>' + window.esc(s) + '</div>';
                            }).join("");
                    }
                } catch (e) {}
            });
        }

        // Запуск рассылки
        var btnStartBroadcast = document.getElementById("btn-start-broadcast");
        if (btnStartBroadcast) {
            btnStartBroadcast.addEventListener("click", async function () {
                var checkedBoxes = document.querySelectorAll('input[name="broadcast-acc"]:checked');
                var selectedAccs = Array.from(checkedBoxes).map(function (b) { return b.value; });
                if (!selectedAccs.length) {
                    if (window.toast) window.toast("Выберите хотя бы один аккаунт для рассылки");
                    return;
                }

                var txtArea = document.getElementById("broadcast-message-text");
                var text = txtArea ? txtArea.value.trim() : "";
                if (!text) {
                    if (window.toast) window.toast("Введите текст сообщения для рассылки");
                    return;
                }

                var isCustom = radioCustom && radioCustom.checked;
                var customTargets = document.getElementById("broadcast-custom-targets");
                var customText = customTargets ? customTargets.value.trim() : "";
                if (isCustom && !customText) {
                    if (window.toast) window.toast("Введите список юзернеймов получателей");
                    return;
                }

                var minDelay = document.getElementById("broadcast-min-delay");
                var maxDelay = document.getElementById("broadcast-max-delay");
                var maxPerAcc = document.getElementById("broadcast-max-per-acc");
                var totalLimit = document.getElementById("broadcast-total-limit");

                btnStartBroadcast.disabled = true;
                btnStartBroadcast.textContent = "Запуск рассылки...";

                var fd = new FormData();
                fd.append("account_names", selectedAccs.join(","));
                fd.append("target_source", isCustom ? "custom" : "leads");
                fd.append("custom_targets", customText);
                fd.append("template_text", text);
                fd.append("min_delay", minDelay ? minDelay.value : "15");
                fd.append("max_delay", maxDelay ? maxDelay.value : "35");
                fd.append("max_per_account", maxPerAcc ? maxPerAcc.value : "25");
                fd.append("limit_total", totalLimit ? totalLimit.value : "200");

                try {
                    var r = await fetch("/api/tools/broadcast", { method: "POST", body: fd });
                    var data = await r.json();
                    if (r.ok) {
                        if (window.toast) window.toast("🚀 Рассылка запущена (" + data.targets_count + " получателей)! Прогресс в Центре активности.");
                        if (modalBroadcast) modalBroadcast.hidden = true;
                    } else {
                        if (window.toast) window.toast("Ошибка: " + (data.detail || "не удалось запустить рассылку"));
                    }
                } catch (e) {
                    if (window.toast) window.toast("Сетевая ошибка при запуске рассылки");
                } finally {
                    btnStartBroadcast.disabled = false;
                    btnStartBroadcast.textContent = "Запустить авторассылку";
                }
            });
        }
    }

    // ==========================================================================
    // АВТОЗАПОЛНЕНИЕ ПРОФИЛЕЙ И КОНФИДЕНЦИАЛЬНОСТЬ
    // ==========================================================================

    async function updateAvatarsCount() {
        try {
            var res = await fetch("/api/tools/profile/avatars-count");
            var data = await res.json();
            var badge = document.getElementById("prof-avatars-count-badge");
            if (badge) badge.textContent = data.count || 0;
        } catch (e) {}
    }

    function switchProfileTab(tabName) {
        var tabBtnData = document.getElementById("tab-btn-prof-data");
        var tabBtnPrivacy = document.getElementById("tab-btn-prof-privacy");
        var tabBtnSecurity = document.getElementById("tab-btn-prof-security");

        var contentData = document.getElementById("tab-content-prof-data");
        var contentPrivacy = document.getElementById("tab-content-prof-privacy");
        var contentSecurity = document.getElementById("tab-content-prof-security");

        var tabs = {
            data: { btn: tabBtnData, content: contentData },
            privacy: { btn: tabBtnPrivacy, content: contentPrivacy },
            security: { btn: tabBtnSecurity, content: contentSecurity }
        };

        [tabBtnData, tabBtnPrivacy, tabBtnSecurity].forEach(function (b) {
            if (b) b.classList.remove("active");
        });

        Object.keys(tabs).forEach(function (key) {
            var item = tabs[key];
            var isActive = (key === tabName);
            if (item.btn && isActive) {
                item.btn.classList.add("active");
            }
            if (item.content) {
                item.content.hidden = !isActive;
                item.content.style.display = isActive ? "flex" : "none";
            }
        });
    }
    window.switchProfileTab = switchProfileTab;

    var profileSelector = null;
    function openProfileModal() {
        if (!modalProfile) return;
        modalProfile.hidden = false;
        switchProfileTab("data");

        if (typeof window.createGroupAccountSelector === "function") {
            if (!profileSelector) {
                profileSelector = window.createGroupAccountSelector({
                    pillsContainer: "prof-groups-bar",
                    gridContainer: "prof-accounts-checkboxes",
                    metaContainer: "prof-selector-meta",
                    inputName: "prof-acc",
                    inputClass: "prof-acc-cb",
                    colorTheme: "blue",
                    allowAllGroup: true
                });
            } else {
                profileSelector.refresh();
            }
        }

        updateAvatarsCount();
    }

    function setupProfileTabs() {
        var tabBtnData = document.getElementById("tab-btn-prof-data");
        var tabBtnPrivacy = document.getElementById("tab-btn-prof-privacy");
        var tabBtnSecurity = document.getElementById("tab-btn-prof-security");

        if (tabBtnData) tabBtnData.addEventListener("click", function () { switchProfileTab("data"); });
        if (tabBtnPrivacy) tabBtnPrivacy.addEventListener("click", function () { switchProfileTab("privacy"); });
        if (tabBtnSecurity) tabBtnSecurity.addEventListener("click", function () { switchProfileTab("security"); });
    }

    function setupProfileActions() {
        // Пресеты конфиденциальности
        var btnPresetFarm = document.getElementById("btn-priv-preset-farm");
        var btnPresetDefault = document.getElementById("btn-priv-preset-default");

        if (btnPresetFarm) {
            btnPresetFarm.addEventListener("click", function () {
                document.getElementById("priv-phone-number").value = "nobody";
                document.getElementById("priv-added-by-phone").value = "nobody";
                document.getElementById("priv-status-timestamp").value = "everybody";
                document.getElementById("priv-profile-photo").value = "everybody";
                document.getElementById("priv-forwards").value = "nobody";
                document.getElementById("priv-phone-call").value = "nobody";
                document.getElementById("priv-phone-p2p").value = "nobody";
                document.getElementById("priv-chat-invite").value = "contacts";
                if (window.toast) window.toast("Применен пресет: Максимальная безопасность фермы");
            });
        }

        if (btnPresetDefault) {
            btnPresetDefault.addEventListener("click", function () {
                document.getElementById("priv-phone-number").value = "contacts";
                document.getElementById("priv-added-by-phone").value = "everybody";
                document.getElementById("priv-status-timestamp").value = "everybody";
                document.getElementById("priv-profile-photo").value = "everybody";
                document.getElementById("priv-forwards").value = "everybody";
                document.getElementById("priv-phone-call").value = "everybody";
                document.getElementById("priv-phone-p2p").value = "contacts";
                document.getElementById("priv-chat-invite").value = "everybody";
                if (window.toast) window.toast("Применен пресет: Обычный профиль");
            });
        }

        // Загрузка фото в пул
        var btnUploadAvatars = document.getElementById("btn-prof-upload-avatars");
        var fileInputAvatars = document.getElementById("prof-avatar-file-input");
        if (btnUploadAvatars && fileInputAvatars) {
            btnUploadAvatars.addEventListener("click", function () {
                fileInputAvatars.click();
            });

            fileInputAvatars.addEventListener("change", async function () {
                var files = fileInputAvatars.files;
                if (!files || !files.length) return;

                var fd = new FormData();
                for (var i = 0; i < files.length; i++) {
                    fd.append("files", files[i]);
                }

                btnUploadAvatars.disabled = true;
                btnUploadAvatars.textContent = "Загрузка...";
                try {
                    var r = await fetch("/api/tools/profile/avatars", { method: "POST", body: fd });
                    var res = await r.json();
                    if (res.status === "ok") {
                        if (window.toast) window.toast("Загружено " + res.uploaded + " фото (всего в пуле: " + res.total + ")");
                        updateAvatarsCount();
                    } else {
                        if (window.toast) window.toast("Ошибка загрузки фото");
                    }
                } catch (e) {
                    if (window.toast) window.toast("Ошибка соединения");
                } finally {
                    btnUploadAvatars.disabled = false;
                    btnUploadAvatars.textContent = "📤 Загрузить фото";
                    fileInputAvatars.value = "";
                }
            });
        }

        // Очистка пула фото
        var btnClearAvatars = document.getElementById("btn-prof-clear-avatars");
        if (btnClearAvatars) {
            btnClearAvatars.addEventListener("click", async function () {
                if (!confirm("Очистить все загруженные аватарки из пула?")) return;
                try {
                    await fetch("/api/tools/profile/avatars", { method: "DELETE" });
                    updateAvatarsCount();
                    if (window.toast) window.toast("Пул аватарок очищен");
                } catch (e) {}
            });
        }

        // Кнопка запуска автозаполнения
        var btnStart = document.getElementById("btn-start-profile-filler");
        if (btnStart) {
            btnStart.addEventListener("click", async function () {
                var selectedAccs = [];
                document.querySelectorAll(".prof-acc-cb:checked").forEach(function (cb) {
                    selectedAccs.push(cb.value);
                });

                if (!selectedAccs.length) {
                    if (window.toast) window.toast("Выберите хотя бы один аккаунт");
                    return;
                }

                // Сбор настроек
                var changeName = document.getElementById("prof-check-names").checked;
                var rawCustomNames = document.getElementById("prof-custom-names").value.trim();
                var rawCustomSurnames = document.getElementById("prof-custom-surnames").value.trim();

                var namesCustom = rawCustomNames ? rawCustomNames.split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean) : null;
                var surnamesCustom = rawCustomSurnames ? rawCustomSurnames.split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean) : null;

                var changeBio = document.getElementById("prof-check-bio").checked;
                var rawCustomBios = document.getElementById("prof-custom-bios").value.trim();
                var biosCustom = rawCustomBios ? rawCustomBios.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : null;

                var setUsername = document.getElementById("prof-check-username").checked;
                var setAvatar = document.getElementById("prof-check-avatar").checked;

                var enable2FA = document.getElementById("prof-check-2fa").checked;
                var twoFaPassword = document.getElementById("prof-2fa-password").value.trim();
                var twoFaHint = document.getElementById("prof-2fa-hint").value.trim();

                var applyPrivacy = document.getElementById("prof-check-privacy").checked;
                var privacyConfig = {
                    phone_number: document.getElementById("priv-phone-number").value,
                    added_by_phone: document.getElementById("priv-added-by-phone").value,
                    status_timestamp: document.getElementById("priv-status-timestamp").value,
                    profile_photo: document.getElementById("priv-profile-photo").value,
                    forwards: document.getElementById("priv-forwards").value,
                    phone_call: document.getElementById("priv-phone-call").value,
                    phone_p2p: document.getElementById("priv-phone-p2p").value,
                    chat_invite: document.getElementById("priv-chat-invite").value
                };

                var delayMin = parseInt(document.getElementById("prof-delay-min").value, 10) || 5;
                var delayMax = parseInt(document.getElementById("prof-delay-max").value, 10) || 12;

                var payload = {
                    account_names: selectedAccs,
                    change_name: changeName,
                    names_custom: namesCustom,
                    surnames_custom: surnamesCustom,
                    change_bio: changeBio,
                    bios_custom: biosCustom,
                    set_username: setUsername,
                    set_avatar: setAvatar,
                    enable_2fa: enable2FA,
                    two_fa_password: twoFaPassword,
                    two_fa_hint: twoFaHint,
                    apply_privacy: applyPrivacy,
                    privacy_config: privacyConfig,
                    delay_min: delayMin,
                    delay_max: delayMax
                };

                btnStart.disabled = true;
                btnStart.textContent = "Запуск задачи...";

                try {
                    var resp = await fetch("/api/tools/profile/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    var result = await resp.json();
                    if (result.status === "ok") {
                        if (modalProfile) modalProfile.hidden = true;
                        if (window.toast) window.toast("Задача автозаполнения запущена! Отслеживайте в Центре активности");

                        // Разворачиваем Центр активности
                        var acBody = document.querySelector(".ac-body");
                        var acToggle = document.querySelector(".ac-toggle");
                        if (acBody && acBody.style.display === "none") {
                            acBody.style.display = "flex";
                            if (acToggle) acToggle.style.transform = "rotate(0deg)";
                        }
                        refreshTasks();
                    } else {
                        if (window.toast) window.toast("Ошибка: " + (result.detail || "не удалось запустить"));
                    }
                } catch (err) {
                    if (window.toast) window.toast("Ошибка при отправке запроса");
                } finally {
                    btnStart.disabled = false;
                    btnStart.textContent = "🚀 Применить настройки к выбранным аккаунтам";
                }
            });
        }
    }

    // ==========================================================================
    // ACTIVITY CENTER (ЦЕНТР АКТИВНОСТИ В ПРАВОМ НИЖНЕМ УГЛУ)
    // ==========================================================================

    function setupActivityCenter() {
        var acToggle = document.querySelector(".ac-toggle");
        var acBody = document.querySelector(".ac-body");
        var activityCenter = document.querySelector(".activity-center");

        if (acToggle && acBody) {
            acToggle.addEventListener("click", function () {
                var isCollapsed = acBody.style.display === "none";
                acBody.style.display = isCollapsed ? "flex" : "none";
                acToggle.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(180deg)";
            });
        }

        // Первоначальная загрузка активных задач
        refreshTasks();

        // Периодическое обновление (если вдруг вебсокет отвалился)
        setInterval(refreshTasks, 10000);
    }

    async function refreshTasks() {
        try {
            var r = await fetch("/api/tools/tasks");
            var data = await r.json();
            renderActivityCenter(data.tasks || []);
        } catch (e) {}
    }

    function renderActivityCenter(tasks) {
        var acBody = document.querySelector(".ac-body");
        if (!acBody) return;

        // Фильтруем только активные (running или pending) и последние 2 завершенные
        var activeTasks = tasks.filter(function (t) { return t.status === "running" || t.status === "pending"; });
        var pastTasks = tasks.filter(function (t) { return t.status !== "running" && t.status !== "pending"; }).slice(0, 2);
        var displayTasks = activeTasks.concat(pastTasks);

        if (!displayTasks.length) {
            acBody.innerHTML = '<div style="font-size: 12px; color: var(--text-2); text-align: center; padding: 10px;">Нет активных задач</div>';
            return;
        }

        var html = "";
        displayTasks.forEach(function (t) {
            var isRunning = t.status === "running" || t.status === "pending";
            var typeName = t.task_type === "parser" ? "🔍 Парсинг" :
                           t.task_type === "profile_filler" ? "👤 Профиль" :
                           t.task_type === "leomatch_warmup" ? "🔥 Прогрев анкеты" :
                           t.task_type === "leomatch_autolike" ? "❤️ Автолайкер" :
                           t.task_type === "leomatch_register" ? "📝 Регистратор" : "📢 Рассылка";
            var barClass = isRunning ? "ac-progress-bar" : "ac-progress-bar ac-wait";
            var stopBtn = isRunning ? '<button class="btn-stop-task" data-task-id="' + t.id + '" style="background: none; border: none; color: #ff4757; font-size: 12px; cursor: pointer; padding: 0 4px;" title="Остановить">■</button>' : '';

            html += '<div class="ac-task" style="margin-bottom: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                    '<span class="ac-task-title" style="margin: 0; font-weight: 500;">' + typeName + '</span>' +
                    '<div style="display: flex; align-items: center; gap: 6px;">' +
                        '<span style="font-size: 11px; color: var(--accent);">' + t.progress + '%</span>' +
                        stopBtn +
                    '</div>' +
                '</div>' +
                '<div class="ac-progress"><div class="' + barClass + '" style="width: ' + t.progress + '%;"></div></div>' +
                '<div style="font-size: 11px; color: var(--text-2); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + window.esc(t.log || "") + '</div>' +
            '</div>';
        });

        acBody.innerHTML = html;

        // Привязываем кнопки остановки
        var stopButtons = acBody.querySelectorAll(".btn-stop-task");
        stopButtons.forEach(function (btn) {
            btn.addEventListener("click", async function (e) {
                e.stopPropagation();
                var taskId = btn.dataset.taskId;
                if (!taskId) return;
                btn.disabled = true;
                btn.style.opacity = "0.5";
                var fd = new FormData();
                fd.append("task_id", taskId);
                try {
                    await fetch("/api/tools/tasks/stop", { method: "POST", body: fd });
                    if (window.toast) window.toast("Задача остановлена");
                    refreshTasks();
                } catch (err) {}
            });
        });
    }

    // Слушатель WebSocket-событий (интеграция с существующим WS в app_v3.js)
    window.addEventListener("ws_message", function (e) {
        if (e.detail && e.detail.type === "task_update") {
            refreshTasks();
        }
    });

    // Экспорт в глобальный scope
    window.farmTools = {
        openParser: openParserModal,
        openBroadcast: openBroadcastModal,
        openProfile: openProfileModal,
        refreshTasks: refreshTasks
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTools);
    } else {
        initTools();
    }
})();
