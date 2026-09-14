// ==========================================================================
// TELEGRAM FARM — ДАЙВИНЧИК (@leomatchbot) AUTOMATION & MATCHES STORAGE
// ==========================================================================

(function () {
    "use strict";

    var modalLeomatch = document.getElementById("modal-tool-leomatch");
    var modalFarmTools = document.getElementById("modal-farm-tools");

    // Табы
    var tabBtnAutolike = document.getElementById("tab-btn-leo-autolike");
    var tabBtnRegister = document.getElementById("tab-btn-leo-register");
    var tabBtnMatches = document.getElementById("tab-btn-leo-matches");

    var tabContentAutolike = document.getElementById("tab-content-leo-autolike");
    var tabContentRegister = document.getElementById("tab-content-leo-register");
    var tabContentMatches = document.getElementById("tab-content-leo-matches");

    var matchesBadge = document.getElementById("leo-matches-badge");
    var allMatches = [];
    var workGroups = [];
    var groupMap = {};
    var warmupMode = "interval";
    var warmupStopCondition = "infinite";
    var currentActiveWarmupTaskId = null;

    async function loadWorkGroups() {
        try {
            var r = await fetch("/api/groups");
            var res = await r.json();
            if (res.ok && Array.isArray(res.groups)) {
                workGroups = res.groups;
                groupMap = {};
                workGroups.forEach(function (g) {
                    groupMap[g.id] = g.title;
                });
            }
        } catch (e) {
            console.error("Failed to load work groups for Leomatch", e);
        }
    }

    // Инициализация при загрузке страницы
    function initLeomatch() {
        // Кнопка возврата к инструментам
        var btnBack = document.getElementById("btn-back-from-leomatch");
        if (btnBack) {
            btnBack.addEventListener("click", function () {
                if (modalLeomatch) modalLeomatch.hidden = true;
                if (modalFarmTools) modalFarmTools.hidden = false;
            });
        }

        // Кнопка закрытия
        var btnClose = document.getElementById("btn-close-leomatch");
        if (btnClose) {
            btnClose.addEventListener("click", function () {
                if (modalLeomatch) modalLeomatch.hidden = true;
            });
        }

        // Переключение табов
        var bAutolike = document.getElementById("tab-btn-leo-autolike");
        var bWarmup = document.getElementById("tab-btn-leo-warmup");
        var bRegister = document.getElementById("tab-btn-leo-register");
        var bMatches = document.getElementById("tab-btn-leo-matches");

        if (bAutolike) {
            bAutolike.onclick = function (e) {
                if (e) e.preventDefault();
                switchTab("autolike");
            };
        }
        if (bWarmup) {
            bWarmup.onclick = function (e) {
                if (e) e.preventDefault();
                switchTab("warmup");
            };
        }
        if (bRegister) {
            bRegister.onclick = function (e) {
                if (e) e.preventDefault();
                switchTab("register");
            };
        }
        if (bMatches) {
            bMatches.onclick = function (e) {
                if (e) e.preventDefault();
                switchTab("matches");
            };
        }

        // Проверка спинтакса
        var btnPreviewSpintax = document.getElementById("btn-leo-preview-spintax");
        if (btnPreviewSpintax) {
            btnPreviewSpintax.addEventListener("click", function () {
                var textEl = document.getElementById("leo-autolike-message-text");
                var box = document.getElementById("leo-spintax-preview-box");
                if (textEl && box) {
                    var sample = parseSpintax(textEl.value);
                    box.innerHTML = '<div style="font-size: 11px; color: var(--text-2); margin-bottom: 4px;">Пример случайного сообщения:</div>' +
                                    '<div style="font-size: 13px; color: #fff; font-style: italic;">"' + escapeHtml(sample) + '"</div>';
                    box.hidden = false;
                }
            });
        }

        // Запуск автолайкера
        var btnStartAutolike = document.getElementById("btn-start-leo-autolike");
        if (btnStartAutolike) {
            btnStartAutolike.addEventListener("click", startAutolike);
        }

        // Запуск прогрева анкеты
        var btnStartWarmup = document.getElementById("btn-start-leo-warmup");
        if (btnStartWarmup) {
            btnStartWarmup.addEventListener("click", startWarmup);
        }

        // Переключатель режима прогрева: Интервальный / Разовый
        var btnWarmupInterval = document.getElementById("btn-warmup-mode-interval");
        var btnWarmupOnce = document.getElementById("btn-warmup-mode-once");
        var wrapInterval = document.getElementById("leo-warmup-interval-wrap");
        var wrapOnce = document.getElementById("leo-warmup-once-wrap");

        if (btnWarmupInterval && btnWarmupOnce) {
            btnWarmupInterval.addEventListener("click", function () {
                warmupMode = "interval";
                btnWarmupInterval.classList.add("active");
                btnWarmupOnce.classList.remove("active");
                if (wrapInterval) wrapInterval.style.display = "flex";
                if (wrapOnce) wrapOnce.style.display = "none";
            });
            btnWarmupOnce.addEventListener("click", function () {
                warmupMode = "once";
                btnWarmupOnce.classList.add("active");
                btnWarmupInterval.classList.remove("active");
                if (wrapInterval) wrapInterval.style.display = "none";
                if (wrapOnce) wrapOnce.style.display = "flex";
            });
        }

        // Переключатель критерия остановки прогрева (Условие завершения)
        var btnStopInfinite = document.getElementById("btn-warmup-stop-infinite");
        var btnStopFirstMatch = document.getElementById("btn-warmup-stop-first-match");
        var btnStopTimeLimit = document.getElementById("btn-warmup-stop-time-limit");
        var wrapTimeLimit = document.getElementById("leo-warmup-time-limit-wrap");
        var inputDurationHours = document.getElementById("leo-warmup-duration-hours");
        var hintDurationMinutes = document.getElementById("leo-warmup-duration-minutes-hint");

        function setStopCondition(cond) {
            warmupStopCondition = cond;
            [btnStopInfinite, btnStopFirstMatch, btnStopTimeLimit].forEach(function (b) {
                if (b) b.classList.remove("active");
            });
            if (cond === "infinite" && btnStopInfinite) btnStopInfinite.classList.add("active");
            if (cond === "first_match" && btnStopFirstMatch) btnStopFirstMatch.classList.add("active");
            if (cond === "time_limit" && btnStopTimeLimit) btnStopTimeLimit.classList.add("active");

            if (wrapTimeLimit) {
                wrapTimeLimit.style.display = (cond === "time_limit") ? "flex" : "none";
            }
        }

        if (btnStopInfinite) btnStopInfinite.addEventListener("click", function () { setStopCondition("infinite"); });
        if (btnStopFirstMatch) btnStopFirstMatch.addEventListener("click", function () { setStopCondition("first_match"); });
        if (btnStopTimeLimit) btnStopTimeLimit.addEventListener("click", function () { setStopCondition("time_limit"); });

        [btnStopInfinite, btnStopFirstMatch, btnStopTimeLimit].forEach(function (el) {
            if (el) {
                el.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        el.click();
                    }
                });
            }
        });

        if (inputDurationHours && hintDurationMinutes) {
            inputDurationHours.addEventListener("input", function () {
                var h = parseFloat(inputDurationHours.value) || 0;
                hintDurationMinutes.textContent = Math.round(h * 60);
            });
        }

        document.querySelectorAll(".btn-preset-duration").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll(".btn-preset-duration").forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");
                var h = parseFloat(btn.dataset.hours) || 4;
                if (inputDurationHours) {
                    inputDurationHours.value = h;
                    if (hintDurationMinutes) hintDurationMinutes.textContent = Math.round(h * 60);
                }
            });
        });

        // Кнопка остановки из активного монитора прогрева
        var btnActiveStop = document.getElementById("btn-leo-warmup-active-stop");
        if (btnActiveStop) {
            btnActiveStop.addEventListener("click", stopActiveWarmup);
        }

        // Слушатель WebSocket-событий для мгновенного обновления хранилища взаимок и активного прогрева
        window.addEventListener("ws_message", function (e) {
            var d = e && e.detail ? e.detail : null;
            if (d && d.type === "leomatch_match") {
                loadMatchesCount();
                if (window.toast) {
                    var mData = d.match || {};
                    var nameLead = mData.lead_username ? "@" + mData.lead_username : (mData.lead_name || "Новая симпатия");
                    window.toast("🎉 Новая взаимная симпатия в Дайвинчике: " + nameLead + " (" + (mData.account_name || "аккаунт") + ")", "success");
                }
                var cMatches = document.getElementById("tab-content-leo-matches");
                if (cMatches && cMatches.style.display !== "none" && !cMatches.hidden) {
                    loadMatches();
                }
            } else if (d && d.type === "task_update") {
                var t = d.task || {};
                if (t.task_type === "leomatch_warmup" || (t.id && t.id.indexOf("warm_") === 0)) {
                    checkAndRenderActiveWarmup();
                }
            }
        });

        // Периодическая проверка активной задачи прогрева (раз в 4 секунды если открыто модальное окно)
        setInterval(function () {
            if (modalLeomatch && !modalLeomatch.hidden) {
                var cWarmup = document.getElementById("tab-content-leo-warmup");
                if (cWarmup && cWarmup.style.display !== "none") {
                    checkAndRenderActiveWarmup();
                }
            }
        }, 4000);

        // Запуск авторегистратора
        var btnStartRegister = document.getElementById("btn-start-leo-register");
        if (btnStartRegister) {
            btnStartRegister.addEventListener("click", startRegister);
        }

        // Загрузка фото для анкет
        var btnUploadPhotos = document.getElementById("btn-leo-upload-photos");
        var inputPhotos = document.getElementById("leo-reg-photo-input");
        if (btnUploadPhotos && inputPhotos) {
            btnUploadPhotos.addEventListener("click", function () {
                inputPhotos.click();
            });
            inputPhotos.addEventListener("change", uploadPhotos);
        }

        // Очистка фото
        var btnClearPhotos = document.getElementById("btn-leo-clear-photos");
        if (btnClearPhotos) {
            btnClearPhotos.addEventListener("click", clearPhotos);
        }

        // Хранилище взаимок: Обновить и Очистить
        var btnRefreshMatches = document.getElementById("btn-leo-refresh-matches");
        if (btnRefreshMatches) {
            btnRefreshMatches.addEventListener("click", loadMatches);
        }
        var btnClearMatches = document.getElementById("btn-leo-clear-matches");
        if (btnClearMatches) {
            btnClearMatches.addEventListener("click", clearAllMatches);
        }

        // Поиск и фильтрация взаимок
        var searchMatches = document.getElementById("leo-matches-search");
        if (searchMatches) {
            searchMatches.addEventListener("input", filterAndRenderMatches);
        }
        var filterAccMatches = document.getElementById("leo-matches-filter-acc");
        if (filterAccMatches) {
            filterAccMatches.addEventListener("change", filterAndRenderMatches);
        }
        var filterGroupMatches = document.getElementById("leo-matches-filter-group");
        if (filterGroupMatches) {
            filterGroupMatches.addEventListener("change", filterAndRenderMatches);
        }

        // Первичная подгрузка счетчика взаимок
        loadMatchesCount();
        loadPhotosCount();
    }

    // Переключение табов
    function switchTab(tabName) {
        var bAutolike = document.getElementById("tab-btn-leo-autolike");
        var bWarmup = document.getElementById("tab-btn-leo-warmup");
        var bRegister = document.getElementById("tab-btn-leo-register");
        var bMatches = document.getElementById("tab-btn-leo-matches");

        var cAutolike = document.getElementById("tab-content-leo-autolike");
        var cWarmup = document.getElementById("tab-content-leo-warmup");
        var cRegister = document.getElementById("tab-content-leo-register");
        var cMatches = document.getElementById("tab-content-leo-matches");

        [bAutolike, bWarmup, bRegister, bMatches].forEach(function (b) {
            if (b) b.classList.remove("active");
        });

        if (cAutolike) {
            cAutolike.hidden = (tabName !== "autolike");
            cAutolike.style.display = (tabName === "autolike") ? "flex" : "none";
        }
        if (cWarmup) {
            cWarmup.hidden = (tabName !== "warmup");
            cWarmup.style.display = (tabName === "warmup") ? "flex" : "none";
        }
        if (cRegister) {
            cRegister.hidden = (tabName !== "register");
            cRegister.style.display = (tabName === "register") ? "flex" : "none";
        }
        if (cMatches) {
            cMatches.hidden = (tabName !== "matches");
            cMatches.style.display = (tabName === "matches") ? "flex" : "none";
        }

        if (tabName === "autolike") {
            if (bAutolike) bAutolike.classList.add("active");
        } else if (tabName === "warmup") {
            if (bWarmup) bWarmup.classList.add("active");
            checkAndRenderActiveWarmup();
        } else if (tabName === "register") {
            if (bRegister) bRegister.classList.add("active");
        } else if (tabName === "matches") {
            if (bMatches) bMatches.classList.add("active");
            loadMatches();
        }
    }

    // Экспорт для inline onclick
    window.switchLeoTab = switchTab;

    var leoAutolikeSelector = null;
    var leoWarmupSelector = null;
    var leoRegisterSelector = null;

    // Открытие окна Дайвинчика
    window.openLeomatchModal = async function () {
        if (modalFarmTools) modalFarmTools.hidden = true;
        if (modalLeomatch) modalLeomatch.hidden = false;

        switchTab("autolike");

        await loadWorkGroups();

        if (typeof window.createGroupAccountSelector === "function") {
            if (!leoAutolikeSelector) {
                leoAutolikeSelector = window.createGroupAccountSelector({
                    pillsContainer: "leo-autolike-groups-bar",
                    gridContainer: "leo-autolike-accounts-checkboxes",
                    metaContainer: "leo-autolike-selector-meta",
                    inputName: "leo-autolike-acc",
                    colorTheme: "coral",
                    allowAllGroup: true
                });
            } else {
                leoAutolikeSelector.refresh();
            }

            if (!leoWarmupSelector) {
                leoWarmupSelector = window.createGroupAccountSelector({
                    pillsContainer: "leo-warmup-groups-bar",
                    gridContainer: "leo-warmup-accounts-checkboxes",
                    metaContainer: "leo-warmup-selector-meta",
                    inputName: "leo-warmup-acc",
                    colorTheme: "coral",
                    allowAllGroup: true
                });
            } else {
                leoWarmupSelector.refresh();
            }

            if (!leoRegisterSelector) {
                leoRegisterSelector = window.createGroupAccountSelector({
                    pillsContainer: "leo-register-groups-bar",
                    gridContainer: "leo-register-accounts-checkboxes",
                    metaContainer: "leo-register-selector-meta",
                    inputName: "leo-register-acc",
                    colorTheme: "coral",
                    allowAllGroup: true
                });
            } else {
                leoRegisterSelector.refresh();
            }
        }

        populateAccountSelect("leo-matches-filter-acc");
        populateGroupSelects();

        loadPhotosCount();
        loadMatches();
    };

    function populateGroupSelects() {
        var selMatches = document.getElementById("leo-matches-filter-group");
        if (selMatches) {
            selMatches.innerHTML = '<option value="">Все группы</option>' + workGroups.map(function(g) {
                return '<option value="' + g.id + '">📁 ' + escapeHtml(g.title) + '</option>';
            }).join("");
        }
    }

    function onGroupFilterChanged(selectId, containerId) {
        var sel = document.getElementById(selectId);
        var container = document.getElementById(containerId);
        if (!sel || !container) return;

        var selectedGroup = sel.value; // "all", group_id string, "none"
        var inputs = container.querySelectorAll("input[type='checkbox']");

        inputs.forEach(function (inp) {
            var gId = inp.dataset.groupId || "none";
            var shouldCheck = false;
            if (selectedGroup === "all") {
                shouldCheck = true;
            } else if (selectedGroup === "none") {
                shouldCheck = (gId === "none");
            } else {
                shouldCheck = (gId === selectedGroup);
            }
            inp.checked = shouldCheck;
            var chip = inp.closest(".account-chip");
            if (chip) chip.classList.toggle("selected", shouldCheck);
        });

        var checkedCount = container.querySelectorAll("input[type='checkbox']:checked").length;
        var groupName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
        if (window.toast) {
            window.toast("Выбрана " + groupName + " (отмечено: " + checkedCount + " акк.)", "info");
        }
    }

    // Заполнение чекбоксов аккаунтов
    function populateAccountCheckboxes(containerId, selectedGroupId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var accs = window.state && window.state.accounts ? window.state.accounts : [];
        if (!accs.length) {
            container.innerHTML = '<div style="font-size: 12px; color: var(--text-2); padding: 15px; text-align: center;">Нет активных аккаунтов</div>';
            return;
        }

        var selGroup = selectedGroupId !== undefined && selectedGroupId !== null ? String(selectedGroupId) : "all";

        var html = accs.map(function (a) {
            var label = a.first || a.phone || a.name;
            var gId = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
            var gTitle = (a.work_group_id !== null && a.work_group_id !== undefined && groupMap[a.work_group_id]) ? groupMap[a.work_group_id] : null;

            var isChecked = false;
            if (selGroup === "all") {
                isChecked = true;
            } else if (selGroup === "none") {
                isChecked = (gId === "none");
            } else {
                isChecked = (gId === selGroup);
            }

            var groupBadge = gTitle ? 
                '<span class="account-chip-badge">📁 ' + escapeHtml(gTitle) + '</span>' :
                '<span style="font-size: 10.5px; color: var(--text-3); white-space: nowrap;">без группы</span>';

            return '<label class="account-chip leo-acc-checkbox-item' + (isChecked ? ' selected' : '') + '" data-group-id="' + escapeHtml(gId) + '">' +
                   '<div style="display: flex; align-items: center; gap: 10px; overflow: hidden; min-width: 0;">' +
                       '<input type="checkbox" value="' + escapeHtml(a.name) + '" data-group-id="' + escapeHtml(gId) + '" ' + (isChecked ? 'checked' : '') + '> ' +
                       '<div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0;">' +
                           '<span class="account-chip-name" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>' +
                           (a.phone ? '<span style="font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums;">' + escapeHtml(a.phone) + '</span>' : '') +
                       '</div>' +
                   '</div>' +
                   groupBadge +
                   '</label>';
        }).join("");

        container.innerHTML = html;

        container.onchange = function (e) {
            if (e.target && e.target.type === "checkbox") {
                var chip = e.target.closest(".account-chip");
                if (chip) {
                    chip.classList.toggle("selected", e.target.checked);
                }
            }
        };
    }

    // Заполнение выпадающего списка фильтра аккаунтов
    function populateAccountSelect(selectId) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        var accs = window.state && window.state.accounts ? window.state.accounts : [];
        var html = '<option value="">Все аккаунты</option>';
        accs.forEach(function (a) {
            var label = (a.first ? a.first + " " : "") + (a.phone || a.name);
            var gTitle = (a.work_group_id !== null && a.work_group_id !== undefined && groupMap[a.work_group_id]) ? " [" + groupMap[a.work_group_id] + "]" : "";
            html += '<option value="' + escapeHtml(a.name) + '">' + escapeHtml(label + gTitle) + '</option>';
        });
        sel.innerHTML = html;
    }

    function toggleAllCheckboxes(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var inputs = container.querySelectorAll("input[type='checkbox']");
        var allChecked = Array.from(inputs).every(function (i) { return i.checked; });
        inputs.forEach(function (i) { 
            i.checked = !allChecked; 
            var chip = i.closest(".account-chip");
            if (chip) chip.classList.toggle("selected", !allChecked);
        });
    }

    // -------------------------------------------------------------------------
    // АВТОЛАЙКЕР
    // -------------------------------------------------------------------------
    async function startAutolike() {
        var inputs = document.querySelectorAll("#leo-autolike-accounts-checkboxes input:checked");
        var selected = Array.from(inputs).map(function (i) { return i.value; });
        if (!selected.length) {
            if (window.toast) window.toast("Выберите хотя бы один аккаунт для запуска", "error");
            return;
        }

        var msgText = document.getElementById("leo-autolike-message-text").value.trim();
        var chance = parseInt(document.getElementById("leo-envelope-chance").value, 10) || 70;
        var delayMin = parseInt(document.getElementById("leo-delay-min").value, 10) || 25;
        var delayMax = parseInt(document.getElementById("leo-delay-max").value, 10) || 45;
        var maxPerAcc = parseInt(document.getElementById("leo-max-per-acc").value, 10) || 50;
        var forwardSaved = document.getElementById("leo-forward-saved").checked;

        var payload = {
            account_names: selected,
            envelope_chance: chance,
            envelope_delay_min: delayMin,
            envelope_delay_max: delayMax,
            max_limit_per_acc: maxPerAcc,
            messages_custom: msgText ? [msgText] : [],
            forward_to_saved: forwardSaved
        };

        try {
            var r = await fetch("/api/leomatch/autolike/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            var res = await r.json();
            if (res.status === "ok") {
                if (window.toast) window.toast("🚀 Автолайкер Дайвинчик успешно запущен! Задача в правом нижнем углу", "success");
                if (modalLeomatch) modalLeomatch.hidden = true;
            } else {
                if (window.toast) window.toast("Ошибка: " + (res.detail || "не удалось запустить"), "error");
            }
        } catch (e) {
            if (window.toast) window.toast("Сетевая ошибка при запуске автолайкера", "error");
        }
    }

    // -------------------------------------------------------------------------
    // ПРОГРЕВ АНКЕТЫ
    // -------------------------------------------------------------------------
    async function startWarmup() {
        var inputs = document.querySelectorAll("#leo-warmup-accounts-checkboxes input:checked");
        var selected = Array.from(inputs).map(function (i) { return i.value; });
        if (!selected.length) {
            if (window.toast) window.toast("Выберите хотя бы один аккаунт для прогрева анкеты", "error");
            return;
        }

        var delayMin = parseInt(document.getElementById("leo-warmup-delay-min").value, 10) || 12;
        var delayMax = parseInt(document.getElementById("leo-warmup-delay-max").value, 10) || 35;

        var enableDislikes = document.getElementById("leo-warmup-enable-dislikes").checked;
        var dislikeChance = parseInt(document.getElementById("leo-warmup-dislike-chance").value, 10) || 30;

        var subscribeChannel = document.getElementById("leo-warmup-subscribe-channel").checked;
        var channelUsername = (document.getElementById("leo-warmup-channel-username").value || "leoday").trim();
        var muteChannel = document.getElementById("leo-warmup-mute-channel").checked;

        var reactIncoming = document.getElementById("leo-warmup-react-incoming").checked;

        var payload = {
            account_names: selected,
            warmup_mode: warmupMode,
            delay_min: delayMin,
            delay_max: delayMax,
            enable_dislikes: enableDislikes,
            dislike_chance: dislikeChance,
            subscribe_channel: subscribeChannel,
            channel_username: channelUsername,
            mute_channel: muteChannel,
            react_incoming_likes: reactIncoming
        };

        if (warmupMode === "interval") {
            var sLikesMinEl = document.getElementById("leo-warmup-session-likes-min");
            var sLikesMaxEl = document.getElementById("leo-warmup-session-likes-max");
            var intMinEl = document.getElementById("leo-warmup-interval-min");
            var intMaxEl = document.getElementById("leo-warmup-interval-max");
            var totSessEl = document.getElementById("leo-warmup-total-sessions");
            var actHoursEnabledEl = document.getElementById("leo-warmup-active-hours-enabled");
            var actStartEl = document.getElementById("leo-warmup-active-start");
            var actEndEl = document.getElementById("leo-warmup-active-end");

            payload.session_likes_min = sLikesMinEl ? (parseInt(sLikesMinEl.value, 10) || 2) : 2;
            payload.session_likes_max = sLikesMaxEl ? (parseInt(sLikesMaxEl.value, 10) || 4) : 4;
            payload.interval_hours_min = intMinEl ? (parseFloat(intMinEl.value) || 2.0) : 2.0;
            payload.interval_hours_max = intMaxEl ? (parseFloat(intMaxEl.value) || 4.0) : 4.0;
            payload.total_sessions = totSessEl ? (parseInt(totSessEl.value, 10) || 0) : 0;
            payload.active_hours_enabled = actHoursEnabledEl ? actHoursEnabledEl.checked : true;
            payload.active_hours_start = actStartEl ? (parseInt(actStartEl.value, 10) || 9) : 9;
            payload.active_hours_end = actEndEl ? (parseInt(actEndEl.value, 10) || 23) : 23;
        } else {
            var likesMinEl = document.getElementById("leo-warmup-likes-min");
            var likesMaxEl = document.getElementById("leo-warmup-likes-max");
            payload.likes_min = likesMinEl ? (parseInt(likesMinEl.value, 10) || 15) : 15;
            payload.likes_max = likesMaxEl ? (parseInt(likesMaxEl.value, 10) || 30) : 30;
        }

        // Критерий завершения прогрева
        payload.stop_condition = warmupStopCondition || "infinite";
        if (warmupStopCondition === "first_match") {
            payload.stop_on_first_match = true;
        } else if (warmupStopCondition === "time_limit") {
            var durHEl = document.getElementById("leo-warmup-duration-hours");
            var durH = durHEl ? (parseFloat(durHEl.value) || 4) : 4;
            payload.duration_minutes = Math.round(durH * 60);
        }

        try {
            var r = await fetch("/api/leomatch/warmup/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            var res = await r.json();
            if (res.status === "ok") {
                if (window.toast) window.toast("🔥 Прогрев анкет в Дайвинчике успешно запущен! Отслеживайте в реальном времени", "success");
                checkAndRenderActiveWarmup();
                if (window.farmTools && typeof window.farmTools.refreshTasks === "function") {
                    window.farmTools.refreshTasks();
                }
            } else {
                if (window.toast) window.toast("Ошибка: " + (res.detail || "не удалось запустить прогрев"), "error");
            }
        } catch (e) {
            if (window.toast) window.toast("Сетевая ошибка при запуске прогрева", "error");
        }
    }

    // -------------------------------------------------------------------------
    // МОНИТОРИНГ И УПРАВЛЕНИЕ АКТИВНЫМ ПРОГРЕВОМ
    // -------------------------------------------------------------------------
    async function checkAndRenderActiveWarmup() {
        var card = document.getElementById("leo-warmup-active-card");
        if (!card) return;

        try {
            var r = await fetch("/api/leomatch/warmup/active");
            var data = await r.json();

            if (!data || !data.active || !data.task) {
                card.style.display = "none";
                currentActiveWarmupTaskId = null;
                return;
            }

            var t = data.task;
            currentActiveWarmupTaskId = t.id;
            var st = t.state || {};
            var cfg = t.config || {};

            card.style.display = "block";

            // ID и время старта
            var elId = document.getElementById("leo-warmup-active-id");
            var elStarted = document.getElementById("leo-warmup-active-started");
            if (elId) elId.textContent = t.id;
            if (elStarted && t.created_at) {
                var d = new Date(t.created_at * 1000);
                elStarted.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }

            // Статус и метка восстановления
            var elBadge = document.getElementById("leo-warmup-active-badge");
            var elResumeTag = document.getElementById("leo-warmup-resume-tag");
            if (elBadge) {
                if (t.status === "running") {
                    elBadge.textContent = "В работе";
                    elBadge.style.color = "#2ed573";
                    elBadge.style.background = "rgba(46, 213, 115, 0.2)";
                } else {
                    elBadge.textContent = t.status;
                }
            }
            if (elResumeTag) {
                if (st.session_idx > 1 || (st.total_likes && st.total_likes > 0)) {
                    elResumeTag.style.display = "flex";
                } else {
                    elResumeTag.style.display = "none";
                }
            }

            // Цель / критерий остановки
            var stopCond = st.stop_condition || cfg.stop_condition || "infinite";
            var elTargetIcon = document.getElementById("leo-warmup-target-icon");
            var elTargetText = document.getElementById("leo-warmup-target-text");

            if (stopCond === "first_match") {
                if (elTargetIcon) elTargetIcon.textContent = "🎯";
                if (elTargetText) elTargetText.textContent = "До 1-й взаимной симпатии";
            } else if (stopCond === "time_limit") {
                var durM = st.duration_minutes || cfg.duration_minutes || 0;
                var durH = (durM / 60).toFixed(1).replace(".0", "");
                if (elTargetIcon) elTargetIcon.textContent = "⏱️";
                if (elTargetText) elTargetText.textContent = "По времени (" + durH + " ч / " + durM + " мин)";
            } else {
                if (elTargetIcon) elTargetIcon.textContent = "♾️";
                if (elTargetText) elTargetText.textContent = "Без ограничений (до ручной остановки)";
            }

            // Прогресс бар
            var prog = typeof t.progress === "number" ? t.progress : (st.progress || 0);
            var elProgFill = document.getElementById("leo-warmup-progress-bar-fill");
            var elProgPct = document.getElementById("leo-warmup-progress-percent");
            var elProgTitle = document.getElementById("leo-warmup-progress-title");

            if (elProgFill) elProgFill.style.width = Math.min(100, Math.max(0, prog)) + "%";
            if (elProgPct) elProgPct.textContent = prog + "%";
            if (elProgTitle) {
                elProgTitle.textContent = st.progress_label ? "Прогресс: " + st.progress_label : "Прогресс выполнения";
            }

            // Статистика
            var elLikes = document.getElementById("leo-warmup-stat-likes");
            var elDislikes = document.getElementById("leo-warmup-stat-dislikes");
            var elMatches = document.getElementById("leo-warmup-stat-matches");
            var elTime = document.getElementById("leo-warmup-stat-time");

            if (elLikes) elLikes.textContent = st.total_likes || 0;
            if (elDislikes) elDislikes.textContent = st.total_dislikes || 0;
            if (elMatches) elMatches.textContent = st.total_matches || 0;

            if (elTime) {
                var startTs = st.start_ts || t.created_at || (Date.now() / 1000);
                var elapsedM = Math.max(0, Math.floor(((Date.now() / 1000) - startTs) / 60));
                var hEl = Math.floor(elapsedM / 60);
                var mEl = elapsedM % 60;
                var elStr = (hEl > 0 ? (hEl + "ч ") : "") + mEl + "м";

                if (stopCond === "time_limit") {
                    var totalDurM = st.duration_minutes || cfg.duration_minutes || 0;
                    var remM = Math.max(0, totalDurM - elapsedM);
                    var hRem = Math.floor(remM / 60);
                    var mRem = remM % 60;
                    var remStr = (hRem > 0 ? (hRem + "ч ") : "") + mRem + "м";
                    elTime.textContent = elStr + " / ост. " + remStr;
                } else {
                    elTime.textContent = elStr + " / ∞";
                }
            }

            // Живой лог
            var elLog = document.getElementById("leo-warmup-active-log");
            if (elLog) elLog.textContent = t.log || "Выполняется прогрев...";

        } catch (err) {
            console.debug("Failed to check active warmup task", err);
        }
    }

    async function stopActiveWarmup() {
        if (!currentActiveWarmupTaskId) return;
        if (!confirm("Вы уверены, что хотите принудительно остановить прогрев анкет?")) {
            return;
        }

        try {
            var r = await fetch("/api/leomatch/stop/" + currentActiveWarmupTaskId, { method: "POST" });
            var res = await r.json();
            if (res.status === "ok") {
                if (window.toast) window.toast("⏹️ Прогрев анкет успешно остановлен", "info");
                var card = document.getElementById("leo-warmup-active-card");
                if (card) card.style.display = "none";
                currentActiveWarmupTaskId = null;
                if (window.farmTools && typeof window.farmTools.refreshTasks === "function") {
                    window.farmTools.refreshTasks();
                }
            }
        } catch (e) {
            if (window.toast) window.toast("Ошибка при остановке прогрева", "error");
        }
    }

    // -------------------------------------------------------------------------
    // АВТОРЕГИСТРАТОР
    // -------------------------------------------------------------------------
    async function startRegister() {
        var inputs = document.querySelectorAll("#leo-register-accounts-checkboxes input:checked");
        var selected = Array.from(inputs).map(function (i) { return i.value; });
        if (!selected.length) {
            if (window.toast) window.toast("Выберите хотя бы один аккаунт для регистрации анкеты", "error");
            return;
        }

        var gender = document.getElementById("leo-reg-gender").value;
        var target = document.getElementById("leo-reg-target").value;
        var age = document.getElementById("leo-reg-age").value.trim();
        var city = document.getElementById("leo-reg-city").value.trim();
        var about = document.getElementById("leo-reg-about").value.trim();
        var shareContact = document.getElementById("leo-reg-share-contact").checked;
        var joinChannels = document.getElementById("leo-reg-join-channels").checked;

        var payload = {
            account_names: selected,
            gender: gender,
            search_gender: target,
            age: age ? parseInt(age, 10) : null,
            city: city || null,
            about: about || null,
            share_contact: shareContact,
            join_channels: joinChannels
        };

        try {
            var r = await fetch("/api/leomatch/register/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            var res = await r.json();
            if (res.status === "ok") {
                if (window.toast) window.toast("🚀 Авторегистратор анкет запущен! Отслеживайте в Activity Center", "success");
                if (modalLeomatch) modalLeomatch.hidden = true;
            } else {
                if (window.toast) window.toast("Ошибка: " + (res.detail || "не удалось запустить"), "error");
            }
        } catch (e) {
            if (window.toast) window.toast("Сетевая ошибка при запуске регистратора", "error");
        }
    }

    // Фотографии для анкет
    async function uploadPhotos(e) {
        var files = e.target.files;
        if (!files || !files.length) return;
        var fd = new FormData();
        for (var i = 0; i < files.length; i++) {
            fd.append("files", files[i]);
        }
        try {
            var r = await fetch("/api/leomatch/photos", { method: "POST", body: fd });
            var res = await r.json();
            if (res.status === "ok") {
                if (window.toast) window.toast("Загружено фото: " + res.uploaded + " (всего в пуле: " + res.total + ")", "success");
                loadPhotosCount();
            }
        } catch (err) {
            if (window.toast) window.toast("Ошибка при загрузке фото", "error");
        }
    }

    async function loadPhotosCount() {
        var el = document.getElementById("leo-photos-count");
        if (!el) return;
        try {
            var r = await fetch("/api/leomatch/photos-count");
            var res = await r.json();
            el.textContent = res.count || 0;
        } catch (e) {}
    }

    async function clearPhotos() {
        if (!confirm("Очистить загруженные фотографии анкет?")) return;
        try {
            await fetch("/api/leomatch/photos", { method: "DELETE" });
            loadPhotosCount();
            if (window.toast) window.toast("Пул фотографий очищен", "info");
        } catch (e) {}
    }

    // -------------------------------------------------------------------------
    // ХРАНИЛИЩЕ ВЗАИМОК (ЛИДЫ)
    // -------------------------------------------------------------------------
    async function loadMatches() {
        var tbody = document.getElementById("leo-matches-table-body");
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 25px; color: var(--text-2);">Загрузка взаимных симпатий...</td></tr>';

        try {
            var r = await fetch("/api/leomatch/matches?limit=300");
            var res = await r.json();
            if (res.ok) {
                allMatches = res.matches || [];
                updateMatchesBadge(allMatches.length);
                filterAndRenderMatches();
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 25px; color: #ff4757;">Ошибка загрузки взаимок</td></tr>';
        }
    }

    async function loadMatchesCount() {
        try {
            var r = await fetch("/api/leomatch/matches?limit=1");
            var res = await r.json();
            if (res.ok) {
                updateMatchesBadge(res.count || 0);
            }
        } catch (e) {}
    }

    function updateMatchesBadge(cnt) {
        if (matchesBadge) {
            matchesBadge.textContent = cnt;
            matchesBadge.style.display = cnt > 0 ? "inline-block" : "none";
        }
    }

    function filterAndRenderMatches() {
        var searchInput = document.getElementById("leo-matches-search");
        var filterAcc = document.getElementById("leo-matches-filter-acc");
        var filterGroup = document.getElementById("leo-matches-filter-group");
        var tbody = document.getElementById("leo-matches-table-body");
        if (!tbody) return;

        var q = (searchInput ? searchInput.value.trim().toLowerCase() : "");
        var accFilter = (filterAcc ? filterAcc.value.trim() : "");
        var groupFilter = (filterGroup ? filterGroup.value.trim() : "");

        var filtered = allMatches.filter(function (m) {
            if (groupFilter && String(m.work_group_id) !== groupFilter) return false;
            if (accFilter && m.account_name !== accFilter) return false;
            if (q) {
                var searchBlob = (m.account_name + " " + (m.group_title || "") + " " + (m.lead_username || "") + " " + (m.lead_name || "") + " " + (m.lead_info || "") + " " + (m.message_text || "")).toLowerCase();
                if (searchBlob.indexOf(q) === -1) return false;
            }
            return true;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 35px; color: var(--text-2);">' +
                              (allMatches.length ? "Ничего не найдено по фильтру" : "Взаимных симпатий пока нет") +
                              '</td></tr>';
            return;
        }

        var html = filtered.map(function (m) {
            var dateStr = formatDate(m.created_at);
            var leadTitle = m.lead_name || "Симпатия";
            var usernameLink = m.lead_username ? 
                '<a href="https://t.me/' + escapeHtml(m.lead_username) + '" target="_blank" style="color: var(--accent); text-decoration: none; font-weight: 600;">@' + escapeHtml(m.lead_username) + '</a>' : 
                '<span style="color: var(--text-muted);">@скрыт</span>';

            var groupBadge = m.group_title ? 
                '<div style="margin-top: 4px;"><span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(0, 168, 255, 0.15); color: #00a8ff; font-size: 11px; font-weight: 500;">📁 ' + escapeHtml(m.group_title) + '</span></div>' : '';

            return '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">' +
                   '<td style="padding: 12px 14px;">' +
                       '<span style="display: inline-block; padding: 3px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); color: #fff; font-weight: 600; font-size: 12px;">📱 ' + escapeHtml(m.account_name) + '</span>' +
                       groupBadge +
                   '</td>' +
                   '<td style="padding: 12px 14px;">' +
                       '<div style="font-weight: 600; color: #fff;">' + escapeHtml(leadTitle) + '</div>' +
                       '<div>' + usernameLink + '</div>' +
                   '</td>' +
                   '<td style="padding: 12px 14px; max-width: 250px;">' +
                       '<div style="font-size: 12px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(m.lead_info || m.message_text || "") + '</div>' +
                   '</td>' +
                   '<td style="padding: 12px 14px; font-size: 12px; color: var(--text-2);">' + dateStr + '</td>' +
                   '<td style="padding: 12px 14px; text-align: right;">' +
                       '<button class="btn btn-primary btn-jump-to-chat" data-account="' + escapeHtml(m.account_name) + '" data-username="' + escapeHtml(m.lead_username || "") + '" data-name="' + escapeHtml(m.lead_name || "") + '" style="font-size: 12px; padding: 6px 14px; background: #00a8ff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">' +
                           '💬 Открыть диалог' +
                       '</button>' +
                   '</td>' +
                   '</tr>';
        }).join("");

        tbody.innerHTML = html;

        // Навешиваем клик на кнопки "Открыть диалог"
        tbody.querySelectorAll(".btn-jump-to-chat").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var acc = btn.dataset.account;
                var uname = btn.dataset.username;
                var leadN = btn.dataset.name;
                jumpToLeadChat(acc, uname, leadN);
            });
        });
    }

    // -------------------------------------------------------------------------
    // СКВОЗНОЙ ПЕРЕХОД В ДИАЛОГ С ЛИДОМ
    // -------------------------------------------------------------------------
    async function jumpToLeadChat(accountName, leadUsername, leadName) {
        if (!accountName) return;

        // 1. Закрываем модальное окно Дайвинчика
        if (modalLeomatch) modalLeomatch.hidden = true;

        if (window.toast) {
            window.toast("Переход на аккаунт " + accountName + "...", "info");
        }

        // 2. Переключаемся на нужный аккаунт
        if (typeof window.selectAccount === "function") {
            await window.selectAccount(accountName);
        }

        // 3. Ищем диалог с самим лидом или с ботом Дайвинчик
        var dialogs = window.state && window.state.dialogs ? window.state.dialogs : [];
        var targetDialog = null;

        // Сначала ищем прямой диалог с лидом по его username
        if (leadUsername) {
            var cleanUname = leadUsername.replace(/^@/, "").toLowerCase();
            targetDialog = dialogs.find(function (d) {
                return (d.username && d.username.toLowerCase() === cleanUname);
            });
        }

        // Если прямого диалога пока нет — ищем диалог с ботом Дайвинчик
        if (!targetDialog) {
            targetDialog = dialogs.find(function (d) {
                var titleLower = (d.title || "").toLowerCase();
                return titleLower.indexOf("дайвинчик") !== -1 || titleLower.indexOf("leomatch") !== -1;
            });
        }

        // Если нашли диалог
        if (targetDialog && typeof window.selectDialog === "function") {
            window.selectDialog(targetDialog);
            if (window.toast) {
                var label = leadUsername ? (" с @" + leadUsername.replace(/^@/, "")) : (leadName ? (" (" + leadName + ")") : "");
                window.toast("💬 Открыт диалог" + label + "!", "success");
            }
        } else if (dialogs.length && typeof window.selectDialog === "function") {
            window.selectDialog(dialogs[0]);
        }
    }

    async function clearAllMatches() {
        if (!confirm("Вы действительно хотите удалить все сохраненные взаимные симпатии?")) return;
        try {
            await fetch("/api/leomatch/matches", { method: "DELETE" });
            allMatches = [];
            updateMatchesBadge(0);
            filterAndRenderMatches();
            if (window.toast) window.toast("Хранилище взаимок очищено", "info");
        } catch (e) {
            if (window.toast) window.toast("Ошибка очистки хранилища", "error");
        }
    }

    // Слушатель WebSocket для мгновенного добавления взаимок
    function setupWebSocketListener() {
        // Ловим через глобальный перехватчик или таймер
        setInterval(async function () {
            var cMatches = document.getElementById("tab-content-leo-matches");
            var mLeo = document.getElementById("modal-tool-leomatch");
            if (mLeo && !mLeo.hidden && cMatches && !cMatches.hidden && cMatches.style.display !== "none") {
                try {
                    var r = await fetch("/api/leomatch/matches?limit=300");
                    var res = await r.json();
                    if (res.ok && res.matches && res.matches.length !== allMatches.length) {
                        allMatches = res.matches;
                        updateMatchesBadge(allMatches.length);
                        filterAndRenderMatches();
                    }
                } catch (e) {}
            }
        }, 4000);
    }

    // Вспомогательные функции
    function parseSpintax(text) {
        if (!text) return "";
        var pattern = /\{([^{}]+)\}/;
        while (pattern.test(text)) {
            text = text.replace(pattern, function (match, choices) {
                var options = choices.split("|");
                return options[Math.floor(Math.random() * options.length)];
            });
        }
        return text;
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(ts) {
        if (!ts) return "";
        var d = new Date(ts * 1000);
        var dd = String(d.getDate()).padStart(2, "0");
        var mm = String(d.getMonth() + 1).padStart(2, "0");
        var hh = String(d.getHours()).padStart(2, "0");
        var min = String(d.getMinutes()).padStart(2, "0");
        return dd + "." + mm + " " + hh + ":" + min;
    }

    // Запуск при старте документа
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            initLeomatch();
            setupWebSocketListener();
        });
    } else {
        initLeomatch();
        setupWebSocketListener();
    }

})();
