/**
 * ALEXANDER YAROVENKO - PORTFOLIO INTERACTION ENGINE
 * Premium interactions, 3D card tilt, accessible modal, calculator, custom cursor
 */

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initCustomCursor();
  initHeaderScroll();
  initMobileNav();
  renderWorks('all');
  initPortfolioFilters();
  initModalLogic();
  initTiltCards();
  initCostCalculator();
  initCopyEmail();
  initScrollObserver();
  initInteractiveSFX();
});

/* --------------------------------------------------------------------------
   1. Live Clock (Siberia / Kemerovo Timezone UTC+7)
   -------------------------------------------------------------------------- */
function initLiveClock() {
  const clockEl = document.getElementById('live-time');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    // UTC+7 (Kemerovo / Siberia time)
    const options = {
      timeZone: 'Asia/Novokuznetsk', // UTC+7
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    try {
      const timeStr = new Intl.DateTimeFormat('ru-RU', options).format(now);
      clockEl.textContent = `${timeStr} (UTC+7)`;
    } catch (e) {
      clockEl.textContent = now.toLocaleTimeString();
    }
  }

  update();
  setInterval(update, 1000);
}

/* --------------------------------------------------------------------------
   2. Smooth Custom Cursor with Physics
   -------------------------------------------------------------------------- */
function initCustomCursor() {
  // Only enable on desktop pointer devices
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const dot = document.querySelector('.cursor-dot');
  const outline = document.querySelector('.cursor-outline');
  if (!dot || !outline) return;

  document.body.classList.add('has-custom-cursor');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let outlineX = mouseX;
  let outlineY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
  }, { passive: true });

  function renderCursor() {
    // Smooth lerp trailing
    outlineX += (mouseX - outlineX) * 0.18;
    outlineY += (mouseY - outlineY) * 0.18;
    outline.style.transform = `translate3d(${outlineX}px, ${outlineY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(renderCursor);
  }
  requestAnimationFrame(renderCursor);

  // Hover states on interactive elements
  const interactiveTargets = 'a, button, input, label, .work-card, .filter-btn';
  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.work-card');
    const interactive = e.target.closest(interactiveTargets);

    if (card) {
      outline.classList.add('view-project');
    } else if (interactive) {
      outline.classList.add('hover');
    }
  });

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.work-card');
    const interactive = e.target.closest(interactiveTargets);

    if (card) {
      outline.classList.remove('view-project');
    } else if (interactive) {
      outline.classList.remove('hover');
    }
  });
}

/* --------------------------------------------------------------------------
   3. Header Sticky & Mobile Nav
   -------------------------------------------------------------------------- */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

function initMobileNav() {
  const toggle = document.querySelector('.mobile-nav-toggle');
  const menu = document.querySelector('.nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
    if (window.sfx) window.sfx.click();
  });

  menu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* --------------------------------------------------------------------------
   4. Render Portfolio Works & Category Filter
   -------------------------------------------------------------------------- */
function renderWorks(category = 'all') {
  const container = document.getElementById('works-container');
  const countEl = document.getElementById('visible-count');
  if (!container) return;

  const filtered = category === 'all' 
    ? portfolioData 
    : portfolioData.filter(item => item.category === category);

  if (countEl) {
    countEl.textContent = `${filtered.length} из ${portfolioData.length}`;
  }

  container.innerHTML = filtered.map(item => `
    <article class="work-card" data-id="${item.id}" data-category="${item.category}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="Смотреть проект: ${item.title}">
      <div class="card-media">
        <span class="card-overlay-badge">${item.categoryLabel}</span>
        <span class="card-overlay-year">${item.year}</span>
        <img src="${item.image}" alt="${item.title} — ${item.tagline}" loading="lazy" width="800" height="500">
      </div>
      <div class="card-content">
        <div class="card-header-row">
          <h3 class="card-title">${item.title}</h3>
          <span class="card-arrow-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </span>
        </div>
        <p class="card-tagline">${item.tagline}</p>
        <div class="card-tags">
          ${item.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
          ${item.results && item.results[0] ? `<span class="tag-pill metric">${item.results[0].label}: ${item.results[0].value}</span>` : ''}
        </div>
      </div>
    </article>
  `).join('');

  // Re-attach listeners for new cards
  initCardClickEvents();
  initTiltCards();
}

function initPortfolioFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.getAttribute('data-filter');
      renderWorks(cat);
      if (window.sfx) window.sfx.click();
    });
  });
}

function initCardClickEvents() {
  document.querySelectorAll('.work-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      openProjectModal(id);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = card.getAttribute('data-id');
        openProjectModal(id);
      }
    });
  });
}

/* --------------------------------------------------------------------------
   5. 3D Card Tilt Effect
   -------------------------------------------------------------------------- */
function initTiltCards() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const cards = document.querySelectorAll('.work-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Max tilt angles (degrees)
      const rotateX = ((centerY - y) / centerY) * 7;
      const rotateY = ((x - centerX) / centerX) * 7;

      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-6px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });
}

/* --------------------------------------------------------------------------
   6. Project Detail Modal (Modern Web Guidance compliant)
   -------------------------------------------------------------------------- */
function initModalLogic() {
  const modal = document.getElementById('project-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeProjectModal());
  }

  // Modern Web Guidance fallback for click outside (light-dismiss)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeProjectModal();
    }
  });

  // Esc key native handling hook
  modal.addEventListener('cancel', () => {
    if (window.sfx) window.sfx.modalClose();
  });
}

function openProjectModal(id) {
  const item = portfolioData.find(p => p.id === id);
  const modal = document.getElementById('project-modal');
  if (!item || !modal) return;

  // Populate Modal Fields
  document.getElementById('modal-title').textContent = item.title;
  document.getElementById('modal-category-badge').textContent = item.categoryLabel;
  document.getElementById('modal-year-badge').textContent = item.year;
  
  const heroImg = document.getElementById('modal-image');
  heroImg.src = item.image;
  heroImg.alt = item.title;

  document.getElementById('modal-client').textContent = item.client || 'Концепт / Заказчик';
  document.getElementById('modal-role').textContent = item.role;
  document.getElementById('modal-year').textContent = item.year;
  document.getElementById('modal-tools').textContent = item.tags.slice(0, 3).join(', ');

  document.getElementById('modal-tagline').textContent = item.tagline;
  document.getElementById('modal-desc').textContent = item.description;

  // Highlights / Design Rules
  const highlightsList = document.getElementById('modal-highlights-list');
  highlightsList.innerHTML = item.designHighlights.map(h => `<li>${h}</li>`).join('');

  // Results
  const resultsContainer = document.getElementById('modal-results-container');
  resultsContainer.innerHTML = item.results.map(r => `
    <div class="results-metric-box">
      <span class="res-metric-lbl">${r.label}</span>
      <span class="res-metric-val">${r.value}</span>
    </div>
  `).join('');

  // Show native modal
  modal.showModal();
  if (window.sfx) window.sfx.modalOpen();
}

function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (!modal || !modal.open) return;
  modal.close();
  if (window.sfx) window.sfx.modalClose();
}

/* --------------------------------------------------------------------------
   7. Interactive Cost & Scope Calculator
   -------------------------------------------------------------------------- */
function initCostCalculator() {
  const form = document.getElementById('project-calculator');
  if (!form) return;

  const priceEl = document.getElementById('calc-price-output');
  const timeEl = document.getElementById('calc-time-output');
  const ctaBtn = document.getElementById('calc-send-telegram');

  function calculate() {
    const serviceInput = form.querySelector('input[name="service"]:checked');
    const scopeInput = form.querySelector('input[name="scope"]:checked');
    const urgencyInput = form.querySelector('input[name="urgency"]:checked');

    if (!serviceInput || !scopeInput || !urgencyInput) return;

    const basePrice = parseInt(serviceInput.getAttribute('data-price') || 0, 10);
    const scopeMultiplier = parseFloat(scopeInput.getAttribute('data-multiplier') || 1);
    const urgencyMultiplier = parseFloat(urgencyInput.getAttribute('data-multiplier') || 1);

    const baseDays = parseInt(serviceInput.getAttribute('data-days') || 5, 10);
    const scopeDaysMultiplier = parseFloat(scopeInput.getAttribute('data-days-mult') || 1);
    const urgencyDaysMultiplier = parseFloat(urgencyInput.getAttribute('data-days-urgency') || 1);

    const finalPrice = Math.round((basePrice * scopeMultiplier * urgencyMultiplier) / 500) * 500;
    const finalDays = Math.max(Math.round(baseDays * scopeDaysMultiplier * urgencyDaysMultiplier), 2);

    if (priceEl) {
      priceEl.textContent = `от ${finalPrice.toLocaleString('ru-RU')} ₽`;
    }
    if (timeEl) {
      timeEl.textContent = `Ориентировочный срок: ~${finalDays} рабочих дней`;
    }

    // Update Telegram Deep Link
    if (ctaBtn) {
      const serviceName = serviceInput.getAttribute('data-name');
      const scopeName = scopeInput.getAttribute('data-name');
      const urgencyName = urgencyInput.getAttribute('data-name');
      
      const message = `Привет, Александр! Хочу заказать дизайн проекта:%0A%0A` +
        `• Услуга: ${encodeURIComponent(serviceName)}%0A` +
        `• Объём: ${encodeURIComponent(scopeName)}%0A` +
        `• Срочность: ${encodeURIComponent(urgencyName)}%0A` +
        `• Расчётная стоимость: ~${finalPrice.toLocaleString('ru-RU')} ₽ (${finalDays} дн.)%0A%0A` +
        `Давай обсудим детали?`;

      ctaBtn.href = `https://t.me/yarovenko_designer?text=${message}`;
    }
  }

  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      calculate();
      if (window.sfx) window.sfx.click();
    });
  });

  calculate();
}

/* --------------------------------------------------------------------------
   8. Copy Email to Clipboard & Toast
   -------------------------------------------------------------------------- */
function initCopyEmail() {
  const btn = document.getElementById('copy-email-btn');
  const toast = document.getElementById('toast-notice');
  if (!btn || !toast) return;

  btn.addEventListener('click', async () => {
    const email = btn.getAttribute('data-email') || 'alexander.yarovenko.design@gmail.com';
    try {
      await navigator.clipboard.writeText(email);
      showToast(`Скопировано в буфер: ${email}`);
      if (window.sfx) window.sfx.success();
    } catch (e) {
      // Fallback
      showToast(`Email: ${email}`);
    }
  });

  function showToast(msg) {
    const textEl = toast.querySelector('.toast-msg');
    if (textEl) textEl.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
}

/* --------------------------------------------------------------------------
   9. Scroll Observer for Reveal Animations
   -------------------------------------------------------------------------- */
function initScrollObserver() {
  const reveals = document.querySelectorAll('.reveal-init');
  if (!reveals.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(el => observer.observe(el));
}

/* --------------------------------------------------------------------------
   10. Interactive SFX Bindings
   -------------------------------------------------------------------------- */
function initInteractiveSFX() {
  const sfxToggleBtn = document.getElementById('sfx-toggle');
  if (sfxToggleBtn && window.sfx) {
    sfxToggleBtn.addEventListener('click', () => {
      window.sfx.toggle();
    });
  }

  document.querySelectorAll('a, button, .work-card, .filter-btn, .calc-option-label').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (window.sfx) window.sfx.hover();
    });
  });
}
