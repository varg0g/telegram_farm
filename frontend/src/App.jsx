import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import Sidebar from './components/Sidebar';
import AccountList from './components/AccountList';
import DialogList from './components/DialogList';
import ChatWindow from './components/ChatWindow';
import LeadProfile from './components/LeadProfile';
import TaskStatusBar from './components/TaskStatusBar';

import AddAccountModal from './modals/AddAccountModal';
import ProxyManagerModal from './modals/ProxyManagerModal';
import ToolsModal from './modals/ToolsModal';
import MatchesModal from './modals/MatchesModal';
import LeadGroupsModal from './modals/LeadGroupsModal';
import ProfileEditorModal from './modals/ProfileEditorModal';
import CreateFarmGroupModal from './modals/CreateFarmGroupModal';
import { playNotificationSound } from './utils/sound';

const cleanPhone = (p) => (p || '').toString().trim().replace(/^\+/, '');

export default function App() {
  // Основные сущности
  const [accounts, setAccounts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [lead, setLead] = useState(null);
  const [leadGroups, setLeadGroups] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [proxyGroups, setProxyGroups] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Состояние навигации и выбора
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedDialog, setSelectedDialog] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Модальные окна
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isProxiesOpen, setIsProxiesOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isMatchesOpen, setIsMatchesOpen] = useState(false);
  const [isLeadGroupsOpen, setIsLeadGroupsOpen] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isFarmGroupsOpen, setIsFarmGroupsOpen] = useState(false);

  // Рефы для хранения актуального состояния в WebSocket хэндлере без устаревания замыканий
  const selectedDialogRef = useRef(selectedDialog);
  useEffect(() => { selectedDialogRef.current = selectedDialog; }, [selectedDialog]);

  const selectedAccountRef = useRef(selectedAccount);
  useEffect(() => { selectedAccountRef.current = selectedAccount; }, [selectedAccount]);

  const selectedGroupRef = useRef(selectedGroup);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);

  const accountsRef = useRef(accounts);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  const filterTypeRef = useRef(filterType);
  useEffect(() => { filterTypeRef.current = filterType; }, [filterType]);

  // In-Memory SWR кэш для моментального переключения диалогов (0 мс)
  const messagesCacheRef = useRef(new Map());
  const leadCacheRef = useRef(new Map());
  const chatAbortRef = useRef(null);

  // Звуковые уведомления
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    return localStorage.getItem('tgfarm_sound') !== 'false';
  });
  const isSoundEnabledRef = useRef(isSoundEnabled);
  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
    localStorage.setItem('tgfarm_sound', isSoundEnabled ? 'true' : 'false');
  }, [isSoundEnabled]);

  const toggleSound = () => {
    setIsSoundEnabled(prev => {
      const next = !prev;
      if (next) {
        // Проигрываем чистое мягкое превью при включении звука
        playNotificationSound(true);
      }
      return next;
    });
  };

  // 1. Инициализация данных
  const loadInitialData = async () => {
    try {
      const [accs, grps, lGrps, qReplies, prxs, pGrps, tskList] = await Promise.all([
        api.getAccounts(),
        api.getGroups(),
        api.getLeadGroups(),
        api.getQuickReplies(),
        api.getProxies(),
        api.getProxyGroups(),
        api.getActiveTasks()
      ]);
      setAccounts(accs);
      setGroups(grps);
      setLeadGroups(lGrps);
      setQuickReplies(qReplies);
      setProxies(prxs);
      setProxyGroups(pGrps);
      setTasks(tskList);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 2. Подключение к WebSocket для моментальных обновлений (Sub-10ms)
  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.port === '5173' ? '127.0.0.1:8000' : window.location.host;
    const ws = new WebSocket(`${wsProto}//${wsHost}/ws`);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        // Новое сообщение
        if (data.type === 'new_message') {
          const isOut = Boolean(data.message?.is_outgoing);
          const isArchived = Boolean(data.dialog?.is_archived);
          const chatType = data.dialog?.chat_type || (data.chat_id > 0 ? 'user' : 'chat');

          // Воспроизведение звука для входящих:
          // Исключены каналы (chat_type === 'channel') и архивные чаты
          // Внутри sound.js работает компрессор и кулдаун (1.4 сек), исключая громкие хлопки и сложение волн
          if (!isOut && !isArchived && chatType !== 'channel' && isSoundEnabledRef.current) {
            playNotificationSound();
          }

          const current = selectedDialogRef.current;
          const isCurrentOpenChat = Boolean(
            current &&
            Number(current.chat_id) === Number(data.chat_id) &&
            cleanPhone(current.account_phone) === cleanPhone(data.account_phone)
          );

          // Синхронизация с кэшем сообщений в оперативной памяти
          const cacheKey = `${cleanPhone(data.account_phone)}_${data.chat_id}`;
          const currentCached = messagesCacheRef.current.get(cacheKey);
          if (currentCached) {
            const msgId = data.message.message_id || data.message.id;
            if (!currentCached.some(m => (m.message_id || m.id) === msgId)) {
              messagesCacheRef.current.set(cacheKey, [...currentCached, data.message]);
            }
          }

          // Если открыт именно этот диалог для этого аккаунта - мгновенно добавляем в ленту и гасим непрочитанное
          if (isCurrentOpenChat) {
            setMessages(prev => {
              const msgId = data.message.message_id || data.message.id;
              if (prev.some(m => (m.message_id || m.id) === msgId)) return prev;
              return [...prev, data.message];
            });
            if (!isOut) {
              api.markRead(data.account_phone, data.chat_id).catch(() => {});
            }
          }

          // Обновляем список диалогов только если сообщение относится к текущему выбранному аккаунту / группе
          const curAcc = selectedAccountRef.current;
          const curGrp = selectedGroupRef.current;
          const curFilter = filterTypeRef.current;

          const isForCurAccount = !curAcc || cleanPhone(curAcc) === cleanPhone(data.account_phone);
          let isForCurGroup = true;
          if (curGrp !== null && curGrp !== undefined) {
            const acc = (accountsRef.current || []).find(
              a => cleanPhone(a.phone) === cleanPhone(data.account_phone) || cleanPhone(a.session_name) === cleanPhone(data.account_phone)
            );
            isForCurGroup = acc && acc.work_group_id === curGrp;
          }

          if (isForCurAccount && isForCurGroup) {
            setDialogs(prev => {
              const filtered = prev.filter(
                d => !(cleanPhone(d.account_phone) === cleanPhone(data.account_phone) && Number(d.chat_id) === Number(data.chat_id))
              );
              const existing = prev.find(
                d => cleanPhone(d.account_phone) === cleanPhone(data.account_phone) && Number(d.chat_id) === Number(data.chat_id)
              );
              
              const isArchived = existing ? Boolean(existing.is_archived) : Boolean(data.dialog?.is_archived);
              if (isArchived && curFilter !== 'archive') {
                return filtered;
              }
              if (!isArchived && curFilter === 'archive') {
                return filtered;
              }

              const isOut = data.message.is_outgoing;
              const previewText = data.message.text || data.dialog?.top_message_text || (data.message.media_type ? `[${data.message.media_type}]` : 'Сообщение');
              const isPinned = existing?.is_pinned !== undefined ? existing.is_pinned : (data.dialog?.is_pinned || 0);

              let finalUnread = existing?.unread_count || 0;
              if (isCurrentOpenChat) {
                finalUnread = 0;
              } else if (!isOut) {
                finalUnread += 1;
              }

              const updatedDialog = {
                ...(existing || data.dialog || {}),
                account_phone: data.account_phone,
                chat_id: data.chat_id,
                top_message_text: previewText,
                top_message_date: data.message.date,
                top_message_id: data.message.message_id || data.message.id,
                top_message_is_outgoing: isOut ? 1 : 0,
                top_message_is_read: 0,
                is_pinned: isPinned,
                is_archived: isArchived ? 1 : 0,
                unread_count: finalUnread
              };

              const isGlobal = selectedAccountRef.current === null;
              const newList = [updatedDialog, ...filtered];
              newList.sort((a, b) => {
                if (!isGlobal) {
                  const pDiff = (b.is_pinned || 0) - (a.is_pinned || 0);
                  if (pDiff !== 0) return pDiff;
                }
                return (b.top_message_date || 0) - (a.top_message_date || 0);
              });
              return newList;
            });
          }
        }

        // Обновление прочитанности сообщений собеседником
        if (data.type === 'messages_read') {
          const cacheKey = `${cleanPhone(data.account_phone)}_${data.chat_id}`;
          const currentCached = messagesCacheRef.current.get(cacheKey);
          if (currentCached) {
            messagesCacheRef.current.set(cacheKey, currentCached.map(m => {
              const mId = m.message_id || m.id;
              if (m.is_outgoing && mId <= data.max_id) {
                return { ...m, is_read: 1 };
              }
              return m;
            }));
          }

          const current = selectedDialogRef.current;
          if (
            current &&
            Number(current.chat_id) === Number(data.chat_id) &&
            cleanPhone(current.account_phone) === cleanPhone(data.account_phone)
          ) {
            setMessages(prev => prev.map(m => {
              const mId = m.message_id || m.id;
              if (m.is_outgoing && mId <= data.max_id) {
                return { ...m, is_read: 1 };
              }
              return m;
            }));
          }

          // Обновляем статус прочитанности последнего сообщения в списке диалогов (Колонка 3)
          setDialogs(prev => prev.map(d => {
            if (
              cleanPhone(d.account_phone) === cleanPhone(data.account_phone) &&
              Number(d.chat_id) === Number(data.chat_id)
            ) {
              const topId = d.top_message_id || 0;
              if (d.top_message_is_outgoing && topId <= data.max_id) {
                return { ...d, top_message_is_read: 1 };
              }
            }
            return d;
          }));
        }

        // Сброс прочитанности
        if (data.type === 'dialog_read') {
          setDialogs(prev => prev.map(d => {
            if (
              cleanPhone(d.account_phone) === cleanPhone(data.account_phone) &&
              Number(d.chat_id) === Number(data.chat_id)
            ) {
              return { ...d, unread_count: 0 };
            }
            return d;
          }));
        }

        // Обновление статуса аккаунта
        if (data.type === 'account_status') {
          setAccounts(prev => prev.map(a => {
            if (a.session_name === data.account_name || a.phone === data.phone) {
              return { ...a, status: data.status, status_detail: data.detail || a.status_detail };
            }
            return a;
          }));
        }

        // Обновление фоновых задач (прогресс-бар)
        if (data.type === 'task_update') {
          setTasks(prev => {
            const exists = prev.some(t => t.id === data.task.id);
            if (exists) {
              return prev.map(t => t.id === data.task.id ? data.task : t);
            }
            return [data.task, ...prev];
          });
        }
      } catch (err) {
        console.error('Ошибка парсинга WebSocket сообщения:', err);
      }
    };

    // Пинг каждые 30 сек для поддержания сокета
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    return () => {
      clearInterval(pingTimer);
      ws.close();
    };
  }, []);

  // 3. Подгрузка списка диалогов при смене фильтров или аккаунтов (Local-First: <3мс)
  const loadDialogs = async () => {
    try {
      const data = await api.getDialogs({
        account_phone: selectedAccount,
        group_id: selectedGroup,
        chat_type: filterType,
        search: searchQuery
      });
      setDialogs(data);
    } catch (err) {
      console.error('Ошибка загрузки диалогов:', err);
    }
  };

  useEffect(() => {
    loadDialogs();
  }, [selectedAccount, selectedGroup, filterType, searchQuery]);

  // 4. Открытие активного чата: история переписки и карточка лида (0 мс SWR + Instant Seed)
  useEffect(() => {
    if (!selectedDialog) {
      setMessages([]);
      setLead(null);
      setIsLoadingMessages(false);
      return;
    }

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const { signal } = controller;

    const currentAcc = selectedDialog.account_phone;
    const currentChat = selectedDialog.chat_id;
    const cacheKey = `${cleanPhone(currentAcc)}_${currentChat}`;
    let isCancelled = false;

    // 1. Проверяем наличие в оперативной памяти (0 мс мгновенный рендеринг)
    const cachedMsgs = messagesCacheRef.current.get(cacheKey);
    const cachedLead = leadCacheRef.current.get(cacheKey);

    if (cachedMsgs && cachedMsgs.length > 0) {
      setMessages(cachedMsgs);
      setIsLoadingMessages(false);
    } else if (selectedDialog.top_message_text) {
      // 2. Мгновенный seed последнего известного сообщения: экран никогда не пустует
      const isOut = Boolean(selectedDialog.top_message_is_outgoing || (selectedDialog.top_message_text && selectedDialog.top_message_text.startsWith('Вы: ')));
      const seedMsg = {
        id: selectedDialog.top_message_id || 'seed_top',
        message_id: selectedDialog.top_message_id || 0,
        chat_id: currentChat,
        account_phone: currentAcc,
        sender_name: isOut ? 'Вы' : (selectedDialog.title || 'Собеседник'),
        text: selectedDialog.top_message_text,
        date: selectedDialog.top_message_date || Math.floor(Date.now() / 1000),
        is_outgoing: isOut ? 1 : 0,
        is_read: selectedDialog.top_message_is_read || 0,
        _is_seed: true
      };
      setMessages([seedMsg]);
      setIsLoadingMessages(false);
    } else {
      setMessages([]);
      setIsLoadingMessages(true);
    }

    if (cachedLead) {
      setLead(cachedLead);
    } else {
      // Мгновенный seed лида из данных диалога (0 мс): карточка появляется мгновенно без "Загрузка профиля..."
      setLead({
        chat_id: currentChat,
        account_phone: currentAcc,
        first_name: selectedDialog.title || '',
        last_name: '',
        username: selectedDialog.username || '',
        bio: '',
        birthday: '',
        channel_link: '',
        channel_title: '',
        notes: '',
        group_ids: []
      });
    }

    // 3. Фоновая подгрузка и ревалидация истории сообщений (SWR: 1-3 мс из SQLite)
    api.getMessages(currentAcc, currentChat, 60, 0, signal)
      .then(msgs => {
        if (msgs) {
          messagesCacheRef.current.set(cacheKey, msgs);
          if (!isCancelled) {
            setMessages(msgs);
          }
        }
      })
      .catch(err => {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Ошибка загрузки сообщений:', err);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingMessages(false);
        }
      });

    // 4. Фоновая подгрузка и ревалидация профиля CRM лида
    api.getLeadProfile(currentChat, currentAcc, signal)
      .then(leadData => {
        if (leadData) {
          leadCacheRef.current.set(cacheKey, leadData);
          if (!isCancelled) {
            setLead(leadData);
          }
        }
      })
      .catch(err => {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Ошибка загрузки профиля лида:', err);
        }
      });

    // 5. Отметка о прочтении
    if (selectedDialog.unread_count > 0) {
      api.markRead(currentAcc, currentChat).catch(console.error);
    }

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [selectedDialog?.account_phone, selectedDialog?.chat_id]);

  // Действия отправки сообщений
  const handleSendMessage = async (text) => {
    if (!selectedDialog) return;
    try {
      await api.sendText(selectedDialog.account_phone, selectedDialog.chat_id, text);
    } catch (err) {
      alert(`Ошибка отправки: ${err.message}`);
    }
  };

  const handleClickButton = async (messageId, buttonData) => {
    if (!selectedDialog) return;
    try {
      await api.clickButton(selectedDialog.account_phone, selectedDialog.chat_id, messageId, buttonData);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateLead = async (patch) => {
    if (!selectedDialog) return;
    try {
      const updated = await api.updateLeadProfile(selectedDialog.chat_id, patch);
      setLead(updated);
      const cacheKey = `${cleanPhone(selectedDialog.account_phone)}_${selectedDialog.chat_id}`;
      leadCacheRef.current.set(cacheKey, updated);
    } catch (err) {
      console.error(err);
    }
  };

  // Переход в диалог из Взаимок Дайвинчика
  const handleSelectMatchChat = (accountPhone, leadUserId, leadTitle) => {
    setSelectedAccount(accountPhone);
    setSelectedDialog({
      account_phone: accountPhone,
      chat_id: leadUserId,
      title: leadTitle || `User ${leadUserId}`,
      unread_count: 0
    });
  };

  return (
    <>
      <div className="mesh-bg"></div>
      <div className="layout" id="layout">
      {/* 1. Боковая панель навигации */}
      <Sidebar
        accounts={accounts}
        groups={groups}
        selectedGroup={selectedGroup}
        setSelectedGroup={setSelectedGroup}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        onOpenAddAccount={() => setIsAddAccountOpen(true)}
        onOpenProxies={() => setIsProxiesOpen(true)}
        onOpenTools={() => setIsToolsOpen(true)}
        onOpenProfile={() => setIsProfileEditorOpen(true)}
        onOpenLeadGroups={() => setIsLeadGroupsOpen(true)}
        onOpenFarmGroups={() => setIsFarmGroupsOpen(true)}
        onOpenMatches={() => setIsMatchesOpen(true)}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={toggleSound}
      />

      {/* 2. Колонка 1: Список аккаунтов фермы */}
      <AccountList
        accounts={accounts}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        onStartAccount={async (name) => {
          await api.startAccount(name);
          loadInitialData();
        }}
        onDeleteAccount={async (name) => {
          await api.deleteAccount(name);
          loadInitialData();
        }}
      />

      {/* 3. Колонка 2: Список диалогов */}
      <DialogList
        accounts={accounts}
        dialogs={dialogs}
        selectedDialog={selectedDialog}
        setSelectedDialog={setSelectedDialog}
        filterType={filterType}
        setFilterType={setFilterType}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isGlobalView={selectedAccount === null}
        selectedAccount={selectedAccount}
        onDeleteAccount={async (name) => {
          await api.deleteAccount(name);
          setSelectedAccount(null);
          loadInitialData();
        }}
        onRefreshDialogs={loadDialogs}
      />

      {/* 4. Колонка 3: Окно активного чата */}
      <ChatWindow
        dialog={selectedDialog}
        messages={messages}
        isLoading={isLoadingMessages}
        onSendMessage={handleSendMessage}
        onClickButton={handleClickButton}
        quickReplies={quickReplies}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={toggleSound}
      />

      {/* 5. Колонки 4–5: Карточка CRM лида / Описание */}
      <LeadProfile
        dialog={selectedDialog}
        lead={lead}
        leadGroups={leadGroups}
        onUpdateLead={handleUpdateLead}
      />
      </div>

      {/* Плавающий статус-бар фоновых задач в правом нижнем углу */}
      <TaskStatusBar
        tasks={tasks}
        onPauseTask={(id) => api.pauseTask(id)}
        onResumeTask={(id) => api.resumeTask(id)}
        onCancelTask={(id) => api.cancelTask(id)}
      />

      {/* Модальные окна */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onAccountAdded={loadInitialData}
        accounts={accounts}
        groups={groups}
        proxies={proxies}
        proxyGroups={proxyGroups}
        onOpenProxyManager={() => {
          setIsAddAccountOpen(false);
          setIsProxiesOpen(true);
        }}
      />

      <ProxyManagerModal
        isOpen={isProxiesOpen}
        onClose={() => setIsProxiesOpen(false)}
        proxies={proxies}
        proxyGroups={proxyGroups}
        accounts={accounts}
        groups={groups}
        onRefresh={loadInitialData}
      />

      <ToolsModal
        isOpen={isToolsOpen}
        onClose={() => setIsToolsOpen(false)}
        accounts={accounts}
        groups={groups}
        onTaskStarted={loadInitialData}
        onSelectMatchChat={handleSelectMatchChat}
      />

      <MatchesModal
        isOpen={isMatchesOpen}
        onClose={() => setIsMatchesOpen(false)}
        onSelectMatchChat={handleSelectMatchChat}
      />

      <LeadGroupsModal
        isOpen={isLeadGroupsOpen}
        onClose={() => setIsLeadGroupsOpen(false)}
        leadGroups={leadGroups}
        onRefresh={loadInitialData}
      />

      <ProfileEditorModal
        isOpen={isProfileEditorOpen}
        onClose={() => setIsProfileEditorOpen(false)}
        accounts={accounts}
        groups={groups}
        onTaskStarted={loadInitialData}
      />

      <CreateFarmGroupModal
        isOpen={isFarmGroupsOpen}
        onClose={() => setIsFarmGroupsOpen(false)}
        groups={groups}
        onRefresh={loadInitialData}
      />
    </>
  );
}
