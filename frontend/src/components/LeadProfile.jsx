import React, { useState, useEffect } from 'react';
import { api } from '../api';

function hashColor(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 8;
}

export default function LeadProfile({
  dialog,
  lead,
  leadGroups,
  onUpdateLead
}) {
  const [notes, setNotes] = useState('');
  const [activeMediaTab, setActiveMediaTab] = useState('media');
  const [isSaved, setIsSaved] = useState(true);
  const [mediaItems, setMediaItems] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);

  useEffect(() => {
    if (!dialog || !dialog.account_phone || !dialog.chat_id) {
      setMediaItems([]);
      setLoadingMedia(false);
      return;
    }
    const controller = new AbortController();
    setMediaItems([]);
    setLoadingMedia(true);
    api.getDialogMedia(dialog.account_phone, dialog.chat_id, activeMediaTab, 18, controller.signal)
      .then(items => {
        setMediaItems(items || []);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.warn('Ошибка загрузки медиа диалога:', err);
          setMediaItems([]);
        }
      })
      .finally(() => {
        setLoadingMedia(false);
      });
    return () => {
      controller.abort();
    };
  }, [dialog?.account_phone, dialog?.chat_id, activeMediaTab]);

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '');
      setIsSaved(true);
    } else {
      setNotes('');
    }
  }, [lead]);

  const handleNotesChange = (e) => {
    setNotes(e.target.value);
    setIsSaved(false);
  };

  const handleNotesBlur = () => {
    if (!isSaved && onUpdateLead) {
      onUpdateLead({ notes });
      setIsSaved(true);
    }
  };

  if (!lead && !dialog) {
    return (
      <aside className="panel panel-crm panel-desc">
        <div className="panel-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 600 }}>Описание</h3>
        </div>
        <div className="desc-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
          <p style={{ fontSize: '13px' }}>Выберите диалог для просмотра</p>
        </div>
      </aside>
    );
  }

  const effectiveLead = lead || {
    chat_id: dialog?.chat_id,
    account_phone: dialog?.account_phone,
    first_name: dialog?.title || '',
    last_name: '',
    username: dialog?.username || '',
    bio: '',
    birthday: '',
    channel_link: '',
    channel_title: '',
    notes: '',
    group_ids: []
  };

  const name = [effectiveLead.first_name, effectiveLead.last_name].filter(Boolean).join(' ') || effectiveLead.username || dialog?.title || `ID: ${effectiveLead.chat_id}`;
  const colorIdx = hashColor(name);
  const isChannel = Boolean(dialog?.chat_type === 'channel' || Number(effectiveLead.chat_id) < 0);

  return (
    <aside className="panel panel-crm panel-desc">
      <div
        className="panel-head"
        style={{
          borderBottom: '1px solid var(--line)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', fontWeight: 600 }}>Описание</h3>
        <span
          className="badge-type"
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-2)'
          }}
        >
          {isChannel ? 'Канал' : 'Личный чат'}
        </span>
      </div>

      <div className="desc-body" id="desc-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
        {/* 1. Карточка профиля */}
        <div className="desc-card desc-profile-card">
          <div className="desc-avatar-wrap">
            <div className={`desc-avatar av av-lg av-${colorIdx}`} style={{ position: 'relative' }}>
              <img
                src={`/api/avatar?account=${encodeURIComponent(effectiveLead.account_phone || '')}&chat_id=${effectiveLead.chat_id}`}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <span>{(name[0] || '?').toUpperCase()}</span>
            </div>
          </div>
          <div className="desc-title" id="desc-title">{name}</div>
          <div className="desc-status" id="desc-status">
            {effectiveLead.username ? `@${effectiveLead.username}` : (isChannel ? 'канал' : 'пользователь')}
          </div>

          {/* Инфо строки */}
          <div className="desc-info-rows" style={{ marginTop: '12px', width: '100%', textAlign: 'left' }}>
            {effectiveLead.bio && (
              <div className="desc-info-row" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="desc-info-val" style={{ color: '#fff', fontSize: '12.5px' }}>{effectiveLead.bio}</div>
                <span className="desc-info-label" style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>О себе</span>
              </div>
            )}
            {effectiveLead.birthday && (
              <div className="desc-info-row" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="desc-info-val" style={{ color: '#fff', fontSize: '12.5px' }}>{effectiveLead.birthday}</div>
                <span className="desc-info-label" style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>День рождения</span>
              </div>
            )}
            {effectiveLead.channel_link && (
              <div className="desc-info-row" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="desc-info-val" style={{ fontSize: '12.5px' }}>
                  <a
                    href={effectiveLead.channel_link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--accent, #00a8ff)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>
                      {effectiveLead.channel_title
                        ? `${effectiveLead.channel_title} (${effectiveLead.channel_link.replace('https://t.me/', '@')})`
                        : (effectiveLead.channel_link.includes('/c/')
                            ? `Канал ID: ${effectiveLead.channel_link.split('/c/')[1]}`
                            : effectiveLead.channel_link.replace('https://t.me/', '@'))}
                    </span>
                  </a>
                </div>
                <span className="desc-info-label" style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>Личный канал</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Карточка: Группа лида */}
        <div className="desc-card">
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '6px' }}>
            ГРУППА ЛИДА
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {(() => {
              const currentGroupIds = effectiveLead.group_ids || [];
              const assigned = (leadGroups || []).filter(g => currentGroupIds.includes(g.id));
              if (assigned.length === 0) {
                return <span style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>Группы не присвоены</span>;
              }
              return assigned.map(g => (
                <span
                  key={g.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    backgroundColor: `${g.color || '#00a8ff'}22`,
                    border: `1px solid ${g.color || '#00a8ff'}55`,
                    color: g.color || '#00a8ff',
                    fontSize: '11.5px',
                    fontWeight: 600
                  }}
                >
                  <span>{g.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newIds = currentGroupIds.filter(id => id !== g.id);
                      onUpdateLead({ group_ids: newIds });
                    }}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 2px', fontSize: '13px', lineHeight: 1 }}
                    title="Удалить из группы"
                  >
                    ×
                  </button>
                </span>
              ));
            })()}
          </div>

          {(() => {
            const currentGroupIds = effectiveLead.group_ids || [];
            const unassigned = (leadGroups || []).filter(g => !currentGroupIds.includes(g.id));
            if (unassigned.length === 0) return null;
            return (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    const newIds = [...currentGroupIds, parseInt(e.target.value)];
                    onUpdateLead({ group_ids: newIds });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="">+ Добавить в группу...</option>
                {unassigned.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            );
          })()}
        </div>

        {/* 3. Карточка: Заметки по лиду */}
        <div className="desc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              ЗАМЕТКИ ПО ЛИДУ
            </span>
            <span style={{ fontSize: '11px', color: '#2ed573' }}>
              {isSaved ? 'Сохранено' : 'Печатает...'}
            </span>
          </div>
          <textarea
            style={{
              width: '100%',
              minHeight: '70px',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '8px 10px',
              color: '#fff',
              fontSize: '12px',
              resize: 'none',
              outline: 'none'
            }}
            placeholder="Заметки по кандидату, статус договоренности..."
            value={notes}
            onChange={handleNotesChange}
            onBlur={handleNotesBlur}
          ></textarea>
        </div>

        {/* 4. Карточка: Медиа / Вложения */}
        <div className="desc-card">
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', gap: '12px' }}>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeMediaTab === 'media' ? 700 : 500,
                color: activeMediaTab === 'media' ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer'
              }}
              onClick={() => setActiveMediaTab('media')}
            >
              Медиа
            </button>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeMediaTab === 'files' ? 700 : 500,
                color: activeMediaTab === 'files' ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer'
              }}
              onClick={() => setActiveMediaTab('files')}
            >
              Файлы
            </button>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeMediaTab === 'links' ? 700 : 500,
                color: activeMediaTab === 'links' ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer'
              }}
              onClick={() => setActiveMediaTab('links')}
            >
              Ссылки
            </button>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                fontWeight: activeMediaTab === 'voice' ? 700 : 500,
                color: activeMediaTab === 'voice' ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer'
              }}
              onClick={() => setActiveMediaTab('voice')}
            >
              Голос
            </button>
          </div>
          <div style={{ minHeight: '80px', maxHeight: '240px', overflowY: 'auto', marginTop: '10px' }}>
            {loadingMedia ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-3)' }}>
                Загрузка...
              </div>
            ) : mediaItems.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-3)' }}>
                Нет данных
              </div>
            ) : activeMediaTab === 'media' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {mediaItems.map(item => {
                  const mId = item.message_id || item.id;
                  const url = `/api/media/${encodeURIComponent(item.account_phone)}/${item.chat_id}/${mId}`;
                  const thumbUrl = `${url}?thumb=1`;
                  const isVid = item.media_type === 'video' || item.media_type === 'video_note';
                  return (
                    <div
                      key={mId}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        background: '#151922',
                        cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}
                      onClick={() => setPreviewMedia({ url, type: isVid ? 'video' : 'image' })}
                      title={isVid ? 'Нажмите для просмотра видео' : 'Нажмите для просмотра фото'}
                    >
                      {isVid ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#10141d', gap: '4px' }}>
                          <span style={{ fontSize: '20px' }}>🎬</span>
                          <span style={{ fontSize: '9.5px', color: 'var(--text-3)', fontWeight: 500 }}>Видео</span>
                        </div>
                      ) : (
                        <img
                          src={thumbUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                      {isVid && (
                        <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.65)', borderRadius: '4px', padding: '1px 5px', fontSize: '9px', color: '#fff', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>▶</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : activeMediaTab === 'files' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mediaItems.map(item => {
                  const mId = item.message_id || item.id;
                  const url = `/api/media/${encodeURIComponent(item.account_phone)}/${item.chat_id}/${mId}`;
                  const name = item.media_metadata?.name || `file_${mId}`;
                  const size = item.media_metadata?.size ? `${Math.round(item.media_metadata.size / 1024)} KB` : '';
                  return (
                    <a
                      key={mId}
                      href={url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        textDecoration: 'none',
                        color: 'inherit',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                        {size && <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{size}</div>}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : activeMediaTab === 'links' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mediaItems.map(item => {
                  const mId = item.message_id || item.id;
                  const match = (item.text || '').match(/https?:\/\/[^\s]+/g);
                  const link = match ? match[0] : item.text;
                  return (
                    <a
                      key={mId}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        textDecoration: 'none',
                        color: 'var(--accent)',
                        fontSize: '11px',
                        wordBreak: 'break-all',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}
                    >
                      <span>🔗</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mediaItems.map(item => {
                  const mId = item.message_id || item.id;
                  const url = `/api/media/${encodeURIComponent(item.account_phone)}/${item.chat_id}/${mId}`;
                  const dur = item.media_metadata?.duration ? `${Math.round(item.media_metadata.duration)}s` : '';
                  const isVNote = item.media_type === 'video_note';

                  if (isVNote) {
                    return (
                      <div
                        key={mId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer'
                        }}
                        onClick={() => setPreviewMedia({ url, type: 'video' })}
                        title="Нажмите для просмотра видеосообщения"
                      >
                        <span style={{ fontSize: '15px' }}>📹</span>
                        <span style={{ fontSize: '11.5px', color: '#fff', flex: 1 }}>Видеосообщение</span>
                        {dur && <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{dur}</span>}
                        <span style={{ fontSize: '11px', color: 'var(--accent)' }}>▶</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={mId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}
                    >
                      <audio controls src={url} preload="none" style={{ height: '30px', width: '100%' }} />
                      {dur && <span style={{ fontSize: '10px', color: 'var(--text-3)', flexShrink: 0 }}>{dur}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модальный просмотрщик медиа */}
      {previewMedia && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setPreviewMedia(null)}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewMedia(null)}
              style={{
                position: 'absolute',
                top: '-36px',
                right: '0',
                background: 'none',
                border: 'none',
                color: '#fff',
                fontSize: '24px',
                cursor: 'pointer',
                lineHeight: 1
              }}
              title="Закрыть"
            >
              ✕
            </button>
            {previewMedia.type === 'video' ? (
              <video
                src={previewMedia.url}
                controls
                autoPlay
                playsInline
                style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
              />
            ) : (
              <img
                src={previewMedia.url}
                alt=""
                style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: '8px', objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
              />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
