import React, { useState, useMemo } from 'react';
import { X, Search, RefreshCw, Plus, Trash2, Edit3, Shield, Server, Check, Link, Unlink, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api';

export default function ProxyManagerModal({
  isOpen,
  onClose,
  proxies = [],
  proxyGroups = [],
  accounts = [],
  groups = [],
  onRefresh
}) {
  const [activeGroupId, setActiveGroupId] = useState('all'); // 'all' | 'none' | groupId
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProxyId, setSelectedProxyId] = useState(null);

  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingProxyId, setCheckingProxyId] = useState(null);

  // Подмодалки
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isDistributeOpen, setIsDistributeOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Состояние добавления прокси
  const [addLines, setAddLines] = useState('');
  const [addProxyGroupId, setAddProxyGroupId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Состояние создания группы
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Состояние распределения пула
  const [distSourceGroupId, setDistSourceGroupId] = useState('');
  const [distTargetWorkGroupId, setDistTargetWorkGroupId] = useState('');
  const [distRatio, setDistRatio] = useState(1);
  const [isDistributing, setIsDistributing] = useState(false);

  // Состояние привязки аккаунтов
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [tempAssignedAccounts, setTempAssignedAccounts] = useState(new Set());
  const [isAssigning, setIsAssigning] = useState(false);

  // Фильтрация списка прокси
  const filteredProxies = useMemo(() => {
    let list = proxies;
    if (activeGroupId === 'none') {
      list = list.filter(p => !p.proxy_group_id);
    } else if (activeGroupId !== 'all') {
      list = list.filter(p => String(p.proxy_group_id) === String(activeGroupId));
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(p =>
        (p.host && p.host.toLowerCase().includes(q)) ||
        (p.port && String(p.port).includes(q)) ||
        (p.username && p.username.toLowerCase().includes(q)) ||
        (p.group_title && p.group_title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [proxies, activeGroupId, searchQuery]);

  // Выбранный прокси для колонки 3
  const selectedProxy = useMemo(() => {
    return proxies.find(p => p.id === selectedProxyId) || null;
  }, [proxies, selectedProxyId]);

  // Аккаунты, привязанные к выбранному прокси
  const boundAccounts = useMemo(() => {
    if (!selectedProxy) return [];
    return accounts.filter(a => a.proxy_id === selectedProxy.id);
  }, [accounts, selectedProxy]);

  // Активная группа для заголовка колонки 2
  const currentGroupObj = useMemo(() => {
    if (activeGroupId === 'all' || activeGroupId === 'none') return null;
    return proxyGroups.find(g => String(g.id) === String(activeGroupId));
  }, [proxyGroups, activeGroupId]);

  // Фильтрация аккаунтов для привязки
  const filteredAssignAccounts = useMemo(() => {
    const q = assignSearchQuery.toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter(a =>
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.session_name && a.session_name.toLowerCase().includes(q)) ||
      (a.phone && a.phone.toLowerCase().includes(q))
    );
  }, [accounts, assignSearchQuery]);

  // Общая статистика
  const totalAll = proxies.length;
  const workingAll = proxies.filter(p => p.status === 'active' || p.status === 'working').length;

  const nogroupProxies = proxies.filter(p => !p.proxy_group_id);
  const nogroupTotal = nogroupProxies.length;
  const nogroupWorking = nogroupProxies.filter(p => p.status === 'active' || p.status === 'working').length;

  // --- Действия: Проверка пинга ---
  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    try {
      const gid = activeGroupId === 'all' ? null : (activeGroupId === 'none' ? 'nogroup' : activeGroupId);
      await api.checkProxies(gid);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка проверки прокси: ${err.message}`);
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleCheckSingle = async (pId, e) => {
    if (e) e.stopPropagation();
    setCheckingProxyId(pId);
    try {
      await api.checkProxy(pId);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка проверки: ${err.message}`);
    } finally {
      setCheckingProxyId(null);
    }
  };

  // --- Действия: Смена группы прокси ---
  const handleMoveGroup = async (targetGid) => {
    if (!selectedProxy) return;
    try {
      const tId = targetGid ? parseInt(targetGid) : null;
      await api.moveProxyGroup([selectedProxy.id], tId);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Не удалось изменить группу: ${err.message}`);
    }
  };

  // --- Действия: Удаление прокси ---
  const handleDeleteProxy = async () => {
    if (!selectedProxy) return;
    if (!window.confirm(`Точно удалить ${selectedProxy.host}:${selectedProxy.port}?\nПривязанные аккаунты будут отвязаны.`)) return;

    try {
      await api.deleteProxy(selectedProxy.id);
      setSelectedProxyId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  // --- Действия: Отвязка одного аккаунта ---
  const handleUnbindAccount = async (accName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Отвязать аккаунт ${accName} от этого прокси?`)) return;

    try {
      await api.assignProxy(0, [accName]);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка отвязки аккаунта: ${err.message}`);
    }
  };

  // --- Действия: Добавить прокси (массово) ---
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const lines = addLines.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      alert('Введите хотя бы одну строку прокси');
      return;
    }

    setIsAdding(true);
    try {
      const gid = addProxyGroupId ? parseInt(addProxyGroupId) : null;
      const res = await api.batchAddProxies(lines, gid, 'socks5');
      setAddLines('');
      setIsAddModalOpen(false);
      alert(`Добавлено прокси: ${res.added_count || lines.length}`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка добавления: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  // --- Действия: Создать группу ---
  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!newGroupTitle.trim()) return;

    setIsCreatingGroup(true);
    try {
      const res = await api.createProxyGroup(newGroupTitle.trim());
      setNewGroupTitle('');
      setIsCreateGroupOpen(false);
      if (res && res.id) setActiveGroupId(String(res.id));
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка создания группы: ${err.message}`);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // --- Действия: Переименовать группу ---
  const handleRenameGroup = async () => {
    if (!currentGroupObj) return;
    const newTitle = window.prompt('Новое название группы:', currentGroupObj.title);
    if (!newTitle || newTitle.trim() === currentGroupObj.title) return;

    try {
      await api.renameProxyGroup(currentGroupObj.id, newTitle.trim());
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка переименования: ${err.message}`);
    }
  };

  // --- Действия: Удалить группу ---
  const handleDeleteGroup = async () => {
    if (!currentGroupObj) return;
    if (!window.confirm(`Удалить группу «${currentGroupObj.title}»?\n\nПрокси не удалятся, а перейдут в «Без группы».`)) return;

    try {
      await api.deleteProxyGroup(currentGroupObj.id);
      setActiveGroupId('all');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка удаления группы: ${err.message}`);
    }
  };

  // --- Действия: Распределить пул ---
  const handleDistributeSubmit = async (e) => {
    e.preventDefault();
    const ratio = parseInt(distRatio) || 1;
    if (!window.confirm(`Выполнить распределение пула прокси?\nАккаунты на 1 прокси: ${ratio}`)) return;

    setIsDistributing(true);
    try {
      const res = await api.distributeProxies({
        proxy_group_id: distSourceGroupId ? parseInt(distSourceGroupId) : null,
        work_group_id: distTargetWorkGroupId ? parseInt(distTargetWorkGroupId) : null,
        accounts_per_proxy: ratio
      });
      setIsDistributeOpen(false);
      alert(`✅ Успешно распределено: ${res.distributed || 0} аккаунтов`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка распределения: ${err.message}`);
    } finally {
      setIsDistributing(false);
    }
  };

  // --- Действия: Модалка привязки аккаунтов к выбранному прокси ---
  const openAssignModal = () => {
    if (!selectedProxy) return;
    const currentBoundNames = accounts
      .filter(a => a.proxy_id === selectedProxy.id)
      .map(a => a.session_name || a.name);
    setTempAssignedAccounts(new Set(currentBoundNames));
    setAssignSearchQuery('');
    setIsAssignModalOpen(true);
  };

  const handleToggleAssignAccount = (accName) => {
    setTempAssignedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accName)) next.delete(accName);
      else next.add(accName);
      return next;
    });
  };

  const handleSaveAssign = async () => {
    if (!selectedProxy) return;
    const selectedList = Array.from(tempAssignedAccounts);

    if (selectedList.length === 0 && boundAccounts.length > 0) {
      if (!window.confirm('Вы сняли выбор со всех аккаунтов. Отвязать все аккаунты от этого прокси?')) return;
    }

    setIsAssigning(true);
    try {
      await api.assignProxy(selectedProxy.id, selectedList);
      setIsAssignModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Ошибка при сохранении привязки: ${err.message}`);
    } finally {
      setIsAssigning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-proxy-manager-large"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="modal-head" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: '#fff' }}>🛡️ Менеджер прокси</h3>
            <span
              className="badge"
              style={{
                background: 'rgba(0, 168, 255, 0.15)',
                color: '#00a8ff',
                border: '1px solid rgba(0, 168, 255, 0.35)',
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '6px',
                fontWeight: 600
              }}
            >
              {totalAll} прокси ({workingAll} раб.)
            </span>
          </div>

          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Колончатый Cockpit */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'hidden', display: 'flex', gap: '18px', padding: '18px 22px' }}>

          {/* Колонка 1: Группы прокси (230px) */}
          <div style={{ width: '230px', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
                Группы прокси
              </span>
              <button
                type="button"
                onClick={() => { setNewGroupTitle(''); setIsCreateGroupOpen(true); }}
                className="btn btn-sm btn-primary"
                style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#007aff', borderColor: '#007aff' }}
              >
                + Создать
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
              {/* 1. Все прокси */}
              <div
                onClick={() => setActiveGroupId('all')}
                className={`pm-group-btn ${activeGroupId === 'all' ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '14px' }}>🌐</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>Все прокси</span>
                </div>
                <span className={`badge ${workingAll > 0 ? 'badge-green' : 'badge-purple'}`} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px' }}>
                  {workingAll}/{totalAll}
                </span>
              </div>

              {/* 2. Без группы */}
              <div
                onClick={() => setActiveGroupId('none')}
                className={`pm-group-btn ${activeGroupId === 'none' ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '14px' }}>📦</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>Без группы</span>
                </div>
                <span className={`badge ${nogroupWorking > 0 ? 'badge-green' : 'badge-purple'}`} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px' }}>
                  {nogroupWorking}/{nogroupTotal}
                </span>
              </div>

              {/* Разделитель */}
              {proxyGroups.length > 0 && (
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
              )}

              {/* 3. Пользовательские группы */}
              {proxyGroups.map(g => {
                const grpProxies = proxies.filter(p => String(p.proxy_group_id) === String(g.id));
                const grpTotal = grpProxies.length;
                const grpWorking = grpProxies.filter(p => p.status === 'active' || p.status === 'working').length;
                const isActive = String(activeGroupId) === String(g.id);

                return (
                  <div
                    key={g.id}
                    onClick={() => setActiveGroupId(String(g.id))}
                    className={`pm-group-btn ${isActive ? 'active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '14px' }}>📁</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }} title={g.title}>
                        {g.title}
                      </span>
                    </div>
                    <span className={`badge ${grpWorking > 0 ? 'badge-green' : 'badge-purple'}`} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px' }}>
                      {grpWorking}/{grpTotal}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Колонка 2: Список серверов и инструменты (Flex 1.6) */}
          <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Тулбар действий */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => { setAddLines(''); setIsAddModalOpen(true); }}
                  className="btn btn-primary btn-sm"
                  style={{ padding: '7px 12px', fontSize: '12px', background: '#007aff', borderColor: '#007aff' }}
                >
                  + Добавить прокси
                </button>
                <button
                  type="button"
                  onClick={handleCheckAll}
                  disabled={isCheckingAll}
                  className="btn btn-light btn-sm"
                  style={{ padding: '7px 12px', fontSize: '12px', background: 'rgba(46, 213, 115, 0.12)', border: '1px solid rgba(46, 213, 115, 0.4)', color: '#2ed573' }}
                >
                  {isCheckingAll ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Проверка...
                    </span>
                  ) : (
                    '⚡ Проверить группу'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDistSourceGroupId(activeGroupId !== 'all' && activeGroupId !== 'none' ? activeGroupId : '');
                    setDistTargetWorkGroupId('');
                    setDistRatio(1);
                    setIsDistributeOpen(true);
                  }}
                  className="btn btn-light btn-sm"
                  style={{ padding: '7px 12px', fontSize: '12px', background: 'rgba(181, 60, 255, 0.12)', border: '1px solid rgba(181, 60, 255, 0.4)', color: '#c060ff' }}
                >
                  🎯 Распределить пул
                </button>
              </div>

              <div className="search" style={{ width: '200px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '8px' }}>
                <Search className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск IP или порта..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', fontSize: '12px', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}
                />
              </div>
            </div>

            {/* Карточка заголовка активной группы */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#fff' }}>
                  {activeGroupId === 'all' ? 'Все прокси' : (activeGroupId === 'none' ? 'Без группы' : (currentGroupObj?.title || 'Группа прокси'))}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>
                  (показано: {filteredProxies.length} из {proxies.length})
                </span>
              </div>

              {currentGroupObj && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleRenameGroup}
                    className="btn btn-sm btn-light"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    title="Переименовать группу"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="btn btn-sm btn-danger"
                    style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(255,0,0,0.1)', color: '#ff4757', borderColor: 'rgba(255,0,0,0.3)' }}
                    title="Удалить группу"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>

            {/* Контейнер карточек прокси */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {filteredProxies.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-2)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>📦</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                    {proxies.length === 0 ? 'В ферме пока нет добавленных прокси' : 'В этом пуле пока нет серверов'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '16px' }}>
                    Добавьте серверы или распределите имеющиеся
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAddLines(''); setIsAddModalOpen(true); }}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', background: '#007aff' }}
                  >
                    + Добавить прокси
                  </button>
                </div>
              ) : (
                filteredProxies.map(p => {
                  const isSelected = p.id === selectedProxyId;
                  const isWorking = p.status === 'active' || p.status === 'working';
                  const isDead = p.status === 'failed' || p.status === 'error';
                  const statusClass = isWorking ? 'badge-green' : (isDead ? 'badge-red' : 'badge-purple');
                  const statusText = isWorking ? `Active (${p.ping_ms ? `${p.ping_ms}ms` : 'OK'})` : (isDead ? 'Dead' : 'Unknown');

                  const accCount = Number(p.linked_accounts_count !== undefined ? p.linked_accounts_count : (p.accounts_count || 0));
                  const accBadgeClass = accCount > 0 ? 'badge-cyan' : 'badge-purple';
                  const isCheckingThis = checkingProxyId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProxyId(p.id)}
                      className={`pm-proxy-card ${isSelected ? 'selected' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Server className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-gray-400'}`} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span style={{ fontSize: '13.5px', fontWeight: 600, fontFamily: 'monospace', color: '#00a8ff' }}>
                              {p.host}:{p.port}
                            </span>
                            {activeGroupId === 'all' && p.group_title && (
                              <span style={{ fontSize: '10.5px', background: 'rgba(181,60,255,0.15)', color: '#c060ff', border: '1px solid rgba(181,60,255,0.3)', padding: '1px 6px', borderRadius: '4px' }}>
                                {p.group_title}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px' }}>
                            {(p.proto || (p.username ? 'SOCKS5' : 'HTTP')).toUpperCase()} • <span className={accBadgeClass} style={{ padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>{accCount} акк.</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span className={statusClass} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 7px', borderRadius: '6px' }}>
                          {statusText}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCheckSingle(p.id, e)}
                          title="Проверить пинг"
                          className="icon-btn"
                          style={{ color: 'var(--text-2)', padding: '4px' }}
                        >
                          {isCheckingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 hover:text-cyan-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Колонка 3: Детали прокси и привязанные аккаунты (280px) */}
          <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '16px' }}>
            {!selectedProxy ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: '4px' }}>Выбранный прокси</div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff' }}>Выберите прокси</h4>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: '12px', textAlign: 'center', padding: '20px 10px' }}>
                  Выберите прокси в списке слева для просмотра параметров, привязанных сессий и проверки пинга
                </div>
              </div>
            ) : (
              <>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: '4px' }}>Выбранный прокси</div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {selectedProxy.host}:{selectedProxy.port}
                  </h4>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '4px' }}>
                    <span>{selectedProxy.username ? 'SOCKS5 (с авторизацией)' : 'HTTP / SOCKS'}</span>
                    <br />
                    <span style={{ color: selectedProxy.status === 'active' || selectedProxy.status === 'working' ? '#2ed573' : '#ff4757', fontWeight: 600 }}>
                      {selectedProxy.status === 'active' || selectedProxy.status === 'working'
                        ? `Active (${selectedProxy.ping_ms || 0} ms)`
                        : (selectedProxy.status === 'failed' || selectedProxy.status === 'error' ? 'Dead' : 'Unknown')}
                    </span>
                  </div>
                </div>

                {/* Селектор группы прокси */}
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-2)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                    Группа прокси:
                  </span>
                  <select
                    value={selectedProxy.proxy_group_id || ''}
                    onChange={(e) => handleMoveGroup(e.target.value)}
                    style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', colorScheme: 'dark' }}
                  >
                    <option value="">Без группы</option>
                    {proxyGroups.map(g => (
                      <option key={g.id} value={g.id}>📁 {g.title}</option>
                    ))}
                  </select>
                </div>

                {/* Привязанные аккаунты */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Привязанные аккаунты
                    </span>
                    <span style={{ fontSize: '11px', color: '#00a8ff', fontWeight: 700 }}>
                      {boundAccounts.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {boundAccounts.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-2)', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                        Нет привязанных аккаунтов
                      </div>
                    ) : (
                      boundAccounts.map(acc => {
                        const accName = acc.session_name || acc.name;
                        const initial = (acc.first_name?.[0] || accName[0] || '?').toUpperCase();
                        return (
                          <div
                            key={accName}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <div style={{ width: '26px', height: '26px', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#007aff', borderRadius: '50%', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                                {initial}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
                                  {acc.first_name ? `${acc.first_name} ${acc.last_name || ''}` : accName}
                                </div>
                                {acc.phone && (
                                  <div style={{ fontSize: '10.5px', color: 'var(--text-2)' }}>
                                    {acc.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleUnbindAccount(accName, e)}
                              title="Отвязать аккаунт"
                              className="icon-btn"
                              style={{ color: '#ff4757', padding: '3px' }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}

                    {/* Кнопка "Привязать ещё аккаунты..." */}
                    <div
                      onClick={openAssignModal}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(0, 168, 255, 0.05)', border: '1px dashed rgba(0, 168, 255, 0.35)', borderRadius: '8px', cursor: 'pointer', marginTop: '4px' }}
                    >
                      <span style={{ color: '#00a8ff', fontWeight: 'bold', fontSize: '14px' }}>+</span>
                      <span style={{ fontSize: '12px', color: '#00a8ff', fontWeight: 600 }}>Привязать ещё аккаунты...</span>
                    </div>
                  </div>
                </div>

                {/* Нижние кнопки управления */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    type="button"
                    onClick={() => handleCheckSingle(selectedProxy.id)}
                    disabled={checkingProxyId === selectedProxy.id}
                    className="btn btn-light btn-sm"
                    style={{ width: '100%', fontSize: '12px', background: 'rgba(46, 213, 115, 0.12)', borderColor: 'rgba(46, 213, 115, 0.35)', color: '#2ed573', justifyContent: 'center' }}
                  >
                    {checkingProxyId === selectedProxy.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '⚡ Проверить пинг'}
                  </button>
                  <button
                    type="button"
                    onClick={openAssignModal}
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', fontSize: '12px', background: 'rgba(0,168,255,0.12)', border: '1px solid rgba(0,168,255,0.4)', color: '#00a8ff', fontWeight: 700, justifyContent: 'center' }}
                  >
                    + Привязать аккаунты
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteProxy}
                    className="btn btn-light btn-sm"
                    style={{ width: '100%', fontSize: '12px', background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', color: '#ff4757', justifyContent: 'center' }}
                  >
                    Удалить прокси
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* --- Подмодалка 1: Добавить прокси (массово) --- */}
      {isAddModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={() => setIsAddModalOpen(false)}>
          <div className="modal" style={{ width: '480px', padding: '22px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>Добавить прокси</h3>
              <button className="icon-btn" onClick={() => setIsAddModalOpen(false)} type="button">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>Добавить в группу прокси:</span>
                  <select
                    value={addProxyGroupId}
                    onChange={(e) => setAddProxyGroupId(e.target.value)}
                    style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                  >
                    <option value="">Без группы</option>
                    {proxyGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>Список прокси (по одному на строку):</span>
                <textarea
                  value={addLines}
                  onChange={(e) => setAddLines(e.target.value)}
                  placeholder={'ip:port:user:pass\nip:port@user:pass\nsocks5://user:pass@ip:port\nip:port'}
                  rows={5}
                  required
                  style={{ width: '100%', height: '130px', resize: 'none', fontFamily: 'monospace', fontSize: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px', borderRadius: '8px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>
                  Поддерживаются любые форматы: socks5/http, с логином или без.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-light" type="button" onClick={() => setIsAddModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="submit" disabled={isAdding} style={{ background: '#007aff', borderColor: '#007aff' }}>
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Добавить прокси'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Подмодалка 2: Создать группу прокси --- */}
      {isCreateGroupOpen && (
        <div className="modal-overlay" style={{ zIndex: 10002 }} onClick={() => setIsCreateGroupOpen(false)}>
          <div className="modal" style={{ width: '400px', padding: '22px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: '#fff' }}>Новая группа прокси</h3>
            <form onSubmit={handleCreateGroupSubmit}>
              <label style={{ display: 'block', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block' }}>Название группы:</span>
                <input
                  type="text"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="например: Прокси для ДВ 1"
                  required
                  autoFocus
                  style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '13px' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-light" type="button" onClick={() => setIsCreateGroupOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="submit" disabled={isCreatingGroup} style={{ background: '#007aff', borderColor: '#007aff' }}>
                  {isCreatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать группу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Подмодалка 3: Пакетное распределение пула --- */}
      {isDistributeOpen && (
        <div className="modal-overlay" style={{ zIndex: 10002 }} onClick={() => setIsDistributeOpen(false)}>
          <div className="modal" style={{ width: '480px', padding: '22px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>🎯 Пакетное распределение пула</h3>
              <button className="icon-btn" onClick={() => setIsDistributeOpen(false)} type="button">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDistributeSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
                <label style={{ display: 'block' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>1. Откуда брать прокси (Пул):</span>
                  <select
                    value={distSourceGroupId}
                    onChange={(e) => setDistSourceGroupId(e.target.value)}
                    style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                  >
                    <option value="">Все прокси (без фильтра группы)</option>
                    {proxyGroups.map(g => (
                      <option key={g.id} value={g.id}>📁 {g.title} ({g.working_count || 0} раб. / {g.proxies_count || 0} всего)</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'block' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>2. Кому назначить (Группа аккаунтов):</span>
                  <select
                    value={distTargetWorkGroupId}
                    onChange={(e) => setDistTargetWorkGroupId(e.target.value)}
                    style={{ width: '100%', background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', colorScheme: 'dark' }}
                  >
                    <option value="">Все активные аккаунты без исключения</option>
                    {groups.map(wg => (
                      <option key={wg.id} value={wg.id}>Группа фермы: {wg.title}</option>
                    ))}
                  </select>
                </label>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 600 }}>3. Аккаунтов на 1 прокси:</span>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={distRatio}
                      onChange={(e) => setDistRatio(parseInt(e.target.value) || 1)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ flex: 1.2, fontSize: '11.5px', color: 'var(--text-2)', lineHeight: 1.3, paddingTop: '18px' }}>
                    {distRatio <= 1 ? '1 аккаунт = 1 отдельный прокси (1:1)' : `До ${distRatio} аккаунтов будут делить 1 прокси (${distRatio}:1)`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-light" type="button" onClick={() => setIsDistributeOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="submit" disabled={isDistributing} style={{ background: '#b53cff', borderColor: '#b53cff' }}>
                  {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Применить распределение'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Подмодалка 4: Привязка аккаунтов к выбранному прокси --- */}
      {isAssignModalOpen && selectedProxy && (
        <div className="modal-overlay" style={{ zIndex: 10003 }} onClick={() => setIsAssignModalOpen(false)}>
          <div className="modal" style={{ width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '22px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>Привязка к {selectedProxy.host}:{selectedProxy.port}</h3>
                <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px' }}>Отметьте аккаунты, которые будут использовать этот IP</div>
              </div>
              <button className="icon-btn" onClick={() => setIsAssignModalOpen(false)} type="button">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div className="search" style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '8px' }}>
                <Search className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск аккаунта..."
                  value={assignSearchQuery}
                  onChange={(e) => setAssignSearchQuery(e.target.value)}
                  style={{ width: '100%', fontSize: '12.5px', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', paddingRight: '4px' }}>
              {filteredAssignAccounts.map(acc => {
                const accName = acc.session_name || acc.name;
                const isChecked = tempAssignedAccounts.has(accName);
                const displayName = [acc.first_name, acc.last_name].filter(Boolean).join(' ') || accName;

                return (
                  <label
                    key={accName}
                    onClick={() => handleToggleAssignAccount(accName)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: isChecked ? 'rgba(0, 168, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isChecked ? 'rgba(0, 168, 255, 0.35)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleAssignAccount(accName)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '16px', height: '16px', accentColor: '#007aff' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{displayName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>{acc.phone || accName}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                Выбрано: <b>{tempAssignedAccounts.size}</b> акк.
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-light" type="button" onClick={() => setIsAssignModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="button" onClick={handleSaveAssign} disabled={isAssigning} style={{ background: '#007aff', borderColor: '#007aff' }}>
                  {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить привязку'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
