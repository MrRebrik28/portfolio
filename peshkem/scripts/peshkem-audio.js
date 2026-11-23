/**
 * ПешКем — Движок голосового аудиогида (Web Speech API)
 * Настоящая озвучка текста остановок на русском языке, управление плеером и визуализатор
 */

(function () {
  'use strict';

  class PeshkemAudio {
    constructor() {
      this.synth = window.speechSynthesis || null;
      this.currentUtterance = null;
      this.voices = [];
      this.selectedVoice = null;

      // Audio element for pre-rendered FreeTTS / Actor MP3 files
      this.audioElement = new Audio();
      this.isMp3Mode = false;

      this.currentRoute = null;
      this.currentStopIndex = 0;
      this.isPlaying = false;
      this.isPaused = false;
      this.playbackRate = 1.0;

      this.dockElement = null;
      this.progressBar = null;
      this.playPauseBtn = null;
      this.rateBtn = null;
      this.titleEl = null;
      this.stopEl = null;
      this.waveformEl = null;

      this.progressInterval = null;
      this.startTime = 0;
      this.estimatedDuration = 60; // seconds

      this.setupAudioElement();
    }

    setupAudioElement() {
      if (!this.audioElement) return;

      this.audioElement.addEventListener('timeupdate', () => {
        if (!this.isMp3Mode || !this.audioElement.duration) return;
        const pct = Math.min(100, (this.audioElement.currentTime / this.audioElement.duration) * 100);
        if (this.progressBar) {
          this.progressBar.style.width = `${pct}%`;
        }
      });

      this.audioElement.addEventListener('ended', () => {
        if (!this.isMp3Mode) return;
        this.onStopPlaybackEnded();
      });

      this.audioElement.addEventListener('play', () => {
        if (!this.isMp3Mode) return;
        this.isPlaying = true;
        this.isPaused = false;
        this.waveformEl?.classList.add('playing');
        if (this.playPauseBtn) {
          this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
          this.playPauseBtn.setAttribute('aria-label', 'Пауза');
        }
        this.updateCardButtons();
      });

      this.audioElement.addEventListener('pause', () => {
        if (!this.isMp3Mode) return;
        if (!this.audioElement.ended) {
          this.isPlaying = false;
          this.isPaused = true;
          this.waveformEl?.classList.remove('playing');
          if (this.playPauseBtn) {
            this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
            this.playPauseBtn.setAttribute('aria-label', 'Воспроизвести');
          }
          this.updateCardButtons();
        }
      });

      this.audioElement.addEventListener('error', () => {
        if (this.isMp3Mode) {
          console.warn('MP3 playback failed, falling back to Web Speech Synthesis');
          this.isMp3Mode = false;
          this.speakViaSynth(this.currentRoute?.stops[this.currentStopIndex]);
        }
      });
    }

    init() {
      if (this.isInitialized) return;
      this.dockElement = document.getElementById('peshkem-audio-dock');
      if (!this.dockElement) return;
      this.isInitialized = true;

      this.progressBar = this.dockElement.querySelector('.audio-progress-bar');
      this.playPauseBtn = this.dockElement.querySelector('.btn-audio-playpause');
      this.rateBtn = this.dockElement.querySelector('.btn-audio-rate');
      this.titleEl = this.dockElement.querySelector('.audio-dock-route-title');
      this.stopEl = this.dockElement.querySelector('.audio-dock-stop-title');
      this.waveformEl = this.dockElement.querySelector('.audio-waveform');

      // Initialize Voices
      this.loadVoices();
      if (this.synth && this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }

      this.bindEvents();
    }

    loadVoices() {
      if (!this.synth) return;
      this.voices = this.synth.getVoices();
      // Look for Russian voice, prefer male narrators
      this.selectedVoice = this.voices.find(v => v.lang.startsWith('ru') && (v.name.includes('Nikita') || v.name.includes('Dmitry') || v.name.includes('Yuri') || v.name.includes('Pavel') || v.name.includes('Natural') || v.name.includes('Google')))
        || this.voices.find(v => v.lang.startsWith('ru'))
        || null;
    }

    bindEvents() {
      if (!this.dockElement) return;

      // Play/Pause
      this.playPauseBtn?.addEventListener('click', () => {
        if (this.isPlaying) {
          this.pause();
        } else if (this.isPaused) {
          this.resume();
        } else if (this.currentRoute) {
          this.playStop(this.currentRoute.id, this.currentStopIndex);
        }
      });

      // Prev Stop
      this.dockElement.querySelector('.btn-audio-prev')?.addEventListener('click', () => {
        this.prevStop();
      });

      // Next Stop
      this.dockElement.querySelector('.btn-audio-next')?.addEventListener('click', () => {
        this.nextStop();
      });

      // Rate Toggle (1x -> 1.25x -> 1.5x)
      this.rateBtn?.addEventListener('click', () => {
        if (this.playbackRate === 1.0) this.playbackRate = 1.25;
        else if (this.playbackRate === 1.25) this.playbackRate = 1.5;
        else this.playbackRate = 1.0;

        if (this.rateBtn) this.rateBtn.textContent = `${this.playbackRate}x`;

        // If currently playing, restart utterance with new rate
        if (this.isPlaying && this.currentRoute) {
          const wasPlaying = true;
          this.playStop(this.currentRoute.id, this.currentStopIndex, false);
        }
      });

      // Close Player
      this.dockElement.querySelector('.btn-audio-close')?.addEventListener('click', () => {
        this.stop();
        this.dockElement.classList.remove('active');
        document.body.classList.remove('has-audio-dock');
      });
    }

    startRoute(routeId, stopIndex = 0) {
      const route = window.PESHKEM_DATA.routes.find(r => r.id === routeId);
      if (!route) return;

      this.currentRoute = route;
      this.currentStopIndex = stopIndex;
      this.playStop(routeId, stopIndex);
    }

    playStop(routeId, stopIndex, announceToast = true) {
      if (!this.dockElement) {
        this.init();
      }

      const route = window.PESHKEM_DATA.routes.find(r => r.id === routeId);
      if (!route || !route.stops[stopIndex]) return;

      this.currentRoute = route;
      this.currentStopIndex = stopIndex;
      const stop = route.stops[stopIndex];

      // Stop any existing playback
      this.stop();

      // Update UI dock
      if (this.dockElement) {
        this.dockElement.classList.add('active');
        document.body.classList.add('has-audio-dock');
        if (this.titleEl) this.titleEl.textContent = route.title;
        if (this.stopEl) this.stopEl.textContent = `Точка ${stop.order} из ${route.stops.length}: ${stop.title} • Диктор: Никита Калинин`;
        if (this.playPauseBtn) {
          this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
          this.playPauseBtn.setAttribute('aria-label', 'Пауза');
        }
        this.waveformEl?.classList.add('playing');
      }

      // Exact MP3 file URL (pre-rendered high quality audio file)
      const mp3Url = stop.audio || `assets/peshkem/audio/${stop.id}.mp3`;
      
      this.isMp3Mode = true;
      if (!this.audioElement) {
        this.audioElement = new Audio();
        this.setupAudioElement();
      }
      this.audioElement.src = mp3Url;
      this.audioElement.playbackRate = this.playbackRate;

      this.isPlaying = true;
      this.isPaused = false;
      this.updateCardButtons();

      // Mobile friendly: play() called synchronously in user click gesture
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isPlaying = true;
            this.isPaused = false;
            this.waveformEl?.classList.add('playing');
            this.updateCardButtons();
            window.PeshkemMap?.focusStop(route.id, stop.id);
            if (announceToast) {
              window.PESHKEM_APP?.showToast(`Слушаем: ${stop.title} (диктор: Никита Калинин)`, 'info');
            }
          })
          .catch((err) => {
            if (err && err.name === 'AbortError') return;
            console.warn('Audio element play failed, falling back to Web Speech Synthesis:', err);
            this.isMp3Mode = false;
            this.speakViaSynth(stop, announceToast);
          });
      }
    }

    speakViaSynth(stop, announceToast = true) {
      if (!this.synth) {
        window.PESHKEM_APP?.showToast('Голосовой синтез речи не поддерживается в этом браузере', 'warning');
        return;
      }

      // Android Chrome & Safari mobile audio unlock
      try {
        this.synth.cancel();
        if (this.synth.paused) {
          this.synth.resume();
        }
      } catch (e) {}

      const textToRead = stop.audioText || stop.fullText;
      this.estimatedDuration = Math.max(10, Math.round(textToRead.length / (15 * this.playbackRate)));

      this.currentUtterance = new SpeechSynthesisUtterance(textToRead);
      this.currentUtterance.rate = this.playbackRate;
      this.currentUtterance.pitch = 0.95; // Adult baritone register for Nikita Kalinin narration
      this.currentUtterance.lang = 'ru-RU';

      if (!this.selectedVoice) {
        this.loadVoices();
      }
      if (this.selectedVoice) {
        this.currentUtterance.voice = this.selectedVoice;
      }

      this.startTime = Date.now();
      this.isPlaying = true;
      this.isPaused = false;
      this.startProgress();

      this.currentUtterance.onstart = () => {
        this.isPlaying = true;
        this.isPaused = false;
        this.waveformEl?.classList.add('playing');
        if (this.playPauseBtn) {
          this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
          this.playPauseBtn.setAttribute('aria-label', 'Пауза');
        }
      };

      this.currentUtterance.onend = () => {
        this.onStopPlaybackEnded();
      };

      this.currentUtterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        this.isPlaying = false;
        this.isPaused = false;
        this.stopProgress();
        this.waveformEl?.classList.remove('playing');
        if (this.playPauseBtn) {
          this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
          this.playPauseBtn.setAttribute('aria-label', 'Воспроизвести');
        }
      };

      try {
        this.synth.speak(this.currentUtterance);
        // Keep-alive for Chromium engines on long stories
        if (this.synthResumeInterval) clearInterval(this.synthResumeInterval);
        this.synthResumeInterval = setInterval(() => {
          if (this.isPlaying && !this.isPaused && this.synth.speaking) {
            this.synth.pause();
            this.synth.resume();
          } else {
            clearInterval(this.synthResumeInterval);
          }
        }, 12000);
      } catch (err) {
        console.error('Speech speak failed:', err);
      }

      window.PeshkemMap?.focusStop(this.currentRoute.id, stop.id);

      if (announceToast) {
        window.PESHKEM_APP?.showToast(`Слушаем: ${stop.title} (диктор: Никита Калинин)`, 'info');
      }
    }

    onStopPlaybackEnded() {
      this.isPlaying = false;
      this.isPaused = false;
      this.stopProgress();
      this.waveformEl?.classList.remove('playing');

      if (this.playPauseBtn) {
        this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        this.playPauseBtn.setAttribute('aria-label', 'Воспроизвести');
      }

      if (this.progressBar) this.progressBar.style.width = '100%';

      const stop = this.currentRoute?.stops[this.currentStopIndex];
      if (this.currentRoute && this.currentStopIndex < this.currentRoute.stops.length - 1) {
        window.PESHKEM_APP?.showToast(`Точка «${stop?.title || ''}» завершена. Переходим к следующей...`, 'info');
        setTimeout(() => {
          this.nextStop();
        }, 1800);
      } else if (this.currentRoute) {
        window.PESHKEM_APP?.showToast(`Маршрут «${this.currentRoute.title}» успешно завершен!`, 'success');
      }
    }

    updateCardButtons() {
      document.querySelectorAll('.btn-stop-audio').forEach(btn => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const isActive = this.currentRoute && this.currentStopIndex === idx;

        if (isActive && this.isPlaying) {
          btn.classList.add('playing');
          btn.classList.remove('paused');
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Пауза</span>`;
        } else if (isActive && this.isPaused) {
          btn.classList.remove('playing');
          btn.classList.add('paused');
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Продолжить</span>`;
        } else {
          btn.classList.remove('playing', 'paused');
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Слушать аудиогид</span>`;
        }
      });

      const heroListenBtn = document.getElementById('btn-hero-listen-tour');
      if (heroListenBtn) {
        if (this.isPlaying) {
          heroListenBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:6px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Пауза аудиогида`;
        } else if (this.isPaused) {
          heroListenBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:6px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>Продолжить слушать`;
        } else {
          heroListenBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:6px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>Слушать весь аудиогид`;
        }
      }
    }

    pause() {
      if (this.isMp3Mode && this.audioElement && !this.audioElement.paused) {
        try {
          this.audioElement.pause();
        } catch (e) {}
      } else if (this.synth && this.isPlaying) {
        try {
          this.synth.pause();
        } catch (e) {}
        clearInterval(this.progressInterval);
      }

      this.isPlaying = false;
      this.isPaused = true;
      this.waveformEl?.classList.remove('playing');
      if (this.playPauseBtn) {
        this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        this.playPauseBtn.setAttribute('aria-label', 'Продолжить');
      }
      this.updateCardButtons();
    }

    resume() {
      if (this.isMp3Mode && this.audioElement && this.audioElement.paused) {
        try {
          this.audioElement.play().catch(() => {});
        } catch (e) {}
      } else if (this.synth && this.isPaused) {
        try {
          this.synth.resume();
        } catch (e) {}
        this.startProgress();
      }

      this.isPlaying = true;
      this.isPaused = false;
      this.waveformEl?.classList.add('playing');
      if (this.playPauseBtn) {
        this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        this.playPauseBtn.setAttribute('aria-label', 'Пауза');
      }
      this.updateCardButtons();
    }

    stop() {
      if (this.audioElement) {
        try {
          this.audioElement.pause();
          this.audioElement.currentTime = 0;
        } catch (e) {}
      }
      if (this.synth) {
        try {
          this.synth.cancel();
        } catch (e) {}
      }
      if (this.synthResumeInterval) {
        clearInterval(this.synthResumeInterval);
        this.synthResumeInterval = null;
      }
      this.isPlaying = false;
      this.isPaused = false;
      this.stopProgress();
      this.waveformEl?.classList.remove('playing');
      if (this.playPauseBtn) {
        this.playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        this.playPauseBtn.setAttribute('aria-label', 'Воспроизвести');
      }
      if (this.progressBar) this.progressBar.style.width = '0%';
      this.updateCardButtons();
    }

    nextStop() {
      if (!this.currentRoute) return;
      if (this.currentStopIndex < this.currentRoute.stops.length - 1) {
        this.playStop(this.currentRoute.id, this.currentStopIndex + 1);
      } else {
        window.PESHKEM_APP?.showToast('Это последняя точка данного маршрута', 'info');
      }
    }

    prevStop() {
      if (!this.currentRoute) return;
      if (this.currentStopIndex > 0) {
        this.playStop(this.currentRoute.id, this.currentStopIndex - 1);
      } else {
        window.PESHKEM_APP?.showToast('Это начальная точка маршрута', 'info');
      }
    }

    startProgress() {
      clearInterval(this.progressInterval);
      this.progressInterval = setInterval(() => {
        if (!this.isPlaying) return;
        const elapsedSec = (Date.now() - this.startTime) / 1000;
        const pct = Math.min(98, (elapsedSec / this.estimatedDuration) * 100);
        if (this.progressBar) {
          this.progressBar.style.width = `${pct}%`;
        }
      }, 500);
    }

    stopProgress() {
      clearInterval(this.progressInterval);
    }
  }

  window.PeshkemAudio = new PeshkemAudio();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.PeshkemAudio.init());
  } else {
    window.PeshkemAudio.init();
  }
})();
