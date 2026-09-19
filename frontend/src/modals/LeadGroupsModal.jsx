import React, { useState } from 'react';
import { X, Tag, Trash2, Download } from 'lucide-react';
import { api } from '../api';

export default function LeadGroupsModal({ isOpen, onClose, leadGroups, onRefresh }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00a8ff');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedExportGroup, setSelectedExportGroup] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createLeadGroup(name.trim(), color);
      setName('');
      onRefresh();
    } catch (err) {
      alert(`Ошибка создания группы лидов: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить эту группу лидов?')) return;
    try {
      await api.deleteLeadGroup(id);
      onRefresh();
    } catch (err) {
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag className="w-5 h-5 text-accent" />
            <span>Управление группами лидов</span>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          {/* Форма создания */}
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            <input
              type="text"
              placeholder="Название (напр. Собеседование, Клиент...)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ flex: 1, fontSize: '13px', padding: '9px 12px' }}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Цвет группы"
              style={{
                width: '44px',
                height: '40px',
                padding: '2px',
                cursor: 'pointer',
                background: 'transparent',
                borderRadius: '8px'
              }}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '0 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              + Добавить
            </button>
          </form>

          {/* Список существующих групп */}
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.8px', fontWeight: 700 }}>
            Существующие группы
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
            {!leadGroups || leadGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: '12px' }}>
                Группы пока не созданы
              </div>
            ) : (
              leadGroups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-glass-hover)',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: g.color || '#00a8ff',
                        boxShadow: `0 0 8px ${g.color || '#00a8ff'}88`
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {g.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="icon-btn"
                    style={{ stroke: 'var(--danger)', opacity: 0.7 }}
                    onClick={() => handleDelete(g.id)}
                    title="Удалить группу"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Секция экспорта базы лидов */}
          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Экспорт базы лидов (CRM)</span>
              <Download className="w-3.5 h-3.5 text-blue-400" />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={selectedExportGroup}
                onChange={(e) => setSelectedExportGroup(e.target.value)}
                style={{ flex: 1, fontSize: '12px', padding: '8px 10px', background: 'var(--bg-glass-hover)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px' }}
              >
                <option value="">Все лиды (без фильтра)</option>
                {leadGroups && leadGroups.map(g => (
                  <option key={g.id} value={g.id}>Группа: {g.name}</option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => api.downloadLeads(selectedExportGroup ? parseInt(selectedExportGroup) : null, 'csv')}
                title="Скачать таблицу CSV с полной информацией"
              >
                <span>Excel/CSV</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => api.downloadLeads(selectedExportGroup ? parseInt(selectedExportGroup) : null, 'txt')}
                title="Скачать список @юзернеймов для рассылки"
              >
                <span>TXT</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

