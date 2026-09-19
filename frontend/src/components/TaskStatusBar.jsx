import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export default function TaskStatusBar({
  tasks,
  onPauseTask,
  onResumeTask,
  onCancelTask
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedTaskLog, setSelectedTaskLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const logBoxRef = useRef(null);

  // Фильтруем активные задачи (выполняются, ожидают или на паузе)
  const activeTasks = tasks.filter(t => ['running', 'pending', 'paused'].includes(t.status));

  // Загрузка лога при открытии модалки логов
  useEffect(() => {
    if (!selectedTaskLog) return;
    setIsLoadingLog(true);

    const fetchLog = async () => {
      try {
        const data = await api.getTask(selectedTaskLog.id);
        if (data && data.log) {
          setLogContent(data.log);
        }
      } catch (err) {
        setLogContent(prev => prev || `Ошибка загрузки лога: ${err.message}`);
      } finally {
        setIsLoadingLog(false);
      }
    };

    fetchLog();
    const interval = setInterval(fetchLog, 1500);
    return () => clearInterval(interval);
  }, [selectedTaskLog]);

  // Автоскролл логов вниз
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logContent]);

  if (activeTasks.length === 0 && !selectedTaskLog) {
    return null; // Если задач нет, не загромождаем экран
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          width: '320px',
          background: 'rgba(14, 17, 23, 0.92)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
          zIndex: 90,
          overflow: 'hidden',
          fontSize: '12px',
          transition: 'all 0.2s ease'
        }}
      >
        {/* Шапка статус-бара */}
        <div
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.08)' : 'none',
            cursor: 'pointer',
            userSelect: 'none',
            background: 'rgba(255,255,255,0.02)'
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: activeTasks.some(t => t.status === 'running') ? '#00a8ff' : '#ffa502',
                boxShadow: activeTasks.some(t => t.status === 'running') ? '0 0 8px #00a8ff' : 'none'
              }}
            />
            <span style={{ fontWeight: 600, color: '#fff' }}>
              Фоновые задачи ({activeTasks.length})
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>

        {/* Тело со списком задач */}
        {isExpanded && (
          <div style={{ padding: '10px 14px', maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeTasks.map(t => {
              const isPaused = t.status === 'paused';
              const isRunning = t.status === 'running';

              return (
                <div
                  key={t.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '11.5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '190px'
                      }}
                      title={t.title}
                    >
                      {t.title}
                    </span>

                    {/* Кнопки управления задачей */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* Пауза / Возобновить */}
                      {isRunning ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onPauseTask(t.id); }}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: '#ffa502',
                            width: '22px',
                            height: '22px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Приостановить"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                            <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                            <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onResumeTask(t.id); }}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            color: '#2ed573',
                            width: '22px',
                            height: '22px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Возобновить"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                        </button>
                      )}

                      {/* Просмотр лога */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedTaskLog(t); }}
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: 'none',
                          color: 'var(--accent, #00a8ff)',
                          width: '22px',
                          height: '22px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Просмотр лога"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                      </button>

                      {/* Отмена задачи */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Отменить задачу "${t.title}"?`)) {
                            onCancelTask(t.id);
                          }
                        }}
                        style={{
                          background: 'rgba(255, 71, 87, 0.15)',
                          border: 'none',
                          color: '#ff4757',
                          width: '22px',
                          height: '22px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Остановить"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Прогресс-бар */}
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' }}>
                    <div
                      style={{
                        width: `${t.progress || 0}%`,
                        height: '100%',
                        background: isPaused ? '#ffa502' : 'var(--accent, #00a8ff)',
                        transition: 'width 0.2s ease'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-3)' }}>
                    <span>{isPaused ? 'Пауза' : `${t.processed || 0} / ${t.total || 0}`}</span>
                    <span style={{ color: isPaused ? '#ffa502' : 'var(--accent, #00a8ff)', fontWeight: 600 }}>
                      {t.progress || 0}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модальное окно просмотра живого лога задачи */}
      {selectedTaskLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}
          onClick={() => setSelectedTaskLog(null)}
        >
          <div
            style={{
              width: '640px',
              maxWidth: '100%',
              background: '#121620',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '14px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '80vh'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  {selectedTaskLog.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                  ID: {selectedTaskLog.id} • Прогресс: {selectedTaskLog.progress || 0}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-3)',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            <div
              ref={logBoxRef}
              style={{
                padding: '16px',
                flex: 1,
                overflowY: 'auto',
                fontFamily: 'Consolas, monospace',
                fontSize: '12px',
                lineHeight: 1.5,
                background: '#0a0d14',
                color: '#d1d8e0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {isLoadingLog && !logContent ? (
                <div style={{ color: 'var(--text-3)' }}>Загрузка логов…</div>
              ) : (
                logContent || 'Лог пуст'
              )}
            </div>

            <div
              style={{
                padding: '10px 18px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(logContent);
                  alert('Лог скопирован в буфер обмена');
                }}
              >
                Копировать лог
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedTaskLog(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
