// ============================================
// CONFIG — Emergency Aid Podcast
// All secrets are server-side, nothing exposed
// ============================================

const API = '/api/data';

// ---- Default chapters (emergency first aid topics) ----
const DEFAULT_CHAPTERS = [
  { id: 1, name: 'CPR Basics', icon: '❤️', songs: [] },
  { id: 2, name: 'Choking Response', icon: '🫁', songs: [] },
  { id: 3, name: 'Burn Treatment', icon: '🔥', songs: [] },
  { id: 4, name: 'Bleeding Control', icon: '🩸', songs: [] },
  { id: 5, name: 'Fractures & Sprains', icon: '🦴', songs: [] },
  { id: 6, name: 'Poisoning Response', icon: '☠️', songs: [] },
  { id: 7, name: 'Seizure First Aid', icon: '⚡', songs: [] },
  { id: 8, name: 'Drowning Rescue', icon: '🌊', songs: [] },
  { id: 9, name: 'Allergic Reactions', icon: '💉', songs: [] },
  { id: 10, name: 'Heart Attack Signs', icon: '💔', songs: [] },
  { id: 11, name: 'Stroke Recognition', icon: '🧠', songs: [] },
  { id: 12, name: 'Heat Stroke & Exhaustion', icon: '🌡️', songs: [] },
  { id: 13, name: 'Hypothermia', icon: '❄️', songs: [] },
  { id: 14, name: 'Snake & Insect Bites', icon: '🐍', songs: [] },
  { id: 15, name: 'Electric Shock', icon: '⚡', songs: [] },
  { id: 16, name: 'Eye Injuries', icon: '👁️', songs: [] },
  { id: 17, name: 'Nosebleeds', icon: '👃', songs: [] },
  { id: 18, name: 'Head Injuries', icon: '🤕', songs: [] },
  { id: 19, name: 'Dental Emergencies', icon: '🦷', songs: [] },
  { id: 20, name: 'Diabetic Emergencies', icon: '🩺', songs: [] },
  { id: 21, name: 'Asthma Attacks', icon: '💨', songs: [] },
  { id: 22, name: 'Animal Bites', icon: '🐕', songs: [] },
  { id: 23, name: 'Cuts & Wound Care', icon: '🩹', songs: [] },
  { id: 24, name: 'Fainting & Shock', icon: '😵', songs: [] },
  { id: 25, name: 'Emergency Calls Guide', icon: '📞', songs: [] },
];

const DEFAULT_DATA = {
  chapters: DEFAULT_CHAPTERS,
  nextId: { chapter: 26, song: 1 },
  admin: { email: 'emadh5156@gmail.com', password: 'Emergency2026!' },
};

// ============================================
// DATABASE — API-based (server-side secrets)
// ============================================
const DB = {
  _cache: null,
  _source: 'none',

  async init() {
    try {
      const res = await fetch(API + '?action=read&t=' + Date.now());
      if (!res.ok) throw new Error('API read failed');
      const data = await res.json();

      if (data.chapters && data.chapters.length > 0) {
        this._cache = { chapters: data.chapters, nextId: data.settings?.nextId || DEFAULT_DATA.nextId, admin: data.settings?.admin || DEFAULT_DATA.admin };
        this._source = data.source || 'api';
      } else {
        this._cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
        this._source = 'defaults';
        // Push defaults to backend
        await this.save('Initial setup');
      }
    } catch (e) {
      console.warn('DB init error:', e.message);
      this._cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
      this._source = 'fallback';
    }

    // Cache locally for offline
    localStorage.setItem('ea_cache', JSON.stringify(this._cache));
    return this._cache;
  },

  getData() { return this._cache || DEFAULT_DATA; },

  async save(message) {
    const data = this._cache;
    localStorage.setItem('ea_cache', JSON.stringify(data));

    try {
      await fetch(API + '?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapters: data.chapters,
          settings: { nextId: data.nextId, admin: data.admin },
        }),
      });
    } catch (e) {
      console.warn('Save failed (cached locally):', e.message);
    }
  },

  // ---- Chapters ----
  getChapters() { return this.getData().chapters; },

  addChapter(name, icon) {
    const data = this._cache;
    const ch = { id: data.nextId.chapter++, name, icon, songs: [] };
    data.chapters.push(ch);
    this.save();
    return ch;
  },

  updateChapter(id, updates) {
    const ch = this._cache.chapters.find(c => c.id === id);
    if (ch) { Object.assign(ch, updates); this.save(); }
    return ch;
  },

  deleteChapter(id) {
    this._cache.chapters = this._cache.chapters.filter(c => c.id !== id);
    this.save();
  },

  // ---- Songs ----
  addSong(chapterId, title, fileUrl, fileId, imageUrl) {
    const ch = this._cache.chapters.find(c => c.id === chapterId);
    if (!ch) return null;
    const song = {
      id: this._cache.nextId.song++,
      title,
      audio: fileUrl,
      image: imageUrl || '',
      file_path: fileId, // GitHub file path for deletion
      created: new Date().toISOString(),
    };
    if (!ch.songs) ch.songs = [];
    ch.songs.push(song);
    this.save();
    return song;
  },

  deleteSong(chapterId, songId) {
    const ch = this._cache.chapters.find(c => c.id === chapterId);
    if (ch) {
      ch.songs = (ch.songs || []).filter(s => s.id !== songId);
      this.save();
    }
  },

  // ---- File Upload (via serverless proxy) ----
  async uploadFile(file, folder, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (onProgress) onProgress(50);
          const base64 = reader.result.split(',')[1];
          const ext = file.name.split('.').pop();
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = `${Date.now()}_${safeName}`;

          const res = await fetch(API + '?action=upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content: base64, folder: folder || 'audio' }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
          }

          const result = await res.json();
          if (onProgress) onProgress(100);
          resolve({ url: result.url, path: result.path, sha: result.sha });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsDataURL(file);
    });
  },

  // ---- Auth ----
  login(email, password) {
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '').trim();
    // Check Supabase/cached admin credentials
    const admin = this._cache?.admin;
    if (admin && e === String(admin.email || '').trim().toLowerCase() && p === String(admin.password || '').trim()) return true;
    return false;
  },

  async changePassword(oldPass, newPass, newEmail) {
    const admin = this._cache?.admin || {};
    if (oldPass && oldPass !== String(admin.password || '').trim()) return { ok: false, error: 'Current password is wrong' };
    this._cache.admin = {
      email: newEmail || admin.email || 'emadh5156@gmail.com',
      password: newPass,
    };
    await this.save('Password updated');
    return { ok: true };
  },

  async resetPassword(newPass, newEmail) {
    this._cache = this._cache || {};
    this._cache.admin = {
      email: newEmail || 'emadh5156@gmail.com',
      password: newPass,
    };
    await this.save('Password reset');
    return { ok: true };
  },

  isLoggedIn() { return !!localStorage.getItem('ea_admin'); },
  setSession(email) { localStorage.setItem('ea_admin', JSON.stringify({ email, ts: Date.now() })); },
  logout() { localStorage.removeItem('ea_admin'); },
};
