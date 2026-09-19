/**
 * Утилита звуковых уведомлений для Telegram Farm CRM.
 * 
 * Особенности:
 * - Singleton AudioContext (предотвращает утечки и блокировки в Chrome/Edge).
 * - Master DynamicsCompressorNode (гарантирует отсутствие перегрузки, клиппинга и громких хлопков).
 * - Smooth Attack & Decay Envelope (исключает щелчки постоянного тока DC-offset).
 * - Rate Limiter / Cooldown (дросселирование: не чаще 1 звука раз в 1.4 секунды, предотвращает наложение звуков при спаме).
 */

let sharedAudioCtx = null;
let masterCompressor = null;
let masterGain = null;
let lastPlayTimestamp = 0;

const COOLDOWN_MS = 1400; // Минимальный интервал между звуками уведомлений
const DEFAULT_VOLUME = 0.45; // Сбалансированная комфортная громкость

function getSavedVolume() {
  const saved = localStorage.getItem('tgfarm_sound_volume');
  if (saved !== null) {
    const val = parseFloat(saved);
    if (!isNaN(val) && val >= 0 && val <= 1) return val;
  }
  return DEFAULT_VOLUME;
}

function initAudioContext() {
  if (sharedAudioCtx) return sharedAudioCtx;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    sharedAudioCtx = new AudioCtx();

    // 1. Динамический компрессор (Limiter / Compressor)
    // Предотвращает перегрузку акустического тракта и клиппинг при любых условиях
    masterCompressor = sharedAudioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-14, sharedAudioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(10, sharedAudioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(16, sharedAudioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, sharedAudioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.22, sharedAudioCtx.currentTime);

    // 2. Мастер-регулятор громкости
    masterGain = sharedAudioCtx.createGain();
    masterGain.gain.setValueAtTime(getSavedVolume(), sharedAudioCtx.currentTime);

    // Цепочка: Oscillator -> Gain ноты -> Compressor -> MasterGain -> Destination (динамики)
    masterCompressor.connect(masterGain);
    masterGain.connect(sharedAudioCtx.destination);
  } catch (err) {
    console.warn('AudioContext init error:', err);
  }

  return sharedAudioCtx;
}

/**
 * Воспроизводит мягкий двухтоновый колокольчик в стиле Telegram.
 * @param {boolean} force - Если true, игнорирует кулдаун (для превью при переключении кнопки)
 */
export function playNotificationSound(force = false) {
  if (!force && typeof window !== 'undefined' && localStorage.getItem('tgfarm_sound') === 'false') {
    return;
  }
  const now = Date.now();
  if (!force && (now - lastPlayTimestamp < COOLDOWN_MS)) {
    return; // Защита от спама и сложения волн
  }
  lastPlayTimestamp = now;

  const ctx = initAudioContext();
  if (!ctx || !masterCompressor) return;

  // Если браузер усыпил контекст — пробуждаем
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const t0 = ctx.currentTime;

    // Нота 1: Теплый мягкий перезвон (G5 ~ 784 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, t0);
    osc1.frequency.exponentialRampToValueAtTime(880, t0 + 0.06);

    // Мягкая атака (без щелчка) и плавное затухание
    gain1.gain.setValueAtTime(0.0001, t0);
    gain1.gain.linearRampToValueAtTime(0.18, t0 + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

    osc1.connect(gain1);
    gain1.connect(masterCompressor);

    osc1.start(t0);
    osc1.stop(t0 + 0.16);

    // Нота 2: Фирменный отзвук Telegram (C6 ~ 1046.5 Hz)
    const t1 = t0 + 0.065;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, t1);

    // Гармонический обертон для бархатистого колокольного тембра
    const osc2Sub = ctx.createOscillator();
    const gain2Sub = ctx.createGain();
    osc2Sub.type = 'sine';
    osc2Sub.frequency.setValueAtTime(1318.51, t1); // E6

    gain2.gain.setValueAtTime(0.0001, t1);
    gain2.gain.linearRampToValueAtTime(0.24, t1 + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.38);

    gain2Sub.gain.setValueAtTime(0.0001, t1);
    gain2Sub.gain.linearRampToValueAtTime(0.06, t1 + 0.015);
    gain2Sub.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.28);

    osc2.connect(gain2);
    gain2.connect(masterCompressor);

    osc2Sub.connect(gain2Sub);
    gain2Sub.connect(masterCompressor);

    osc2.start(t1);
    osc2.stop(t1 + 0.38);

    osc2Sub.start(t1);
    osc2Sub.stop(t1 + 0.38);
  } catch (err) {
    console.warn('Error playing chime:', err);
  }
}

/**
 * Установка громкости (0.0 ... 1.0)
 */
export function setNotificationVolume(val) {
  const clamped = Math.max(0, Math.min(1, parseFloat(val) || 0));
  localStorage.setItem('tgfarm_sound_volume', clamped.toString());
  if (masterGain && sharedAudioCtx) {
    masterGain.gain.setValueAtTime(clamped, sharedAudioCtx.currentTime);
  }
}

export function getNotificationVolume() {
  return getSavedVolume();
}
