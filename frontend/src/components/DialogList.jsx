import React, { useRef, useState, useEffect } from 'react';

function hashColor(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 8;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

import { api } from '../api';

// Высота строки диалога фиксирована в CSS (.dlg-row: min-height 64px + margin-bottom 2px),
// заголовок и превью не переносятся (white-space: nowrap) — поэтому виртуализация по
// постоянному шагу корректна. Раньше рендерились все 200 строк сразу, и каждая тянула
// свой HTTP-запрос за аватаркой.
const ROW_HEIGHT = 66;
const OVERSCAN = 6;

export default function DialogList({
  accounts = [],
  dialogs,
  selectedDialog,
  setSelectedDialog,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  isGlobalView,
  selectedAccount,
  onDeleteAccount,
  onRefreshDialogs,
  onPrefetchDialog,
  avatarMap = {},
  onNeedAvatars
}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const handleScroll = () => setScrollTop(el.scrollTop);
    const measure = () => setViewportH(el.clientHeight);
    el.addEventListener('scroll', handleScroll, { passive: true });
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', measure);
    };
  }, []);

  const handleGetCode = async () => {
    if (!selectedAccount) {
      alert('Сначала выберите аккаунт слева');
      return;
    }
    try {
      const res = await api.getTelegramCode(selectedAccount);
      if (res.success && res.code) {
        alert(`✉️ Сервисный код Telegram (777000): ${res.code}\n\nТекст сообщения:\n${res.text}`);
      } else {
        alert(res.message || res.text || 'Код не найден в чате 777000');
      }
    } catch (e) {
      alert('Ошибка получения кода: ' + e.message);
    }
  };

  const handleDelete = () => {
    if (!selectedAccount) {
      alert('Сначала выберите аккаунт слева');
      return;
    }
    if (window.confirm(`Удалить выбранный аккаунт ${selectedAccount}?`)) {
      if (onDeleteAccount) onDeleteAccount(selectedAccount);
    }
  };

  const filtered = dialogs.filter(d => {
    // 1. Поиск
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const title = (d.title || '').toLowerCase();
      const user = (d.username || '').toLowerCase();
      const text = (d.top_message_text || '').toLowerCase();
      if (!title.includes(q) && !user.includes(q) && !text.includes(q)) return false;
    }

    // 2. Вкладки (архив строго изолирован от остальных вкладок)
    if (filterType === 'archive') return Boolean(d.is_archived);
    if (d.is_archived) return false;

    if (filterType === 'all') return true;
    if (filterType === 'private') return d.chat_type === 'user' || d.chat_type === 'private';
    if (filterType === 'group') return d.chat_type === 'group' || d.chat_type === 'chat' || d.chat_type === 'megagroup';
    if (filterType === 'channel') return d.chat_type === 'channel';
    if (filterType === 'bot') return d.chat_type === 'bot';
    return true;
  });

  const cleanPhone = (p) => (p || '').toString().trim().replace(/^\+/, '');
  const currentAcc = (accounts || []).find(a => 
    cleanPhone(a.phone) === cleanPhone(selectedAccount) || 
    cleanPhone(a.session_name) === cleanPhone(selectedAccount)
  );

  let titleNick = 'Все диалоги';
  let subInfo = `${filtered.length} диалогов`;
  if (selectedAccount) {
    if (currentAcc) {
      const fullName = `${currentAcc.first_name || ''} ${currentAcc.last_name || ''}`.trim();
      if (fullName) {
        titleNick = fullName;
      } else if (currentAcc.username) {
        titleNick = `@${currentAcc.username}`;
      } else {
        titleNick = currentAcc.session_name || selectedAccount;
      }
      const rawPhone = currentAcc.phone || selectedAccount;
      const formattedPhone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
      const userTag = currentAcc.username ? `@${currentAcc.username} • ` : '';
      subInfo = `${userTag}${formattedPhone} • ${filtered.length} диалогов`;
    } else {
      titleNick = selectedAccount.startsWith('+') ? selectedAccount : `+${selectedAccount}`;
      subInfo = `${filtered.length} диалогов`;
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    if (!isGlobalView) {
      const pinA = a.is_pinned ? 1 : 0;
      const pinB = b.is_pinned ? 1 : 0;
      if (pinB !== pinA) return pinB - pinA;
    }
    return (b.top_message_date || 0) - (a.top_message_date || 0);
  });

  // Окно виртуализации: рендерим только видимые строки + небольшой запас
  const effectiveViewport = viewportH > 0 ? viewportH : 600;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(sorted.length, Math.ceil((scrollTop + effectiveViewport) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = sorted.slice(startIndex, endIndex).map((d, i) => ({ d, index: startIndex + i }));

  // Запрашиваем аватарки только для видимого окна, одним пакетным запросом
  const visibleItems = visibleRows.map(({ d }) => `${d.account_phone}:${d.chat_id}`);
  const visibleItemsKey = visibleItems.join(',');
  const visibleItemsRef = useRef(visibleItems);
  visibleItemsRef.current = visibleItems;
  const needAvatarsRef = useRef(onNeedAvatars);
  useEffect(() => { needAvatarsRef.current = onNeedAvatars; }, [onNeedAvatars]);

  useEffect(() => {
    const cb = needAvatarsRef.current;
    if (!cb || !visibleItemsKey) return undefined;
    const timer = setTimeout(() => cb(visibleItemsRef.current), 200);
    return () => clearTimeout(timer);
  }, [visibleItemsKey]);

  return (
    <section className="panel panel-dialogs">
      <div className="panel-head">
        <div className="head-text">
          <div className="head-title" id="dialogHeadTitle">
            {titleNick}
          </div>
          <div className="head-sub" id="dialogHeadSub">
            {subInfo}
          </div>
        </div>

        <div className="head-actions">
          {selectedAccount && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Получить сервисный код Telegram (777000)"
                style={{ color: 'var(--accent)' }}
                onClick={handleGetCode}
              >
                <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Удалить аккаунт"
                style={{ stroke: 'var(--danger)' }}
                onClick={handleDelete}
              >
                <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            title="Обновить диалоги"
            onClick={onRefreshDialogs}
          >
            <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="panel-tool">
        <div className="search">
          <svg className="svg-ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            id="dialogSearch"
            type="text"
            placeholder="Поиск по чатам…"
            autoComplete="off"
            spellCheck="false"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Фильтры/вкладки диалогов */}
      <div className="dialog-tabs" id="dialogTabs">
        <button
          type="button"
          className={`dialog-tab ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          Все
        </button>
        <button
          type="button"
          className={`dialog-tab ${filterType === 'private' ? 'active' : ''}`}
          onClick={() => setFilterType('private')}
        >
          Личные
        </button>
        <button
          type="button"
          className={`dialog-tab ${filterType === 'group' ? 'active' : ''}`}
          onClick={() => setFilterType('group')}
        >
          Группы
        </button>
        <button
          type="button"
          className={`dialog-tab ${filterType === 'channel' ? 'active' : ''}`}
          onClick={() => setFilterType('channel')}
        >
          Каналы
        </button>
        <button
          type="button"
          className={`dialog-tab ${filterType === 'bot' ? 'active' : ''}`}
          onClick={() => setFilterType('bot')}
        >
          Боты
        </button>
        <button
          type="button"
          className={`dialog-tab ${filterType === 'archive' ? 'active' : ''}`}
          onClick={() => setFilterType('archive')}
        >
          Архив
        </button>
      </div>

      <div className="list-scroll" id="dialogList" aria-label="Диалоги" ref={scrollRef}>
        {sorted.length === 0 ? (
          <div className="list-empty">
            {dialogs.length ? 'Диалоги не найдены' : 'Нет диалогов'}
          </div>
        ) : (
          <div style={{ position: 'relative', height: sorted.length * ROW_HEIGHT }}>
            {visibleRows.map(({ d, index }) => {
              const isSelected = selectedDialog &&
                Number(selectedDialog.chat_id) === Number(d.chat_id) &&
                cleanPhone(selectedDialog.account_phone) === cleanPhone(d.account_phone);
              const title = d.title || d.username || 'Без названия';
              const colorIdx = hashColor(title);
              const isOut = Boolean(d.top_message_is_outgoing || (d.top_message_text && d.top_message_text.startsWith('Вы: ')));
              const preview = d.top_message_text || (d.top_message_date ? 'Сообщение' : 'Нет сообщений');
              const avatarUrl = avatarMap[`${d.account_phone}_${d.chat_id}`] || null;

              return (
                <a
                  key={`${d.account_phone}_${d.chat_id}`}
                  href="#"
                  className={`dlg-row ${isSelected ? 'active' : ''}`}
                  style={{
                    position: 'absolute',
                    top: index * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT - 2,
                    marginBottom: 0
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedDialog(d);
                  }}
                >
                  <span className={`av av-md av-${colorIdx}`} style={{ position: 'relative' }}>
                    {avatarUrl && (
                      <img
                        src={avatarUrl}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <span>{(title[0] || '?').toUpperCase()}</span>
                    {d.is_online && <span className="online-dot" title="В сети"></span>}
                  </span>

                  <span className="dlg-mid">
                    <span className="dlg-title">
                      {title}
                      {d.is_pinned && !isGlobalView ? (
                        <svg className="svg-ico pinned-ico" viewBox="0 0 24 24" aria-hidden="true" style={{ marginLeft: '4px', opacity: 0.6, width: '13px', height: '13px' }}>
                          <path d="M16 3H8l-1 9 2 2v6l3 2 3-2v-6l2-2-1-9z"></path>
                        </svg>
                      ) : null}
                    </span>
                    <span className="dlg-preview">
                      {isOut && <span className="dlg-prefix">Вы: </span>}
                      {preview.replace(/^Вы:\s*/, '')}
                    </span>
                  </span>

                  <span className="dlg-side">
                    <span className="dlg-time">{formatTime(d.top_message_date)}</span>
                    <span className="dlg-side-bottom">
                      {isOut && (
                        <span
                          className={`dlg-tick ${d.top_message_is_read ? 'out-read' : 'out-sent'}`}
                          title={d.top_message_is_read ? 'Прочитано' : 'Отправлено'}
                        >
                          {d.top_message_is_read ? '✓✓' : '✓'}
                        </span>
                      )}
                      {d.unread_count > 0 && (
                        <span className="unread">{d.unread_count > 99 ? '99+' : d.unread_count}</span>
                      )}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
