import React, { useState } from 'react';
import { X, FolderPlus, Trash2, Users } from 'lucide-react';
import { api } from '../api';

export default function CreateFarmGroupModal({ isOpen, onClose, groups, onRefresh }) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#00a8ff');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createGroup(title.trim(), color);
      setTitle('');
      onRefresh();
      onClose();
    } catch (err) {
      alert(`Ошибка создания группы фермы: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить эту группу фермы? Аккаунты перейдут в общий список.')) return;
    try {
      await api.deleteGroup(id);
      onRefresh();
    } catch (err) {
      alert(`Ошибка удаления группы: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users className="w-5 h-5 text-accent" />
            <span>Группы фермы</span>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            <input
              type="text"
              placeholder="Название (напр. ворк дд, спам...)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              + Создать
            </button>
          </form>

          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.8px', fontWeight: 700 }}>
            Существующие группы фермы
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
            {!groups || groups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: '12px' }}>
                Группы пока не созданы
              </div>
            ) : (
              groups.map((g) => (
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
                      {g.title}
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
        </div>
      </div>
    </div>
  );
}
