import React, { useState, useEffect } from 'react';
import { X, UserCheck, Shield, Lock, Upload, Sparkles, Trash2, Check, Loader2 } from 'lucide-react';
import { api } from '../api';

export default function ProfileEditorModal({ isOpen, onClose, accounts, groups, onTaskStarted }) {
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  
  // Юзернейм и Аватарки
  const [setUsername, setSetUsername] = useState(true);
  const [setAvatar, setSetAvatar] = useState(true);
  const [avatarsCount, setAvatarsCount] = useState(0);
  const [isUploadingAvatars, setIsUploadingAvatars] = useState(false);

  // 2FA
  const [enable2FA, setEnable2FA] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [twoFaHint, setTwoFaHint] = useState('farm');

  // Приватность (MTProto Shield)
  const [hidePhone, setHidePhone] = useState(true);
  const [hideSearch, setHideSearch] = useState(true);
  const [hideLastSeen, setHideLastSeen] = useState(false);
  const [blockCalls, setBlockCalls] = useState(true);
  const [blockP2P, setBlockP2P] = useState(true);
  const [blockInvites, setBlockInvites] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAvatarsCount = async () => {
    try {
      const res = await api.getAvatarsCount();
      setAvatarsCount(res.count || 0);
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen) {
      loadAvatarsCount();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (selectedPhones.length === accounts.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(accounts.map(a => a.phone || a.session_name));
    }
  };

  const handleSelectGroup = (groupId) => {
    const inGroup = accounts.filter(a => a.work_group_id === groupId).map(a => a.phone || a.session_name);
    setSelectedPhones(inGroup);
  };

  const handleAvatarUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsUploadingAvatars(true);
    try {
      const res = await api.uploadAvatars(files);
      setAvatarsCount(res.count || 0);
    } catch (err) {
      alert(`Ошибка загрузки аватарок: ${err.message}`);
    } finally {
      setIsUploadingAvatars(false);
    }
  };

  const handleClearAvatars = async () => {
    if (!window.confirm('Очистить пул загруженных аватарок?')) return;
    try {
      await api.clearAvatars();
      setAvatarsCount(0);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPhones.length) {
      alert('Выберите хотя бы один аккаунт для применения изменений');
      return;
    }

    if (enable2FA && !twoFaPassword.trim()) {
      alert('Укажите пароль двухфакторной аутентификации (2FA)');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.startProfileUpdate({
        account_phones: selectedPhones,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        bio: bio.trim() || null,
        set_username: setUsername,
        set_avatar: setAvatar,
        enable_2fa: enable2FA,
        two_fa_password: twoFaPassword.trim() || null,
        two_fa_hint: twoFaHint.trim() || 'farm',
        hide_phone: hidePhone,
        hide_search_by_phone: hideSearch,
        hide_last_seen: hideLastSeen,
        block_calls: blockCalls,
        block_p2p: blockP2P,
        block_invites: blockInvites
      });

      if (onTaskStarted) onTaskStarted();
      onClose();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '820px', width: '96%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(0, 168, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00a8ff', border: '1px solid rgba(0, 168, 255, 0.3)' }}>
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="modal-title">Массовое оформление профилей, 2FA и приватность</div>
              <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.55)', marginTop: '2px' }}>
                Персонализация данных, ротация аватарок, генератор @username и MTProto Shield
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto', padding: '20px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* ШАГ 1: Выбор аккаунтов */}
            <div className="modal-card-section">
              <div className="card-step-header">
                <div className="card-step-title">
                  <span className="step-badge">1</span>
                  <span>Аккаунты для обновления ({selectedPhones.length} из {accounts.length})</span>
                  <span className="step-subtitle">выберите сессии вручную или воспользуйтесь быстрыми фильтрами</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="group-pill"
                    onClick={handleSelectAll}
                  >
                    {selectedPhones.length === accounts.length ? 'Снять все' : 'Выбрать все'}
                  </button>
                  {groups && groups.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      className="group-pill"
                      onClick={() => handleSelectGroup(g.id)}
                    >
                      {g.title}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px', maxHeight: '140px', overflowY: 'auto', padding: '4px' }}>
                {accounts.map(acc => {
                  const id = acc.phone || acc.session_name;
                  const isChecked = selectedPhones.includes(id);
                  const name = [acc.first_name, acc.last_name].filter(Boolean).join(' ') || (acc.username ? `@${acc.username}` : id);
                  return (
                    <label
                      key={acc.session_name}
                      className={`account-chip ${isChecked ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPhones(prev => [...prev, id]);
                          } else {
                            setSelectedPhones(prev => prev.filter(p => p !== id));
                          }
                        }}
                      />
                      <div className="chip-info">
                        <span className="chip-name">{name}</span>
                        <span className="chip-phone">{id}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ШАГ 2: Данные профиля */}
            <div className="modal-card-section">
              <div className="card-step-header">
                <div className="card-step-title">
                  <span className="step-badge purple">2</span>
                  <span>Персонализация (Имя, О себе, Username, Аватарка)</span>
                  <span className="step-subtitle">пустые поля берут случайные значения из локальной базы</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Имя (пусто = рандом из names.txt)
                  </span>
                  <input
                    type="text"
                    placeholder="Рандомное имя из базы..."
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Фамилия (пусто = рандом из surnames.txt)
                  </span>
                  <input
                    type="text"
                    placeholder="Рандомная фамилия из базы..."
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  О себе (Bio) (пусто = рандом из tg_about.txt со спинтаксом)
                </span>
                <textarea
                  rows="2"
                  placeholder="{Привет!|Здравствуй!} {Пишите в ЛС|На связи|По всем вопросам в личные сообщения}."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                ></textarea>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="option-toggle-card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      Генерировать уникальный читаемый <b>@username</b>
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Проверяет доступность ника через MTProto Telegram API перед сохранением
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={setUsername}
                    onChange={(e) => setSetUsername(e.target.checked)}
                  />
                </label>

                <div className="option-toggle-card">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={setAvatar}
                      onChange={(e) => setSetAvatar(e.target.checked)}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                        Установить случайную аватарку из пула
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        В пуле загружено: <b style={{ color: '#00a8ff' }}>{avatarsCount}</b> шт.
                      </span>
                    </div>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {isUploadingAvatars ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      <span>{isUploadingAvatars ? 'Загрузка...' : '+ Загрузить фото'}</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        style={{ display: 'none' }}
                        onChange={handleAvatarUpload}
                      />
                    </label>
                    {avatarsCount > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAvatars}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '6px 8px', color: '#f87171' }}
                        title="Очистить все аватарки"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ШАГ 3: Двухфакторная аутентификация (2FA) */}
            <div className="modal-card-section">
              <div className="card-step-header">
                <div className="card-step-title">
                  <span className="step-badge amber">3</span>
                  <span>Облачный пароль (2FA)</span>
                  <span className="step-subtitle">двухфакторная защита от угона и восстановления сессий</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600, color: '#fbbf24' }}>
                  <input
                    type="checkbox"
                    checked={enable2FA}
                    onChange={(e) => setEnable2FA(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }}
                  />
                  <span>Установить 2FA на аккаунты</span>
                </label>
              </div>

              {enable2FA && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                        Пароль 2FA *
                      </span>
                      <input
                        type="text"
                        required
                        value={twoFaPassword}
                        onChange={(e) => setTwoFaPassword(e.target.value)}
                        placeholder="Напр. SecretPass123!"
                        style={{ width: '100%', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                        Подсказка к паролю (Hint)
                      </span>
                      <input
                        type="text"
                        value={twoFaHint}
                        onChange={(e) => setTwoFaHint(e.target.value)}
                        placeholder="Напр. farm"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                  <div className="info-callout" style={{ fontSize: '11.5px', padding: '8px 12px' }}>
                    <span className="ico">🔒</span>
                    <span>Пароль будет установлен через MTProto API и автоматически сохранен в `.json` файл сессии для безопасных последующих авторизаций.</span>
                  </div>
                </div>
              )}
            </div>

            {/* ШАГ 4: Приватность и Безопасность (MTProto Shield) */}
            <div className="modal-card-section">
              <div className="card-step-header">
                <div className="card-step-title">
                  <span className="step-badge emerald">4</span>
                  <span>Приватность и защита прокси (MTProto Shield)</span>
                  <span className="step-subtitle">настройка приватности для полной защиты аккаунтов от банов и деанонимизации</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label className="option-toggle-card">
                  <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Номер телефона: «Никто»</span>
                  <input
                    type="checkbox"
                    checked={hidePhone}
                    onChange={(e) => setHidePhone(e.target.checked)}
                  />
                </label>

                <label className="option-toggle-card">
                  <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Поиск по номеру: «Никто»</span>
                  <input
                    type="checkbox"
                    checked={hideSearch}
                    onChange={(e) => setHideSearch(e.target.checked)}
                  />
                </label>

                <label className="option-toggle-card">
                  <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Запретить звонки: «Никто»</span>
                  <input
                    type="checkbox"
                    checked={blockCalls}
                    onChange={(e) => setBlockCalls(e.target.checked)}
                  />
                </label>

                <label className="option-toggle-card">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Запрет P2P-звонков</span>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Защита IP прокси от утечки</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={blockP2P}
                    onChange={(e) => setBlockP2P(e.target.checked)}
                  />
                </label>

                <label className="option-toggle-card">
                  <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Инвайты в группы: «Контакты»</span>
                  <input
                    type="checkbox"
                    checked={blockInvites}
                    onChange={(e) => setBlockInvites(e.target.checked)}
                  />
                </label>

                <label className="option-toggle-card">
                  <span style={{ fontSize: '12.5px', color: '#f1f5f9' }}>Время захода: «Никто»</span>
                  <input
                    type="checkbox"
                    checked={hideLastSeen}
                    onChange={(e) => setHideLastSeen(e.target.checked)}
                  />
                </label>
              </div>
            </div>

            {/* Кнопка отправки */}
            <div style={{ paddingTop: '6px' }}>
              <button
                type="submit"
                className="btn-modal-action"
                disabled={isSubmitting || selectedPhones.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Запуск обновления...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Применить настройки к {selectedPhones.length} аккаунтам</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

