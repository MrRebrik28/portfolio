/**
 * ПешКем — Скрипт для отдельных страниц гидов (tyri.html, tyri2.html, tyri3.html)
 * Интерактивная карта маршрута, пошаговый аудиоплеер, трекинг прогресса и быстрая навигация
 */

(function () {
  'use strict';

  class PeshkemTourPage {
    constructor() {
      this.routeId = window.CURRENT_ROUTE_ID || 'embankment-legends';
      this.route = null;
      this.map = null;
      this.tileLayer = null;
      this.markers = {};
      this.visitedStops = {};
      this.theme = 'light';
    }

    init() {
      this.loadStorage();
      document.documentElement.setAttribute('data-theme', 'light');

      // Find Route Data
      this.route = window.PESHKEM_DATA.routes.find(r => r.id === this.routeId);
      if (!this.route) {
        console.error('Route not found:', this.routeId);
        return;
      }

      this.initTourMap();
      this.initAudioPlayer();
      this.bindStopActions();
      this.initQuickNavScrollspy();
      this.initHeaderControls();
    }

    loadStorage() {
      try {
        localStorage.removeItem('peshkem_theme');
      } catch (e) {}
      try {
        this.visitedStops = JSON.parse(localStorage.getItem('peshkem_visited_stops') || '{}');
      } catch (e) {
        this.visitedStops = {};
      }
    }

    saveStorage() {
      localStorage.setItem('peshkem_visited_stops', JSON.stringify(this.visitedStops));
    }

    initTourMap() {
      const mapContainer = document.getElementById('tour-dedicated-map');
      if (!mapContainer || typeof L === 'undefined') return;

      const firstStop = this.route.stops[0];
      const center = firstStop ? firstStop.coordinates : window.PESHKEM_DATA.city.center;

      this.map = L.map('tour-dedicated-map', {
        center: center,
        zoom: 15,
        zoomControl: false,
        scrollWheelZoom: false
      });

      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.updateMapTiles();

      // Render Trail
      const latLngs = this.route.stops.map(s => s.coordinates);

      // Glow casing
      L.polyline(latLngs, {
        color: this.route.color,
        weight: 8,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Core Polyline
      L.polyline(latLngs, {
        color: this.route.color,
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Markers
      this.route.stops.forEach((stop, index) => {
        const icon = L.divIcon({
          className: 'peshkem-map-marker-container',
          html: `
            <div class="peshkem-marker" style="--marker-color: ${this.route.color}">
              <div class="marker-pulse"></div>
              <div class="marker-dot"><span>${stop.order}</span></div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18]
        });

        const marker = L.marker(stop.coordinates, { icon }).addTo(this.map);
        marker.bindPopup(`
          <div class="peshkem-popup">
            <span class="popup-badge" style="background: ${this.route.color}20; color: ${this.route.color};">Точка №${stop.order}</span>
            <h4 class="popup-title">${stop.title}</h4>
            <p class="popup-text">${stop.shortDescription}</p>
            <div class="popup-actions">
              <button type="button" class="btn-popup-audio" data-index="${index}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Слушать
              </button>
              <a href="#stop-card-${stop.id}" class="btn-popup-detail">К карточке</a>
            </div>
          </div>
        `, { maxWidth: 280, className: 'peshkem-custom-popup' });

        this.markers[stop.id] = marker;
      });

      // Fit bounds
      this.map.fitBounds(L.latLngBounds(latLngs), {
        padding: [50, 50],
        maxZoom: 16
      });

      // Enable scroll on click
      mapContainer.addEventListener('click', () => {
        this.map.scrollWheelZoom.enable();
      });
      mapContainer.addEventListener('mouseleave', () => {
        this.map.scrollWheelZoom.disable();
      });
    }

    updateMapTiles() {
      if (!this.map) return;
      if (this.tileLayer) this.map.removeLayer(this.tileLayer);

      // OpenStreetMap standard tile URL (100% free, reliable, no API key required)
      const url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      this.tileLayer = L.tileLayer(url, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
    }

    initAudioPlayer() {
      if (window.PeshkemAudio) {
        window.PeshkemAudio.init();
      }

      // "Слушать весь маршрут" button in Hero
      document.getElementById('btn-hero-listen-tour')?.addEventListener('click', () => {
        window.PeshkemAudio?.startRoute(this.route.id, 0);
      });
    }

    bindStopActions() {
      // Individual Stop Listen Buttons
      document.querySelectorAll('.btn-stop-audio').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          window.PeshkemAudio?.playStop(this.route.id, idx);
        });
      });

      // "Показать на карте" buttons
      document.querySelectorAll('.btn-stop-map').forEach(btn => {
        btn.addEventListener('click', () => {
          const stopId = btn.getAttribute('data-stop-id');
          this.focusMarker(stopId);
          document.getElementById('tour-map-wrap')?.scrollIntoView({ behavior: 'smooth' });
        });
      });

      // Checkboxes "Отметить как пройденную"
      document.querySelectorAll('.stop-visited-checkbox').forEach(cb => {
        const stopId = cb.getAttribute('data-stop-id');
        const card = document.getElementById(`stop-card-${stopId}`);

        // Set initial state
        if (this.isStopVisited(this.route.id, stopId)) {
          cb.checked = true;
          card?.classList.add('visited');
        }

        cb.addEventListener('change', (e) => {
          this.setStopVisited(this.route.id, stopId, e.target.checked);
          card?.classList.toggle('visited', e.target.checked);
          this.updateProgressSummary();
        });
      });

      this.updateProgressSummary();

      // Popup listen button click delegation
      document.addEventListener('click', (e) => {
        const popupAudio = e.target.closest('.btn-popup-audio');
        if (popupAudio) {
          const idx = parseInt(popupAudio.getAttribute('data-index'), 10);
          window.PeshkemAudio?.playStop(this.route.id, idx);
        }
      });
    }

    focusMarker(stopId) {
      const marker = this.markers[stopId];
      if (marker && this.map) {
        this.map.flyTo(marker.getLatLng(), 17, { duration: 1.2 });
        marker.openPopup();
      }
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

    updateProgressSummary() {
      const progressTextEl = document.getElementById('tour-progress-stat');
      const progressLineEl = document.getElementById('tour-progress-line');

      const total = this.route.stops.length;
      let count = 0;
      this.route.stops.forEach(s => {
        if (this.isStopVisited(this.route.id, s.id)) count++;
      });

      const pct = Math.round((count / total) * 100);
      if (progressTextEl) {
        progressTextEl.textContent = `Пройдено ${count} из ${total} (${pct}%)`;
      }
      if (progressLineEl) {
        progressLineEl.style.width = `${pct}%`;
      }
    }

    initQuickNavScrollspy() {
      const pills = document.querySelectorAll('.quick-nav-pill');
      const cards = document.querySelectorAll('.tour-stop-card');
      const track = document.getElementById('tour-quick-nav-track');

      if (!pills.length || !cards.length) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('stop-card-', '');
            pills.forEach(p => {
              const matches = p.getAttribute('href') === `#stop-card-${id}`;
              p.classList.toggle('active', matches);
              if (matches && track) {
                const pillLeft = p.offsetLeft;
                const pillWidth = p.offsetWidth;
                const trackWidth = track.offsetWidth;
                track.scrollTo({
                  left: pillLeft - (trackWidth / 2) + (pillWidth / 2),
                  behavior: 'smooth'
                });
              }
            });
          }
        });
      }, {
        rootMargin: '-120px 0px -70% 0px'
      });

      cards.forEach(c => observer.observe(c));
    }

    initHeaderControls() {
      // Favorite Button in Hero
      const favBtn = document.getElementById('btn-hero-fav');
      let favs = new Set();
      try {
        favs = new Set(JSON.parse(localStorage.getItem('peshkem_favorites') || '[]'));
      } catch (e) {}

      if (favs.has(this.route.id)) {
        favBtn?.classList.add('active');
      }

      favBtn?.addEventListener('click', () => {
        if (favs.has(this.route.id)) {
          favs.delete(this.route.id);
          favBtn.classList.remove('active');
        } else {
          favs.add(this.route.id);
          favBtn.classList.add('active');
        }
        localStorage.setItem('peshkem_favorites', JSON.stringify(Array.from(favs)));
      });

      // Share button in Hero
      document.getElementById('btn-hero-share')?.addEventListener('click', () => {
        if (navigator.share) {
          navigator.share({
            title: `ПешКем — ${this.route.title}`,
            text: this.route.subtitle,
            url: window.location.href
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(window.location.href);
          alert('Ссылка на маршрут скопирована в буфер обмена!');
        }
      });
    }
  }

  window.PeshkemTourPage = new PeshkemTourPage();
  document.addEventListener('DOMContentLoaded', () => {
    window.PeshkemTourPage.init();
  });
})();
