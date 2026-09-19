import React, { useState, useMemo } from 'react';
import { X, Search, Trash2, Smartphone, FolderArchive, ArrowRight, ShieldCheck, Check, Loader2 } from 'lucide-react';
import { api } from '../api';

export default function AddAccountModal({
  isOpen,
  onClose,
  onAccountAdded,
  accounts = [],
  groups = [],
  proxies = [],
  proxyGroups = [],
  onOpenProxyManager
}) {
  const [activeTab, setActiveTab] = useState('phone'); // 'phone' | 'files'

  // --- Вкладка "По номеру" ---
  const [phone, setPhone] = useState('');
  const [phoneProxyId, setPhoneProxyId] = useState('');
  const [phoneStep, setPhoneStep] = useState(1); // 1 = ввод номера, 2 = ввод SMS, 3 = 2FA пароль
  const [phoneCode, setPhoneCode] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [isPhoneLoading, setIsPhoneLoading] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState({ text: '', type: '' });

  // --- Вкладка "Сессии (.session)" ---
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [workGroupId, setWorkGroupId] = useState('');
  const [proxyMode, setProxyMode] = useState('none'); // 'none' | 'group' | 'single'
  const [selectedProxyGroupId, setSelectedProxyGroupId] = useState('');
  const [selectedSingleProxyId, setSelectedSingleProxyId] = useState('');
  const [accountsPerProxy, setAccountsPerProxy] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState({ text: '', type: '' });

  // --- Правая колонка: Управление и удаление ---
  const [selectedFilterGroup, setSelectedFilterGroup] = useState('all'); // 'all' | 'none' | groupId
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountNames, setSelectedAccountNames] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Фильтрация аккаунтов в правой колонке ---
  const filteredAccounts = useMemo(() => {
    let list = accounts || [];
    if (selectedFilterGroup === 'none') {
      list = list.filter(a => !a.work_group_id);
    } else if (selectedFilterGroup !== 'all') {
      list = list.filter(a => String(a.work_group_id) === String(selectedFilterGroup));
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(a =>
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.session_name && a.session_name.toLowerCase().includes(q)) ||
        (a.phone && a.phone.toLowerCase().includes(q)) ||
        (a.first_name && a.first_name.toLowerCase().includes(q)) ||
        (a.last_name && a.last_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [accounts, selectedFilterGroup, searchQuery]);

  // Подсчёт количества по группам для пилюль
  const groupCounts = useMemo(() => {
    const counts = {};
    let noGroup = 0;
    (accounts || []).forEach(a => {
      if (a.work_group_id) {
        const gid = String(a.work_group_id);
        counts[gid] = (counts[gid] || 0) + 1;
      } else {
        noGroup++;
      }
    });
    return { counts, noGroup };
  }, [accounts]);

  // --- Логика авторизации по номеру ---
  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setIsPhoneLoading(true);
    setPhoneMessage({ text: '', type: '' });

    try {
      const pId = phoneProxyId ? parseInt(phoneProxyId) : null;
      await api.startPhoneAuth(phone.trim(), pId);
      setPhoneStep(2);
      setPhoneMessage({ text: 'Код отправлен в Telegram!', type: 'success' });
    } catch (err) {
      setPhoneMessage({ text: err.message || 'Ошибка отправки кода', type: 'error' });
    } finally {
      setIsPhoneLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!phoneCode.trim()) return;
    setIsPhoneLoading(true);
    setPhoneMessage({ text: '', type: '' });

    try {
      const res = await api.signInPhone(phone.trim(), phoneCode.trim(), phonePassword ? phonePassword.trim() : null);
      if (res.data && res.data.need_password) {
        setPhoneStep(3);
        setPhoneMessage({ text: 'Требуется пароль двухфакторной аутентификации (2FA)', type: 'info' });
      } else {
        setPhoneMessage({ text: '✅ Аккаунт успешно добавлен!', type: 'success' });
        if (onAccountAdded) onAccountAdded();
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err) {
      setPhoneMessage({ text: err.message || 'Ошибка авторизации', type: 'error' });
    } finally {
      setIsPhoneLoading(false);
    }
  };

  // --- Логика загрузки файлов ---
  const handleFileChange = (e) => {
    if (!e.target.files || !e.target.files.length) return;
    const incoming = Array.from(e.target.files);
    setSelectedFiles(incoming);
    setUploadNote({ text: '', type: '' });
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFiles.length) {
      setUploadNote({ text: 'Выберите файлы (.session, .json или .zip)', type: 'error' });
      return;
    }

    setIsUploading(true);
    setUploadNote({ text: '⏳ Загрузка и активация сессий…', type: 'info' });

    try {
      const formData = new FormData();
      for (const f of selectedFiles) {
        formData.append('files', f);
      }
      if (workGroupId) {
        formData.append('work_group_id', workGroupId);
      }
      formData.append('proxy_mode', proxyMode);
      if (proxyMode === 'group' && selectedProxyGroupId) {
        formData.append('proxy_group_id', selectedProxyGroupId);
        formData.append('accounts_per_proxy', accountsPerProxy);
      } else if (proxyMode === 'single' && selectedSingleProxyId) {
        formData.append('proxy_id', selectedSingleProxyId);
      }

      const res = await api.uploadBatchSessions(formData);
      if (res.errors && res.errors.length > 0 && res.uploaded === 0) {
        setUploadNote({ text: `❌ Ошибки импорта:\n${res.errors.join('\n')}`, type: 'error' });
      } else {
        const okMsg = `✅ Успешно загружено и активировано: ${res.uploaded} из ${res.total}`;
        setUploadNote({ text: okMsg, type: 'success' });
        setSelectedFiles([]);
        if (onAccountAdded) onAccountAdded();
      }
    } catch (err) {
      setUploadNote({ text: `❌ Ошибка: ${err.message || 'не удалось загрузить файлы'}`, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };


  // Чекбоксы и множественное удаление
  const handleToggleAccount = (accName) => {
    setSelectedAccountNames(prev => {
      const next = new Set(prev);
      if (next.has(accName)) {
        next.delete(accName);
      } else {
        next.add(accName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedAccountNames.size === filteredAccounts.length && filteredAccounts.length > 0) {
      setSelectedAccountNames(new Set());
    } else {
      setSelectedAccountNames(new Set(filteredAccounts.map(a => a.session_name || a.name)));
    }
  };

  const handleDeleteSelected = async () => {
    const names = Array.from(selectedAccountNames);
    if (!names.length) return;
    if (!window.confirm(`Вы действительно хотите удалить выбранные аккаунты (${names.length})? Их сессии будут удалены.`)) return;

    setIsDeleting(true);
    try {
      for (const name of names) {
        await api.deleteAccount(name);
      }
      setSelectedAccountNames(new Set());
      if (onAccountAdded) onAccountAdded();
    } catch (err) {
      alert(`Ошибка при удалении: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (accName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить аккаунт ${accName}?`)) return;
    try {
      await api.deleteAccount(accName);
      setSelectedAccountNames(prev => {
        const next = new Set(prev);
        next.delete(accName);
        return next;
      });
      if (onAccountAdded) onAccountAdded();
    } catch (err) {
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-manage-accounts"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="modal-head" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0, 168, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00a8ff' }}>
              <Smartphone className="w-4 h-4" />
            </div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '17px', color: '#fff' }}>Управление аккаунтами</h3>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Тело модального окна: 2 Колонки */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'hidden', display: 'flex', gap: '20px', padding: '20px' }}>
          
          {/* Левая колонка: Добавление аккаунтов (Flex 1.1) */}
          <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: '15px', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px', overflowY: 'auto' }}>
            
            {/* Карточка добавления с табами */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '18px' }}>
              <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#fff' }}>Добавить аккаунт</h4>

              {/* Табы */}
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('phone'); setPhoneMessage({ text: '', type: '' }); }}
                  className={`btn btn-secondary ${activeTab === 'phone' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    fontSize: '12px',
                    padding: '7px 8px',
                    background: activeTab === 'phone' ? '#007aff' : 'transparent',
                    color: activeTab === 'phone' ? '#fff' : 'var(--text-2)',
                    borderColor: activeTab === 'phone' ? '#007aff' : 'transparent',
                    fontWeight: 600
                  }}
                >
                  📱 По номеру
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('files'); setUploadNote({ text: '', type: '' }); }}
                  className={`btn btn-secondary ${activeTab === 'files' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    fontSize: '12px',
                    padding: '7px 8px',
                    background: activeTab === 'files' ? '#007aff' : 'transparent',
                    color: activeTab === 'files' ? '#fff' : 'var(--text-2)',
                    borderColor: activeTab === 'files' ? '#007aff' : 'transparent',
                    fontWeight: 600
                  }}
                >
                  📂 Сессии (.session)
                </button>
              </div>

              {/* Вкладка 1: По номеру телефона */}
              {activeTab === 'phone' && (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: 0, marginBottom: '12px', lineHeight: 1.4 }}>
                    Введите номер телефона. Telegram пришлёт официальный код для входа.
                  </p>

                  {phoneStep === 1 && (
                    <form onSubmit={handleSendCode}>
                      <label style={{ marginBottom: '12px', display: 'block' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Номер телефона</span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+79991234567"
                          required
                          style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13.5px' }}
                        />
                      </label>

                      <label style={{ marginBottom: '16px', display: 'block' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Выберите прокси (необязательно)</span>
                        <select
                          value={phoneProxyId}
                          onChange={(e) => setPhoneProxyId(e.target.value)}
                          style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                        >
                          <option value="">Без прокси (свой IP)</option>
                          {proxies.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.host}:{p.port} ({p.status === 'active' ? `🟢 ${p.ping_ms || 0}ms` : '⚪'})
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={isPhoneLoading}
                        style={{ width: '100%', justifyContent: 'center', padding: '10px', fontWeight: 600, background: '#007aff', borderColor: '#007aff' }}
                      >
                        {isPhoneLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Получить код в Telegram'}
                      </button>
                    </form>
                  )}

                  {phoneStep === 2 && (
                    <form onSubmit={handleSignIn}>
                      <div style={{ marginBottom: '12px', fontSize: '12.5px', color: '#00a8ff', background: 'rgba(0,168,255,0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                        Код отправлен на номер <b>{phone}</b>
                      </div>
                      <label style={{ marginBottom: '14px', display: 'block' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Код подтверждения</span>
                        <input
                          type="text"
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value)}
                          placeholder="Например: 12345"
                          required
                          autoFocus
                          style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '14px', letterSpacing: '2px', textAlign: 'center', fontWeight: 700 }}
                        />
                      </label>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={isPhoneLoading}
                        style={{ width: '100%', justifyContent: 'center', padding: '10px', fontWeight: 600, background: '#2ed573', borderColor: '#2ed573', color: '#000' }}
                      >
                        {isPhoneLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Войти в Telegram'}
                      </button>
                    </form>
                  )}

                  {phoneStep === 3 && (
                    <form onSubmit={handleSignIn}>
                      <div style={{ marginBottom: '12px', fontSize: '12.5px', color: '#ffb300', background: 'rgba(255,179,0,0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                        🔐 Аккаунт защищен облачным паролем (2FA)
                      </div>
                      <label style={{ marginBottom: '14px', display: 'block' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Пароль 2FA</span>
                        <input
                          type="password"
                          value={phonePassword}
                          onChange={(e) => setPhonePassword(e.target.value)}
                          placeholder="Введите ваш 2FA пароль"
                          required
                          autoFocus
                          style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13.5px' }}
                        />
                      </label>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={isPhoneLoading}
                        style={{ width: '100%', justifyContent: 'center', padding: '10px', fontWeight: 600, background: '#2ed573', borderColor: '#2ed573', color: '#000' }}
                      >
                        {isPhoneLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Подтвердить и завершить вход'}
                      </button>
                    </form>
                  )}

                  {phoneMessage.text && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      lineHeight: 1.4,
                      background: phoneMessage.type === 'error' ? 'rgba(255,71,87,0.1)' : (phoneMessage.type === 'success' ? 'rgba(46,213,115,0.1)' : 'rgba(0,168,255,0.1)'),
                      border: `1px solid ${phoneMessage.type === 'error' ? 'rgba(255,71,87,0.3)' : (phoneMessage.type === 'success' ? 'rgba(46,213,115,0.3)' : 'rgba(0,168,255,0.3)')}`,
                      color: phoneMessage.type === 'error' ? '#ff4757' : (phoneMessage.type === 'success' ? '#2ed573' : '#00a8ff')
                    }}>
                      {phoneMessage.text}
                    </div>
                  )}
                </div>
              )}

              {/* Вкладка 2: Загрузка сессий */}
              {activeTab === 'files' && (
                <form onSubmit={handleUploadSubmit}>
                  <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: 0, marginBottom: '12px', lineHeight: 1.4 }}>
                    Файлы <b>.session</b>, <b>.json</b> или <b>.zip</b> архив. Сессии подключаются на лету без перезапуска!
                  </p>

                  <label style={{ marginBottom: '12px', display: 'block' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Файлы сессий или .zip архив</span>
                    <input
                      type="file"
                      accept=".session, .json, .zip"
                      multiple
                      required
                      onChange={handleFileChange}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.18)', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                    />
                    {selectedFiles.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#2ed573', marginTop: '4px', fontWeight: 600 }}>
                        Выбрано файлов: {selectedFiles.length}
                      </div>
                    )}
                  </label>

                  {/* Целевая группа аккаунтов фермы */}
                  <label style={{ marginBottom: '12px', display: 'block' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Группа аккаунтов фермы</span>
                    <select
                      value={workGroupId}
                      onChange={(e) => setWorkGroupId(e.target.value)}
                      style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                    >
                      <option value="">Без группы (общий список)</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>📁 {g.title}</option>
                      ))}
                    </select>
                  </label>

                  {/* Настройка прокси для загружаемых сессий */}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', display: 'block', fontWeight: 600 }}>Настройка прокси</span>
                    <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.25)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setProxyMode('none')}
                        className={`btn btn-sm ${proxyMode === 'none' ? 'btn-primary active' : 'btn-light'}`}
                        style={{ flex: 1, fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center' }}
                      >
                        Без прокси
                      </button>
                      <button
                        type="button"
                        onClick={() => setProxyMode('group')}
                        className={`btn btn-sm ${proxyMode === 'group' ? 'btn-primary active' : 'btn-light'}`}
                        style={{ flex: 1.2, fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center', color: proxyMode === 'group' ? '#fff' : '#00a8ff', borderColor: 'rgba(0,168,255,0.4)', fontWeight: 600 }}
                      >
                        ⚡ Пул (Группа)
                      </button>
                      <button
                        type="button"
                        onClick={() => setProxyMode('single')}
                        className={`btn btn-sm ${proxyMode === 'single' ? 'btn-primary active' : 'btn-light'}`}
                        style={{ flex: 1, fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center' }}
                      >
                        Один IP
                      </button>
                    </div>
                  </div>

                  {/* Блок: Пул (Группа прокси) */}
                  {proxyMode === 'group' && (
                    <div style={{ background: 'rgba(0, 168, 255, 0.05)', border: '1px solid rgba(0, 168, 255, 0.25)', borderRadius: '10px', padding: '12px', marginBottom: '14px' }}>
                      <label style={{ marginBottom: '10px', display: 'block' }}>
                        <span style={{ fontSize: '11.5px', color: '#00a8ff', marginBottom: '4px', display: 'block', fontWeight: 600 }}>Выберите группу прокси</span>
                        <select
                          value={selectedProxyGroupId}
                          onChange={(e) => setSelectedProxyGroupId(e.target.value)}
                          style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(0, 168, 255, 0.35)', color: '#fff', padding: '8px 10px', borderRadius: '8px', fontSize: '12.5px', colorScheme: 'dark' }}
                        >
                          <option value="">Выберите группу прокси...</option>
                          {proxyGroups.map(pg => (
                            <option key={pg.id} value={pg.id}>
                              🛡️ {pg.title} ({pg.working_count !== undefined ? `${pg.working_count}/${pg.proxies_count} раб.` : `${pg.proxies_count || 0} прокси`})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>Аккаунтов на 1 прокси</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={accountsPerProxy}
                            onChange={(e) => setAccountsPerProxy(parseInt(e.target.value) || 1)}
                            style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '7px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
                          />
                        </div>
                        <div style={{ flex: 1.2, fontSize: '11px', color: 'var(--text-2)', lineHeight: 1.3, paddingTop: '14px' }}>
                          {accountsPerProxy <= 1 ? '1 аккаунт = 1 прокси (1:1)' : `По ${accountsPerProxy} акк. на 1 прокси (${accountsPerProxy}:1)`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Блок: Одиночный прокси */}
                  {proxyMode === 'single' && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ marginBottom: '5px', display: 'block' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px', display: 'block', fontWeight: 600 }}>Привязать один конкретный прокси</span>
                        <select
                          value={selectedSingleProxyId}
                          onChange={(e) => setSelectedSingleProxyId(e.target.value)}
                          style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                        >
                          <option value="">Выберите прокси...</option>
                          {proxies.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.host}:{p.port} ({p.status === 'active' ? `🟢 ${p.ping_ms || 0}ms` : '⚪'})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={isUploading}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px', fontWeight: 600, background: '#007aff', borderColor: '#007aff' }}
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Загрузить и активировать'}
                  </button>

                  {uploadNote.text && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      lineHeight: 1.4,
                      background: uploadNote.type === 'error' ? 'rgba(255,71,87,0.1)' : (uploadNote.type === 'success' ? 'rgba(46,213,115,0.1)' : 'rgba(0,168,255,0.1)'),
                      border: `1px solid ${uploadNote.type === 'error' ? 'rgba(255,71,87,0.3)' : (uploadNote.type === 'success' ? 'rgba(46,213,115,0.3)' : 'rgba(0,168,255,0.3)')}`,
                      color: uploadNote.type === 'error' ? '#ff4757' : (uploadNote.type === 'success' ? '#2ed573' : '#00a8ff')
                    }}>
                      {uploadNote.text}
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Карточка-шорткат "🛡️ Менеджер прокси" */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>🛡️ Менеджер прокси</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Добавление и проверка прокси фермы</div>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={onOpenProxyManager}
                style={{ fontSize: '12px', padding: '6px 14px', borderColor: 'rgba(0,168,255,0.4)', color: '#00a8ff', fontWeight: 600 }}
              >
                Открыть
              </button>
            </div>

          </div>

          {/* Правая колонка: Управление и удаление (Flex 1.5) */}
          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            {/* Заголовок + Поиск */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#fff' }}>Управление и удаление</h4>
              <div className="search" style={{ width: '220px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                <Search className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск аккаунта..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', fontSize: '12.5px', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}
                />
              </div>
            </div>

            {/* Пилюли фильтрации по группам */}
            <div className="group-pills-bar" style={{ padding: '2px 0 6px 0', display: 'flex', gap: '6px', overflowX: 'auto' }}>
              <button
                type="button"
                onClick={() => setSelectedFilterGroup('all')}
                className={`group-pill ${selectedFilterGroup === 'all' ? 'active' : ''}`}
              >
                <span className="group-pill-ico">🌐</span>
                <span className="group-pill-title">Все</span>
                <span className="group-pill-count">{accounts.length}</span>
              </button>

              {groups.map(g => {
                const count = groupCounts.counts[String(g.id)] || 0;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedFilterGroup(String(g.id))}
                    className={`group-pill ${selectedFilterGroup === String(g.id) ? 'active' : ''}`}
                  >
                    <span className="group-pill-ico">📁</span>
                    <span className="group-pill-title">{g.title}</span>
                    <span className="group-pill-count">{count}</span>
                  </button>
                );
              })}

              {groupCounts.noGroup > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFilterGroup('none')}
                  className={`group-pill ${selectedFilterGroup === 'none' ? 'active' : ''}`}
                >
                  <span className="group-pill-ico">📁</span>
                  <span className="group-pill-title">Без группы</span>
                  <span className="group-pill-count">{groupCounts.noGroup}</span>
                </button>
              )}
            </div>

            {/* Скроллируемый список сессий */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {filteredAccounts.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-2)', fontSize: '13px' }}>
                  {accounts.length === 0 ? 'Нет подключённых аккаунтов' : 'Аккаунты не найдены в данной выборке'}
                </div>
              ) : (
                filteredAccounts.map(acc => {
                  const accKey = acc.session_name || acc.name;
                  const isChecked = selectedAccountNames.has(accKey);
                  const displayName = [acc.first_name, acc.last_name].filter(Boolean).join(' ') || acc.name || acc.session_name;
                  const initial = (displayName[0] || acc.session_name?.[0] || '?').toUpperCase();
                  const isOnline = acc.status === 'active';

                  return (
                    <div
                      key={accKey}
                      onClick={() => handleToggleAccount(accKey)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: isChecked ? 'rgba(0, 168, 255, 0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isChecked ? 'rgba(0, 168, 255, 0.35)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleAccount(accKey)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '17px', height: '17px', accentColor: '#007aff', cursor: 'pointer' }}
                        />
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            fontWeight: 700,
                            background: isOnline ? 'linear-gradient(135deg, #00a8ff, #0052cc)' : 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            flexShrink: 0
                          }}
                        >
                          {initial}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayName}
                            </span>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline ? '#2ed573' : '#64748b' }} />
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>
                            {acc.phone || acc.session_name}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {acc.group_title && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: 'rgba(0,168,255,0.12)', color: '#00a8ff', border: '1px solid rgba(0,168,255,0.3)' }}>
                            {acc.group_title}
                          </span>
                        )}
                        {acc.proxy_str && (
                          <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-2)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace' }}>
                            {acc.proxy_str.split('://')[1] || acc.proxy_str}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSingle(accKey, e)}
                          title="Удалить сессию"
                          className="icon-btn"
                          style={{ padding: '4px', color: 'rgba(255,71,87,0.7)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Нижняя панель: Выбрать все + Удалить выбранные */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filteredAccounts.length > 0 && selectedAccountNames.size === filteredAccounts.length}
                  onChange={handleSelectAll}
                  style={{ width: '16px', height: '16px', accentColor: '#007aff' }}
                />
                Выбрать все ({filteredAccounts.length})
              </label>

              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedAccountNames.size === 0 || isDeleting}
                className="btn btn-danger"
                style={{
                  background: 'rgba(255, 0, 0, 0.12)',
                  border: '1px solid rgba(255, 0, 0, 0.35)',
                  color: '#ff4d4d',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  padding: '7px 14px',
                  borderRadius: '8px'
                }}
              >
                {isDeleting ? 'Удаление...' : `🗑️ Удалить выбранные (${selectedAccountNames.size})`}
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
