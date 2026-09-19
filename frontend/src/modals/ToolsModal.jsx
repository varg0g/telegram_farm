import React, { useState, useEffect } from 'react';
import {
  X, Sparkles, Play, Loader2, Heart, ExternalLink,
  MessageSquare, RefreshCw, Download, Trash2, Shield, Upload, Check,
  Flame, Thermometer, UserPlus, Users, Send, Dices, Eye
} from 'lucide-react';
import { api } from '../api';

export default function ToolsModal({ isOpen, onClose, accounts, groups, onTaskStarted, onSelectMatchChat }) {
  const [activeTab, setActiveTab] = useState('autolike'); // 'autolike' | 'warmup' | 'register' | 'matches' | 'scraper' | 'sender' | 'profile'
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Взаимки Дайвинчика
  const [matches, setMatches] = useState([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [matchesSearch, setMatchesSearch] = useState('');
  const [matchesFilterGroup, setMatchesFilterGroup] = useState('');
  const [matchesFilterAcc, setMatchesFilterAcc] = useState('');

  const loadMatches = async () => {
    setIsLoadingMatches(true);
    try {
      const data = await api.getMatches();
      setMatches(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMatches(false);
    }
  };

  // Счетчики загруженных фото
  const [leoPhotosCount, setLeoPhotosCount] = useState(0);
  const [avatarsCount, setAvatarsCount] = useState(0);

  const loadPhotosCounts = async () => {
    try {
      const [lRes, aRes] = await Promise.all([
        api.getLeoPhotosCount(),
        api.getAvatarsCount()
      ]);
      setLeoPhotosCount(lRes.count || 0);
      setAvatarsCount(aRes.count || 0);
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen) {
      loadPhotosCounts();
      if (activeTab === 'matches') {
        loadMatches();
      }
    }
  }, [isOpen, activeTab]);

  // Параметры Автолайкера Дайвинчика
  const [likesPerAccount, setLikesPerAccount] = useState(50);
  const [envelopeChance, setEnvelopeChance] = useState(70);
  const [minDelay, setMinDelay] = useState(25);
  const [maxDelay, setMaxDelay] = useState(45);
  const [autolikeMessageText, setAutolikeMessageText] = useState('{Привет|Здравствуй|Приветствую}! {Как дела|Чем занимаешься|Как настроение}? {Познакомимся|Пообщаемся}?');
  const [forwardSaved, setForwardSaved] = useState(true);
  const [showAutolikeSpintaxPreview, setShowAutolikeSpintaxPreview] = useState(false);
  const [autolikeSpintaxSamples, setAutolikeSpintaxSamples] = useState([]);

  // Параметры Прогрева Дайвинчика
  const [minWarmupLikes, setMinWarmupLikes] = useState(15);
  const [maxWarmupLikes, setMaxWarmupLikes] = useState(30);
  const [minWarmupDelay, setMinWarmupDelay] = useState(12);
  const [maxWarmupDelay, setMaxWarmupDelay] = useState(35);
  const [stopOnMatch, setStopOnMatch] = useState(false); // false = без ограничений, true = до 1-й взаимки
  const [warmupEnableDislikes, setWarmupEnableDislikes] = useState(true);
  const [warmupDislikeChance, setWarmupDislikeChance] = useState(30);
  const [warmupSubscribeChannel, setWarmupSubscribeChannel] = useState(true);
  const [warmupChannelUsername, setWarmupChannelUsername] = useState('leoday');

  // Параметры Авторегистратора анкет Дайвинчика
  const [regGender, setRegGender] = useState('Я парень');
  const [regSearchGender, setRegSearchGender] = useState('девушки');
  const [regAge, setRegAge] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regName, setRegName] = useState('');
  const [regBio, setRegBio] = useState('{Привет!|Здравствуй!} {Ищу общение|Познакомлюсь для прогулок и общения|Буду рад новым знакомствам}');
  const [regShareContact, setRegShareContact] = useState(true);
  const [regJoinChannels, setRegJoinChannels] = useState(true);

  // Параметры Парсера
  const [scraperAccount, setScraperAccount] = useState('');
  const [chatLink, setChatLink] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyWithUsername, setOnlyWithUsername] = useState(true);
  const [maxScrapeCount, setMaxScrapeCount] = useState(500);

  // Параметры Рассылки
  const [targetsText, setTargetsText] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('{Привет|Здравствуйте|Добрый день}! {Подскажите, пожалуйста|У меня вопрос|Актуально ли предложение}?');
  const [broadcastMinDelay, setBroadcastMinDelay] = useState(15);
  const [broadcastMaxDelay, setBroadcastMaxDelay] = useState(35);
  const [broadcastMaxPerAcc, setBroadcastMaxPerAcc] = useState(25);
  const [showBroadcastSpintaxPreview, setShowBroadcastSpintaxPreview] = useState(false);
  const [broadcastSpintaxSamples, setBroadcastSpintaxSamples] = useState([]);

  // Параметры Автозаполнения и Приватности
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [setUsername, setSetUsername] = useState(true);
  const [setAvatar, setSetAvatar] = useState(true);
  const [enable2FA, setEnable2FA] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [twoFaHint, setTwoFaHint] = useState('farm');
  const [hidePhone, setHidePhone] = useState(true);
  const [hideSearch, setHideSearch] = useState(true);
  const [hideLastSeen, setHideLastSeen] = useState(false);
  const [blockCalls, setBlockCalls] = useState(true);
  const [blockP2P, setBlockP2P] = useState(true);
  const [blockInvites, setBlockInvites] = useState(true);

  if (!isOpen) return null;

  // Spintax Helper
  const parseSpintax = (text) => {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (_, choices) => {
      const arr = choices.split('|');
      return arr[Math.floor(Math.random() * arr.length)];
    });
  };

  const generateSpintaxSamples = (text, count = 3) => {
    const samples = [];
    for (let i = 0; i < count; i++) {
      samples.push(parseSpintax(text));
    }
    return samples;
  };

  const handleSelectGroupAccounts = (groupId) => {
    const inGroup = accounts.filter(a => a.work_group_id === groupId).map(a => a.phone || a.session_name);
    setSelectedPhones(inGroup);
  };

  const handleSelectAll = () => {
    if (selectedPhones.length === accounts.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(accounts.map(a => a.phone || a.session_name));
    }
  };

  const handleUploadLeoPhotos = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      const res = await api.uploadLeoPhotos(fd);
      alert(`Загружено фотографий для Дайвинчика: ${res.uploaded}`);
      loadPhotosCounts();
    } catch (err) {
      alert(`Ошибка загрузки: ${err.message}`);
    }
  };

  const handleClearLeoPhotos = async () => {
    if (!window.confirm('Удалить все загруженные фотографии для Дайвинчика?')) return;
    try {
      await api.clearLeoPhotos();
      setLeoPhotosCount(0);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleUploadAvatars = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      const res = await api.uploadAvatars(fd);
      alert(`Загружено аватарок в пул: ${res.uploaded}`);
      loadPhotosCounts();
    } catch (err) {
      alert(`Ошибка загрузки: ${err.message}`);
    }
  };

  const handleClearAvatars = async () => {
    if (!window.confirm('Очистить пул аватарок профилей?')) return;
    try {
      await api.clearAvatars();
      setAvatarsCount(0);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleClearMatches = async () => {
    if (!window.confirm('Очистить весь список взаимных симпатий?')) return;
    try {
      await api.clearMatches();
      setMatches([]);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const handleLaunch = async (e) => {
    e.preventDefault();
    setIsLaunching(true);

    try {
      if (activeTab === 'autolike') {
        if (!selectedPhones.length) {
          alert('Выберите хотя бы один аккаунт для запуска');
          setIsLaunching(false);
          return;
        }
        await api.startLeoAutolike({
          account_phones: selectedPhones,
          likes_per_account: parseInt(likesPerAccount) || 50,
          min_delay: parseFloat(minDelay) || 25,
          max_delay: parseFloat(maxDelay) || 45
        });
      } else if (activeTab === 'warmup') {
        if (!selectedPhones.length) {
          alert('Выберите хотя бы один аккаунт для запуска');
          setIsLaunching(false);
          return;
        }
        await api.startLeoWarmup({
          account_phones: selectedPhones,
          min_likes: parseInt(minWarmupLikes) || 15,
          max_likes: parseInt(maxWarmupLikes) || 30,
          stop_on_match: stopOnMatch
        });
      } else if (activeTab === 'register') {
        if (!selectedPhones.length) {
          alert('Выберите хотя бы один аккаунт для запуска');
          setIsLaunching(false);
          return;
        }
        await api.startLeoRegister({
          account_phones: selectedPhones,
          gender: regGender,
          search_gender: regSearchGender,
          fixed_age: regAge ? parseInt(regAge) : null,
          fixed_city: regCity.trim() || null,
          fixed_name: regName.trim() || null,
          custom_bio: regBio.trim() || null,
          share_contact: regShareContact,
          join_channels: regJoinChannels
        });
      } else if (activeTab === 'scraper') {
        const phone = scraperAccount || selectedPhones[0];
        if (!phone || !chatLink.trim()) {
          alert('Выберите аккаунт-исполнитель и укажите ссылку на чат');
          setIsLaunching(false);
          return;
        }
        await api.startScraper({
          account_phone: phone,
          chat_username_or_link: chatLink.trim(),
          only_active: onlyActive,
          only_with_username: onlyWithUsername,
          max_count: parseInt(maxScrapeCount) || 500
        });
      } else if (activeTab === 'sender') {
        if (!selectedPhones.length) {
          alert('Выберите хотя бы один аккаунт-отправитель');
          setIsLaunching(false);
          return;
        }
        const targets = targetsText.split('\n').map(t => t.trim()).filter(Boolean);
        if (!targets.length || !messageTemplate.trim()) {
          alert('Заполните список получателей и текст сообщения');
          setIsLaunching(false);
          return;
        }
        await api.startSender({
          account_phones: selectedPhones,
          targets,
          message_template: messageTemplate
        });
      } else if (activeTab === 'profile') {
        if (!selectedPhones.length) {
          alert('Выберите хотя бы один аккаунт для оформления');
          setIsLaunching(false);
          return;
        }
        await api.startProfileUpdate({
          account_phones: selectedPhones,
          first_name: firstName || null,
          last_name: lastName || null,
          bio: bio || null,
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
      }

      if (onTaskStarted) onTaskStarted();
      onClose();
    } catch (err) {
      alert(`Ошибка запуска: ${err.message}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // Фильтрация взаимок
  const filteredMatches = matches.filter(m => {
    if (matchesSearch) {
      const q = matchesSearch.toLowerCase();
      const name = (m.lead_name || '').toLowerCase();
      const user = (m.lead_username || '').toLowerCase();
      const bio = (m.lead_bio || '').toLowerCase();
      if (!name.includes(q) && !user.includes(q) && !bio.includes(q)) return false;
    }
    if (matchesFilterAcc && m.account_phone !== matchesFilterAcc) {
      return false;
    }
    return true;
  });

  // Компонент селектора аккаунтов (Шаг 1)
  const renderAccountSelectorStep = (badgeColor = 'coral', title = 'Пул аккаунтов для работы', subtitle = 'выберите группу (или несколько) — список покажет только выбранные аккаунты') => (
    <div className="modal-card-section">
      <div className="card-step-header" style={{ marginBottom: '10px' }}>
        <div className="card-step-title">
          <span className={`step-badge ${badgeColor}`}>1</span>
          <span>{title}</span>
          <span className="step-subtitle">{subtitle}</span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
          Выбрано: <b style={{ color: '#fff' }}>{selectedPhones.length}</b> из {accounts.length}
        </span>
      </div>

      {/* Group Pills Bar */}
      <div className="group-pills-bar">
        <button
          type="button"
          className={`group-pill ${selectedPhones.length === accounts.length && accounts.length > 0 ? 'active' : ''}`}
          onClick={handleSelectAll}
        >
          <span>Все</span>
          <span className="group-pill-count">{accounts.length}</span>
        </button>
        <button
          type="button"
          className="group-pill"
          onClick={() => setSelectedPhones([])}
        >
          <span>Снять</span>
        </button>
        {groups.map(g => {
          const gAccounts = accounts.filter(a => a.work_group_id === g.id);
          const isSelected = gAccounts.length > 0 && gAccounts.every(a => selectedPhones.includes(a.phone || a.session_name));
          return (
            <button
              key={g.id}
              type="button"
              className={`group-pill ${isSelected ? 'active' : ''}`}
              onClick={() => handleSelectGroupAccounts(g.id)}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: g.color || '#6366f1' }}></span>
              <span>{g.title}</span>
              <span className="group-pill-count">{gAccounts.length}</span>
            </button>
          );
        })}
      </div>

      {/* Accounts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
        gap: '8px',
        maxHeight: '160px',
        overflowY: 'auto',
        padding: '10px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        background: 'rgba(0, 0, 0, 0.25)',
        marginTop: '6px'
      }}>
        {accounts.map(a => {
          const val = a.phone || a.session_name;
          const isChecked = selectedPhones.includes(val);
          const name = a.first_name || a.username || val;
          const initial = (name[0] || 'T').toUpperCase();
          return (
            <label
              key={val}
              className={`account-chip ${isChecked ? 'selected' : ''}`}
              onClick={() => {
                setSelectedPhones(prev => 
                  prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val]
                );
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div className="chip-avatar">{initial}</div>
                <div className="chip-info">
                  <span className="chip-name">{name}</span>
                  <span className="chip-phone">{a.phone ? `+${a.phone}` : `@${a.username || a.session_name}`}</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {}} // handled by label onClick
              />
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal modal-tools" 
        style={{ 
          width: '900px', 
          maxWidth: '96vw', 
          height: '86vh', 
          maxHeight: '88vh', 
          display: 'flex', 
          flexDirection: 'column' 
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '10px', 
              background: activeTab.startsWith('leo') || activeTab === 'autolike' || activeTab === 'warmup' || activeTab === 'register' || activeTab === 'matches'
                ? 'rgba(255, 71, 87, 0.15)' 
                : 'rgba(0, 168, 255, 0.15)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: activeTab.startsWith('leo') || activeTab === 'autolike' || activeTab === 'warmup' || activeTab === 'register' || activeTab === 'matches'
                ? '#ff4757' 
                : '#00a8ff',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {activeTab === 'matches' ? (
                <Heart className="w-5 h-5 fill-current" />
              ) : activeTab === 'warmup' ? (
                <Thermometer className="w-5 h-5" />
              ) : activeTab === 'register' ? (
                <UserPlus className="w-5 h-5" />
              ) : activeTab === 'scraper' ? (
                <Users className="w-5 h-5" />
              ) : activeTab === 'sender' ? (
                <Send className="w-5 h-5" />
              ) : activeTab === 'profile' ? (
                <Shield className="w-5 h-5" />
              ) : (
                <Flame className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="modal-title" style={{ fontSize: '17px', color: '#fff' }}>
                {activeTab === 'autolike' || activeTab === 'warmup' || activeTab === 'register' || activeTab === 'matches'
                  ? 'Дайвинчик (@leomatchbot) — Автоматизация и Лиды'
                  : activeTab === 'scraper'
                  ? 'Парсер целевой аудитории'
                  : activeTab === 'sender'
                  ? 'Массовая рассылка (Smart Broadcast)'
                  : 'Автозаполнение профилей и приватность'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                {activeTab === 'autolike' || activeTab === 'warmup' || activeTab === 'register' || activeTab === 'matches'
                  ? 'Автолайкер, прогрев анкет, регистрация и CRM-хранилище лидов'
                  : activeTab === 'scraper'
                  ? 'Сбор участников групп и активных комментаторов'
                  : activeTab === 'sender'
                  ? 'Персонализированная рассылка со спинтаксом и защитой от спамбрейка'
                  : 'Персонализация данных, ротация аватарок и MTProto Shield'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="icon-btn"
            type="button"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Навигация по табам */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '12px 20px', 
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
          background: 'rgba(0, 0, 0, 0.25)', 
          overflowX: 'auto', 
          flexShrink: 0 
        }}>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'autolike' ? 'active' : ''}`}
            onClick={() => setActiveTab('autolike')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            🔥 Автолайкер
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'warmup' ? 'active' : ''}`}
            onClick={() => setActiveTab('warmup')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            🌡️ Прогрев анкеты
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            📝 Регистратор
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
            style={{ fontSize: '12.5px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>💌 Взаимки</span>
            <span style={{ 
              background: '#ff4757', 
              color: '#fff', 
              padding: '1px 7px', 
              borderRadius: '10px', 
              fontSize: '11px', 
              fontWeight: 700 
            }}>
              {matches.length}
            </span>
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            🎯 Парсер
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'sender' ? 'active' : ''}`}
            onClick={() => setActiveTab('sender')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            ✉️ Рассылка
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            👤 Оформление
          </button>
        </div>

        {/* Тело модального окна */}
        <div className="modal-body" style={{ 
          flex: 1, 
          overflowY: 'auto', 
          overflowX: 'hidden', 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          boxSizing: 'border-box' 
        }}>
          
          {/* ===================== ТАБ: АВТОЛАЙКЕР ДАЙВИНЧИКА ===================== */}
          {activeTab === 'autolike' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Пул аккаунтов */}
              {renderAccountSelectorStep('coral', 'Пул аккаунтов для работы', 'выберите группу (или несколько) — список покажет выбранные аккаунты')}

              {/* ШАГ 2: Текст письма со спинтаксом */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">2</span>
                    <span>Текст письма (со спинтаксом)</span>
                    <span className="step-subtitle">отправляется ботом вместе с лайком анкеты</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => {
                      setAutolikeSpintaxSamples(generateSpintaxSamples(autolikeMessageText, 3));
                      setShowAutolikeSpintaxPreview(!showAutolikeSpintaxPreview);
                    }}
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Проверить рандомизацию</span>
                  </button>
                </div>
                <textarea
                  value={autolikeMessageText}
                  onChange={(e) => setAutolikeMessageText(e.target.value)}
                  placeholder="{Привет|Здравствуйте|Добрый день}! {Как дела|Чем занимаешься}? {Познакомимся|Пообщаемся}?"
                  style={{ width: '100%', height: '90px', resize: 'vertical', lineHeight: '1.45' }}
                />
                <div className="info-callout">
                  <span className="ico">💡</span>
                  <span>
                    Используйте конструкцию <code>{'{вариант 1|вариант 2|вариант 3}'}</code>. При отправке бот выбирает случайное слово, обеспечивая уникальность каждого письма и обход спам-фильтра Дайвинчика.
                  </span>
                </div>
                {showAutolikeSpintaxPreview && (
                  <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-2)' }}>Примеры рандомизированных писем:</div>
                    {autolikeSpintaxSamples.map((sample, idx) => (
                      <div key={idx} style={{ fontSize: '12.5px', color: '#fff', padding: '6px 10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid #ff4757' }}>
                        «{sample}»
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ШАГ 3: Тайминги и параметры */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">3</span>
                    <span>Тайминги и параметры безопасности</span>
                    <span className="step-subtitle">рандомизация интервалов для защиты от лимитов</span>
                  </div>
                </div>
                <div className="param-tile-grid">
                  <div className="param-tile">
                    <span className="param-label">🎯 Шанс письма</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="10"
                        max="100"
                        value={envelopeChance}
                        onChange={(e) => setEnvelopeChance(e.target.value)}
                      />
                      <span className="param-unit">%</span>
                    </div>
                    <span className="param-hint">Остальное — дизлайк 👎</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">⏱️ Мин. пауза</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={minDelay}
                        onChange={(e) => setMinDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Пауза перед лайком</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">⏳ Макс. пауза</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="10"
                        max="180"
                        value={maxDelay}
                        onChange={(e) => setMaxDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Случайный разброс</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">🛑 Лимит анкет</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="5"
                        max="500"
                        value={likesPerAccount}
                        onChange={(e) => setLikesPerAccount(e.target.value)}
                      />
                      <span className="param-unit">шт</span>
                    </div>
                    <span className="param-hint">Лайков на 1 аккаунт</span>
                  </div>
                </div>
              </div>

              {/* ШАГ 4: Дополнительные опции */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">4</span>
                    <span>Дополнительные опции</span>
                  </div>
                </div>
                <label className="option-toggle-card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff' }}>Дублировать пойманные взаимки в «Избранное» (Saved Messages)</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Копия контакта и профиля анкеты будет автоматически пересылаться в сохраненные сообщения аккаунта фермы</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={forwardSaved}
                    onChange={(e) => setForwardSaved(e.target.checked)}
                  />
                </label>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)',
                  boxShadow: '0 4px 18px rgba(255, 71, 87, 0.4)',
                  padding: '15px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Запуск автолайкера...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Запустить автолайкер в Дайвинчике</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ===================== ТАБ: ПРОГРЕВ АНКЕТЫ ===================== */}
          {activeTab === 'warmup' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Пул аккаунтов */}
              {renderAccountSelectorStep('coral', 'Пул аккаунтов для прогрева', 'выберите группу (или несколько) — список покажет только выбранные аккаунты')}

              {/* ШАГ 2: Количество лайков и паузы */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">2</span>
                    <span>Количество лайков и паузы</span>
                    <span className="step-subtitle">лимиты свайпов и естественные интервалы</span>
                  </div>
                </div>
                <div className="param-tile-grid">
                  <div className="param-tile">
                    <span className="param-label">❤️ Мин. лайков</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={minWarmupLikes}
                        onChange={(e) => setMinWarmupLikes(e.target.value)}
                      />
                      <span className="param-unit">шт</span>
                    </div>
                    <span className="param-hint">Минимум на аккаунт</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">❤️ Макс. лайков</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={maxWarmupLikes}
                        onChange={(e) => setMaxWarmupLikes(e.target.value)}
                      />
                      <span className="param-unit">шт</span>
                    </div>
                    <span className="param-hint">Случайный целевой порог</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">⏱️ Мин. пауза между свайпами</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="3"
                        max="180"
                        value={minWarmupDelay}
                        onChange={(e) => setMinWarmupDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Пауза между анкетами</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">⏳ Макс. пауза между свайпами</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={maxWarmupDelay}
                        onChange={(e) => setMaxWarmupDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Случайный разброс</span>
                  </div>
                </div>
              </div>

              {/* ШАГ 3: Критерий завершения прогрева */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">3</span>
                    <span>Критерий завершения прогрева</span>
                    <span className="step-subtitle">выберите условие остановки задачи</span>
                  </div>
                </div>
                <div className="criteria-card-grid">
                  <div
                    className={`criteria-card ${!stopOnMatch ? 'active' : ''}`}
                    onClick={() => setStopOnMatch(false)}
                  >
                    <div className="criteria-card-top">
                      <div className="criteria-card-title-row">
                        <span className="criteria-card-icon">♾️</span>
                        <span className="criteria-card-title">Без ограничений</span>
                      </div>
                      <span className="criteria-card-radio"></span>
                    </div>
                    <div className="criteria-card-desc">Работает по расписанию, пока вы не остановите его вручную</div>
                  </div>

                  <div
                    className={`criteria-card ${stopOnMatch ? 'active' : ''}`}
                    onClick={() => setStopOnMatch(true)}
                  >
                    <div className="criteria-card-top">
                      <div className="criteria-card-title-row">
                        <span className="criteria-card-icon">🎯</span>
                        <span className="criteria-card-title">До 1-й взаимки</span>
                      </div>
                      <span className="criteria-card-radio"></span>
                    </div>
                    <div className="criteria-card-desc">Аккаунт завершает прогрев сразу при получении первой взаимной симпатии</div>
                  </div>
                </div>
              </div>

              {/* ШАГ 4: Поведение при прогреве */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">4</span>
                    <span>Поведение при прогреве</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff' }}>Добавлять дизлайки во время прогрева</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Разбавляет свайпы случайными пропусками (👎) для естественности поведения и обхода антифрод-фильтров</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={warmupEnableDislikes}
                      onChange={(e) => setWarmupEnableDislikes(e.target.checked)}
                    />
                  </label>

                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff' }}>Подписываться на канал Дайвинчика (@{warmupChannelUsername})</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Снимает ограничение «буст анкеты понижен» и повышает траст аккаунта</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={warmupSubscribeChannel}
                      onChange={(e) => setWarmupSubscribeChannel(e.target.checked)}
                    />
                  </label>
                </div>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)',
                  boxShadow: '0 4px 18px rgba(255, 71, 87, 0.4)',
                  padding: '15px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Запуск прогрева...</span>
                  </>
                ) : (
                  <>
                    <Thermometer className="w-5 h-5" />
                    <span>Запустить прогрев анкет в Дайвинчике</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ===================== ТАБ: РЕГИСТРАТОР АНКЕТ ===================== */}
          {activeTab === 'register' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Аккаунты */}
              {renderAccountSelectorStep('coral', 'Аккаунты для регистрации анкет', 'выберите группу (или несколько) — список покажет только выбранные аккаунты')}

              {/* ШАГ 2: Параметры анкеты */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">2</span>
                    <span>Параметры анкеты бота</span>
                    <span className="step-subtitle">пол, поиск, возраст и город</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="param-tile">
                    <span className="param-label">👤 Пол аккаунта</span>
                    <select
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <option value="Я парень">Я парень</option>
                      <option value="Я девушка">Я девушка</option>
                    </select>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">🔍 Кого искать</span>
                    <select
                      value={regSearchGender}
                      onChange={(e) => setRegSearchGender(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <option value="девушки">Девушки</option>
                      <option value="парни">Парни</option>
                      <option value="все равно">Все равно</option>
                    </select>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">🎂 Возраст</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        placeholder="Случайно (20-25)"
                        min="18"
                        max="60"
                        value={regAge}
                        onChange={(e) => setRegAge(e.target.value)}
                      />
                      <span className="param-unit">лет</span>
                    </div>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">📍 Город</span>
                    <div className="param-input-wrap">
                      <input
                        type="text"
                        placeholder="Случайно (Москва, СПб...)"
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ШАГ 3: Описание О себе и Фотографии */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">3</span>
                    <span>Описание «О себе» и фотографии</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Текст анкеты (поддерживает Спинтакс):</span>
                  <textarea
                    value={regBio}
                    onChange={(e) => setRegBio(e.target.value)}
                    placeholder="{Привет!|Здравствуй!} {Ищу приятное общение|Познакомлюсь для прогулок}..."
                    style={{ width: '100%', height: '70px', resize: 'vertical' }}
                  />
                </div>

                {/* Фотографии */}
                <div style={{ 
                  padding: '12px 14px', 
                  background: 'rgba(0,0,0,0.25)', 
                  border: '1px solid rgba(255, 255, 255, 0.08)', 
                  borderRadius: '10px', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  flexWrap: 'wrap', 
                  gap: '10px' 
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📸 Пул фотографий анкет:</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                        (загружено: <b style={{ color: '#00a8ff', fontSize: '14px' }}>{leoPhotosCount}</b> шт)
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Бот отправит случайное фото из пула при прохождении регистрации в @leomatchbot
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 14px', cursor: 'pointer' }}>
                      + Загрузить фото
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp"
                        style={{ display: 'none' }}
                        onChange={handleUploadLeoPhotos}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleClearLeoPhotos}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Очистить
                    </button>
                  </div>
                </div>
              </div>

              {/* ШАГ 4: Верификация и безопасность */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge coral">4</span>
                    <span>Верификация и безопасность</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Отправлять контакт аккаунта</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Необходимо боту Дайвинчик для подтверждения номера и прохождения первичной верификации</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={regShareContact}
                      onChange={(e) => setRegShareContact(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Подписаться на прогревочные каналы</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-2)' }}>Автоматически подписывается на каналы партнёров после создания анкеты для снятия спамбрейка</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={regJoinChannels}
                      onChange={(e) => setRegJoinChannels(e.target.checked)}
                    />
                  </label>
                </div>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)',
                  boxShadow: '0 4px 18px rgba(255, 71, 87, 0.4)',
                  padding: '15px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Регистрация анкет...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    <span>Запустить авторегистрацию анкет</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ===================== ТАБ: ХРАНИЛИЩЕ ВЗАИМОК ===================== */}
          {activeTab === 'matches' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '14px', minHeight: 0 }}>
              {/* Панель фильтров и поиска */}
              <div className="modal-card-section" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Поиск по имени, юзернейму или тексту..."
                      value={matchesSearch}
                      onChange={(e) => setMatchesSearch(e.target.value)}
                      style={{ width: '280px', padding: '8px 12px', fontSize: '13px' }}
                    />
                    <select
                      value={matchesFilterAcc}
                      onChange={(e) => setMatchesFilterAcc(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '13px', width: 'auto' }}
                    >
                      <option value="">Все аккаунты ({accounts.length})</option>
                      {accounts.map(a => (
                        <option key={a.phone || a.session_name} value={a.phone || a.session_name}>
                          {a.first_name || a.username || a.phone}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => api.downloadMatches(null, 'csv')}
                      disabled={matches.length === 0}
                      style={{ fontSize: '12px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Excel/CSV</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => api.downloadMatches(null, 'txt')}
                      disabled={matches.length === 0}
                      style={{ fontSize: '12px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>TXT</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={loadMatches}
                      disabled={isLoadingMatches}
                      style={{ fontSize: '12px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMatches ? 'animate-spin' : ''}`} />
                      <span>Обновить</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleClearMatches}
                      disabled={matches.length === 0}
                      style={{ fontSize: '12px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Очистить</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Таблица / Карточки взаимок */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                borderRadius: '12px', 
                minHeight: '260px', 
                background: 'rgba(0,0,0,0.25)',
                padding: filteredMatches.length > 0 ? '12px' : '0'
              }}>
                {isLoadingMatches ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Загрузка взаимок...</span>
                  </div>
                ) : filteredMatches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-2)' }}>
                    <Heart className="w-8 h-8 text-rose-500/40 mx-auto mb-2" />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Взаимных симпатий пока нет</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
                      Запустите Автолайкер Дайвинчика, и все пойманные лиды сохранятся здесь
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '12px' }}>
                    {filteredMatches.map(m => (
                      <div
                        key={m.id || m.lead_user_id || Math.random()}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {m.lead_name || 'Лид Дайвинчика'}
                              </div>
                              {m.lead_username && (
                                <div style={{ fontSize: '12px', color: '#00a8ff', fontFamily: 'monospace', marginTop: '1px' }}>
                                  @{m.lead_username}
                                </div>
                              )}
                            </div>
                            <span style={{ 
                              fontSize: '10.5px', 
                              padding: '2px 7px', 
                              borderRadius: '6px', 
                              background: 'rgba(255, 71, 87, 0.15)', 
                              color: '#ff6b81', 
                              fontWeight: 600, 
                              flexShrink: 0 
                            }}>
                              {m.account_name || m.account_phone || 'Аккаунт'}
                            </span>
                          </div>

                          {m.lead_bio && (
                            <div style={{ 
                              fontSize: '11.5px', 
                              color: 'rgba(255, 255, 255, 0.75)', 
                              background: 'rgba(0, 0, 0, 0.3)', 
                              padding: '8px 10px', 
                              borderRadius: '8px', 
                              marginTop: '8px', 
                              lineHeight: '1.4', 
                              maxHeight: '60px', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {m.lead_bio}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          {onSelectMatchChat && (m.lead_user_id || m.lead_username) && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectMatchChat(m.account_phone, m.lead_user_id || m.lead_username, m.lead_name || m.lead_username);
                                onClose();
                              }}
                              className="btn btn-secondary"
                              style={{ 
                                flex: 1, 
                                fontSize: '11.5px', 
                                padding: '6px 10px', 
                                background: 'rgba(168, 85, 247, 0.2)', 
                                borderColor: 'rgba(168, 85, 247, 0.4)', 
                                color: '#c084fc', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '5px' 
                              }}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Диалог в CRM</span>
                            </button>
                          )}
                          {m.lead_username && (
                            <a
                              href={`https://t.me/${m.lead_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ fontSize: '11.5px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>В Telegram</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================== ТАБ: ПАРСЕР ЦЕЛЕВОЙ АУДИТОРИИ ===================== */}
          {activeTab === 'scraper' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Источник и исполнитель */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">1</span>
                    <span>Источник и аккаунт-исполнитель</span>
                    <span className="step-subtitle">выберите рабочий аккаунт для парсинга участников</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                      Аккаунт-исполнитель:
                    </label>
                    <select
                      value={scraperAccount || (accounts[0] ? (accounts[0].phone || accounts[0].session_name) : '')}
                      onChange={(e) => setScraperAccount(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      {accounts.map(a => (
                        <option key={a.phone || a.session_name} value={a.phone || a.session_name}>
                          {a.first_name || a.username || a.phone} ({a.phone})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                      С этого аккаунта будет отправлен запрос участников группы
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                      Целевой чат / группа:
                    </label>
                    <input
                      type="text"
                      placeholder="@chat_username или t.me/joinchat/..."
                      value={chatLink}
                      onChange={(e) => setChatLink(e.target.value)}
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                      Юзернейм открытой группы или ссылка-приглашение
                    </div>
                  </div>
                </div>
              </div>

              {/* ШАГ 2: Фильтрация */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">2</span>
                    <span>Метод сбора и фильтрация</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Только активные пользователи</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Сбор пользователей, заходивших в Telegram недавно</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={onlyActive}
                      onChange={(e) => setOnlyActive(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Только с @username</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Сохранять только контакты с публичным юзернеймом</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={onlyWithUsername}
                      onChange={(e) => setOnlyWithUsername(e.target.checked)}
                    />
                  </label>
                </div>
              </div>

              {/* ШАГ 3: Лимит сбора */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">3</span>
                    <span>Лимит сбора контактов</span>
                  </div>
                </div>
                <div className="param-tile-grid" style={{ gridTemplateColumns: 'minmax(200px, 260px)' }}>
                  <div className="param-tile">
                    <span className="param-label">🛑 Максимум контактов</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="10"
                        max="5000"
                        value={maxScrapeCount}
                        onChange={(e) => setMaxScrapeCount(e.target.value)}
                      />
                      <span className="param-unit">контактов</span>
                    </div>
                    <span className="param-hint">Рекомендуемый объём: 500–1000</span>
                  </div>
                </div>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #00a8ff 0%, #0066cc 100%)',
                  padding: '14px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Сбор лидов...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Начать сбор лидов</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ===================== ТАБ: МАССОВАЯ РАССЫЛКА ===================== */}
          {activeTab === 'sender' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Пул аккаунтов-отправителей */}
              {renderAccountSelectorStep('', 'Пул аккаунтов для отправки', 'выберите группу (или несколько) — список покажет только выбранные аккаунты')}

              {/* ШАГ 2: База получателей */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">2</span>
                    <span>База получателей</span>
                    <span className="step-subtitle">укажите юзернеймы или ID построчно</span>
                  </div>
                </div>
                <textarea
                  value={targetsText}
                  onChange={(e) => setTargetsText(e.target.value)}
                  placeholder="@username1&#10;@username2&#10;123456789"
                  style={{ width: '100%', height: '85px', resize: 'vertical' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  Укажите получателей построчно (юзернеймы с @ или числовые Telegram ID)
                </div>
              </div>

              {/* ШАГ 3: Текст сообщения и Спинтакс */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">3</span>
                    <span>Текст сообщения и Спинтакс</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => {
                      setBroadcastSpintaxSamples(generateSpintaxSamples(messageTemplate, 3));
                      setShowBroadcastSpintaxPreview(!showBroadcastSpintaxPreview);
                    }}
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Проверить рандомизацию</span>
                  </button>
                </div>
                <textarea
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="{Привет|Здравствуйте|Добрый день}! {Подскажите|У меня вопрос}..."
                  style={{ width: '100%', height: '85px', resize: 'vertical' }}
                />
                <div className="info-callout">
                  <span className="ico">💡</span>
                  <span>
                    Используйте скобки вида <code>{'{Привет|Здравствуйте|Добрый день}'}</code> для автоматической рандомизации текста на каждом сообщении. Это критично для обхода антиспам-системы Telegram.
                  </span>
                </div>
                {showBroadcastSpintaxPreview && (
                  <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-2)' }}>Примеры рандомизированных сообщений:</div>
                    {broadcastSpintaxSamples.map((sample, idx) => (
                      <div key={idx} style={{ fontSize: '12.5px', color: '#fff', padding: '6px 10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', borderLeft: '3px solid #00a8ff' }}>
                        «{sample}»
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ШАГ 4: Защита и задержки */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge">4</span>
                    <span>Интервалы и безопасность</span>
                  </div>
                </div>
                <div className="param-tile-grid">
                  <div className="param-tile">
                    <span className="param-label">⏱️ Мин. пауза</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={broadcastMinDelay}
                        onChange={(e) => setBroadcastMinDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Минимальный интервал</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">⏳ Макс. пауза</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="10"
                        max="300"
                        value={broadcastMaxDelay}
                        onChange={(e) => setBroadcastMaxDelay(e.target.value)}
                      />
                      <span className="param-unit">сек</span>
                    </div>
                    <span className="param-hint">Рандомизация паузы</span>
                  </div>
                  <div className="param-tile">
                    <span className="param-label">🛑 Лимит на 1 акк</span>
                    <div className="param-input-wrap">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={broadcastMaxPerAcc}
                        onChange={(e) => setBroadcastMaxPerAcc(e.target.value)}
                      />
                      <span className="param-unit">сообщ.</span>
                    </div>
                    <span className="param-hint">Безопасный лимит</span>
                  </div>
                </div>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #00a8ff 0%, #0066cc 100%)',
                  padding: '14px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Запуск рассылки...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Запустить авторассылку</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ===================== ТАБ: ОФОРМЛЕНИЕ И 2FA ===================== */}
          {activeTab === 'profile' && (
            <form onSubmit={handleLaunch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* ШАГ 1: Аккаунты */}
              {renderAccountSelectorStep('purple', 'Целевые аккаунты для настройки', 'выберите группу (или несколько) — список покажет выбранные аккаунты')}

              {/* ШАГ 2: Персонализация */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge purple">2</span>
                    <span>Персонализация данных</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                      Имя (пусто = рандом из базы):
                    </label>
                    <input
                      type="text"
                      placeholder="Рандомное имя"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                      Фамилия (пусто = рандом):
                    </label>
                    <input
                      type="text"
                      placeholder="Рандомная фамилия"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                    О себе / Bio (со спинтаксом):
                  </label>
                  <textarea
                    placeholder="{Привет!|Здравствуй!} {Пишите в ЛС|По всем вопросам в лс}..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    style={{ width: '100%', height: '65px', resize: 'vertical' }}
                  />
                </div>

                <label className="option-toggle-card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Генерировать уникальный читаемый @username</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Автоматическая проверка доступности через Telegram API</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={setUsername}
                    onChange={(e) => setSetUsername(e.target.checked)}
                  />
                </label>

                {/* Аватарки */}
                <div style={{ 
                  padding: '12px 14px', 
                  background: 'rgba(0,0,0,0.25)', 
                  border: '1px solid rgba(255, 255, 255, 0.08)', 
                  borderRadius: '10px', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  flexWrap: 'wrap', 
                  gap: '10px' 
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🖼️ Пул аватарок:</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                        (в пуле: <b style={{ color: '#c084fc', fontSize: '14px' }}>{avatarsCount}</b> шт)
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                      Установка случайного фото профиля из загруженного пула
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 14px', cursor: 'pointer' }}>
                      + Загрузить фото
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp"
                        style={{ display: 'none' }}
                        onChange={handleUploadAvatars}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleClearAvatars}
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Очистить
                    </button>
                  </div>
                </div>
              </div>

              {/* ШАГ 3: 2FA */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge purple">3</span>
                    <span>Облачный пароль (2FA)</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enable2FA}
                      onChange={(e) => setEnable2FA(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: '#c084fc' }}
                    />
                    <span style={{ fontSize: '12.5px', color: '#fff', fontWeight: 600 }}>Установить 2FA на аккаунты</span>
                  </label>
                </div>
                {enable2FA && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                        Пароль 2FA:
                      </label>
                      <input
                        type="text"
                        placeholder="Сложный мастер-пароль"
                        value={twoFaPassword}
                        onChange={(e) => setTwoFaPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                        Подсказка к паролю:
                      </label>
                      <input
                        type="text"
                        placeholder="Подсказка (например: farm)"
                        value={twoFaHint}
                        onChange={(e) => setTwoFaHint(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ШАГ 4: MTProto Shield */}
              <div className="modal-card-section">
                <div className="card-step-header">
                  <div className="card-step-title">
                    <span className="step-badge purple">4</span>
                    <span>Приватность и защита прокси (MTProto Shield)</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Номер телефона: «Никто»</span>
                    <input
                      type="checkbox"
                      checked={hidePhone}
                      onChange={(e) => setHidePhone(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Поиск по номеру: «Никто»</span>
                    <input
                      type="checkbox"
                      checked={hideSearch}
                      onChange={(e) => setHideSearch(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Запретить звонки: «Никто»</span>
                    <input
                      type="checkbox"
                      checked={blockCalls}
                      onChange={(e) => setBlockCalls(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Запрет P2P-звонков (защита IP)</span>
                    <input
                      type="checkbox"
                      checked={blockP2P}
                      onChange={(e) => setBlockP2P(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Инвайты в группы: только контакты</span>
                    <input
                      type="checkbox"
                      checked={blockInvites}
                      onChange={(e) => setBlockInvites(e.target.checked)}
                    />
                  </label>
                  <label className="option-toggle-card" style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '12.5px', color: '#fff' }}>Время захода: «Никто»</span>
                    <input
                      type="checkbox"
                      checked={hideLastSeen}
                      onChange={(e) => setHideLastSeen(e.target.checked)}
                    />
                  </label>
                </div>
              </div>

              {/* Кнопка запуска */}
              <button
                type="submit"
                disabled={isLaunching}
                className="btn-modal-action"
                style={{
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 18px rgba(168, 85, 247, 0.4)',
                  padding: '14px',
                  fontSize: '15px'
                }}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Применение настроек...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Применить к {selectedPhones.length} аккаунтам</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
