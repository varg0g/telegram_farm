var els = window.els;
var state = window.state;
var toast = window.toast;
var pollMessages = window.pollMessages;
var setReplyTarget = window.setReplyTarget;
var $ = window.$;
var $$ = window.$$;

  // ---------- голосовые сообщения ----------
  function voiceTimeLabel(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  function pauseAllVoice() {
    $$(".voice", els.messages).forEach(function (v) {
      if (v._audio && !v._audio.paused) v._audio.pause();
    });
    $$("video", els.messages).forEach(function (v) {
      if (v.src && !v.paused) v.pause();
    });
  }

  function playLazyVideo(video) {
    if (!video.src && video.dataset.src) {
      video.src = video.dataset.src;
      video.setAttribute("src", video.dataset.src);
    }
    var wrap = video.parentElement;
    var btn = wrap && wrap.querySelector(".video-play-btn");
    if (btn) btn.hidden = true;
    if (wrap && wrap.classList.contains("album-video")) {
      var play = wrap.querySelector(".album-play");
      if (play) play.hidden = true;
    }
    pauseAllVoice();
    video.play().catch(function () {});
  }

  function initVoicePlayers() {
    var voiceEls = (els.messages || document).querySelectorAll(".voice");
    voiceEls.forEach(function (v) {
      if (v._audio) return;
      var a = new Audio();
      a.preload = "none";
      a.src = v.dataset.url;
      v._audio = a;

      var btn = v.querySelector(".voice-btn");
      var trackWrap = v.querySelector(".voice-track-wrap") || v.querySelector(".voice-track");
      var progress = v.querySelector(".voice-wave-progress") || v.querySelector(".voice-fill");
      var time = v.querySelector(".voice-time");
      var speedBtn = v.querySelector(".voice-speed-btn");
      var bars = v.querySelectorAll(".vbar");
      var dur = Number(v.dataset.dur) || 0;

      function paint() {
        var t = a.currentTime || 0;
        var d = a.duration && isFinite(a.duration) ? a.duration : dur;
        var pct = d > 0 ? Math.min(1, t / d) : 0;
        if (progress) progress.style.width = (pct * 100) + "%";
        if (bars && bars.length) {
          var activeCount = Math.floor(pct * bars.length);
          bars.forEach(function (bar, idx) {
            if (idx <= activeCount) bar.classList.add("played");
            else bar.classList.remove("played");
          });
        }
        if (time) {
          time.textContent = d ? voiceTimeLabel(Math.min(t, d)) : voiceTimeLabel(dur);
        }
      }

      a.addEventListener("loadedmetadata", paint);
      a.addEventListener("timeupdate", paint);
      a.addEventListener("ended", function () {
        if (btn) btn.classList.remove("playing");
        if (bars) bars.forEach(function (b) { b.classList.remove("played"); });
        if (progress) progress.style.width = "0%";
        if (time) time.textContent = voiceTimeLabel(dur);
      });
      a.addEventListener("play", function () {
        if (btn) btn.classList.add("playing");
        var msgEl = v.closest(".msg");
        if (msgEl && msgEl.dataset.id && state.account && state.dialog) {
          var fd = new FormData();
          fd.append("account", state.account.name);
          fd.append("chat_id", state.dialog.id);
          fd.append("message_id", msgEl.dataset.id);
          apiFetch("/api/read_media_content", { method: "POST", body: fd }).catch(function () {});
        }
      });

      if (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var wasPlaying = !a.paused;
          pauseAllVoice();
          if (wasPlaying) { a.pause(); } else { a.play().catch(function () {}); }
        });
      }

      if (trackWrap) {
        trackWrap.addEventListener("click", function (e) {
          e.stopPropagation();
          var rect = trackWrap.getBoundingClientRect();
          var p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          var d = a.duration && isFinite(a.duration) ? a.duration : dur;
          if (d > 0) a.currentTime = p * d;
        });
      }

      if (speedBtn) {
        speedBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (a.playbackRate === 1) {
            a.playbackRate = 1.5;
            speedBtn.textContent = "1.5X";
          } else if (a.playbackRate === 1.5) {
            a.playbackRate = 2;
            speedBtn.textContent = "2X";
          } else {
            a.playbackRate = 1;
            speedBtn.textContent = "1X";
          }
        });
      }

      if (time) time.textContent = voiceTimeLabel(dur);
    });

    if (typeof initVideoNotes === "function") {
      initVideoNotes();
    }
  }

  // ---------- запись голосового ----------
  var recorder = null;
  var recChunks = [];
  var recSeconds = 0;
  var recTimer = null;
  var recStream = null;
  var recCancelled = false;

  function updateComposerMode() {
    var hasText = els.composerInput && !!els.composerInput.value.trim();
    if (els.micBtn) els.micBtn.hidden = hasText;
    if (els.videoNoteBtn) els.videoNoteBtn.hidden = hasText;
    if (els.sendBtn) els.sendBtn.hidden = !hasText;
  }
  window.updateComposerMode = updateComposerMode;

  function stopRecUI() {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    els.composer.classList.remove("recording");
    els.recBar.hidden = true;
    if (els.micBtn) els.micBtn.classList.remove("recording", "sending");
    if (recStream) {
      recStream.getTracks().forEach(function (t) { t.stop(); });
      recStream = null;
    }
    recorder = null;
  }

  function startRec() {
    if (!state.account || !state.dialog) return;
    pauseAllVoice();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Запись голосовых недоступна в этом браузере");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      recStream = stream;
      var mime = "";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mime = "audio/webm";
      }
      try {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (err) {
        toast("Не удалось запустить запись");
        return;
      }
      recChunks = [];
      recCancelled = false;
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) recChunks.push(e.data);
      };
      recorder.onstop = function () {
        var blob = new Blob(recChunks, { type: (mime || "audio/webm") });
        var wasCancelled = recCancelled;
        stopRecUI();
        updateComposerMode();
        if (!wasCancelled && blob.size > 0) sendVoice(blob);
      };
      recorder.start();
      if (state.account && state.dialog) {
        var cfd = new FormData();
        cfd.append("account", state.account.name);
        cfd.append("chat_id", state.dialog.id);
        cfd.append("action", "record_audio");
        apiFetch("/api/chat_action", { method: "POST", body: cfd }).catch(function () {});
      }
      recSeconds = 0;
      els.recTime.textContent = "0:00";
      els.composer.classList.add("recording");
      els.recBar.hidden = false;
      els.micBtn.classList.add("recording");
      if (recTimer) clearInterval(recTimer);
      recTimer = setInterval(function () {
        recSeconds++;
        els.recTime.textContent = voiceTimeLabel(recSeconds);
      }, 1000);
      toast("Идёт запись — нажмите на микрофон, чтобы отправить");
    }).catch(function () {
      toast("Доступ к микрофону запрещён");
    });
  }

  function onMic() {
    if (recorder && recorder.state === "recording") { recorder.stop(); }
    else startRec();
  }

  function cancelRec() {
    if (recorder && recorder.state === "recording") {
      recCancelled = true;
      recorder.stop();
    }
  }

  function sendVoice(blob) {
    if (!state.account || !state.dialog) return;
    var fd = new FormData();
    fd.append("account", state.account.name);
    fd.append("chat_id", state.dialog.id);
    fd.append("voice", blob, "voice.webm");
    if (state.replyTarget && state.replyTarget.id) {
      fd.append("reply_to_message_id", state.replyTarget.id);
    }
    setReplyTarget(null);
    els.micBtn.classList.add("sending");
    apiFetch("/api/send_voice", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) toast(data.error || "Не удалось отправить голосовое");
        else { pollMessages(); toast("Голосовое отправлено"); }
      })
      .catch(function () { toast("Соединение с сервером потеряно"); })
      .finally(function () {
        els.micBtn.classList.remove("sending");
        updateComposerMode();
      });
  }

  // ---------- отправка документов / вложений ----------
  function sendFiles(files) {
    if (!state.account || !state.dialog || !files || !files.length) return;
    var count = files.length;
    var completed = 0;
    toast("Отправка файлов (" + count + ")…");

    Array.prototype.forEach.call(files, function (file) {
      var fd = new FormData();
      fd.append("account", state.account.name);
      fd.append("chat_id", state.dialog.id);
      fd.append("file", file);
      if (state.replyTarget && state.replyTarget.id) {
        fd.append("reply_to_message_id", state.replyTarget.id);
      }
      apiFetch("/api/send_document", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) toast(data.error || ("Не удалось отправить " + file.name));
          else toast("Файл " + file.name + " отправлен");
        })
        .catch(function () { toast("Ошибка отправки " + file.name); })
        .finally(function () {
          completed++;
          if (completed === count) {
            setReplyTarget(null);
            pollMessages();
          }
        });
    });
  }

  // ---------- видеосообщения (кружки) ----------
  var vnoteStream = null;
  var vnoteRecorder = null;
  var vnoteChunks = [];
  var vnoteBlob = null;
  var vnoteSeconds = 0;
  var vnoteTimerInterval = null;

  function openVnoteModal() {
    if (!state.account || !state.dialog) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Камера недоступна в этом браузере");
      return;
    }
    pauseAllVoice();
    vnoteBlob = null;
    vnoteChunks = [];
    vnoteSeconds = 0;
    els.vnoteTimer.hidden = true;
    els.vnoteTimer.textContent = "0:00";
    els.vnoteRecordBtn.hidden = false;
    els.vnoteStopBtn.hidden = true;
    els.vnoteSendBtn.hidden = true;
    els.vnoteModalOverlay.hidden = false;

    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 400 }, height: { ideal: 400 }, aspectRatio: 1 },
      audio: true
    }).then(function (stream) {
      vnoteStream = stream;
      els.vnotePreview.srcObject = stream;
      els.vnotePreview.play().catch(function () {});
    }).catch(function () {
      toast("Доступ к камере/микрофону запрещён");
      closeVnoteModal();
    });
  }

  function closeVnoteModal() {
    stopVnoteRecordingUI();
    els.vnoteModalOverlay.hidden = true;
  }

  function stopVnoteRecordingUI() {
    if (vnoteTimerInterval) { clearInterval(vnoteTimerInterval); vnoteTimerInterval = null; }
    if (vnoteStream) {
      vnoteStream.getTracks().forEach(function (t) { t.stop(); });
      vnoteStream = null;
    }
    if (els.vnotePreview.srcObject) {
      els.vnotePreview.srcObject = null;
    }
    vnoteRecorder = null;
  }

  function startVnoteRecord() {
    if (!vnoteStream) return;
    var mime = "";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) mime = "video/webm;codecs=vp9,opus";
      else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) mime = "video/webm;codecs=vp8,opus";
      else if (MediaRecorder.isTypeSupported("video/webm")) mime = "video/webm";
      else if (MediaRecorder.isTypeSupported("video/mp4")) mime = "video/mp4";
    }
    try {
      vnoteRecorder = mime ? new MediaRecorder(vnoteStream, { mimeType: mime }) : new MediaRecorder(vnoteStream);
    } catch (err) {
      toast("Не удалось запустить запись видео");
      return;
    }
    vnoteChunks = [];
    vnoteRecorder.ondataavailable = function (e) {
      if (e.data && e.data.size) vnoteChunks.push(e.data);
    };
    vnoteRecorder.onstop = function () {
      vnoteBlob = new Blob(vnoteChunks, { type: (mime || "video/webm") });
      els.vnotePreview.srcObject = null;
      els.vnotePreview.src = URL.createObjectURL(vnoteBlob);
      els.vnotePreview.loop = true;
      els.vnotePreview.play().catch(function () {});
      els.vnoteRecordBtn.hidden = true;
      els.vnoteStopBtn.hidden = true;
      els.vnoteSendBtn.hidden = false;
    };
    vnoteRecorder.start();
    if (state.account && state.dialog) {
      var cfd = new FormData();
      cfd.append("account", state.account.name);
      cfd.append("chat_id", state.dialog.id);
      cfd.append("action", "record_video_note");
      apiFetch("/api/chat_action", { method: "POST", body: cfd }).catch(function () {});
    }
    vnoteSeconds = 0;
    els.vnoteTimer.textContent = "0:00";
    els.vnoteTimer.hidden = false;
    els.vnoteRecordBtn.hidden = true;
    els.vnoteStopBtn.hidden = false;
    els.vnoteSendBtn.hidden = true;

    vnoteTimerInterval = setInterval(function () {
      vnoteSeconds++;
      els.vnoteTimer.textContent = voiceTimeLabel(vnoteSeconds);
    }, 1000);
  }

  function stopVnoteRecord() {
    if (vnoteTimerInterval) { clearInterval(vnoteTimerInterval); vnoteTimerInterval = null; }
    if (vnoteRecorder && vnoteRecorder.state === "recording") {
      vnoteRecorder.stop();
    }
  }

  function sendVnote() {
    if (!state.account || !state.dialog || !vnoteBlob || vnoteBlob.size === 0) return;
    toast("Отправка кружка…");
    var fd = new FormData();
    fd.append("account", state.account.name);
    fd.append("chat_id", state.dialog.id);
    fd.append("video_note", vnoteBlob, "video_note.mp4");
    fd.append("duration", vnoteSeconds);
    if (state.replyTarget && state.replyTarget.id) {
      fd.append("reply_to_message_id", state.replyTarget.id);
    }
    closeVnoteModal();
    apiFetch("/api/send_video_note", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) toast(data.error || "Не удалось отправить кружок");
        else {
          setReplyTarget(null);
          pollMessages();
          toast("Кружок отправлен");
        }
      })
      .catch(function () { toast("Соединение с сервером потеряно"); });
  }

  // ---------- видеосообщения (кружки в ленте) ----------
  function initVideoNotes() {
    var vnotes = (els.messages || document).querySelectorAll(".vnote-wrap");
    vnotes.forEach(function (wrap) {
      if (wrap._init) return;
      wrap._init = true;
      var v = wrap.querySelector("video");
      var circle = wrap.querySelector(".vnote-circle");
      var ringBar = wrap.querySelector(".vnote-ring-bar");
      var timeEl = wrap.querySelector(".vnote-time-badge");
      var circ = 289; // 2 * PI * 46

      if (ringBar) {
        ringBar.style.strokeDasharray = circ;
        ringBar.style.strokeDashoffset = circ;
      }

      if (v) {
        function onPlay() {
          wrap.classList.add("playing");
          if (circle) circle.classList.add("playing");
          var msgEl = wrap.closest(".msg");
          if (msgEl && msgEl.dataset.id && state.account && state.dialog) {
            var mfd = new FormData();
            mfd.append("account", state.account.name);
            mfd.append("chat_id", state.dialog.id);
            mfd.append("message_id", msgEl.dataset.id);
            apiFetch("/api/read_media_content", { method: "POST", body: mfd }).catch(function () {});
          }
        }
        function onPause() {
          wrap.classList.remove("playing");
          if (circle) circle.classList.remove("playing");
        }

        v.addEventListener("play", onPlay);
        v.addEventListener("pause", onPause);

        v.addEventListener("timeupdate", function () {
          if (!v.duration) return;
          var p = v.currentTime / v.duration;
          if (ringBar) {
            ringBar.style.strokeDashoffset = (circ * (1 - p)) + "px";
          }
          if (timeEl) {
            var rem = Math.max(0, Math.ceil(v.duration - v.currentTime));
            timeEl.textContent = voiceTimeLabel(rem);
          }
        });

        v.addEventListener("ended", function () {
          onPause();
          if (ringBar) ringBar.style.strokeDashoffset = circ;
          if (timeEl) timeEl.textContent = voiceTimeLabel(v.duration || 0);
        });

        if (circle) {
          circle.addEventListener("click", function (e) {
            if (e.target.closest && e.target.closest(".vnote-expand-btn")) return;
            e.stopPropagation();
            if (v.paused) {
              if (typeof pauseAllVoice === "function") pauseAllVoice();
              v.muted = false;
              if (v.ended || (v.duration && v.currentTime >= v.duration - 0.2)) {
                v.currentTime = 0;
              }
              v.play().catch(function (err) {
                console.warn("Vnote play failed:", err);
              });
            } else {
              v.pause();
            }
          });

          circle.addEventListener("dblclick", function (e) {
            e.stopPropagation();
            var expBtn = wrap.querySelector(".vnote-expand-btn");
            if (expBtn && typeof window.triggerMediaPreview === "function") {
              window.triggerMediaPreview(expBtn);
            }
          });
        }
      }
    });
  }

  // ---------- полноэкранный просмотрщик медиа (Media Lightbox) ----------
  var currentGallery = [];
  var currentLightboxIndex = 0;
  var isZoomed = false;

  var lbModal = document.getElementById("modal-media-lightbox");
  var lbCounter = document.getElementById("lightbox-counter");
  var lbTitle = document.getElementById("lightbox-title");
  var lbMediaWrap = document.getElementById("lightbox-media-wrap");
  var lbPrev = document.getElementById("lightbox-prev");
  var lbNext = document.getElementById("lightbox-next");
  var lbClose = document.getElementById("lightbox-btn-close");
  var lbZoom = document.getElementById("lightbox-btn-zoom");
  var lbDownload = document.getElementById("lightbox-btn-download");
  var lbFooter = document.getElementById("lightbox-footer");
  var lbCaption = document.getElementById("lightbox-caption");

  function openMediaLightbox(index) {
    if (!lbModal) lbModal = document.getElementById("modal-media-lightbox");
    if (!lbCounter) lbCounter = document.getElementById("lightbox-counter");
    if (!lbTitle) lbTitle = document.getElementById("lightbox-title");
    if (!lbMediaWrap) lbMediaWrap = document.getElementById("lightbox-media-wrap");
    if (!lbPrev) lbPrev = document.getElementById("lightbox-prev");
    if (!lbNext) lbNext = document.getElementById("lightbox-next");
    if (!lbDownload) lbDownload = document.getElementById("lightbox-btn-download");
    if (!lbFooter) lbFooter = document.getElementById("lightbox-footer");
    if (!lbCaption) lbCaption = document.getElementById("lightbox-caption");

    if (!lbModal || !currentGallery.length) return;

    if (index < 0) index = currentGallery.length - 1;
    if (index >= currentGallery.length) index = 0;
    currentLightboxIndex = index;

    var item = currentGallery[index];
    isZoomed = false;

    // Сброс и остановка звуков
    lbMediaWrap.innerHTML = "";
    pauseAllVoice();

    var isVnote = item.type === "video_note" || (item.src && item.src.indexOf("kind=video_note") !== -1);
    if (isVnote) {
      var vnoteVideo = document.createElement("video");
      vnoteVideo.className = "lightbox-video lightbox-vnote-circle";
      vnoteVideo.src = item.src;
      vnoteVideo.controls = false;
      vnoteVideo.autoplay = true;
      vnoteVideo.loop = true;
      vnoteVideo.playsInline = true;
      vnoteVideo.title = "Нажмите, чтобы поставить на паузу / продолжить";
      vnoteVideo.onclick = function (e) {
        e.stopPropagation();
        if (vnoteVideo.paused) {
          vnoteVideo.play();
        } else {
          vnoteVideo.pause();
        }
      };
      lbMediaWrap.appendChild(vnoteVideo);
    } else if (item.type === "video") {
      var video = document.createElement("video");
      video.className = "lightbox-video";
      video.src = item.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      lbMediaWrap.appendChild(video);
    } else {
      var img = document.createElement("img");
      img.className = "lightbox-img";
      img.src = item.src;
      img.alt = "";
      img.onclick = function (e) {
        e.stopPropagation();
        toggleZoom();
      };
      lbMediaWrap.appendChild(img);
    }

    if (lbCounter) lbCounter.textContent = (index + 1) + " / " + currentGallery.length;
    if (lbTitle) lbTitle.textContent = item.author || (state && state.dialog ? (state.dialog.title || state.dialog.name || "Медиа") : "Медиа");
    if (lbDownload) {
      lbDownload.href = item.src + "&download=1";
    }

    if (item.caption && item.caption.trim()) {
      if (lbCaption) lbCaption.innerHTML = item.caption;
      if (lbFooter) lbFooter.hidden = false;
    } else {
      if (lbFooter) lbFooter.hidden = true;
    }

    if (lbPrev) lbPrev.style.display = currentGallery.length > 1 ? "flex" : "none";
    if (lbNext) lbNext.style.display = currentGallery.length > 1 ? "flex" : "none";

    lbModal.hidden = false;
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
    if (!lbMediaWrap) return;
    var img = lbMediaWrap.querySelector(".lightbox-img");
    if (img) {
      if (isZoomed) img.classList.add("zoomed");
      else img.classList.remove("zoomed");
    }
  }

  function closeMediaLightbox() {
    if (!lbModal) lbModal = document.getElementById("modal-media-lightbox");
    if (!lbModal) return;
    lbModal.hidden = true;
    if (lbMediaWrap) {
      var v = lbMediaWrap.querySelector("video");
      if (v) v.pause();
      lbMediaWrap.innerHTML = "";
    }
  }

  function setupLightboxEvents() {
    lbModal = document.getElementById("modal-media-lightbox");
    if (!lbModal) return;

    lbClose = document.getElementById("lightbox-btn-close");
    lbZoom = document.getElementById("lightbox-btn-zoom");
    lbPrev = document.getElementById("lightbox-prev");
    lbNext = document.getElementById("lightbox-next");

    if (lbClose) lbClose.addEventListener("click", closeMediaLightbox);
    if (lbZoom) lbZoom.addEventListener("click", toggleZoom);
    if (lbPrev) lbPrev.addEventListener("click", function (e) { e.stopPropagation(); openMediaLightbox(currentLightboxIndex - 1); });
    if (lbNext) lbNext.addEventListener("click", function (e) { e.stopPropagation(); openMediaLightbox(currentLightboxIndex + 1); });

    var backdrop = lbModal.querySelector(".lightbox-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeMediaLightbox);

    document.addEventListener("keydown", function (e) {
      if (!lbModal || lbModal.hidden) return;
      if (e.key === "Escape") closeMediaLightbox();
      else if (e.key === "ArrowLeft") openMediaLightbox(currentLightboxIndex - 1);
      else if (e.key === "ArrowRight") openMediaLightbox(currentLightboxIndex + 1);
      else if (e.key === " ") {
        var v = lbMediaWrap.querySelector("video");
        if (v) {
          e.preventDefault();
          if (v.paused) v.play(); else v.pause();
        }
      }
    });
  }

  function triggerMediaPreview(targetEl) {
    var triggers = Array.from((els.messages || document).querySelectorAll(".media-preview-trigger"));
    currentGallery = triggers.map(function (el) {
      var msgEl = el.closest(".msg");
      var senderEl = msgEl ? msgEl.querySelector(".msg-sender") : null;
      var author = senderEl ? senderEl.textContent : (msgEl && msgEl.dataset.side === "out" ? "Вы" : "");
      return {
        type: el.dataset.type || "photo",
        src: el.dataset.src || (el.querySelector("img") ? el.querySelector("img").src : (el.querySelector("video") ? el.querySelector("video").src : "")),
        caption: el.dataset.caption || "",
        msgId: el.dataset.msgId || (msgEl ? msgEl.dataset.id : ""),
        author: author
      };
    }).filter(function (it) { return it.src; });

    var idx = triggers.indexOf(targetEl);
    if (idx === -1) idx = 0;
    openMediaLightbox(idx);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupLightboxEvents);
  } else {
    setupLightboxEvents();
  }

  // Делаем функции глобальными, чтобы их видел app.js
  window.openVnoteModal = openVnoteModal;
  window.closeVnoteModal = closeVnoteModal;
  window.startVnoteRecord = startVnoteRecord;
  window.stopVnoteRecord = stopVnoteRecord;
  window.sendVnote = sendVnote;
  window.onMic = onMic;
  window.cancelRec = cancelRec;
  window.pauseAllVoice = pauseAllVoice;
  window.playLazyVideo = playLazyVideo;
  window.triggerMediaPreview = triggerMediaPreview;
  window.openMediaLightbox = openMediaLightbox;
  window.closeMediaLightbox = closeMediaLightbox;
  window.initVoicePlayers = initVoicePlayers;
  window.initVideoNotes = initVideoNotes;