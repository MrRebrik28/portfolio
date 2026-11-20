/**
 * ПешКем — Модуль интерактивной карты (Leaflet.js)
 * Поддержка светлой и тёмной тем, полилиний маршрутов, кастомных маркеров и геолокации
 */

(function () {
  'use strict';

  class PeshkemMap {
    constructor() {
      this.map = null;
      this.tileLayer = null;
      this.currentTheme = 'light';
      this.activeRouteId = 'embankment-legends';
      this.routeLayers = {};
      this.stopMarkers = {};
      this.userMarker = null;
      this.watchId = null;

      // OpenStreetMap standard tile URL (100% free, reliable, no API key required)
      this.tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      this.subdomains = 'abc';
      this.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }

    init(containerId = 'peshkem-map') {
      const container = document.getElementById(containerId);
      if (!container || typeof L === 'undefined') {
        console.warn('Map container or Leaflet library not found.');
        return;
      }

      this.currentTheme = 'light';

      // Create Leaflet instance
      this.map = L.map(containerId, {
        center: window.PESHKEM_DATA.city.center,
        zoom: window.PESHKEM_DATA.city.defaultZoom,
        zoomControl: false,
        scrollWheelZoom: false // Keep page scrolling smooth on touch/trackpad
      });

      // Add Zoom Control to bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);

      // Add Tile Layer
      this.updateTileLayer();

      // Render All Routes
      this.renderRoutes();

      // Set initial active route
      this.selectRoute(this.activeRouteId);

      // Enable scroll zoom on map focus / click
      container.addEventListener('click', () => {
        this.map.scrollWheelZoom.enable();
      });

      container.addEventListener('mouseleave', () => {
        this.map.scrollWheelZoom.disable();
      });
    }

    updateTileLayer() {
      if (!this.map) return;
      if (this.tileLayer) {
        this.map.removeLayer(this.tileLayer);
      }

      this.tileLayer = L.tileLayer(this.tileUrl, {
        subdomains: this.subdomains,
        attribution: this.attribution,
        maxZoom: 19
      }).addTo(this.map);
    }

    createCustomMarkerIcon(stop, routeColor, isActive = false) {
      return L.divIcon({
        className: 'peshkem-map-marker-container',
        html: `
          <div class="peshkem-marker ${isActive ? 'active' : ''}" style="--marker-color: ${routeColor}">
            <div class="marker-pulse"></div>
            <div class="marker-dot">
              <span>${stop.order}</span>
            </div>
            <div class="marker-label">${stop.title}</div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
      });
    }

    renderRoutes() {
      const routes = window.PESHKEM_DATA.routes;
      if (!routes || !routes.length) return;

      routes.forEach((route) => {
        const routeGroup = L.featureGroup();
        const latLngs = route.stops.map((stop) => stop.coordinates);

        // Polyline casing (glow / outline)
        const polylineGlow = L.polyline(latLngs, {
          color: route.color,
          weight: 8,
          opacity: 0.25,
          lineCap: 'round',
          lineJoin: 'round'
        });
        routeGroup.addLayer(polylineGlow);

        // Main Polyline
        const polyline = L.polyline(latLngs, {
          color: route.color,
          weight: 4,
          opacity: 0.9,
          dashArray: '8, 8',
          lineCap: 'round',
          lineJoin: 'round'
        });
        routeGroup.addLayer(polyline);

        // Stop Markers
        route.stops.forEach((stop) => {
          const icon = this.createCustomMarkerIcon(stop, route.color);
          const marker = L.marker(stop.coordinates, { icon: icon });

          const popupContent = `
            <div class="peshkem-popup">
              <div class="popup-header">
                <span class="popup-badge" style="background: ${route.color}20; color: ${route.color};">
                  Точка №${stop.order} • ${stop.durationStop}
                </span>
                <span class="popup-route-title">${route.title}</span>
              </div>
              <h4 class="popup-title">${stop.title}</h4>
              <p class="popup-text">${stop.shortDescription}</p>
              <div class="popup-actions">
                <button type="button" class="btn-popup-audio" data-route-id="${route.id}" data-stop-id="${stop.id}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Слушать гид
                </button>
                <button type="button" class="btn-popup-detail" data-route-id="${route.id}" data-stop-id="${stop.id}">
                  Подробнее
                </button>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent, {
            className: 'peshkem-custom-popup',
            maxWidth: 280,
            closeButton: true
          });

          this.stopMarkers[`${route.id}_${stop.id}`] = marker;
          routeGroup.addLayer(marker);
        });

        this.routeLayers[route.id] = {
          group: routeGroup,
          polyline: polyline,
          bounds: L.latLngBounds(latLngs)
        };
      });
    }

    selectRoute(routeId, fitBounds = true) {
      if (!this.map || !this.routeLayers[routeId]) return;

      this.activeRouteId = routeId;

      // Update layer visibilities: show all or highlight selected
      Object.keys(this.routeLayers).forEach((id) => {
        const item = this.routeLayers[id];
        if (id === routeId) {
          if (!this.map.hasLayer(item.group)) {
            this.map.addLayer(item.group);
          }
          item.group.setZIndex?.(100);
        } else {
          // Dim other routes or keep them visible with reduced opacity
          if (this.map.hasLayer(item.group)) {
            this.map.removeLayer(item.group);
          }
        }
      });

      if (fitBounds) {
        const bounds = this.routeLayers[routeId].bounds;
        this.map.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 16,
          animate: true,
          duration: 1
        });
      }

      // Dispatch route-selected event
      window.dispatchEvent(new CustomEvent('map-route-selected', { detail: { routeId } }));
    }

    focusStop(routeId, stopId) {
      if (routeId !== this.activeRouteId) {
        this.selectRoute(routeId, false);
      }

      const marker = this.stopMarkers[`${routeId}_${stopId}`];
      if (marker && this.map) {
        const latLng = marker.getLatLng();
        this.map.flyTo(latLng, 16.5, {
          duration: 1.2
        });
        marker.openPopup();
      }
    }

    locateUser() {
      if (!navigator.geolocation) {
        window.PESHKEM_APP?.showToast('Геолокация не поддерживается вашим браузером', 'warning');
        return;
      }

      window.PESHKEM_APP?.showToast('Определяем ваше местоположение...', 'info');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const userLatLng = [lat, lng];

          if (this.userMarker) {
            this.userMarker.setLatLng(userLatLng);
          } else {
            const userIcon = L.divIcon({
              className: 'peshkem-user-marker',
              html: `<div class="user-location-pin"><div class="user-pulse"></div><div class="user-core"></div></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            this.userMarker = L.marker(userLatLng, { icon: userIcon }).addTo(this.map);
          }

          this.map.flyTo(userLatLng, 16, { duration: 1.2 });
          window.PESHKEM_APP?.showToast('Вы на карте! Наслаждайтесь прогулкой', 'success');
        },
        (error) => {
          console.warn('Geolocation error:', error);
          window.PESHKEM_APP?.showToast('Не удалось определить координаты. Проверьте разрешения в браузере', 'warning');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  }

  window.PeshkemMap = new PeshkemMap();
})();
