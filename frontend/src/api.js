const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
    }
  });

  if (!res.ok) {
    let errText = res.statusText;
    try {
      const j = await res.json();
      errText = j.detail || j.message || errText;
    } catch (_) {}
    throw new Error(errText);
  }
  return res.json();
}

export const api = {
  // Аккаунты
  getAccounts: () => request('/api/accounts'),
  uploadSession: (formData) => request('/api/accounts/upload', { method: 'POST', body: formData }),
  uploadBatchSessions: (formData) => request('/api/accounts/upload-batch', { method: 'POST', body: formData }),
  startPhoneAuth: (phone, proxy_id) => request('/api/accounts/phone/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, proxy_id })
  }),
  signInPhone: (phone, code, password) => request('/api/accounts/phone/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, password })
  }),
  startAccount: (name) => request(`/api/accounts/${encodeURIComponent(name)}/start`, { method: 'POST' }),
  precacheAccount: (name, topCount = 20) =>
    request(`/api/accounts/${encodeURIComponent(name)}/precache?top_count=${topCount}`, { method: 'POST' }),
  bindProxy: (name, proxy_id) => request(`/api/accounts/${encodeURIComponent(name)}/bind-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxy_id })
  }),
  bindGroup: (name, work_group_id) => request(`/api/accounts/${encodeURIComponent(name)}/bind-group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_group_id })
  }),
  deleteAccount: (name) => request(`/api/accounts/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getTelegramCode: (name) => request(`/api/accounts/${encodeURIComponent(name)}/telegram_code`),

  // Рабочие группы
  getGroups: () => request('/api/accounts/groups'),
  createGroup: (title, color) => request('/api/accounts/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, color })
  }),
  deleteGroup: (id) => request(`/api/accounts/groups/${id}`, { method: 'DELETE' }),

  // Диалоги
  getDialogs: ({ account_phone, group_id, chat_type, search } = {}) => {
    const params = new URLSearchParams();
    if (account_phone) params.append('account_phone', account_phone);
    if (group_id !== undefined && group_id !== null) params.append('group_id', group_id);
    if (chat_type && chat_type !== 'all') params.append('chat_type', chat_type);
    if (search) params.append('search', search);
    return request(`/api/dialogs?${params.toString()}`);
  },
  getDialogMedia: (account_phone, chat_id, kind = 'media', limit = 18, signal = null) =>
    request(`/api/dialogs/${encodeURIComponent(account_phone)}/${chat_id}/media?kind=${kind}&limit=${limit}`, { signal }),
  markRead: (account_phone, chat_id) => request(`/api/dialogs/${encodeURIComponent(account_phone)}/${chat_id}/read`, { method: 'POST' }),

  // Пакетный резолвер аватарок: один запрос на всё видимое окно списка диалогов
  // вместо отдельного запроса от каждой строки.
  getAvatars: (items, download = 16) =>
    request(`/api/avatars?items=${encodeURIComponent(items)}&download=${download}`),

  // Сообщения
  getMessages: (account_phone, chat_id, limit = 60, offset_id = 0, signal = null) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}?limit=${limit}&offset_id=${offset_id}`, { signal }),
  sendText: (account_phone, chat_id, text, reply_to_msg_id = null) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, reply_to_msg_id })
    }),
  sendVoice: (account_phone, chat_id, formData) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}/send-voice`, { method: 'POST', body: formData }),
  sendVideoNote: (account_phone, chat_id, formData) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}/send-video-note`, { method: 'POST', body: formData }),
  sendFile: (account_phone, chat_id, formData) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}/send-file`, { method: 'POST', body: formData }),
  clickButton: (account_phone, chat_id, message_id, button_data) =>
    request(`/api/messages/${encodeURIComponent(account_phone)}/${chat_id}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id, button_data })
    }),

  // Быстрые ответы (шаблоны)
  getQuickReplies: () => request('/api/messages/quick-replies'),
  createQuickReply: (data) => request('/api/messages/quick-replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteQuickReply: (id) => request(`/api/messages/quick-replies/${id}`, { method: 'DELETE' }),

  // Прокси
  getProxies: (group_id = null) => request(`/api/proxies${group_id !== null && group_id !== undefined ? `?proxy_group_id=${group_id}` : ''}`),
  addProxy: (data) => request('/api/proxies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  batchAddProxies: (lines, proxy_group_id, default_proto = 'socks5') => request('/api/proxies/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines, proxy_group_id, default_proto })
  }),
  checkProxies: (group_id = null) => request(`/api/proxies/check-all${group_id ? `?proxy_group_id=${group_id}` : ''}`, { method: 'POST' }),
  checkProxy: (id) => request(`/api/proxies/${id}/check`, { method: 'POST' }),
  moveProxyGroup: (proxy_ids, target_group_id) => request('/api/proxies/move-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxy_ids, target_group_id })
  }),
  assignProxy: (proxy_id, accounts) => request('/api/proxies/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxy_id, accounts })
  }),
  distributeProxies: (data) => request('/api/proxies/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteProxy: (id) => request(`/api/proxies/${id}`, { method: 'DELETE' }),
  getProxyGroups: () => request('/api/proxies/groups'),
  createProxyGroup: (title) => request('/api/proxies/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  }),
  renameProxyGroup: (id, title) => request(`/api/proxies/groups/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  }),
  deleteProxyGroup: (id) => request(`/api/proxies/groups/${id}`, { method: 'DELETE' }),

  // Лиды (CRM)
  getLeadProfile: (chat_id, account_phone, signal = null) => request(`/api/leads/profile/${chat_id}?account_phone=${encodeURIComponent(account_phone || '')}`, { signal }),
  updateLeadProfile: (chat_id, data) => request(`/api/leads/profile/${chat_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getLeadGroups: () => request('/api/leads/groups'),
  createLeadGroup: (name, color) => request('/api/leads/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  }),
  deleteLeadGroup: (id) => request(`/api/leads/groups/${id}`, { method: 'DELETE' }),

  // Взаимки Дайвинчика
  getMatches: (account_phone = null, status = null) => {
    const params = new URLSearchParams();
    if (account_phone) params.append('account_phone', account_phone);
    if (status) params.append('status', status);
    return request(`/api/leads/matches?${params.toString()}`);
  },
  updateMatchStatus: (id, status) => request(`/api/leads/matches/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  }),

  // Задачи
  getTasks: () => request('/api/tasks'),
  getActiveTasks: () => request('/api/tasks/active'),
  getTask: (id) => request(`/api/tasks/${id}`),
  pauseTask: (id) => request(`/api/tasks/${id}/pause`, { method: 'POST' }),
  resumeTask: (id) => request(`/api/tasks/${id}/resume`, { method: 'POST' }),
  cancelTask: (id) => request(`/api/tasks/${id}/cancel`, { method: 'POST' }),

  // Инструменты
  startLeoAutolike: (data) => request('/api/tools/leomatch/autolike', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  startLeoWarmup: (data) => request('/api/tools/leomatch/warmup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  startScraper: (data) => request('/api/tools/scraper/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  startSender: (data) => request('/api/tools/sender/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  startProfileUpdate: (data) => request('/api/tools/profile/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  // Экспорт CRM Лидов
  downloadLeads: async (groupId = null, format = 'csv') => {
    const params = new URLSearchParams();
    if (groupId) params.append('group_id', groupId);
    params.append('format', format);
    const res = await fetch(`${BASE_URL}/api/leads/export?${params.toString()}`);
    if (!res.ok) throw new Error('Ошибка экспорта лидов');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Экспорт и очистка взаимок Дайвинчика
  downloadMatches: async (accountPhone = null, format = 'csv') => {
    const params = new URLSearchParams();
    if (accountPhone) params.append('account_phone', accountPhone);
    params.append('format', format);
    const res = await fetch(`${BASE_URL}/api/leads/matches/export?${params.toString()}`);
    if (!res.ok) throw new Error('Ошибка экспорта взаимных симпатий');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matches_export_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  clearMatches: (accountPhone = null) => {
    const params = new URLSearchParams();
    if (accountPhone) params.append('account_phone', accountPhone);
    return request(`/api/leads/matches?${params.toString()}`, { method: 'DELETE' });
  },

  // Регистратор Дайвинчик и фото
  startLeoRegister: (data) => request('/api/tools/leomatch/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  uploadLeoPhotos: (formData) => request('/api/tools/leomatch/photos', { method: 'POST', body: formData }),
  getLeoPhotosCount: () => request('/api/tools/leomatch/photos-count'),
  clearLeoPhotos: () => request('/api/tools/leomatch/photos', { method: 'DELETE' }),

  // Пул аватарок для профилей
  uploadAvatars: (formData) => request('/api/tools/profile/avatars', { method: 'POST', body: formData }),
  getAvatarsCount: () => request('/api/tools/profile/avatars-count'),
  clearAvatars: () => request('/api/tools/profile/avatars', { method: 'DELETE' })
};

