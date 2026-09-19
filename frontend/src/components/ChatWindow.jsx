import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api';

function hashColor(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 8;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDur(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function VideoNotePlayer({ src, duration }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);
  const retryCountRef = useRef(0);

  useEffect(() => {
    setHasError(false);
    setIsLoading(false);
    setIsPlaying(false);
    setProgress(0);
    retryCountRef.current = 0;
  }, [src]);

  // Глобальная остановка других аудио/видео при старте этого плеера
  useEffect(() => {
    const handleGlobalPlay = (e) => {
      if (e.detail?.src !== src && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('tg-media-play', handleGlobalPlay);
    return () => window.removeEventListener('tg-media-play', handleGlobalPlay);
  }, [src]);

  const togglePlay = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;

    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
      return;
    }

    if (hasError) {
      setHasError(false);
      setIsLoading(true);
      retryCountRef.current = 0;
      v.load();
    }

    window.dispatchEvent(new CustomEvent('tg-media-play', { detail: { src } }));
    setIsLoading(true);
    setHasError(false);

    // Воспроизведение со звуком прямо в контексте пользовательского клика
    v.play().then(() => {
      setIsPlaying(true);
      setIsLoading(false);
      setHasError(false);
    }).catch((err) => {
      // Если браузер ещё буферизует видео
      if (err.name === 'AbortError' || err.name === 'NotSupportedError') {
        setIsLoading(true);
      } else if (err.name === 'NotAllowedError') {
        // Если браузер строго заблокировал автовоспроизведение звука
        v.muted = true;
        v.play().then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        }).catch(() => {
          setHasError(true);
          setIsLoading(false);
        });
      } else {
        console.warn('Playback error:', err);
        setHasError(true);
        setIsLoading(false);
      }
    });
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    const dur = (v && v.duration) || duration || 1;
    if (v && dur > 0) {
      setProgress((v.currentTime / dur) * 100);
    }
  };

  const radius = 96;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      onClick={togglePlay}
      style={{
        position: 'relative',
        width: '210px',
        height: '210px',
        borderRadius: '50%',
        cursor: 'pointer',
        backgroundColor: '#0a0a0c',
        margin: '4px auto 8px auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.45)'
      }}
      title="Нажмите для воспроизведения кружочка"
    >
      {/* SVG кольцо прогресса в стиле Telegram */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: 'rotate(-90deg)',
          pointerEvents: 'none',
          zIndex: 4
        }}
      >
        <circle
          cx="105"
          cy="105"
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="4"
        />
        <circle
          cx="105"
          cy="105"
          r={radius}
          fill="transparent"
          stroke="var(--accent, #00a8ff)"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.12s linear' }}
        />
      </svg>

      {/* Контейнер видео */}
      <div
        style={{
          width: '196px',
          height: '196px',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          loop
          onLoadedMetadata={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => {
            setIsPlaying(true);
            setIsLoading(false);
            setHasError(false);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={handleTimeUpdate}
          onError={() => {
            if (retryCountRef.current < 2) {
              retryCountRef.current += 1;
              setTimeout(() => {
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }, 1200);
            } else {
              setIsLoading(false);
              setHasError(true);
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />

        {/* Спиннер ожидания буфера */}
        {isLoading && !hasError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '3px solid rgba(255, 255, 255, 0.25)',
                borderTopColor: 'var(--accent, #00a8ff)',
                animation: 'spin 1s linear infinite'
              }}
            />
          </div>
        )}

        {/* Кнопка воспроизведения (когда на паузе) */}
        {!isPlaying && !isLoading && !hasError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              transition: 'background 0.2s'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent, #00a8ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0, 168, 255, 0.45)'
              }}
            >
              <svg viewBox="0 0 24 24" fill="#fff" style={{ width: '24px', height: '24px', marginLeft: '3px' }}>
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
          </div>
        )}

        {/* Ошибка с возможностью повторить */}
        {hasError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              textAlign: 'center',
              zIndex: 3
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent, #00a8ff)" strokeWidth="2" style={{ width: '28px', height: '28px', marginBottom: '6px' }}>
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>Повторить</span>
          </div>
        )}
      </div>

      {/* Бейдж длительности */}
      {duration ? (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            color: '#fff',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 5,
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          {Math.round(duration)}s
        </div>
      ) : null}
    </div>
  );
}

function VoicePlayer({ src, duration, isOut }) {
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Сброс состояния при смене источника
  useEffect(() => {
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(false);
    setCurTime(0);
  }, [src]);

  // Глобальная остановка других плееров
  useEffect(() => {
    const handleGlobalPlay = (e) => {
      if (e.detail?.src !== src && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('tg-media-play', handleGlobalPlay);
    return () => window.removeEventListener('tg-media-play', handleGlobalPlay);
  }, [src]);

  const togglePlay = (e) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;

    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
      return;
    }

    if (hasError) {
      setHasError(false);
      setIsLoading(true);
      a.load();
    }

    window.dispatchEvent(new CustomEvent('tg-media-play', { detail: { src } }));
    setIsLoading(true);
    setHasError(false);

    a.play().then(() => {
      setIsPlaying(true);
      setIsLoading(false);
    }).catch((err) => {
      if (err.name === 'AbortError') {
        setIsLoading(true);
      } else {
        console.warn('Audio play error:', err);
        setHasError(true);
        setIsLoading(false);
      }
    });
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!barRef.current || !audioRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalW = rect.width;
    const ratio = Math.max(0, Math.min(1, clickX / totalW));
    const totalDur = duration || audioRef.current.duration || 0;
    if (totalDur > 0) {
      audioRef.current.currentTime = ratio * totalDur;
      setCurTime(ratio * totalDur);
    }
  };

  const toggleSpeed = (e) => {
    e.stopPropagation();
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const dur = duration || audioRef.current?.duration || 0;
  const progress = dur > 0 ? (curTime / dur) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 8px',
        minWidth: '240px',
        maxWidth: '300px',
        userSelect: 'none'
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setIsLoading(false)}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
          setHasError(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurTime(0);
        }}
        onTimeUpdate={() => setCurTime(audioRef.current?.currentTime || 0)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />

      {/* Кнопка Play / Pause / Спиннер / Ошибка */}
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          border: 'none',
          background: isOut ? '#fff' : 'var(--accent, #00a8ff)',
          color: isOut ? 'var(--accent, #00a8ff)' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          transition: 'transform 0.1s'
        }}
        title={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isLoading ? (
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: `2px solid ${isOut ? 'rgba(0,168,255,0.3)' : 'rgba(255,255,255,0.3)'}`,
              borderTopColor: isOut ? 'var(--accent, #00a8ff)' : '#fff',
              animation: 'spin 1s linear infinite'
            }}
          />
        ) : hasError ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
            <path d="M23 4v6h-6"></path>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '16px', height: '16px' }}>
            <rect x="6" y="4" width="4" height="16" rx="1"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1"></rect>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '16px', height: '16px', marginLeft: '2px' }}>
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        )}
      </button>

      {/* Таймлайн и длительность */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          ref={barRef}
          onClick={handleSeek}
          style={{
            height: '14px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: '2px'
          }}
          title="Перемотка"
        >
          <div
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              background: isOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: isOut ? '#fff' : 'var(--accent, #00a8ff)',
                borderRadius: '2px',
                transition: 'width 0.1s linear'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', opacity: 0.85 }}>
          <span>{formatDur(curTime)} / {formatDur(dur)}</span>
          <button
            type="button"
            onClick={toggleSpeed}
            style={{
              background: 'transparent',
              border: 'none',
              color: isOut ? '#fff' : 'var(--accent, #00a8ff)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '0 2px',
              opacity: speed === 1 ? 0.7 : 1
            }}
            title="Скорость воспроизведения"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({
  dialog,
  messages,
  isLoading = false,
  onSendMessage,
  onClickButton,
  quickReplies,
  isSoundEnabled = true,
  onToggleSound
}) {
  const [inputText, setInputText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const messagesEndRef = useRef(null);

  const fileInputRef = useRef(null);
  const photoVideoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const vnoteInputRef = useRef(null);
  const voiceInputRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Закрытие меню вложений при клике вне его
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.attach-menu-popover') && !e.target.closest('.attach-btn')) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || !files.length || !dialog) return;
    for (let f of files) {
      const fd = new FormData();
      fd.append('file', f, f.name);
      try {
        await api.sendFile(dialog.account_phone, dialog.chat_id, fd);
      } catch (err) {
        alert(`Ошибка отправки файла: ${err.message}`);
      }
    }
    e.target.value = '';
  };

  const handleVnoteChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !dialog) return;
    const fd = new FormData();
    fd.append('video_file', file, file.name);
    try {
      await api.sendVideoNote(dialog.account_phone, dialog.chat_id, fd);
    } catch (err) {
      alert(`Ошибка отправки видеосообщения: ${err.message}`);
    }
    e.target.value = '';
  };

  const handleVoiceFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !dialog) return;
    const fd = new FormData();
    fd.append('voice_file', file, file.name);
    try {
      await api.sendVoice(dialog.account_phone, dialog.chat_id, fd);
    } catch (err) {
      alert(`Ошибка отправки аудио: ${err.message}`);
    }
    e.target.value = '';
  };

  // Drag-and-drop обработчики
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDragging(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (!dialog) return;
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;

    for (let f of files) {
      const isAudio = f.type.startsWith('audio/') || f.name.toLowerCase().endsWith('.ogg');
      const fd = new FormData();
      try {
        if (isAudio && f.name.toLowerCase().endsWith('.ogg')) {
          fd.append('voice_file', f, f.name);
          await api.sendVoice(dialog.account_phone, dialog.chat_id, fd);
        } else {
          fd.append('file', f, f.name);
          await api.sendFile(dialog.account_phone, dialog.chat_id, fd);
        }
      } catch (err) {
        alert(`Ошибка при отправке файла ${f.name}: ${err.message}`);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        if (dialog && blob.size > 100) {
          const fd = new FormData();
          fd.append('voice_file', blob, 'voice.ogg');
          try {
            await api.sendVoice(dialog.account_phone, dialog.chat_id, fd);
          } catch (err) {
            alert(`Ошибка отправки голосового: ${err.message}`);
          }
        }
      };

      mr.start();
      setIsRecording(true);
      setRecordSec(0);
      timerRef.current = setInterval(() => {
        setRecordSec(s => s + 1);
      }, 1000);
    } catch (err) {
      alert(`Не удалось получить доступ к микрофону: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  if (!dialog) {
    return (
      <section className="panel panel-chat">
        <div className="chat-empty" id="chatEmpty">
          <svg className="svg-ico" viewBox="0 0 24 24" aria-hidden="true" style={{ width: '48px', height: '48px', opacity: 0.3, marginBottom: '12px' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Выберите чат, чтобы открыть переписку</p>
        </div>
      </section>
    );
  }

  const title = dialog.title || dialog.username || 'Чат';
  const colorIdx = hashColor(title);
  const subText = dialog.chat_type === 'channel' ? 'канал' : (dialog.is_online ? 'в сети' : (dialog.username ? `@${dialog.username}` : 'был(а) недавно'));

  return (
    <section
      className="panel panel-chat"
      style={{ position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10, 13, 20, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed var(--accent, #00a8ff)',
            borderRadius: '8px',
            margin: '8px',
            pointerEvents: 'none'
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent, #00a8ff)" strokeWidth="2" style={{ width: '48px', height: '48px', marginBottom: '12px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>Перетащите файлы сюда</div>
          <div style={{ fontSize: '13px', color: 'var(--text-3, #8a96a8)', marginTop: '4px' }}>Файлы, фото или видео будут отправлены собеседнику</div>
        </div>
      )}
      <div className="chat-head">
        <div className={`conv-avatar av av-lg av-${colorIdx}`} style={{ position: 'relative' }}>
          <img
            src={`/api/avatar?account=${encodeURIComponent(dialog.account_phone)}&chat_id=${dialog.chat_id}`}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <span>{(title[0] || '?').toUpperCase()}</span>
        </div>

        <div className="head-text">
          <div className="head-title" id="chatTitle">{title}</div>
          <div className="head-sub" id="chatSub">{subText}</div>
        </div>

        <button
          type="button"
          className="icon-btn"
          title={isSoundEnabled ? "Звуковые уведомления включены (кликните, чтобы отключить)" : "Звуковые уведомления отключены (кликните, чтобы включить)"}
          onClick={onToggleSound}
          style={{ color: isSoundEnabled ? 'var(--accent, #00a8ff)' : 'var(--text-3, #8a96a8)' }}
        >
          {isSoundEnabled ? (
            <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          ) : (
            <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          )}
        </button>
        <button type="button" className="icon-btn" title="Поиск по чату">
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button type="button" className="icon-btn" title="Обновить переписку">
          <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>

      <div className="messages" id="messages">
        {isLoading && messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'var(--text-3, #8a96a8)', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent, #00a8ff)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
            <span style={{ fontSize: '13px' }}>Загрузка переписки...</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'var(--text-3, #8a96a8)', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Нет сообщений</span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>Отправьте сообщение или дождитесь ответа собеседника</span>
          </div>
        ) : (
          messages.map((m, idx) => {
          const isOut = Boolean(m.is_outgoing);
          const isRoundVideo = m.media_type === 'video_note';
          const isVoice = m.media_type === 'voice';
          const isAudio = m.media_type === 'audio';
          const isPhoto = m.media_type === 'photo';
          const isVideo = m.media_type === 'video';
          const isDoc = m.media_type === 'document';
          const isSticker = m.media_type === 'sticker';
          const msgId = m.message_id || m.id;
          const mediaUrl = `/api/media/${encodeURIComponent(dialog.account_phone)}/${dialog.chat_id}/${msgId}`;
          const thumbUrl = `${mediaUrl}?thumb=1`;

          return (
            <div key={msgId || idx} className={`msg ${isOut ? 'msg-out' : 'msg-in'}`}>
              <div className="msg-bubble">
                {isRoundVideo ? (
                  <VideoNotePlayer key={msgId} src={mediaUrl} duration={m.media_metadata?.duration} />
                ) : (isVoice || isAudio) ? (
                  <VoicePlayer src={mediaUrl} duration={m.media_metadata?.duration} isOut={isOut} />
                ) : isPhoto ? (
                  <div style={{ marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', maxWidth: '320px', background: 'rgba(0,0,0,0.2)' }}>
                    <img
                      src={thumbUrl}
                      alt="Фото"
                      style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', display: 'block', cursor: 'pointer', borderRadius: '8px' }}
                      onClick={() => window.open(mediaUrl, '_blank')}
                      loading="lazy"
                    />
                    {m.text && <div className="msg-text" style={{ padding: '4px 2px 0' }}>{m.text}</div>}
                  </div>
                ) : isVideo ? (
                  <div style={{ marginBottom: '6px', borderRadius: '8px', overflow: 'hidden', maxWidth: '320px', background: '#000' }}>
                    <video src={mediaUrl} controls playsInline preload="none" style={{ width: '100%', maxHeight: '300px', display: 'block' }} />
                    {m.text && <div className="msg-text" style={{ padding: '4px 2px 0' }}>{m.text}</div>}
                  </div>
                ) : isSticker ? (
                  <div style={{ padding: '4px', maxWidth: '160px', display: 'flex', justifyContent: 'center' }}>
                    <img
                      src={thumbUrl}
                      alt={m.media_metadata?.alt || 'Стикер'}
                      style={{ maxWidth: '160px', maxHeight: '160px', objectFit: 'contain', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                ) : isDoc ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px' }}>
                    <a
                      href={mediaUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'inherit',
                        textDecoration: 'none'
                      }}
                    >
                      <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{m.media_metadata?.name || 'Документ'}</div>
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>Скачать файл</div>
                      </div>
                    </a>
                  </div>
                ) : (
                  <div className="msg-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.text}
                  </div>
                )}

                {/* Инлайн-кнопки бота */}
                {m.buttons && m.buttons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    {m.buttons.map((row, rIdx) => (
                      <div key={rIdx} style={{ display: 'flex', gap: '4px' }}>
                        {row.map((b, bIdx) => (
                          <button
                            key={bIdx}
                            type="button"
                            onClick={() => {
                              if (b.url) {
                                window.open(b.url, '_blank');
                              } else if (b.data) {
                                onClickButton(msgId, b.data);
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.1)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            {b.text}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div className="msg-time" style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                  <span>{formatTime(m.date)}</span>
                  {isOut && (
                    Boolean(m.is_read) ? (
                      <span className="ticks ticks-read" style={{ color: '#00a8ff', fontSize: '13px', fontWeight: 'bold' }} title="Прочитано">✓✓</span>
                    ) : (
                      <span className="ticks" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }} title="Отправлено">✓</span>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        }))}
        <div ref={messagesEndRef} />
      </div>

      {/* Быстрые ответы (поповер) */}
      {showQuickReplies && (
        <div className="quick-replies-popover" style={{ position: 'absolute', bottom: '70px', left: '20px', right: '20px', zIndex: 50 }}>
          <div className="qr-header">
            <div className="qr-tabs">
              <button type="button" className="qr-tab active">💬 Шаблоны</button>
            </div>
            <button type="button" className="icon-btn qr-add-btn" onClick={() => setShowQuickReplies(false)}>
              ✕
            </button>
          </div>
          <div className="qr-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {quickReplies.map(qr => (
              <div
                key={qr.id}
                className="qr-item"
                onClick={() => {
                  setInputText(qr.content_text);
                  setShowQuickReplies(false);
                }}
              >
                <div className="qr-item-title">{qr.title}</div>
                <div className="qr-item-text">{qr.content_text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Скрытые файловые инпуты */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple
      />
      <input
        type="file"
        ref={photoVideoInputRef}
        accept="image/*,video/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple
      />
      <input
        type="file"
        ref={docInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple
      />
      <input
        type="file"
        ref={vnoteInputRef}
        accept="video/*"
        onChange={handleVnoteChange}
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={voiceInputRef}
        accept="audio/*"
        onChange={handleVoiceFileChange}
        style={{ display: 'none' }}
      />

      {/* Поповер меню прикрепления */}
      {showAttachMenu && (
        <div
          className="attach-menu-popover"
          style={{
            position: 'absolute',
            bottom: '70px',
            left: '16px',
            background: '#161b26',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(12px)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            zIndex: 60,
            minWidth: '220px'
          }}
        >
          <button
            type="button"
            className="attach-menu-item"
            onClick={() => { setShowAttachMenu(false); photoVideoInputRef.current?.click(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>📷</span>
            <span>Фото или видео</span>
          </button>
          <button
            type="button"
            className="attach-menu-item"
            onClick={() => { setShowAttachMenu(false); docInputRef.current?.click(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>📄</span>
            <span>Файл / Документ</span>
          </button>
          <button
            type="button"
            className="attach-menu-item"
            onClick={() => { setShowAttachMenu(false); vnoteInputRef.current?.click(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>📹</span>
            <span>Видеосообщение (кружок)</span>
          </button>
          <button
            type="button"
            className="attach-menu-item"
            onClick={() => { setShowAttachMenu(false); voiceInputRef.current?.click(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>🎙️</span>
            <span>Голосовое из файла</span>
          </button>
        </div>
      )}

      {/* Форма ввода сообщения */}
      <form className="composer" onSubmit={handleSend}>
        {isRecording ? (
          <div className="composer-box" style={{ background: 'rgba(255, 71, 87, 0.1)', borderColor: 'rgba(255, 71, 87, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '0 8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff4757', boxShadow: '0 0 10px #ff4757', animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>Запись голосового…</span>
              <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  if (mediaRecorderRef.current) {
                    mediaRecorderRef.current.stop();
                    setIsRecording(false);
                    clearInterval(timerRef.current);
                    audioChunksRef.current = []; // отмена
                  }
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ padding: '4px 12px', fontSize: '12px' }}
                onClick={stopRecording}
              >
                Отправить
              </button>
            </div>
          </div>
        ) : (
          <div className="composer-box">
            <button
              type="button"
              className="attach-btn"
              title="Прикрепить (фото, видео, документ, кружок, аудио)"
              onClick={() => setShowAttachMenu(prev => !prev)}
            >
              <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            <textarea
              id="composerInput"
              rows="1"
              placeholder="Написать сообщение…"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
            ></textarea>

            <button
              type="button"
              className="quick-btn"
              title="Заготовки и скрипты (быстрые ответы)"
              onClick={() => setShowQuickReplies(!showQuickReplies)}
            >
              <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </button>

            <button type="button" className="smile-btn" title="Смайлы и эмодзи">
              <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
              </svg>
            </button>

            <button
              type="button"
              className="vnote-btn"
              title="Отправить видеосообщение (кружок)"
              onClick={() => vnoteInputRef.current?.click()}
            >
              <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>

            <button
              type="button"
              className="mic-btn"
              title="Записать голосовое"
              onClick={startRecording}
            >
              <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
              </svg>
            </button>

            {inputText.trim() && (
              <button type="submit" className="send-btn" title="Отправить" style={{ display: 'flex' }}>
                <svg className="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
