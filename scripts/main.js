/**
 * Александр Яровенко — Скрипт интерактивности портфолио
 * Выстроен по правилам ai-design-skills и modern-web-guidance:
 * 1) IntersectionObserver для секционных появлений и активной навигации (scroll-spy)
 * 2) Построчный / пословный скролл эффект для обязательной секции слогана (B11)
 * 3) Нативный top-layer <dialog> с анимацией входа/выхода и Safari/Firefox fallback
 * 4) Асимметричная витрина проектов с фильтрацией, скелетоном и детальным кейсом
 * 5) Клиентская валидация формы брифа (:user-invalid + ARIA live announcer)
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeaderScroll();
  initMobileDrawer();
  initScrollSpy();
  initScrollProgressFallback();
  initRevealObserver();
  initTaglineWordReveal();
  initWorksShowcase();
  initFaqAccordion();
  initModalDialog();
  initEstimatorAndBrief();
  initLiveTime();
  initCopyEmail();
  initSoundPreference();
  openCaseFromHash();
});

/* --------------------------------------------------------------------------
   0. Scroll Progress Fallback (for browsers without scroll() timeline)
   -------------------------------------------------------------------------- */
function initScrollProgressFallback() {
  const progress = document.getElementById('scroll-progress');
  if (!progress) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (CSS.supports('animation-timeline', 'scroll()')) return;

  let ticking = false;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(Math.max(window.scrollY / scrollable, 0), 1) : 0;
    progress.style.transform = `scaleX(${ratio})`;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

/* --------------------------------------------------------------------------
   1. Floating Header & Full-Height Accessible Mobile Drawer (B7)
   -------------------------------------------------------------------------- */
function initHeaderScroll() {
  const nav = document.getElementById('floating-nav');
  if (!nav) return;

  const sentinel = document.getElementById('top-sentinel');
  if (!sentinel) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        nav.classList.toggle('is-scrolled', !entry.isIntersecting);
      }
    },
    { threshold: 0 }
  );
  observer.observe(sentinel);
}

function initMobileDrawer() {
  const toggleBtn = document.getElementById('menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const pageMain = document.getElementById('main-content');
  const pageFooter = document.getElementById('site-footer');
  if (!toggleBtn || !drawer) return;

  const drawerLinks = drawer.querySelectorAll('a');

  function setDrawerState(open) {
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', open ? 'Закрыть меню навигации' : 'Открыть меню навигации');

    if (pageMain) pageMain.inert = open;
    if (pageFooter) pageFooter.inert = open;

    if (open && drawerLinks.length > 0) {
      drawerLinks[0].focus();
    } else if (!open) {
      toggleBtn.focus();
    }
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('is-open');
    setDrawerState(!isOpen);
    if (window.sfx) window.sfx.click();
  });

  drawerLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setDrawerState(false);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      setDrawerState(false);
    }
  });
}

function initScrollSpy() {
  const navLinks = Array.from(document.querySelectorAll('.desktop-nav-list .nav-link[href^="#"]'));
  if (!navLinks.length) return;

  const sectionIds = navLinks.map((a) => a.getAttribute('href').slice(1));
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const activeHref = `#${entry.target.id}`;
          navLinks.forEach((link) => {
            if (link.getAttribute('href') === activeHref) {
              link.setAttribute('aria-current', 'location');
            } else {
              link.removeAttribute('aria-current');
            }
          });
        }
      }
    },
    { rootMargin: '-35% 0px -50% 0px', threshold: 0 }
  );

  sections.forEach((sec) => observer.observe(sec));
}

/* --------------------------------------------------------------------------
   2. Scroll Section Reveals (IntersectionObserver, B7)
   -------------------------------------------------------------------------- */
function initRevealObserver() {
  const reveals = document.querySelectorAll('.reveal-init');
  if (!reveals.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveals.forEach((el) => el.classList.add('reveal-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -32px 0px' }
  );

  reveals.forEach((el) => observer.observe(el));
}

/* --------------------------------------------------------------------------
   3. Mandatory Tagline Word Reveal (B11)
   Word by word along viewport trigger line, throttled through rAF
   -------------------------------------------------------------------------- */
function initTaglineWordReveal() {
  const container = document.getElementById('tagline-reveal');
  if (!container) return;

  const lines = Array.from(container.querySelectorAll('[data-reveal-line]'));
  const words = [];

  lines.forEach((lineEl) => {
    const rawWords = lineEl.textContent.trim().split(/\s+/);
    lineEl.textContent = '';
    rawWords.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'reveal-word';
      span.textContent = word;
      lineEl.appendChild(span);
      words.push(span);
      if (index < rawWords.length - 1) {
        lineEl.appendChild(document.createTextNode(' '));
      }
    });
  });

  if (!words.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    words.forEach((w) => w.classList.add('is-lit'));
    return;
  }

  let rafPending = false;
  let active = false;

  function updateWords() {
    rafPending = false;
    const rect = container.getBoundingClientRect();
    const vh = window.innerHeight || 800;

    // Progress traverses from 80% viewport height down to 32% viewport height
    const startY = vh * 0.82;
    const endY = vh * 0.34;
    const progressRaw = (startY - rect.top) / Math.max(startY - endY, 120);
    const progress = Math.min(Math.max(progressRaw, 0), 1);
    const litCount = Math.round(progress * words.length);

    words.forEach((wordEl, idx) => {
      wordEl.classList.toggle('is-lit', idx < litCount);
    });
  }

  function scheduleUpdate() {
    if (!active || rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateWords);
  }

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        active = entry.isIntersecting;
        if (active) {
          scheduleUpdate();
        }
      }
    },
    { rootMargin: '120px 0px 120px 0px', threshold: 0 }
  );

  sectionObserver.observe(container);
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  updateWords();
}

/* --------------------------------------------------------------------------
   4. Works Bento Grid, Filter Tabs, Skeleton & Empty State (B9)
   -------------------------------------------------------------------------- */
function getBentoSpanClass(idx, total) {
  if (total === 1) return 'is-featured';
  if (total === 2) return idx === 0 ? 'is-wide' : 'is-compact';
  if (idx === 0) return 'is-featured';
  if (idx === total - 1 && (total - 1) % 2 === 1) return 'is-featured';
  const pairIdx = Math.floor((idx - 1) / 2);
  const posInPair = (idx - 1) % 2;
  if (pairIdx % 2 === 0) {
    return posInPair === 0 ? 'is-wide' : 'is-compact';
  }
  return posInPair === 0 ? 'is-compact' : 'is-wide';
}

function renderWorksSkeleton(container) {
  container.innerHTML = [0, 1].map(() => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-box skeleton-media skeleton-pulse"></div>
      <div class="skeleton-box skeleton-line-lg skeleton-pulse"></div>
      <div class="skeleton-box skeleton-line-sm skeleton-pulse"></div>
    </div>
  `).join('');
}

function renderWorks(category = 'all', showSkeletonTransition = false) {
  const container = document.getElementById('works-container');
  const countEl = document.getElementById('visible-count');
  if (!container) return;

  const filtered = category === 'all'
    ? portfolioData
    : portfolioData.filter((item) => item.category === category);

  if (countEl) {
    countEl.textContent = `${filtered.length} из ${portfolioData.length}`;
  }

  const paintGrid = () => {
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="works-state-panel">
          <p class="title-2">В этой категории пока нет опубликованных кейсов</p>
          <p class="body-6" style="color: var(--text-secondary);">Сбросьте фильтр, чтобы вернуться ко всем восьми проектам портфолио.</p>
          <button type="button" class="btn btn-primary button-sm" id="reset-works-filter">Показать все проекты</button>
        </div>
      `;
      const resetBtn = document.getElementById('reset-works-filter');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
          if (allBtn) allBtn.click();
        });
      }
      return;
    }

    container.innerHTML = filtered.map((item, idx) => {
      const spanClass = getBentoSpanClass(idx, filtered.length);
      const firstResult = item.results && item.results[0]
        ? `${item.results[0].label}: ${item.results[0].value}`
        : item.tags.slice(0, 2).join(', ');

      return `
        <article class="work-card ${spanClass}" data-id="${item.id}">
          <div class="work-media">
            <img src="${item.image}" alt="${item.title}: ${item.tagline}" loading="${idx === 0 ? 'eager' : 'lazy'}" width="1280" height="800">
          </div>
          <div class="work-body">
            <div class="work-meta-row">
              <span class="meta-pill meta-pill-accent caption-4">${item.categoryLabel}</span>
              <span class="meta-pill caption-5 mono-num">${item.year}</span>
            </div>
            <div class="work-header-row">
              <h3 class="heading-5 work-title">${item.title}</h3>
              <button type="button" class="work-arrow-btn" data-open-case="${item.id}" aria-label="Открыть кейс ${item.title}">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="64" y1="192" x2="192" y2="64"></line>
                  <polyline points="88 64 192 64 192 168"></polyline>
                </svg>
              </button>
            </div>
            <p class="body-3 work-desc">${item.tagline}</p>
            <div class="work-footer-row">
              <span class="body-4 work-metric">${firstResult}</span>
              <span class="caption-4" style="color: var(--text-tertiary);">${item.tags.slice(0, 3).join(' · ')}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.work-card').forEach((card) => {
      const caseId = card.getAttribute('data-id');
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        openProjectModal(caseId);
      });
    });
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (showSkeletonTransition && !reduced) {
    renderWorksSkeleton(container);
    setTimeout(paintGrid, 160);
  } else {
    paintGrid();
  }
}

function initWorksShowcase() {
  renderWorks('all', false);

  const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      renderWorks(btn.getAttribute('data-filter'), false);
      if (window.sfx) window.sfx.click();
    });
  });

  const heroPreviewBtn = document.getElementById('hero-preview-case');
  if (heroPreviewBtn) {
    heroPreviewBtn.addEventListener('click', () => openProjectModal('kinetix-pay'));
  }
}

/* --------------------------------------------------------------------------
   5. Accessible FAQ Accordion (modern-web-guidance: heading wraps button)
   -------------------------------------------------------------------------- */
function initFaqAccordion() {
  const faqRoot = document.getElementById('faq-list');
  if (!faqRoot || typeof faqData === 'undefined') return;

  faqRoot.innerHTML = faqData.map((item, idx) => `
    <div class="faq-item">
      <h3>
        <button type="button" class="faq-trigger title-2" aria-expanded="${idx === 0 ? 'true' : 'false'}" aria-controls="faq-panel-${idx}" id="faq-trigger-${idx}">
          <span>${item.question}</span>
          <svg class="faq-icon" width="20" height="20" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="128" y1="40" x2="128" y2="216"></line>
            <line x1="40" y1="128" x2="216" y2="128"></line>
          </svg>
        </button>
      </h3>
      <div id="faq-panel-${idx}" class="faq-panel body-3" role="region" aria-labelledby="faq-trigger-${idx}" ${idx === 0 ? '' : 'hidden'}>
        ${item.answer}
      </div>
    </div>
  `).join('');

  faqRoot.querySelectorAll('.faq-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const panelId = btn.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (panel) panel.hidden = expanded;
      if (window.sfx) window.sfx.click();
    });
  });
}

/* --------------------------------------------------------------------------
   6. Top-Layer Native <dialog> Modal + Safari/Firefox Fallbacks
   -------------------------------------------------------------------------- */
let supportsDisplayTransition;
let activeModalCaseId = null;

function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

async function closeTopLayer(element) {
  if (!element || !element.open) return;

  if (!supportsTopLayerExit()) {
    element.setAttribute('data-closing', '');
    const animations = element.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 600))
      ]);
    }
    if (!element.hasAttribute('data-closing')) return;
    element.removeAttribute('data-closing');
  }

  element.close();
}

function initModalDialog() {
  const modal = document.getElementById('project-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeProjectModal());
  }

  const copyCaseBtn = document.getElementById('modal-copy-link-btn');
  if (copyCaseBtn) {
    copyCaseBtn.addEventListener('click', async () => {
      if (!activeModalCaseId) return;
      const caseUrl = `${window.location.origin}${window.location.pathname}#case-${activeModalCaseId}`;
      try {
        await navigator.clipboard.writeText(caseUrl);
        showToast('Ссылка на проект скопирована');
        if (window.sfx) window.sfx.success();
      } catch (_err) {
        showToast(caseUrl);
      }
    });
  }

  // Click backdrop fallback when browser lacks closedBy attribute (Safari)
  modal.addEventListener('click', (event) => {
    if (event.target !== modal) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const rect = modal.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (inside) return;
    }
    closeProjectModal();
  });

  // Intercept native cancel so top-layer exit transition plays cleanly
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeProjectModal();
  });
}

function openProjectModal(id) {
  const item = portfolioData.find((p) => p.id === id);
  const modal = document.getElementById('project-modal');
  if (!item || !modal) return;

  activeModalCaseId = item.id;
  modal.removeAttribute('data-closing');

  document.getElementById('modal-title').textContent = item.title;
  document.getElementById('modal-category-badge').textContent = item.categoryLabel;
  document.getElementById('modal-year-badge').textContent = item.year;

  const heroImg = document.getElementById('modal-image');
  heroImg.src = item.image;
  heroImg.alt = `${item.title}: ${item.tagline}`;

  document.getElementById('modal-client').textContent = item.client;
  document.getElementById('modal-role').textContent = item.role;
  document.getElementById('modal-year').textContent = item.year;
  document.getElementById('modal-tools').textContent = item.tags.join(', ');

  document.getElementById('modal-tagline').textContent = item.tagline;
  document.getElementById('modal-desc').textContent = item.description;

  const discussBtn = document.getElementById('modal-discuss-btn');
  if (discussBtn) {
    const msg = `Здравствуйте, Александр. Посмотрел проект «${item.title}» и хочу обсудить похожую задачу.`;
    discussBtn.href = `https://t.me/MrRebrik?text=${encodeURIComponent(msg)}`;
  }

  const highlightsList = document.getElementById('modal-highlights-list');
  highlightsList.innerHTML = item.designHighlights.map((h) => `
    <li>
      <svg width="16" height="16" viewBox="0 0 256 256" fill="none" stroke="var(--text-accent)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 4px;" aria-hidden="true">
        <polyline points="40 144 96 200 224 72"></polyline>
      </svg>
      <span>${h}</span>
    </li>
  `).join('');

  const resultsContainer = document.getElementById('modal-results-container');
  resultsContainer.innerHTML = item.results.map((r) => `
    <div class="result-row">
      <span class="caption-2" style="color: var(--text-secondary);">${r.label}</span>
      <span class="body-4" style="color: var(--text-accent);">${r.value}</span>
    </div>
  `).join('');

  if (history.replaceState) {
    history.replaceState(null, '', `#case-${item.id}`);
  }
  modal.showModal();
  modal.scrollTop = 0;
  if (window.sfx) window.sfx.modalOpen();
}

function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || !modal.open) return;

  activeModalCaseId = null;
  if (history.replaceState && window.location.hash.startsWith('#case-')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  closeTopLayer(modal);
  if (window.sfx) window.sfx.modalClose();
}

function openCaseFromHash() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#case-')) return;
  const caseId = hash.replace('#case-', '');
  if (portfolioData.some((p) => p.id === caseId)) {
    openProjectModal(caseId);
  }
}

/* --------------------------------------------------------------------------
   7. Estimator + Validated Brief Form (:user-invalid + ARIA live announcer)
   -------------------------------------------------------------------------- */
function initEstimatorAndBrief() {
  const estimatorForm = document.getElementById('estimator-form');
  const priceEl = document.getElementById('calc-price-output');
  const timeEl = document.getElementById('calc-time-output');

  let currentEstimate = {
    service: 'Посадочная страница',
    scope: 'Базовый объем',
    urgency: 'Обычный темп',
    priceText: 'от 25 000 ₽',
    daysText: 'около 5 рабочих дней'
  };

  function recalculate() {
    if (!estimatorForm) return;
    const serviceInput = estimatorForm.querySelector('input[name="service"]:checked');
    const scopeInput = estimatorForm.querySelector('input[name="scope"]:checked');
    const urgencyInput = estimatorForm.querySelector('input[name="urgency"]:checked');
    if (!serviceInput || !scopeInput || !urgencyInput) return;

    const basePrice = parseInt(serviceInput.dataset.price || '25000', 10);
    const scopeMult = parseFloat(scopeInput.dataset.multiplier || '1');
    const urgencyMult = parseFloat(urgencyInput.dataset.multiplier || '1');

    const baseDays = parseInt(serviceInput.dataset.days || '5', 10);
    const scopeDays = parseFloat(scopeInput.dataset.daysMult || '1');
    const urgencyDays = parseFloat(urgencyInput.dataset.daysUrgency || '1');

    const totalPrice = Math.round((basePrice * scopeMult * urgencyMult) / 500) * 500;
    const totalDays = Math.max(Math.round(baseDays * scopeDays * urgencyDays), 2);

    const priceText = `от ${totalPrice.toLocaleString('ru-RU')} ₽`;
    const daysText = `около ${totalDays} рабочих дней`;

    currentEstimate = {
      service: serviceInput.dataset.name,
      scope: scopeInput.dataset.name,
      urgency: urgencyInput.dataset.name,
      priceText,
      daysText
    };

    if (priceEl) priceEl.textContent = priceText;
    if (timeEl) timeEl.textContent = `Ориентировочный срок: ${daysText}`;
  }

  if (estimatorForm) {
    estimatorForm.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        recalculate();
        if (window.sfx) window.sfx.click();
      });
    });
    recalculate();
  }

  initBriefFormValidation(() => currentEstimate);
}

function initBriefFormValidation(getEstimate) {
  const form = document.getElementById('brief-form');
  const statusBox = document.getElementById('brief-status-box');
  const statusText = document.getElementById('brief-status-text');
  const telegramConfirmLink = document.getElementById('brief-telegram-confirm');
  if (!form) return;

  // Fallback for browsers lacking :user-invalid
  if (!CSS.supports('selector(:user-invalid)')) {
    const dirtyState = new WeakMap();
    const updateFallback = (el) => {
      const valid = el.validity.valid;
      el.classList.toggle('user-invalid-fallback', !valid);
      el.classList.toggle('user-valid-fallback', valid);
    };
    form.addEventListener('blur', (e) => {
      const s = dirtyState.get(e.target) || { interacted: false, blurred: false };
      s.blurred = true;
      dirtyState.set(e.target, s);
      if (s.interacted && e.target.checkValidity) updateFallback(e.target);
    }, true);
    form.addEventListener('input', (e) => {
      const s = dirtyState.get(e.target) || { interacted: false, blurred: false };
      s.interacted = true;
      dirtyState.set(e.target, s);
      if (s.blurred && e.target.checkValidity) updateFallback(e.target);
    });
    form.addEventListener('invalid', (e) => {
      dirtyState.set(e.target, { interacted: true, blurred: true });
      if (e.target.checkValidity) updateFallback(e.target);
    }, true);
  }

  // Consistent ARIA Error Experience (modern-web-guidance)
  const linkError = (el, shown) => {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);
  let announceTimer;
  let announcedField;

  const spokenText = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => n.replaceWith(`${n.getAttribute('aria-label')}: `));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };

  const announceError = (el) => {
    const errorEl = document.getElementById(el.dataset.error);
    if (!errorEl) return;
    const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      announcer.textContent = label + spokenText(errorEl);
    }, 500);
  };

  const flagged = new WeakSet();
  const announced = new WeakSet();

  const syncAria = (el, announce = false) => {
    if (!el.matches?.('input, textarea, select')) return;
    const invalid = CSS.supports('selector(:user-invalid)')
      ? el.matches(':user-invalid')
      : el.classList.contains('user-invalid-fallback');

    if (invalid) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  form.querySelectorAll('input, textarea, select').forEach((el) => syncAria(el));
  form.addEventListener('blur', (e) => syncAria(e.target, true), true);
  form.addEventListener('input', (e) => {
    if (e.target.hasAttribute('aria-invalid')) syncAria(e.target);
  });
  form.addEventListener('invalid', (e) => {
    announced.add(e.target);
    syncAria(e.target);
  }, true);

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const controls = Array.from(form.querySelectorAll('input, textarea'));
    controls.forEach((ctrl) => syncAria(ctrl, false));

    if (!form.checkValidity()) {
      const firstInvalid = controls.find((ctrl) => !ctrl.validity.valid);
      if (firstInvalid) firstInvalid.focus();
      if (window.sfx) window.sfx.click();
      return;
    }

    const clientName = form.elements.name.value.trim();
    const clientEmail = form.elements.email.value.trim();
    const clientTask = form.elements.task.value.trim();
    const est = getEstimate();

    const message =
      `Здравствуйте, Александр. Меня зовут ${clientName}.\n` +
      `Формат: ${est.service} (${est.scope}, ${est.urgency}).\n` +
      `Ориентир: ${est.priceText}, ${est.daysText}.\n` +
      `Почта для связи: ${clientEmail}\n` +
      `Задача: ${clientTask}`;

    if (telegramConfirmLink) {
      telegramConfirmLink.href = `https://t.me/MrRebrik?text=${encodeURIComponent(message)}`;
    }
    if (statusText) {
      statusText.textContent = `Бриф для ${clientName} подготовлен. Отправьте его в Telegram в один клик или скопируйте адрес ${clientEmail} для связи.`;
    }
    if (statusBox) {
      statusBox.hidden = false;
    }
    showToast('Параметры брифа сформированы');
    if (window.sfx) window.sfx.success();
  });
}

/* --------------------------------------------------------------------------
   8. Kemerovo Live Time, Email Clipboard & Sound Preference
   -------------------------------------------------------------------------- */
function initLiveTime() {
  const el = document.getElementById('live-time');
  if (!el) return;

  const update = () => {
    try {
      const fmt = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Novokuznetsk',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      el.textContent = `Кемерово ${fmt.format(new Date())} (UTC+7)`;
    } catch (_err) {
      el.textContent = 'Кемерово (UTC+7)';
    }
  };
  update();
  setInterval(update, 30000);
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast-notice');
  if (!toast) return;
  const textEl = toast.querySelector('.toast-msg');
  if (textEl) textEl.textContent = msg;
  toast.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}

function initCopyEmail() {
  const btn = document.getElementById('copy-email-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const email = btn.dataset.email || 'jarovenkoaleksander@yandex.ru';
    try {
      await navigator.clipboard.writeText(email);
      showToast(`Адрес скопирован: ${email}`);
      if (window.sfx) window.sfx.success();
    } catch (_err) {
      showToast(email);
    }
  });
}

function initSoundPreference() {
  const btn = document.getElementById('sfx-toggle');
  if (!btn || !window.sfx) return;
  btn.addEventListener('click', () => {
    window.sfx.toggle();
    const label = btn.querySelector('.sfx-state');
    if (label) {
      label.textContent = window.sfx.enabled ? 'Звук включен' : 'Звук выключен';
    }
  });
  const label = btn.querySelector('.sfx-state');
  if (label) {
    label.textContent = window.sfx.enabled ? 'Звук включен' : 'Звук выключен';
  }
}
