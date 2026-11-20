/**
 * ПешКем — Главный контроллер приложения
 * Управление темой, диалогами, фильтрами, избранным, режимом прогулки и тостами
 */

(function () {
  'use strict';

  class PeshkemApp {
    constructor() {
      this.theme = 'light';
      this.favorites = new Set();
      this.visitedStops = {};
      this.activeFilter = 'all';
      this.searchQuery = '';
      this.activeRoute = null;

      this.toastContainer = null;
    }

    init() {
      this.loadStorage();
      this.initTheme();
      this.initToasts();
      this.initNavigation();
      this.initRouteCards();
      this.initModals();
      this.initFaqAccordion();
      this.initReviews();

      // Initialize Map and Audio
      if (window.PeshkemMap) window.PeshkemMap.init();
      if (window.PeshkemAudio) window.PeshkemAudio.init();

      // Listen for popup actions from map
      this.bindMapEvents();
    }

    loadStorage() {
      // Clear legacy dark theme setting if present
      try {
        localStorage.removeItem('peshkem_theme');
      } catch (e) {}

      // Favorites
      try {
        const savedFavs = JSON.parse(localStorage.getItem('peshkem_favorites') || '[]');
        this.favorites = new Set(savedFavs);
      } catch (e) {
        this.favorites = new Set();
      }

      // Visited Stops
      try {
        this.visitedStops = JSON.parse(localStorage.getItem('peshkem_visited_stops') || '{}');
      } catch (e) {
        this.visitedStops = {};
      }
    }

    saveStorage() {
      localStorage.setItem('peshkem_favorites', JSON.stringify(Array.from(this.favorites)));
      localStorage.setItem('peshkem_visited_stops', JSON.stringify(this.visitedStops));
    }

    initTheme() {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    initToasts() {
      let container = document.getElementById('peshkem-toasts');
      if (!container) {
        container = document.createElement('div');
        container.id = 'peshkem-toasts';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      this.toastContainer = container;
    }

    showToast(message, type = 'info', duration = 3500) {
      if (!this.toastContainer) return;

      const toast = document.createElement('div');
      toast.className = `toast-item toast-${type}`;

      const iconSvg = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
      }[type] || '';

      toast.innerHTML = `
        <span class="toast-icon">${iconSvg}</span>
        <span class="toast-message">${message}</span>
      `;

      this.toastContainer.appendChild(toast);

      // Trigger animation
      requestAnimationFrame(() => {
        toast.classList.add('visible');
      });

      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    initNavigation() {
      // Mobile Drawer Dialog
      const drawer = document.getElementById('nav-drawer');
      const openBtn = document.getElementById('btn-open-drawer');
      const closeBtn = document.getElementById('btn-close-drawer');

      openBtn?.addEventListener('click', () => {
        drawer?.showModal();
        openBtn.setAttribute('aria-expanded', 'true');
      });

      closeBtn?.addEventListener('click', () => {
        drawer?.close();
        openBtn?.setAttribute('aria-expanded', 'false');
      });

      // Light-dismiss drawer on backdrop click
      drawer?.addEventListener('click', (event) => {
        const sheet = drawer.querySelector('.drawer-sheet');
        if (sheet && !sheet.contains(event.target)) {
          drawer.close();
          openBtn?.setAttribute('aria-expanded', 'false');
        }
      });

      drawer?.addEventListener('close', () => {
        openBtn?.setAttribute('aria-expanded', 'false');
      });

      // Close drawer on internal link click
      drawer?.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          drawer.close();
        });
      });

      // Update Favorites Counter in Header
      this.updateFavoritesBadge();

      // Quick Header buttons
      document.getElementById('btn-header-start')?.addEventListener('click', () => {
        this.openWalkMode('embankment-legends');
      });

      document.getElementById('btn-header-favs')?.addEventListener('click', () => {
        this.activeFilter = 'favorites';
        this.filterRoutes();
        document.getElementById('routes-section')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    updateFavoritesBadge() {
      const badge = document.getElementById('favorites-counter');
      if (!badge) return;
      const count = this.favorites.size;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    filterRoutes() {
      const container = document.getElementById('routes-cards-container');
      if (!container) return;

      const routes = window.PESHKEM_DATA.routes;
      let matchedCount = 0;

      container.querySelectorAll('.route-card').forEach(card => {
        const routeId = card.getAttribute('data-route-id');
        const route = routes.find(r => r.id === routeId);
        if (!route) return;

        let matchesCategory = true;
        if (this.activeFilter === 'favorites') {
          matchesCategory = this.favorites.has(routeId);
        } else if (this.activeFilter === 'historical') {
          matchesCategory = route.category === 'historical';
        } else if (this.activeFilter === 'memorial') {
          matchesCategory = route.category === 'memorial';
        } else if (this.activeFilter === 'industrial') {
          matchesCategory = route.category === 'industrial';
        } else if (this.activeFilter === 'short') {
          matchesCategory = route.durationMinutes <= 90;
        }

        let matchesSearch = true;
        if (this.searchQuery) {
          const haystack = `${route.title} ${route.subtitle} ${route.description} ${route.tags.join(' ')} ${route.stops.map(s => s.title).join(' ')}`.toLowerCase();
          matchesSearch = haystack.includes(this.searchQuery);
        }

        if (matchesCategory && matchesSearch) {
          card.style.display = '';
          matchedCount++;
        } else {
          card.style.display = 'none';
        }
      });

      const emptyEl = document.getElementById('routes-empty-state');
      if (emptyEl) {
        emptyEl.style.display = matchedCount === 0 ? 'block' : 'none';
      }
    }

    initRouteCards() {
      const container = document.getElementById('routes-cards-container');
      if (!container) return;

      container.addEventListener('click', (e) => {
        const target = e.target;

        // Favorite Toggle
        const favBtn = target.closest('.btn-card-fav');
        if (favBtn) {
          const routeId = favBtn.getAttribute('data-route-id');
          if (this.favorites.has(routeId)) {
            this.favorites.delete(routeId);
            favBtn.classList.remove('active');
            favBtn.setAttribute('aria-label', 'Добавить в избранное');
            this.showToast('Маршрут удалён из избранного', 'info');
          } else {
            this.favorites.add(routeId);
            favBtn.classList.add('active');
            favBtn.setAttribute('aria-label', 'Удалить из избранного');
            this.showToast('Маршрут добавлен в избранное ', 'success');
          }
          this.saveStorage();
          this.updateFavoritesBadge();
          return;
        }

        // Open Route Details
        const detailBtn = target.closest('.btn-route-detail');
        if (detailBtn) {
          const routeId = detailBtn.getAttribute('data-route-id');
          this.openRouteDetail(routeId);
          return;
        }

        // Start Audio Guide
        const audioBtn = target.closest('.btn-route-audio');
        if (audioBtn) {
          const routeId = audioBtn.getAttribute('data-route-id');
          window.PeshkemAudio?.startRoute(routeId, 0);
          return;
        }

        // Show on Map
        const mapBtn = target.closest('.btn-route-on-map');
        if (mapBtn) {
          const routeId = mapBtn.getAttribute('data-route-id');
          window.PeshkemMap?.selectRoute(routeId, true);
          document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      });

      // Map Route Switcher Tabs
      document.querySelectorAll('.map-route-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.map-route-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const routeId = tab.getAttribute('data-route-id');
          window.PeshkemMap?.selectRoute(routeId, true);
        });
      });

      // Map Geolocation Button
      document.getElementById('btn-map-locate')?.addEventListener('click', () => {
        window.PeshkemMap?.locateUser();
      });
    }

    openRouteDetail(routeId) {
      const route = window.PESHKEM_DATA.routes.find(r => r.id === routeId);
      if (!route) return;

      this.activeRoute = route;
      const modal = document.getElementById('dialog-route-detail');
      if (!modal) return;

      // Populate Modal Content
      modal.querySelector('.modal-route-badge').textContent = route.categoryName;
      modal.querySelector('.modal-route-badge').style.background = `${route.color}20`;
      modal.querySelector('.modal-route-badge').style.color = route.color;
      modal.querySelector('.modal-route-title').textContent = route.title;
      modal.querySelector('.modal-route-desc').textContent = route.description;

      modal.querySelector('.param-time').textContent = route.duration;
      modal.querySelector('.param-dist').textContent = route.distance;
      modal.querySelector('.param-stops').textContent = `${route.stops.length} точек`;
      modal.querySelector('.param-diff').textContent = route.difficulty;

      // Render Stops Timeline
      const stopsListEl = modal.querySelector('.modal-stops-timeline');
      if (stopsListEl) {
        stopsListEl.innerHTML = route.stops.map((stop, index) => {
          const isVisited = this.isStopVisited(route.id, stop.id);
          return `
            <div class="timeline-stop-item ${isVisited ? 'visited' : ''}" data-stop-id="${stop.id}">
              <div class="timeline-marker" style="--route-color: ${route.color}">
                <span>${stop.order}</span>
              </div>
              <div class="timeline-content">
                <div class="timeline-stop-header">
                  <h4 class="timeline-stop-title">${stop.title}</h4>
                  <span class="timeline-stop-time">${stop.durationStop}</span>
                </div>
                <p class="timeline-stop-desc">${stop.shortDescription}</p>
                <div class="timeline-stop-actions">
                  <button type="button" class="btn-timeline-listen" data-route-id="${route.id}" data-index="${index}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Слушать точку
                  </button>
                  <button type="button" class="btn-timeline-map" data-route-id="${route.id}" data-stop-id="${stop.id}">
                    Показать на карте
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      // Actions in Modal
      const startWalkBtn = modal.querySelector('.btn-modal-start-walk');
      if (startWalkBtn) {
        startWalkBtn.onclick = () => {
          modal.close();
          this.openWalkMode(route.id);
        };
      }

      const listenAllBtn = modal.querySelector('.btn-modal-listen-all');
      if (listenAllBtn) {
        listenAllBtn.onclick = () => {
          modal.close();
          window.PeshkemAudio?.startRoute(route.id, 0);
        };
      }

      const shareBtn = modal.querySelector('.btn-modal-share');
      if (shareBtn) {
        shareBtn.onclick = () => {
          if (navigator.share) {
            navigator.share({
              title: `ПешКем — ${route.title}`,
              text: route.subtitle,
              url: window.location.href
            }).catch(() => {});
          } else {
            navigator.clipboard.writeText(window.location.href);
            this.showToast('Ссылка на маршрут скопирована в буфер обмена ', 'success');
          }
        };
      }

      this.openModal('dialog-route-detail');
    }

    openWalkMode(routeId) {
      const route = window.PESHKEM_DATA.routes.find(r => r.id === routeId);
      if (!route) return;

      this.activeRoute = route;
      const modal = document.getElementById('dialog-walk-mode');
      if (!modal) return;

      modal.querySelector('.walk-route-title').textContent = route.title;

      this.renderWalkChecklist(modal, route);

      this.openModal('dialog-walk-mode');
      window.PeshkemMap?.selectRoute(route.id, true);
    }

    renderWalkChecklist(modal, route) {
      const container = modal.querySelector('.walk-stops-checklist');
      if (!container) return;

      let visitedCount = 0;

      container.innerHTML = route.stops.map((stop, index) => {
        const isVisited = this.isStopVisited(route.id, stop.id);
        if (isVisited) visitedCount++;

        return `
          <div class="walk-item ${isVisited ? 'is-done' : ''}" data-stop-id="${stop.id}">
            <label class="walk-checkbox-label">
              <input type="checkbox" class="walk-checkbox" data-route-id="${route.id}" data-stop-id="${stop.id}" ${isVisited ? 'checked' : ''}>
              <span class="custom-checkbox"></span>
              <span class="walk-stop-name">${stop.order}. ${stop.title}</span>
            </label>
            <div class="walk-item-actions">
              <button type="button" class="btn-walk-listen" data-route-id="${route.id}" data-index="${index}" title="Слушать">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <a href="https://yandex.ru/maps/?rtext=~${stop.coordinates[0]},${stop.coordinates[1]}" target="_blank" rel="noopener noreferrer" class="btn-walk-navigate" title="Навигатор">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </a>
            </div>
          </div>
        `;
      }).join('');

      // Update progress indicator
      const pct = Math.round((visitedCount / route.stops.length) * 100);
      const progressBar = modal.querySelector('.walk-progress-fill');
      const progressText = modal.querySelector('.walk-progress-text');
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressText) progressText.textContent = `Пройдено ${visitedCount} из ${route.stops.length} точек (${pct}%)`;

      // Checkbox click handlers
      container.querySelectorAll('.walk-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const rId = cb.getAttribute('data-route-id');
          const sId = cb.getAttribute('data-stop-id');
          this.setStopVisited(rId, sId, e.target.checked);
          this.renderWalkChecklist(modal, route);
          if (e.target.checked) {
            this.showToast('Точка отмечена как пройденная! ', 'success');
          }
        });
      });

      // Listen buttons
      container.querySelectorAll('.btn-walk-listen').forEach(btn => {
        btn.addEventListener('click', () => {
          const rId = btn.getAttribute('data-route-id');
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          window.PeshkemAudio?.playStop(rId, idx);
        });
      });
    }

    isStopVisited(routeId, stopId) {
      return !!(this.visitedStops[routeId] && this.visitedStops[routeId][stopId]);
    }

    setStopVisited(routeId, stopId, status) {
      if (!this.visitedStops[routeId]) {
        this.visitedStops[routeId] = {};
      }
      this.visitedStops[routeId][stopId] = status;
      this.saveStorage();
    }

    initModals() {
      // Light-dismiss support for all native <dialog> elements
      document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', (event) => {
          const box = dialog.querySelector('.modal-box') || dialog.querySelector('.drawer-sheet');
          if (box && !box.contains(event.target)) {
            dialog.close();
          }
        });

        dialog.querySelectorAll('.btn-modal-close').forEach(btn => {
          btn.addEventListener('click', () => dialog.close());
        });
      });

      // Stop Timeline buttons inside Route Detail Modal
      const routeDetailModal = document.getElementById('dialog-route-detail');
      routeDetailModal?.addEventListener('click', (e) => {
        const listenBtn = e.target.closest('.btn-timeline-listen');
        if (listenBtn) {
          const rId = listenBtn.getAttribute('data-route-id');
          const idx = parseInt(listenBtn.getAttribute('data-index'), 10);
          routeDetailModal.close();
          window.PeshkemAudio?.playStop(rId, idx);
          return;
        }

        const mapBtn = e.target.closest('.btn-timeline-map');
        if (mapBtn) {
          const rId = mapBtn.getAttribute('data-route-id');
          const sId = mapBtn.getAttribute('data-stop-id');
          routeDetailModal.close();
          window.PeshkemMap?.focusStop(rId, sId);
          document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      });
    }

    openModal(id) {
      const dialog = document.getElementById(id);
      if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    }

    initFaqAccordion() {
      const expandAllBtn = document.getElementById('btn-faq-toggle-all');
      const faqSection = document.getElementById('faq-section');
      if (!faqSection) return;

      const detailsList = faqSection.querySelectorAll('details');

      expandAllBtn?.addEventListener('click', () => {
        const isAllOpen = Array.from(detailsList).every(d => d.open);
        const newState = !isAllOpen;

        detailsList.forEach(d => {
          d.open = newState;
        });

        expandAllBtn.setAttribute('aria-expanded', String(newState));
        expandAllBtn.querySelector('.btn-text').textContent = newState ? 'Свернуть все' : 'Развернуть все';
      });

      // Keep expand-all button label in sync
      detailsList.forEach(d => {
        d.addEventListener('toggle', () => {
          const isAllOpen = Array.from(detailsList).every(item => item.open);
          if (expandAllBtn) {
            expandAllBtn.setAttribute('aria-expanded', String(isAllOpen));
            expandAllBtn.querySelector('.btn-text').textContent = isAllOpen ? 'Свернуть все' : 'Развернуть все';
          }
        });
      });
    }

    initReviews() {
      const addReviewBtn = document.getElementById('btn-add-review');
      const reviewModal = document.getElementById('dialog-review');
      const reviewForm = document.getElementById('form-add-review');

      addReviewBtn?.addEventListener('click', () => {
        this.openModal('dialog-review');
      });

      reviewForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const author = document.getElementById('review-author')?.value;
        const text = document.getElementById('review-text')?.value;

        if (author && text) {
          this.showToast('Спасибо за ваш тёплый отзыв о прогулке! Опубликовано ', 'success');
          reviewModal?.close();
          reviewForm.reset();
        }
      });
    }

    bindMapEvents() {
      document.addEventListener('click', (e) => {
        const audioBtn = e.target.closest('.btn-popup-audio');
        if (audioBtn) {
          const rId = audioBtn.getAttribute('data-route-id');
          const sId = audioBtn.getAttribute('data-stop-id');
          const route = window.PESHKEM_DATA.routes.find(r => r.id === rId);
          if (route) {
            const idx = route.stops.findIndex(s => s.id === sId);
            if (idx !== -1) {
              window.PeshkemAudio?.playStop(rId, idx);
            }
          }
          return;
        }

        const detailBtn = e.target.closest('.btn-popup-detail');
        if (detailBtn) {
          const rId = detailBtn.getAttribute('data-route-id');
          this.openRouteDetail(rId);
          return;
        }
      });
    }
  }

  window.PESHKEM_APP = new PeshkemApp();
  document.addEventListener('DOMContentLoaded', () => {
    window.PESHKEM_APP.init();
  });
})();
