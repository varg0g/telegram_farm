  // ---------- helpers ----------
  function hashColor(s) {
    var h = 0, i, str = String(s);
    for (i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 8;
  }

  function accountDisplay(a) {
    var full = [a.first, a.last].filter(Boolean).join(" ") || a.name || "Аккаунт";
    var sub = a.phone || (a.username ? "@" + a.username : "");
    return { full: full, sub: sub };
  }

  function timeLabel(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    var now = new Date();
    var sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }
    var yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    var isYest = d.getDate() === yest.getDate() && d.getMonth() === yest.getMonth() && d.getFullYear() === yest.getFullYear();
    if (isYest) return "Вчера";
    if (d.getFullYear() === now.getFullYear()) {
      return d.getDate() + "." + ("0" + (d.getMonth() + 1)).slice(-2);
    }
    return d.getDate() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  }

  function chatTypeLabel(type) {
    if (type === "channel") return "Канал";
    if (type === "group" || type === "supergroup") return "Группа";
    return "Личный чат";
  }

  function avatarImg(account, chatId) {
    if (!account || !chatId) return "";
    return '<img src="/api/avatar?account=' + encodeURIComponent(account) +
      "&chat_id=" + encodeURIComponent(chatId) + '" alt="" loading="lazy" onerror="this.remove()">';
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  window.esc = window.esc || esc;

  // =========================================================================
  // Smart Group Account Selector Component
  // =========================================================================
  window.createGroupAccountSelector = function(opts) {
    var pillsContainer = typeof opts.pillsContainer === "string" ? 
      document.getElementById(opts.pillsContainer) : opts.pillsContainer;
    var gridContainer = typeof opts.gridContainer === "string" ? 
      document.getElementById(opts.gridContainer) : opts.gridContainer;
    var metaContainer = typeof opts.metaContainer === "string" ? 
      document.getElementById(opts.metaContainer) : opts.metaContainer;

    var inputName = opts.inputName || "selected_acc";
    var inputClass = opts.inputClass || "";
    var colorTheme = opts.colorTheme || "blue"; // 'blue', 'coral', 'green'
    var allowAllGroup = opts.allowAllGroup !== false;
    var onChange = typeof opts.onChange === "function" ? opts.onChange : null;

    var selectedGroupIds = new Set();
    var checkedAccountNames = new Set();
    var searchQuery = "";
    var isInitialized = false;

    function getAccounts() {
      return (window.state && window.state.accounts) || [];
    }

    function getGroups() {
      return (window.state && window.state.groups) || (window.workGroups || []);
    }

    function getGroupMap() {
      var map = {};
      getGroups().forEach(function(g) {
        if (g && g.id !== undefined) map[String(g.id)] = g.title || ("Группа " + g.id);
      });
      return map;
    }

    function initDefaultSelection() {
      if (isInitialized) return;
      var accs = getAccounts();
      var groups = getGroups();

      // Check if CRM currently has an active group selected
      var crmGroupId = window.state && window.state.selectedGroupId !== null && window.state.selectedGroupId !== undefined ?
        String(window.state.selectedGroupId) : null;

      if (opts.defaultGroupId !== undefined && opts.defaultGroupId !== null) {
        selectedGroupIds.add(String(opts.defaultGroupId));
      } else if (crmGroupId && groups.some(function(g) { return String(g.id) === crmGroupId; })) {
        selectedGroupIds.add(crmGroupId);
      } else if (groups.length > 0) {
        // Find first group with accounts
        var firstWithAccs = groups.find(function(g) {
          return accs.some(function(a) { return String(a.work_group_id) === String(g.id); });
        });
        if (firstWithAccs) {
          selectedGroupIds.add(String(firstWithAccs.id));
        } else {
          selectedGroupIds.add(String(groups[0].id));
        }
      } else {
        selectedGroupIds.add("all");
      }

      // Check all accounts in the selected groups by default
      accs.forEach(function(a) {
        var gId = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
        if (selectedGroupIds.has("all") || selectedGroupIds.has(gId)) {
          checkedAccountNames.add(a.name);
        }
      });

      isInitialized = true;
    }

    function renderPills() {
      if (!pillsContainer) return;
      var accs = getAccounts();
      var groups = getGroups();

      var counts = {};
      var noGroupCount = 0;
      accs.forEach(function(a) {
        if (a.work_group_id !== null && a.work_group_id !== undefined) {
          var gid = String(a.work_group_id);
          counts[gid] = (counts[gid] || 0) + 1;
        } else {
          noGroupCount++;
        }
      });

      var activeClass = "active" + (colorTheme !== "blue" ? " " + colorTheme : "");

      var html = '<div class="group-pills-bar">';
      
      // "All" pill if enabled
      if (allowAllGroup) {
        var isAllActive = selectedGroupIds.has("all");
        html += '<button type="button" class="group-pill' + (isAllActive ? ' ' + activeClass : '') + '" data-group-id="all">' +
          '<span class="group-pill-ico">🌐</span>' +
          '<span class="group-pill-title">Все аккаунты</span>' +
          '<span class="group-pill-count">' + accs.length + '</span>' +
        '</button>';
      }

      // Individual groups
      groups.forEach(function(g) {
        var gid = String(g.id);
        var c = counts[gid] || 0;
        var isActive = selectedGroupIds.has(gid);
        html += '<button type="button" class="group-pill' + (isActive ? ' ' + activeClass : '') + '" data-group-id="' + gid + '">' +
          '<span class="group-pill-ico">📁</span>' +
          '<span class="group-pill-title">' + esc(g.title || ("Группа " + gid)) + '</span>' +
          '<span class="group-pill-count">' + c + '</span>' +
        '</button>';
      });

      // No group pill
      if (noGroupCount > 0) {
        var isNoneActive = selectedGroupIds.has("none");
        html += '<button type="button" class="group-pill' + (isNoneActive ? ' ' + activeClass : '') + '" data-group-id="none">' +
          '<span class="group-pill-ico">📁</span>' +
          '<span class="group-pill-title">Без группы</span>' +
          '<span class="group-pill-count">' + noGroupCount + '</span>' +
        '</button>';
      }

      html += '</div>';
      pillsContainer.innerHTML = html;

      // Bind click events on pills
      var pills = pillsContainer.querySelectorAll(".group-pill");
      pills.forEach(function(pill) {
        pill.addEventListener("click", function() {
          var gid = pill.dataset.groupId;
          toggleGroup(gid);
        });
      });
    }

    function toggleGroup(gid) {
      var accs = getAccounts();
      if (gid === "all") {
        if (selectedGroupIds.has("all")) {
          selectedGroupIds.clear();
          checkedAccountNames.clear();
        } else {
          selectedGroupIds.clear();
          selectedGroupIds.add("all");
          accs.forEach(function(a) { checkedAccountNames.add(a.name); });
        }
      } else {
        selectedGroupIds.delete("all");
        if (selectedGroupIds.has(gid)) {
          selectedGroupIds.delete(gid);
          // Remove accounts of this group from checked set
          accs.forEach(function(a) {
            var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
            if (agid === gid) checkedAccountNames.delete(a.name);
          });
        } else {
          selectedGroupIds.add(gid);
          // Add accounts of this group to checked set
          accs.forEach(function(a) {
            var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
            if (agid === gid) checkedAccountNames.add(a.name);
          });
        }
      }

      renderPills();
      renderMeta();
      renderGrid();
      notifyChange();
    }

    function getVisibleAccounts() {
      var accs = getAccounts();
      if (selectedGroupIds.size === 0) return [];

      return accs.filter(function(a) {
        var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
        var inGroup = selectedGroupIds.has("all") || selectedGroupIds.has(agid);
        if (!inGroup) return false;

        if (searchQuery) {
          var q = searchQuery.toLowerCase();
          var name = (a.name || "").toLowerCase();
          var phone = (a.phone || "").toLowerCase();
          var first = (a.first || "").toLowerCase();
          var last = (a.last || "").toLowerCase();
          var full = (first + " " + last).trim();
          return name.includes(q) || phone.includes(q) || first.includes(q) || last.includes(q) || full.includes(q);
        }
        return true;
      });
    }

    function renderMeta() {
      if (!metaContainer) return;
      var visible = getVisibleAccounts();
      var checkedInVisible = visible.filter(function(a) { return checkedAccountNames.has(a.name); });
      var groupMap = getGroupMap();

      var groupNames = [];
      if (selectedGroupIds.has("all")) {
        groupNames.push("Все аккаунты");
      } else {
        selectedGroupIds.forEach(function(gid) {
          if (gid === "none") groupNames.push("Без группы");
          else if (groupMap[gid]) groupNames.push(groupMap[gid]);
          else groupNames.push("Группа " + gid);
        });
      }

      var metaColor = colorTheme !== "blue" ? " " + colorTheme : "";
      var subtitle = groupNames.length > 0 ? 
        '<span style="font-size: 11px; opacity: 0.7; font-weight: normal; margin-left: 4px;">(' + esc(groupNames.join(", ")) + ')</span>' : '';

      var html = 
        '<div class="selector-meta-count' + metaColor + '">' +
          '<span>Выбрано:</span>' +
          '<span class="badge-num">' + checkedInVisible.length + '</span>' +
          '<span>из ' + visible.length + ' акк.' + subtitle + '</span>' +
        '</div>' +
        '<div class="selector-meta-actions">' +
          '<input type="text" class="selector-search-input" placeholder="🔍 Поиск в группе..." value="' + esc(searchQuery) + '">' +
          '<button type="button" class="btn btn-secondary btn-selector-select-all" style="font-size: 11px; padding: 4px 9px;">Выбрать все</button>' +
          '<button type="button" class="btn btn-secondary btn-selector-deselect-all" style="font-size: 11px; padding: 4px 9px;">Снять все</button>' +
        '</div>';

      metaContainer.innerHTML = html;

      // Event listeners for meta controls
      var searchInput = metaContainer.querySelector(".selector-search-input");
      if (searchInput) {
        searchInput.addEventListener("input", function(e) {
          searchQuery = e.target.value.trim();
          renderGrid();
          updateMetaCountOnly();
          notifyChange();
        });
      }

      var btnAll = metaContainer.querySelector(".btn-selector-select-all");
      if (btnAll) {
        btnAll.addEventListener("click", function() {
          var vis = getVisibleAccounts();
          vis.forEach(function(a) { checkedAccountNames.add(a.name); });
          renderGrid();
          updateMetaCountOnly();
          notifyChange();
        });
      }

      var btnNone = metaContainer.querySelector(".btn-selector-deselect-all");
      if (btnNone) {
        btnNone.addEventListener("click", function() {
          var vis = getVisibleAccounts();
          vis.forEach(function(a) { checkedAccountNames.delete(a.name); });
          renderGrid();
          updateMetaCountOnly();
          notifyChange();
        });
      }
    }

    function updateMetaCountOnly() {
      if (!metaContainer) return;
      var numBadge = metaContainer.querySelector(".badge-num");
      var visible = getVisibleAccounts();
      var checkedCount = visible.filter(function(a) { return checkedAccountNames.has(a.name); }).length;
      if (numBadge) numBadge.textContent = checkedCount;
    }

    function renderGrid() {
      if (!gridContainer) return;
      var visible = getVisibleAccounts();
      var groupMap = getGroupMap();

      if (selectedGroupIds.size === 0) {
        gridContainer.innerHTML = 
          '<div class="selector-empty-hint">' +
            '<span>📁</span> Выберите одну или несколько групп выше для отображения аккаунтов' +
          '</div>';
        return;
      }

      if (visible.length === 0) {
        gridContainer.innerHTML = 
          '<div class="selector-empty-hint">' +
            '<span>🔍</span> Аккаунты не найдены' + (searchQuery ? ' по запросу «' + esc(searchQuery) + '»' : ' в выбранных группах') +
          '</div>';
        return;
      }

      var html = visible.map(function(a) {
        var d = window.accountDisplay ? window.accountDisplay(a) : { full: a.name, sub: a.phone || "" };
        var isChecked = checkedAccountNames.has(a.name);
        var gid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
        var gTitle = groupMap[gid] || null;

        var colorIdx = hashColor(a.name || a.phone || "");
        var initial = (d.full || a.name || "?").trim().charAt(0).toUpperCase();

        var groupBadge = "";
        if (selectedGroupIds.has("all") || selectedGroupIds.size > 1) {
          if (gTitle) {
            groupBadge = '<span class="account-chip-badge">📁 ' + esc(gTitle) + '</span>';
          } else {
            groupBadge = '<span class="account-chip-badge" style="opacity: 0.6;">без группы</span>';
          }
        }

        return '<label class="account-chip' + (isChecked ? ' selected' : '') + '" data-account-name="' + esc(a.name) + '">' +
          '<div style="display: flex; align-items: center; gap: 9px; overflow: hidden; min-width: 0;">' +
            '<input type="checkbox" name="' + esc(inputName) + '" class="' + esc(inputClass) + '" value="' + esc(a.name) + '" data-group-id="' + esc(gid) + '" ' + (isChecked ? 'checked' : '') + '> ' +
            '<div class="chip-avatar color-' + colorIdx + '" style="width: 26px; height: 26px; font-size: 11px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: 600; flex-shrink: 0;">' + esc(initial) + '</div>' +
            '<div class="chip-info" style="display: flex; flex-direction: column; overflow: hidden; min-width: 0;">' +
              '<span class="chip-name" title="' + esc(d.full) + '" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; font-weight: 500;">' + esc(d.full) + '</span>' +
              (d.sub ? '<span class="chip-phone" style="font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums;">' + esc(d.sub) + '</span>' : '') +
            '</div>' +
          '</div>' +
          groupBadge +
        '</label>';
      }).join("");

      gridContainer.innerHTML = html;

      // Bind change handler on checkboxes
      var chips = gridContainer.querySelectorAll(".account-chip");
      chips.forEach(function(chip) {
        var cb = chip.querySelector("input[type='checkbox']");
        var accName = chip.dataset.accountName;
        if (!cb) return;

        cb.addEventListener("change", function(e) {
          if (cb.checked) {
            checkedAccountNames.add(accName);
            chip.classList.add("selected");
          } else {
            checkedAccountNames.delete(accName);
            chip.classList.remove("selected");
          }
          updateMetaCountOnly();
          notifyChange();
        });
      });
    }

    function notifyChange() {
      if (onChange) {
        var selected = Array.from(checkedAccountNames);
        var visible = getVisibleAccounts();
        onChange(selected, selected.length, visible);
      }
    }

    // Public API
    function refresh(preselectedGroupId) {
      if (preselectedGroupId !== undefined && preselectedGroupId !== null) {
        selectedGroupIds.clear();
        selectedGroupIds.add(String(preselectedGroupId));
        var accs = getAccounts();
        accs.forEach(function(a) {
          var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
          if (String(preselectedGroupId) === "all" || agid === String(preselectedGroupId)) {
            checkedAccountNames.add(a.name);
          }
        });
      } else if (!isInitialized) {
        initDefaultSelection();
      }
      renderPills();
      renderMeta();
      renderGrid();
      notifyChange();
    }

    function getSelected() {
      // Return only checked accounts that are currently matching the active groups
      var visible = getVisibleAccounts();
      var visibleNames = new Set(visible.map(function(a) { return a.name; }));
      return Array.from(checkedAccountNames).filter(function(n) { return visibleNames.has(n); });
    }

    function setSelected(names) {
      checkedAccountNames.clear();
      if (Array.isArray(names)) {
        names.forEach(function(n) { checkedAccountNames.add(n); });
      }
      renderMeta();
      renderGrid();
      notifyChange();
    }

    function selectGroup(gid) {
      selectedGroupIds.clear();
      selectedGroupIds.add(String(gid));
      var accs = getAccounts();
      accs.forEach(function(a) {
        var agid = (a.work_group_id !== null && a.work_group_id !== undefined) ? String(a.work_group_id) : "none";
        if (String(gid) === "all" || agid === String(gid)) {
          checkedAccountNames.add(a.name);
        }
      });
      renderPills();
      renderMeta();
      renderGrid();
      notifyChange();
    }

    // Initialize immediately
    initDefaultSelection();
    renderPills();
    renderMeta();
    renderGrid();

    return {
      refresh: refresh,
      getSelected: getSelected,
      setSelected: setSelected,
      selectGroup: selectGroup,
      selectAll: function() {
        var vis = getVisibleAccounts();
        vis.forEach(function(a) { checkedAccountNames.add(a.name); });
        renderGrid();
        updateMetaCountOnly();
        notifyChange();
      },
      deselectAll: function() {
        var vis = getVisibleAccounts();
        vis.forEach(function(a) { checkedAccountNames.delete(a.name); });
        renderGrid();
        updateMetaCountOnly();
        notifyChange();
      }
    };
  };