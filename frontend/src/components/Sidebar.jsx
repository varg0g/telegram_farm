import React from 'react';

export default function Sidebar({
  accounts,
  groups,
  selectedGroup,
  setSelectedGroup,
  selectedAccount,
  setSelectedAccount,
  onOpenAddAccount,
  onOpenProxies,
  onOpenTools,
  onOpenProfile,
  onOpenLeadGroups,
  onOpenFarmGroups,
  onOpenMatches,
  isSoundEnabled,
  onToggleSound
}) {
  return (
    <aside className="panel panel-nav">
      <div className="nav-brand">Telegram Farm</div>

      <div className="nav-menu">
        <div className="nav-section-title">ГЛАВНОЕ</div>
        <button
          type="button"
          className={`nav-btn ${selectedAccount === null && selectedGroup === null ? 'active' : ''}`}
          onClick={() => {
            setSelectedAccount(null);
            setSelectedGroup(null);
          }}
          title="Все входящие сообщения (Общая лента)"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          <span className="nav-btn-text">Все входящие</span>
        </button>

        <div className="nav-section-title">УПРАВЛЕНИЕ</div>
        <button
          type="button"
          className="nav-btn"
          onClick={onOpenAddAccount}
          title="Добавление аккаунтов"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <span className="nav-btn-text">Добавление аккаунтов</span>
        </button>

        <button
          type="button"
          className="nav-btn"
          onClick={onOpenProxies}
          title="Менеджер прокси"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span className="nav-btn-text">Менеджер прокси</span>
        </button>

        <button
          type="button"
          className="nav-btn"
          onClick={onOpenProfile}
          title="Автозаполнение профилей и приватность"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span className="nav-btn-text">Автозаполнение</span>
        </button>

        <button
          type="button"
          className="nav-btn"
          onClick={onOpenTools}
          title="Инструменты фермы"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span className="nav-btn-text">Инструменты фермы</span>
        </button>

        <button
          type="button"
          className="nav-btn"
          onClick={onOpenLeadGroups}
          title="Группы лидов (CRM теги)"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span className="nav-btn-text">Группы лидов</span>
        </button>

        <div className="nav-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>ГРУППЫ (ФЕРМА)</span>
          <button
            type="button"
            onClick={onOpenFarmGroups}
            title="Создать или настроить группы фермы"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 800,
              padding: '0 4px',
              lineHeight: 1
            }}
          >
            +
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {groups && groups.length > 0 ? (
            groups.map(g => (
              <button
                key={g.id}
                type="button"
                className={`nav-btn ${selectedGroup === g.id ? 'active' : ''}`}
                onClick={() => {
                  if (selectedGroup === g.id) {
                    setSelectedGroup(null);
                  } else {
                    setSelectedGroup(g.id);
                    setSelectedAccount(null);
                  }
                }}
              >
                <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span className="nav-btn-text">{g.title}</span>
              </button>
            ))
          ) : (
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--text-3)' }}>
              Нет созданных групп
            </div>
          )}
        </div>
      </div>

      <div className="nav-bottom">
        <button
          type="button"
          className="nav-btn"
          style={{
            width: 'auto',
            padding: '0 10px',
            color: isSoundEnabled ? 'var(--accent, #00a8ff)' : 'var(--text-3, #8a96a8)'
          }}
          onClick={onToggleSound}
          title={isSoundEnabled ? "Звуковые уведомления включены (кликните, чтобы отключить)" : "Звуковые уведомления отключены (кликните, чтобы включить)"}
        >
          {isSoundEnabled ? (
            <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          ) : (
            <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          )}
        </button>
        <button
          type="button"
          className="nav-btn"
          style={{ width: 'auto', padding: '0 10px' }}
          title="Тема"
        >
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
      </div>
    </aside>
  );
}
