/**
 * Interactive Background Canvas
 * Fluid particle network & cyber-grid with mouse attraction and neon glow
 */

class BackgroundCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: null, y: null, radius: 160 };
    this.animationId = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.init();
    this.bindEvents();
    this.animate();
  }

  init() {
    this.resize();
    this.createParticles();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  createParticles() {
    this.particles = [];
    // Number of particles proportional to screen area
    const count = Math.floor((this.width * this.height) / 18000);
    const particleCount = Math.min(Math.max(count, 35), 85);

    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 1.8 + 0.8,
        alpha: Math.random() * 0.4 + 0.2,
        baseAlpha: Math.random() * 0.35 + 0.15,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        angle: Math.random() * Math.PI * 2
      });
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.createParticles();
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });

    // Pause when page is not visible to conserve resources
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.animationId);
      } else {
        this.animate();
      }
    });
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw subtle cyber grid vignette in background
    this.drawGrid();

    // Update and draw particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Pulse
      p.angle += p.pulseSpeed;
      p.alpha = p.baseAlpha + Math.sin(p.angle) * 0.15;

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off edges
      if (p.x < 0 || p.x > this.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.height) p.vy *= -1;

      // Mouse repulsion/attraction
      if (this.mouse.x !== null) {
        const dx = this.mouse.x - p.x;
        const dy = this.mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.mouse.radius) {
          const force = (1 - dist / this.mouse.radius) * 1.2;
          p.x -= (dx / dist) * force;
          p.y -= (dy / dist) * force;
        }
      }

      // Draw particle
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(179, 247, 125, ${Math.max(p.alpha, 0.1)})`;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = 'rgba(179, 247, 125, 0.4)';
      this.ctx.fill();

      // Connect near particles
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 110) {
          const lineAlpha = (1 - dist / 110) * 0.12;
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = `rgba(179, 247, 125, ${lineAlpha})`;
          this.ctx.lineWidth = 0.75;
          this.ctx.stroke();
        }
      }
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  drawGrid() {
    const gridSize = 64;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    this.ctx.lineWidth = 1;

    // Optional subtle grid lines
    const startX = 0;
    const startY = 0;

    for (let x = startX; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    for (let y = startY; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new BackgroundCanvas('bg-canvas');
});
