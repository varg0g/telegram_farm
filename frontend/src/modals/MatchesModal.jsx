import React, { useState, useEffect } from 'react';
import { X, Heart, ExternalLink, MessageSquare, CheckCircle, RefreshCw } from 'lucide-react';
import { api } from '../api';

export default function MatchesModal({ isOpen, onClose, onSelectMatchChat }) {
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadMatches = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMatches();
      setMatches(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMatches();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '840px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255, 71, 87, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4757' }}>
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="modal-title" style={{ fontSize: '16px' }}>Хранилище взаимок (Дайвинчик)</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>Взаимные симпатии со всех аккаунтов фермы</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={loadMatches}
              disabled={isLoading}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
            <button
              onClick={onClose}
              className="icon-btn"
              type="button"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* Сетка анкет взаимок */}
        <div className="flex-1 overflow-y-auto pt-4 grid grid-cols-2 gap-3">
          {matches.map(m => {
            return (
              <div
                key={m.id}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-pink-500/30 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-sm text-white flex items-center space-x-1.5">
                        <span>{m.lead_name || 'Кандидат'}</span>
                        {m.lead_age > 0 && <span className="text-gray-400 text-xs">, {m.lead_age}</span>}
                      </div>
                      {m.lead_city && (
                        <div className="text-[11px] text-gray-400 mt-0.5">{m.lead_city}</div>
                      )}
                    </div>

                    <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-2 py-0.5 rounded-full font-medium">
                      на {m.account_phone}
                    </span>
                  </div>

                  {m.lead_bio && (
                    <div className="mt-2 text-gray-300 text-[11px] line-clamp-3 bg-black/20 p-2 rounded-xl">
                      {m.lead_bio}
                    </div>
                  )}

                  {m.lead_username && (
                    <div className="mt-2 flex items-center space-x-1 text-blue-400">
                      <span>@{m.lead_username}</span>
                    </div>
                  )}
                </div>

                {/* Кнопка перехода в чат */}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {new Date(m.created_at * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>

                  <button
                    onClick={() => {
                      onSelectMatchChat(m.account_phone, m.lead_user_id, m.lead_name || m.lead_username);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-medium flex items-center space-x-1.5 shadow-md shadow-pink-500/20 active:scale-95 transition-all"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Открыть диалог</span>
                  </button>
                </div>
              </div>
            );
          })}

          {matches.length === 0 && !isLoading && (
            <div className="col-span-2 p-12 text-center text-gray-500">
              Пока нет взаимных симпатий.<br />Запустите автолайкер или прогрев в инструментах фермы!
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
