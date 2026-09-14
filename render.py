import re
from html import escape
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from fastapi.responses import HTMLResponse
from utils import DELIVERY_NAMES


# --- Иконки (feather, одно семейство, stroke 1.8) ------------------------------
SVG_PHONE = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
SVG_IMAGE = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
SVG_FILE = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
SVG_MIC = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'
SVG_VIDEO = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
SVG_PLAY = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
SVG_PAUSE = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
SVG_PIN = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
SVG_USER = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
SVG_MUSIC = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
SVG_SMILE = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
SVG_ARROW_LEFT = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>'
SVG_USER_PLUS = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>'
SVG_UPLOAD = '<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'

# ==============================================================================
# 1. АВТОРИЗАЦИЯ (Формы и страницы входа)
# ==============================================================================

def auth_page(title, subtitle, body, status=200):
    return HTMLResponse(f"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} — Telegram Farm</title>
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
<div class="auth-wrap">
    <div class="auth-card">
        <div class="auth-head">
            <div class="auth-title">{title}</div>
            <div class="auth-sub">{subtitle}</div>
        </div>
        <div class="auth-body">
            {body}
            <div class="divider"></div>
            <a class="btn btn-light btn-block" href="/">← Вернуться на главную</a>
        </div>
    </div>
</div>
</body>
</html>
    """, status_code=status)

def error_page(message, status_code=400, title="Ошибка"):
    return auth_page(title, "Что-то пошло не так", f'<div class="alert alert-error">{escape(message)}</div>', status=status_code)

def password_form(phone_number, error: str = ""):
    error_html = f'<div class="alert alert-error" style="margin-bottom: 12px;">{escape(error)}</div>' if error else ""
    return auth_page(
        "Двухэтапная проверка",
        "В аккаунте включен облачный пароль",
        f"""
        {error_html}
        <form action="/check_password/" method="post">
            <input type="hidden" name="phone_number" value="{escape(phone_number)}">
            <label class="field">
                <span>Пароль (2FA)</span>
                <input type="password" name="password" placeholder="Введите облачный пароль" required>
            </label>
            <button class="btn btn-primary btn-block" type="submit">Продолжить</button>
        </form>
        """,
    )

def login_page(error: str = ""):
    error_html = f'<div class="alert alert-error">{escape(error)}</div>' if error else ""
    return HTMLResponse(f"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Вход — Telegram Farm</title>
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
<div class="auth-wrap">
    <div class="auth-card">
        <div class="auth-head">
            <div class="auth-title">Telegram Farm</div>
            <div class="auth-sub">Введите пароль администратора</div>
        </div>
        <div class="auth-body">
            {error_html}
            <form action="/login" method="post">
                <label class="field">
                    <span>Пароль</span>
                    <input type="password" name="password" placeholder="Пароль" required autofocus>
                </label>
                <button class="btn btn-primary btn-block" type="submit">Войти</button>
            </form>
        </div>
    </div>
</div>
</body>
</html>
    """)

def code_form(phone_number: str, sent_code, notice: str = ""):
    delivery = DELIVERY_NAMES.get(sent_code.type.name, sent_code.type.name)
    next_delivery = (
        DELIVERY_NAMES.get(sent_code.next_type.name, sent_code.next_type.name)
        if sent_code.next_type else None
    )
    timeout = sent_code.timeout or 0

    notice_html = ""
    if notice:
        notice_html = f'<div class="alert alert-warn">{escape(notice)}</div>'

    resend_btn = ""
    if next_delivery:
        resend_btn = f"""
            <p class="small" style="margin-bottom:8px;">Доступен другой способ: <b>{escape(next_delivery)}</b> (через {timeout} сек.)</p>
            <form action="/resend_code" method="post" style="margin-bottom:8px;">
                <input type="hidden" name="phone_number" value="{escape(phone_number)}">
                <button class="btn btn-ghost btn-block" type="submit">Отправить другим способом</button>
            </form>
        """
    else:
        resend_btn = f"""
            <form action="/resend_code" method="post" style="margin-bottom:8px;">
                <input type="hidden" name="phone_number" value="{escape(phone_number)}">
                <button class="btn btn-ghost btn-block" type="submit">Отправить код ещё раз</button>
            </form>
        """

    return HTMLResponse(f"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Вход — Telegram Farm</title>
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
<div class="auth-wrap">
    <div class="auth-card">
        <div class="auth-head">
            <div class="auth-title">Подтверждение входа</div>
            <div class="auth-sub">Введите код, полученный в Telegram</div>
        </div>
        <div class="auth-body">
            {notice_html}
            <div class="auth-phone">{SVG_PHONE} <span>{escape(phone_number)}</span></div>
            <div class="delivery-chip"><span class="dot"></span> Способ доставки: <b>{escape(delivery)}</b></div>

            <form action="/sign_in" method="post">
            <input type="hidden" name="phone_number" value="{escape(phone_number)}">
                <label class="field">
                    <span>Код подтверждения</span>
                    <input class="code-input" type="text" name="phone_code" inputmode="numeric"
                           autocomplete="one-time-code" maxlength="6" placeholder="• • • • • •" required>
                </label>
                <button class="btn btn-primary btn-block" type="submit">Войти</button>
            </form>

            <div class="divider"></div>
            {resend_btn}
            <a class="btn btn-light btn-block" href="/">← Вернуться на главную</a>
        </div>
    </div>
</div>
</body>
</html>
    """)

# ==============================================================================
# 2. МЕДИА И ЧАТЫ (Рендеринг интерфейса сообщений)
# ==============================================================================

MONTHS_RU = ["января", "февраля", "марта", "апреля", "мая", "июня",
             "июля", "августа", "сентября", "октября", "ноября", "декабря"]

def _local_dt(dt):
    # Pyrogram уже отдает правильное время, не нужно прибавлять часовой пояс дважды
    return dt

def _hhmm(dt):
    return _local_dt(dt).strftime("%H:%M")

def _date_label(dt):
    d = _local_dt(dt).date()
    now = datetime.now().date()
    if d == now:
        return "Сегодня"
    if d == now - timedelta(days=1):
        return "Вчера"
    if d.year == now.year:
        return f"{d.day} {MONTHS_RU[d.month - 1]}"
    return f"{d.day} {MONTHS_RU[d.month - 1]} {d.year}"

def _list_time(dt):
    d = _local_dt(dt).date()
    now = datetime.now().date()
    if d == now:
        return _hhmm(dt)
    if d == now - timedelta(days=1):
        return "Вчера"
    if d.year == now.year:
        return f"{d.day}.{d.month:02d}"
    return f"{d.day}.{d.month:02d}.{d.year}"

def _fmt_duration(seconds):
    seconds = int(seconds or 0)
    m, s = divmod(seconds, 60)
    return f"{m}:{s:02d}"

def _fmt_size(num):
    num = num or 0
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if num < 1024 or unit == "ГБ":
            return (f"{num:.0f} {unit}" if unit == "Б" else f"{num:.1f} {unit}")
        num /= 1024
    return f"{num:.1f} ГБ"

def _hidden_media_badge(m):
    if getattr(m, "ttl_seconds", None):
        return "🔥 Исчезающее фото/видео (доступно только в приложении Telegram)"
    if getattr(m, "story", None):
        return "📖 История (Story)"
    return "Скрытое вложение (доступно только в приложении Telegram)"


def _parse_markdown(text):
    escaped = escape(str(text))
    escaped = re.sub(r'(https?://[^\s]+)', r'<a href="\1" target="_blank" class="text-link">\1</a>', escaped)
    escaped = re.sub(r'\*\*(.+?)\*\*', r'<b class="text-bold">\1</b>', escaped)
    escaped = re.sub(r'__(.+?)__', r'<i class="text-italic">\1</i>', escaped)
    escaped = re.sub(r'`([^`\n]+)`', r'<code class="text-code">\1</code>', escaped)
    escaped = re.sub(r'\|\|(.+?)\|\|', r'<span class="text-spoiler">\1</span>', escaped)
    escaped = re.sub(r'(?<!\w)@([a-zA-Z0-9_]+)', r'<span class="text-cyan text-glow-cyan">@\1</span>', escaped)
    escaped = re.sub(r'(?<!\w)#([a-zA-Z0-9_а-яА-ЯёЁ]+)', r'<span class="text-purple text-glow-purple">#\1</span>', escaped)
    return escaped

def _media_label(m):
    if not m:
        return ""
    caption = getattr(m, "caption", None)
    if getattr(m, "photo", None):
        return f"📷 {caption}" if caption else "📷 Фото"
    if getattr(m, "video", None):
        return f"📹 {caption}" if caption else "📹 Видео"
    if getattr(m, "voice", None):
        return "🎤 Голосовое сообщение"
    if getattr(m, "video_note", None):
        return "📹 Видеосообщение"
    if getattr(m, "sticker", None):
        emoji = getattr(m.sticker, "emoji", "")
        return f"Стикер {emoji}" if emoji else "Стикер"
    if getattr(m, "animation", None):
        return f"GIF {caption}" if caption else "GIF"
    if getattr(m, "audio", None):
        title = getattr(m.audio, "title", None) or getattr(m.audio, "file_name", None)
        return f"🎵 {title}" if title else "🎵 Аудио"
    if getattr(m, "document", None):
        name = getattr(m.document, "file_name", None)
        return f"📎 {name}" if name else "📎 Документ"
    if getattr(m, "contact", None):
        name = f"{getattr(m.contact, 'first_name', '')} {getattr(m.contact, 'last_name', '')}".strip()
        return f"👤 Контакт {name}".strip()
    if getattr(m, "location", None):
        return "📍 Локация"
    if getattr(m, "poll", None):
        question = getattr(m.poll, "question", "")
        return f"📊 Опрос: {question}" if question else "📊 Опрос"
    if getattr(m, "venue", None):
        return "📍 Место"
    if getattr(m, "game", None):
        return "🎮 Игра"
    if getattr(m, "invoice", None):
        return "🧾 Счёт"
    if getattr(m, "story", None):
        return "История (Story)"
    if getattr(m, "text", None):
        return str(m.text)
    if caption:
        return str(caption)
    return _hidden_media_badge(m)



def _voice_waveform_html(voice_obj):
    wf = getattr(voice_obj, "waveform", None)
    bars = []
    if wf and isinstance(wf, (bytes, bytearray)) and len(wf) >= 5:
        step = max(1, len(wf) // 30)
        for i in range(0, min(len(wf), 30 * step), step):
            val = wf[i]
            h = max(4, min(24, int((val / 31.0) * 24)))
            bars.append(h)
    else:
        pattern = [4, 8, 14, 18, 22, 16, 12, 20, 24, 18, 14, 8, 12, 16, 22, 24, 19, 15, 10, 14, 18, 20, 16, 12, 8, 14, 18, 12, 8, 5]
        bars = pattern
    
    bars_html = "".join(f'<span class="vbar" style="height:{h}px;"></span>' for h in bars[:30])
    return f'<div class="voice-wave">{bars_html}<div class="voice-wave-progress"></div></div>'


def _inline_keyboard_html(m):
    rm = getattr(m, "reply_markup", None)
    if not rm or not getattr(rm, "inline_keyboard", None):
        return ""
    
    rows_html = []
    for row in rm.inline_keyboard:
        btns_html = []
        for btn in row:
            text = escape(str(getattr(btn, "text", "") or ""))
            url = getattr(btn, "url", None)
            web_app = getattr(btn, "web_app", None)
            cb = getattr(btn, "callback_data", None)
            switch_inline = getattr(btn, "switch_inline_query_current_chat", None)

            if url:
                btns_html.append(
                    f'<a href="{escape(url)}" target="_blank" rel="noopener noreferrer" class="inline-kb-btn inline-kb-link">'
                    f'<span>{text}</span> <span class="kb-icon">↗</span></a>'
                )
            elif web_app and getattr(web_app, "url", None):
                btns_html.append(
                    f'<a href="{escape(web_app.url)}" target="_blank" rel="noopener noreferrer" class="inline-kb-btn inline-kb-webapp">'
                    f'<span>{text}</span> <span class="kb-icon">⊞</span></a>'
                )
            elif cb is not None:
                if isinstance(cb, bytes):
                    cb = cb.decode("latin1", errors="ignore")
                cb_encoded = quote(str(cb))
                btns_html.append(
                    f'<button type="button" class="inline-kb-btn inline-kb-callback" data-action="callback" data-msg-id="{m.id}" data-cb="{cb_encoded}">'
                    f'<span>{text}</span></button>'
                )
            elif switch_inline is not None:
                q_val = quote(str(switch_inline))
                btns_html.append(
                    f'<button type="button" class="inline-kb-btn inline-kb-switch" data-action="switch_inline" data-query="{q_val}">'
                    f'<span>{text}</span></button>'
                )
            else:
                btns_html.append(f'<button type="button" class="inline-kb-btn"><span>{text}</span></button>')

        if btns_html:
            rows_html.append(f'<div class="inline-kb-row">{"".join(btns_html)}</div>')

    if not rows_html:
        return ""
    return f'<div class="msg-inline-keyboard" data-msg-id="{m.id}">{"".join(rows_html)}</div>'


def _media_caption(m):
    if not getattr(m, "caption", None):
        return ""
    escaped = _parse_markdown(m.caption)
    return f'<span class="bubble-caption">{escaped}</span>'

def _media_html(m, account, chat_id):
    from urllib.parse import quote
    url = f"/api/media?account={quote(str(account))}&chat_id={chat_id}&message_id={m.id}&kind="
    cap_text = escape(str(getattr(m, "caption", "") or ""))

    if m.sticker:
        if getattr(m.sticker, "is_video", False):
            return f'<video class="bubble-gif" src="{url}sticker" autoplay loop muted playsinline></video>'
        if getattr(m.sticker, "is_animated", False):
            return f'<span class="media-line"><span class="media-ico">{SVG_SMILE}</span><span class="media-text">Анимированный стикер</span></span>'
        return f'<img class="bubble-sticker" src="{url}sticker" alt="Стикер" loading="lazy">'
    
    if m.photo:
        return (
            f'<div class="bubble-media media-preview-trigger" data-type="photo" data-src="{url}photo" data-msg-id="{m.id}" data-caption="{cap_text}">'
            f'<img class="bubble-img" src="{url}photo" alt="Фотография" loading="lazy">'
            f'</div>'
            f'{_media_caption(m)}'
        )
    
    if m.video:
        dur = _fmt_duration(getattr(m.video, "duration", 0))
        return (
            f'<div class="bubble-media bubble-video-wrap media-preview-trigger" data-type="video" data-src="{url}video" data-msg-id="{m.id}" data-caption="{cap_text}">'
            f'<video class="bubble-video" src="{url}video" preload="metadata" playsinline></video>'
            f'<div class="video-overlay-play"><span class="v-play-ico">{SVG_PLAY}</span><span class="v-dur-badge">{dur}</span></div>'
            f'</div>'
            f'{_media_caption(m)}'
        )
    
    if m.video_note:
        dur = int(getattr(m.video_note, "duration", 0) or 0)
        dur_label = _fmt_duration(dur)
        return (
            f'<div class="vnote-wrap" data-msg-id="{m.id}">'
            f'<div class="vnote-circle">'
            f'<video class="bubble-video-note" src="{url}video_note" preload="metadata" playsinline muted></video>'
            f'<svg class="vnote-progress-ring" viewBox="0 0 100 100">'
            f'<circle class="vnote-ring-bg" cx="50" cy="50" r="46"/>'
            f'<circle class="vnote-ring-bar" cx="50" cy="50" r="46"/>'
            f'</svg>'
            f'<div class="vnote-center-badge">'
            f'<span class="vnote-icon-play">{SVG_PLAY}</span>'
            f'<span class="vnote-icon-pause">{SVG_PAUSE}</span>'
            f'</div>'
            f'<button type="button" class="btn-save-qr vnote-save-qr-btn" data-msg-id="{m.id}" data-type="video_note" data-dur="{dur}" title="Сохранить кружок в скрипты">'
            f'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>'
            f'</button>'
            f'<button type="button" class="vnote-expand-btn media-preview-trigger" data-type="video" data-src="{url}video_note" data-msg-id="{m.id}" title="Во весь экран">'
            f'<svg class="svg-ico-xs" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
            f'</button>'
            f'</div>'
            f'<div class="vnote-time-badge">{dur_label}</div>'
            f'</div>'
        )
    
    if m.voice:
        dur = int(getattr(m.voice, "duration", 0) or 0)
        dur_label = _fmt_duration(dur)
        wf_html = _voice_waveform_html(m.voice)
        return (
            f'<div class="voice tg-voice" data-url="{url}voice" data-dur="{dur}">'
            f'<button class="voice-btn" type="button" aria-label="Воспроизвести">'
            f'<span class="play-i">{SVG_PLAY}</span><span class="pause-i">{SVG_PAUSE}</span></button>'
            f'<div class="voice-body">'
            f'<div class="voice-track-wrap">{wf_html}</div>'
            f'<div class="voice-meta">'
            f'<span class="voice-time">{dur_label}</span>'
            f'<button type="button" class="voice-speed-btn" title="Скорость воспроизведения">1X</button>'
            f'<button type="button" class="btn-save-qr voice-save-qr-btn" data-msg-id="{m.id}" data-type="voice" data-dur="{dur}" title="Сохранить в скрипты">'
            f'<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>'
            f'<span>В скрипты</span></button>'
            f'</div></div></div>'
        )
    
    if m.audio:
        title = m.audio.title or m.audio.file_name or "Аудиозапись"
        dur = getattr(m.audio, "duration", 0)
        return (
            f'<span class="media-line"><span class="media-ico">{SVG_MUSIC}</span>'
            f'<span class="media-text">{escape(title)}</span></span>'
            f'<audio class="bubble-audio" src="{url}audio" controls preload="none"></audio>'
        )
    
    if m.animation:
        return (
            f'<div class="bubble-media bubble-gif-wrap media-preview-trigger" data-type="video" data-src="{url}animation" data-msg-id="{m.id}" data-caption="{cap_text}">'
            f'<video class="bubble-gif" src="{url}animation" autoplay loop muted playsinline></video>'
            f'<span class="gif-tag-badge">GIF</span>'
            f'</div>'
            f'{_media_caption(m)}'
        )
    
    if m.document:
        name = m.document.file_name or "Документ"
        return (
            f'<a class="bubble-doc" href="{url}document&download=1" download target="_blank" rel="noopener">'
            f'<span class="media-ico">{SVG_FILE}</span>'
            f'<span class="doc-meta"><span class="doc-name">{escape(name)}</span>'
            f'</span></a>'
            f'{_media_caption(m)}'
        )
    if getattr(m, "poll", None):
        p = m.poll
        opts = "".join(f'<div class="poll-opt">○ {escape(opt.text)}</div>' for opt in (p.options or []))
        return f'<div class="bubble-poll"><div class="poll-question">📊 {escape(p.question)}</div>{opts}</div>'
    if getattr(m, "web_page", None):
        wp = m.web_page
        wp_title = wp.title or wp.site_name or wp.url or "Веб-страница"
        wp_desc = (wp.description or "")[:150]
        wp_img = f'<img class="webpage-thumb" src="{url}web_page" loading="lazy">' if getattr(wp, "photo", None) else ""
        txt = _parse_markdown(m.text or "")
        return (
            f'{txt}'
            f'<a class="msg-webpage" href="{escape(wp.url or "#")}" target="_blank" rel="noopener">'
            f'<div class="webpage-site">{escape(wp.site_name or "Web")}</div>'
            f'<div class="webpage-title">{escape(wp_title)}</div>'
            f'<div class="webpage-desc">{escape(wp_desc)}</div>'
            f'{wp_img}</a>'
        )
    if m.location:
        return f'<span class="media-line"><span class="media-ico">{SVG_PIN}</span><span class="media-text">Местоположение</span></span>'
    if m.contact:
        name = m.contact.first_name or "Контакт"
        phone = m.contact.phone_number or ""
        return f'<span class="media-line"><span class="media-ico">{SVG_USER}</span><span class="media-text">Контакт - {escape(name)} {escape(phone)}</span></span>'
    if m.text:
        return _parse_markdown(m.text)
    badge = _hidden_media_badge(m)
    return f'<span class="media-line"><span class="media-ico">{SVG_FILE}</span><span class="media-text">{escape(badge)}</span></span>'


def _chat_subtitle(chat):
    if getattr(chat, "description", None):
        desc = " ".join(chat.description.strip().split())
        return desc if len(desc) <= 70 else desc[:70] + "…"
    members = getattr(chat, "members_count", None)
    if members:
        return f"{members} участников"
    if getattr(chat, "username", None):
        return f"@{chat.username}"
    return "переписка"

def _render_album_html(msgs, is_group, account, chat_id, read_outbox_max_id=0):
    last = msgs[-1]
    side = "out" if last.outgoing else "in"
    date_label = _date_label(last.date)
    ts = int(last.date.timestamp())
    if last.outgoing:
        if read_outbox_max_id and last.id <= read_outbox_max_id:
            ticks = '<span class="ticks ticks-read" title="Прочитано">✓✓</span>'
        else:
            ticks = '<span class="ticks ticks-sent" title="Отправлено">✓</span>'
    else:
        ticks = ""

    meta_extra = ""
    views = getattr(last, "views", None)
    if views is not None:
        v_str = f"{views/1000:.1f}k" if views >= 1000 else str(views)
        meta_extra += f'<span class="msg-views" title="Просмотры: {views}"><svg class="svg-ico-xs" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> {v_str}</span>'
    forwards = getattr(last, "forwards", None)
    if forwards:
        meta_extra += f'<span class="msg-forwards" title="Пересылки: {forwards}"><svg class="svg-ico-xs" viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg> {forwards}</span>'
    sig = getattr(last, "author_signature", None)
    if sig:
        meta_extra += f'<span class="msg-sig">{escape(sig)}</span>'

    time_html = f'{meta_extra}<span class="msg-clock">{_hhmm(last.date)}</span>{ticks}'

    sender_attr = ""
    sender_html = ""
    if side == "in" and is_group and getattr(last, "from_user", None):
        u = last.from_user
        name = ((u.first_name or "").strip() or "Пользователь")
        if u.last_name:
            name += " " + u.last_name
        sender_attr = f' data-sender="{u.id}"'
        sender_html = f'<div class="msg-sender sender-c{abs(u.id) % 8}">{escape(name)}</div>'

    items = []
    for m in msgs:
        u = f"/api/media?account={quote(str(account))}&chat_id={chat_id}&message_id={m.id}&kind="
        m_cap = escape(str(getattr(m, "caption", "") or ""))
        if m.photo:
            items.append(
                f'<div class="album-item media-preview-trigger" data-type="photo" data-src="{u}photo" data-msg-id="{m.id}" data-caption="{m_cap}">'
                f'<img class="album-img" src="{u}photo" alt="" loading="lazy"></div>'
            )
        elif m.video:
            dur = _fmt_duration(getattr(m.video, "duration", 0))
            items.append(
                f'<div class="album-item album-video media-preview-trigger" data-type="video" data-src="{u}video" data-msg-id="{m.id}" data-caption="{m_cap}">'
                f'<video class="album-img" src="{u}video" data-src="{u}video" preload="metadata" playsinline></video>'
                f'<span class="album-play">{SVG_PLAY}</span><span class="album-vdur">{dur}</span></div>'
            )

    n = len(items)
    grid_class = "album-c1" if n <= 1 else ("album-c2" if n <= 4 else "album-c3")

    caption = ""
    for m in reversed(msgs):
        if getattr(m, "caption", None):
            caption = f'<span class="bubble-caption">{escape(str(m.caption))}</span>'
            break

    quick_react = (
        f'<button class="msg-quick-react-btn" type="button" title="Реакция" data-msg-id="{last.id}">'
        f'<svg class="svg-ico-mini" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
        f'</button>'
    )

    reactions_html = ""
    if getattr(last, 'reactions', None) and getattr(last.reactions, 'reactions', None):
        reactions_html = '<div class="msg-reactions">'
        for r in last.reactions.reactions:
            chosen_class = " chosen" if getattr(r, "chosen", False) else ""
            emoji = getattr(r, "emoji", "")
            if not emoji and getattr(r, "custom_emoji_id", None):
                emoji = "❤️"
            if emoji:
                reactions_html += f'<div class="msg-reaction{chosen_class}" data-emoji="{emoji}" data-msg-id="{last.id}" title="Поставить {emoji}"><span class="mr-emoji">{emoji}</span><span class="mr-count">{r.count}</span></div>'
        reactions_html += '</div>'

    keyboard_html = _inline_keyboard_html(last)

    return (
        f'<div class="msg msg-{side}" data-id="{msgs[0].id}" data-idmax="{last.id}" '
        f'data-side="{side}" data-ts="{ts}" data-date="{escape(date_label)}"{sender_attr}>'
        f'<div class="msg-checkbox"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#fff"/></svg></div>'
        f'{sender_html}'
        f'<div class="msg-content">'
        f'<div class="msg-bubble-wrap">'
        f'<div class="msg-text">'
        f'<div class="msg-hover-actions">{quick_react}</div>'
        f'<div class="album {grid_class}">{"".join(items)}</div>'
        f'{caption}{reactions_html}<span class="msg-time">{time_html}</span>'
        f'</div>'
        f'{keyboard_html}'
        f'</div></div></div>'
    )

def _render_message_html(m, is_group, account, chat_id, read_outbox_max_id=0):
    side = "out" if m.outgoing else "in"
    date_label = _date_label(m.date)
    ts = int(m.date.timestamp())
    if m.outgoing:
        if read_outbox_max_id and m.id <= read_outbox_max_id:
            ticks = '<span class="ticks ticks-read" title="Прочитано">✓✓</span>'
        else:
            ticks = '<span class="ticks ticks-sent" title="Отправлено">✓</span>'
    else:
        ticks = ""

    meta_extra = ""
    views = getattr(m, "views", None)
    if views is not None:
        v_str = f"{views/1000:.1f}k" if views >= 1000 else str(views)
        meta_extra += f'<span class="msg-views" title="Просмотры: {views}"><svg class="svg-ico-xs" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> {v_str}</span>'
    forwards = getattr(m, "forwards", None)
    if forwards:
        meta_extra += f'<span class="msg-forwards" title="Пересылки: {forwards}"><svg class="svg-ico-xs" viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg> {forwards}</span>'
    sig = getattr(m, "author_signature", None)
    if sig:
        meta_extra += f'<span class="msg-sig">{escape(sig)}</span>'

    time_html = f'{meta_extra}<span class="msg-clock">{_hhmm(m.date)}</span>{ticks}'

    sender_attr = ""
    sender_html = ""
    avatar_html = ""
    if side == "in" and is_group and getattr(m, "from_user", None):
        u = m.from_user
        name = ((u.first_name or "").strip() or "Пользователь")
        if u.last_name:
            name += " " + u.last_name
        sender_attr = f' data-sender="{u.id}"'
        avatar_url = f"/api/avatar?account={quote(str(account))}&chat_id={u.id}"
        avatar_html = f'<img src="{avatar_url}" class="msg-avatar" loading="lazy" alt="" onerror="this.style.display=\'none\'">'
        sender_html = f'<div class="msg-sender sender-c{abs(u.id) % 8}">{escape(name)}</div>'

    reply_html = ""
    rm = getattr(m, "reply_to_message", None)
    if rm:
        r_name = "Сообщение"
        if getattr(rm, "from_user", None):
            u_r = rm.from_user
            r_name = (" ".join(filter(None, [u_r.first_name, u_r.last_name])) or "Пользователь")
        r_text = rm.text if rm.text else _media_label(rm)
        reply_html = (
            f'<div class="msg-reply-quote" data-reply-id="{rm.id}">'
            f'<div class="reply-author">{escape(r_name)}</div>'
            f'<div class="reply-text">{escape(r_text[:100])}</div></div>'
        )

    body = _media_html(m, account, chat_id)

    reactions_html = ""
    if getattr(m, 'reactions', None) and getattr(m.reactions, 'reactions', None):
        reactions_html = '<div class="msg-reactions">'
        for r in m.reactions.reactions:
            chosen_class = " chosen" if getattr(r, "chosen", False) else ""
            emoji = getattr(r, "emoji", "")
            if not emoji and getattr(r, "custom_emoji_id", None):
                emoji = "❤️"
            if emoji:
                reactions_html += f'<div class="msg-reaction{chosen_class}" data-emoji="{emoji}" data-msg-id="{m.id}" title="Поставить {emoji}"><span class="mr-emoji">{emoji}</span><span class="mr-count">{r.count}</span></div>'
        reactions_html += '</div>'

    quick_react = (
        f'<button class="msg-quick-react-btn" type="button" title="Реакция" data-msg-id="{m.id}">'
        f'<svg class="svg-ico-mini" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
        f'</button>'
    )

    keyboard_html = _inline_keyboard_html(m)

    vnote_class = " msg-vnote" if getattr(m, "video_note", None) else ""
    return (
        f'<div class="msg msg-{side}{vnote_class}" data-id="{m.id}" data-side="{side}" '
        f'data-ts="{ts}" data-date="{escape(date_label)}"{sender_attr}>'
        f'<div class="msg-checkbox"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#fff"/></svg></div>'
        f'{sender_html}'
        f'<div class="msg-content">'
        f'{avatar_html}'
        f'<div class="msg-bubble-wrap">'
        f'<div class="msg-text">'
        f'<div class="msg-hover-actions">{quick_react}</div>'
        f'{reply_html}{body}{reactions_html}'
        f'<span class="msg-time">{time_html}</span>'
        f'</div>'
        f'{keyboard_html}'
        f'</div></div></div>'
    )