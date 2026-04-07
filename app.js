/* ============================================
   EMERGENCY AID PODCAST — Main App
   ============================================ */

// ===== DOM REFS =====
const player = document.getElementById('player');
let currentChapter = null;
let currentSong = -1;
let chapters = [];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initScrollAnimations();
  initCounterAnimations();
  initChapters();
  initLucide();
});

// ===== LUCIDE ICONS =====
function initLucide() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('ea_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ea_theme', next);
    });
  }
}

// ===== NAVIGATION =====
function initNav() {
  const header = document.getElementById('header');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');

  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('open');
    });
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('open');
      });
    });
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function() {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

// ===== SCROLL ANIMATIONS =====
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const parent = el.parentElement;
        if (parent && parent.classList.contains('grid')) {
          const siblings = Array.from(parent.children);
          const i = siblings.indexOf(el);
          el.style.transitionDelay = `${i * 0.06}s`;
        }
        el.classList.add('visible');
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.animate-on-scroll, .grid .card').forEach(el => observer.observe(el));
}

// ===== COUNTER ANIMATIONS =====
function initCounterAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { animateCounter(entry.target); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(c => observer.observe(c));
}

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-count'));
  if (isNaN(target)) return;
  const duration = 1500, start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ===== CHAPTERS =====
async function initChapters() {
  await DB.init();
  chapters = DB.getChapters();
  renderChapters();
}

function renderChapters() {
  const grid = document.getElementById('chaptersGrid');
  if (!grid) return;

  grid.innerHTML = chapters.map(c => `
    <div class="card" onclick="openChapter(${c.id})">
      <div class="num">${c.id}</div>
      <div class="name">${c.icon} ${c.name}</div>
      <div class="count">${(c.songs || []).length} episode${(c.songs || []).length !== 1 ? 's' : ''}</div>
    </div>
  `).join('');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const siblings = Array.from(el.parentElement.children);
        el.style.transitionDelay = `${siblings.indexOf(el) * 0.06}s`;
        el.classList.add('visible');
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  grid.querySelectorAll('.card').forEach(c => observer.observe(c));
}

// ===== CHAPTER / EPISODE VIEW =====
function openChapter(id) {
  currentChapter = chapters.find(c => c.id === id);
  if (!currentChapter) return;

  const hero = document.getElementById('hero');
  const features = document.getElementById('features');
  const chaptersSection = document.getElementById('chapters');
  const ctaSection = document.querySelector('.cta-section');

  if (hero) hero.style.display = 'none';
  if (features) features.style.display = 'none';
  if (chaptersSection) chaptersSection.style.display = 'none';
  if (ctaSection) ctaSection.style.display = 'none';

  let sv = document.getElementById('songsView');
  if (!sv) { createSongsView(); sv = document.getElementById('songsView'); }
  sv.style.display = 'block';

  document.getElementById('chapterTitle').textContent = currentChapter.icon + ' ' + currentChapter.name;

  const sl = document.getElementById('songsList');
  if (!currentChapter.songs || !currentChapter.songs.length) {
    sl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🎙️</div>
        <h3 style="margin-bottom:8px;">No episodes yet</h3>
        <p>Episodes coming soon — stay tuned!</p>
      </div>`;
  } else {
    sl.innerHTML = currentChapter.songs.map((s, i) => `
      <div class="song-card" id="sc-${i}">
        <button class="song-play" onclick="event.stopPropagation(); playSong(${i})">
          <i data-lucide="play"></i>
        </button>
        <span class="song-title">${s.title}</span>
      </div>
    `).join('');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createSongsView() {
  const sv = document.createElement('div');
  sv.id = 'songsView';
  sv.className = 'songs-view';
  sv.innerHTML = `
    <button class="back-btn" onclick="showHome()">
      <i data-lucide="arrow-left"></i> Back to Topics
    </button>
    <h2 id="chapterTitle" style="margin-bottom:24px;"></h2>
    <div id="songsList"></div>
  `;
  document.querySelector('main')?.appendChild(sv) || document.body.insertBefore(sv, document.querySelector('.np-bar'));
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showHome() {
  ['hero', 'features', 'chapters'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  const cta = document.querySelector('.cta-section');
  if (cta) cta.style.display = '';
  const sv = document.getElementById('songsView');
  if (sv) sv.style.display = 'none';
  currentChapter = null;
}

// ===== AUDIO PLAYER =====
function playSong(i) {
  if (!currentChapter || !currentChapter.songs || !currentChapter.songs[i]) return;
  currentSong = i;
  const s = currentChapter.songs[i];
  player.src = s.audio;
  player.play().catch(() => {});

  const npBar = document.querySelector('.np-bar');
  npBar.classList.add('show');
  document.getElementById('npTitle').textContent = s.title;
  document.getElementById('npSub').textContent = currentChapter.name;

  const npImg = document.getElementById('npImg');
  if (s.image) { npImg.src = s.image; npImg.style.display = 'block'; }
  else { npImg.style.display = 'none'; }

  document.getElementById('playBtn').textContent = '⏸';
  document.querySelectorAll('.song-card').forEach(c => c.classList.remove('playing'));
  document.getElementById('sc-' + i)?.classList.add('playing');
}

function togglePlay() {
  if (!player.src) return;
  if (player.paused) { player.play(); document.getElementById('playBtn').textContent = '⏸'; }
  else { player.pause(); document.getElementById('playBtn').textContent = '▶'; }
}

function stopAudio() { player.pause(); player.currentTime = 0; document.getElementById('playBtn').textContent = '▶'; }

function closePlayer() {
  player.pause(); player.src = '';
  document.querySelector('.np-bar').classList.remove('show');
  document.querySelectorAll('.song-card').forEach(c => c.classList.remove('playing'));
}

function prevSong() { if (currentChapter && currentSong > 0) playSong(currentSong - 1); }
function nextSong() { if (currentChapter && currentSong + 1 < currentChapter.songs.length) playSong(currentSong + 1); }

function seekAudio(e) {
  const bar = e.currentTarget;
  const pct = e.offsetX / bar.offsetWidth;
  player.currentTime = pct * player.duration;
}

player?.addEventListener('timeupdate', () => {
  if (!player.duration) return;
  document.getElementById('npFill').style.width = (player.currentTime / player.duration * 100) + '%';
});

player?.addEventListener('ended', () => {
  if (currentChapter && currentSong + 1 < currentChapter.songs.length) playSong(currentSong + 1);
  else {
    document.getElementById('playBtn').textContent = '▶';
    document.querySelectorAll('.song-card').forEach(c => c.classList.remove('playing'));
  }
});
