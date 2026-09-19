import React, { useState } from 'react';

function hashColor(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 8;
}

export default function AccountList({
  accounts,
  selectedAccount,
  setSelectedAccount
}) {
  const [search, setSearch] = useState('');

  const activeCount = accounts.filter(a => a.status === 'active').length;
  const totalCount = accounts.length;

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = `${a.first_name || ''} ${a.last_name || ''} ${a.username || ''} ${a.session_name || ''}`.toLowerCase();
    const phone = (a.phone || '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  return (
    <aside className="panel panel-accounts">
      <div
        className="panel-head"
        style={{
          borderBottom: '1px solid var(--line)',
          padding: '14px 15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 id="col2-title" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
            Все аккаунты
          </h3>
          <span
            className="acc-counter-badge"
            id="accountsCounter"
            title={`Всего сессий: ${totalCount} | Активно: ${activeCount}`}
          >
            <span className="cnt-total">{totalCount}</span>
            <span className="cnt-slash">/</span>
            <span className={`cnt-active ${activeCount < totalCount ? 'has-errors' : ''}`}>
              {activeCount}
            </span>
          </span>
        </div>
      </div>

      <div className="panel-tool" style={{ padding: '10px' }}>
        <div className="search">
          <svg className="svg-ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            id="accountSearch"
            type="text"
            placeholder="Поиск аккаунта..."
            autoComplete="off"
            spellCheck="false"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="list-scroll" id="accountList" aria-label="Аккаунты">
        {filtered.length === 0 ? (
          <div className="list-empty">
            {accounts.length ? 'Ничего не найдено' : 'Нет аккаунтов. Добавьте через меню'}
          </div>
        ) : (
          filtered.map(acc => {
            const isSelected = selectedAccount === acc.phone || selectedAccount === acc.session_name;
            const displayName = [acc.first_name, acc.last_name].filter(Boolean).join(' ') || (acc.username ? `@${acc.username}` : (acc.phone || acc.session_name));
            const subName = acc.phone ? (acc.phone.startsWith('+') ? acc.phone : `+${acc.phone}`) : acc.session_name;
            const colorIdx = hashColor(displayName);
            const isOnline = acc.status === 'active';
            const isError = acc.status === 'banned' || acc.status === 'unauthorized' || acc.status === 'error';

            return (
              <a
                key={acc.session_name}
                href="#"
                className={`acc-row ${isSelected ? 'active' : ''} ${isError ? 'is-error' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (isSelected) {
                    setSelectedAccount(null);
                  } else {
                    setSelectedAccount(acc.phone || acc.session_name);
                  }
                }}
              >
                <span className={`av av-sm av-${colorIdx}`} style={{ position: 'relative' }}>
                  <img
                    src={`/api/avatar?account=${encodeURIComponent(acc.session_name)}&chat_id=${acc.user_id || acc.session_name}`}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <span>{(displayName[0] || '?').toUpperCase()}</span>
                </span>

                <span className="acc-mid">
                  <span className="acc-name">
                    {displayName}
                    {isError && (
                      <span className="acc-badge-err" style={{ marginLeft: '4px' }}>
                        {acc.status === 'banned' ? 'Бан' : 'Ошибка'}
                      </span>
                    )}
                  </span>
                  <span className="acc-sub">{subName}</span>
                </span>

                {acc.total_unread > 0 && (
                  <span className="unread" style={{ marginLeft: 'auto', marginRight: '6px' }}>
                    {acc.total_unread > 99 ? '99+' : acc.total_unread}
                  </span>
                )}

                <span className={`acc-status ${isOnline ? 'is-online' : ''}`} aria-hidden="true"></span>
              </a>
            );
          })
        )}
      </div>
    </aside>
  );
}
