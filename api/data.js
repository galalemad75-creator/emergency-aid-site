// api/data.js — Vercel Serverless Proxy
// Handles Supabase + GitHub operations server-side (secrets never exposed)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || '';
const GH_REPO = process.env.GH_REPO || '';
const GH_BRANCH = 'main';

// ---- Supabase (lazy init) ----
let _sb = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) {
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _sb;
}

// ---- GitHub helpers ----
function ghHeaders() {
  return {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function ghReadFile(path) {
  const url = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}?t=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function ghWriteFile(path, data, message) {
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
  let sha = null;
  try {
    const check = await fetch(apiUrl, { headers: ghHeaders() });
    if (check.ok) { const info = await check.json(); sha = info.sha; }
  } catch {}
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
  const body = { message, content, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'GitHub write failed'); }
  return true;
}

// ---- GitHub File Upload (audio/images) ----
async function ghUploadFile(path, base64Content, message) {
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
  let sha = null;
  try {
    const check = await fetch(apiUrl, { headers: ghHeaders() });
    if (check.ok) { const info = await check.json(); sha = info.sha; }
  } catch {}
  const body = { message, content: base64Content, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Upload failed'); }
  const result = await res.json();
  return { url: result.content.download_url, sha: result.content.sha, path: result.content.path };
}

async function ghDeleteFile(path, sha, message) {
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
  const res = await fetch(apiUrl, {
    method: 'DELETE',
    headers: ghHeaders(),
    body: JSON.stringify({ message, sha, branch: GH_BRANCH }),
  });
  return res.ok;
}

// ---- CORS ----
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---- Handler ----
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || (req.method === 'GET' ? 'read' : '');

  try {
    // ========== READ chapters ==========
    if (action === 'read') {
      // Try Supabase first
      const db = sb();
      if (db) {
        const { data, error } = await db.from('chapters').select('*').order('id');
        if (!error && data && data.length > 0) {
          // Also get settings
          const { data: settings } = await db.from('settings').select('*');
          const settingsObj = {};
          (settings || []).forEach(s => { settingsObj[s.key] = s.value; });
          return res.status(200).json({ chapters: data, settings: settingsObj, source: 'supabase' });
        }
      }
      // Fallback to GitHub data.json
      const ghData = await ghReadFile('data.json');
      if (ghData) return res.status(200).json({ ...ghData, source: 'github' });
      return res.status(200).json({ chapters: [], settings: {}, source: 'empty' });
    }

    // ========== WRITE chapters ==========
    if (action === 'save' && req.method === 'POST') {
      const { chapters, settings } = req.body;
      if (!chapters) return res.status(400).json({ error: 'No chapters data' });

      // Save to Supabase
      const db = sb();
      if (db) {
        for (const ch of chapters) {
          await db.from('chapters').upsert({
            id: ch.id, name: ch.name, icon: ch.icon,
            songs: ch.songs || [], updated_at: new Date().toISOString(),
          });
        }
        if (settings) {
          for (const [key, value] of Object.entries(settings)) {
            await db.from('settings').upsert({
              key, value, updated_at: new Date().toISOString(),
            });
          }
        }
      }

      // Also save to GitHub data.json as backup
      const data = { chapters, nextId: settings?.nextId || { chapter: chapters.length + 1, song: 1 }, admin: settings?.admin || {} };
      await ghWriteFile('data.json', data, '🎵 Update chapters & songs');

      return res.status(200).json({ ok: true });
    }

    // ========== UPLOAD file to GitHub ==========
    if (action === 'upload' && req.method === 'POST') {
      const { filename, content, folder } = req.body;
      if (!filename || !content) return res.status(400).json({ error: 'Missing filename or content' });

      const path = `${folder || 'files'}/${filename}`;
      const result = await ghUploadFile(path, content, `📤 Upload ${filename}`);
      return res.status(200).json(result);
    }

    // ========== DELETE file from GitHub ==========
    if (action === 'delete-file' && req.method === 'POST') {
      const { path, sha } = req.body;
      if (!path || !sha) return res.status(400).json({ error: 'Missing path or sha' });
      const ok = await ghDeleteFile(path, sha, `🗑 Delete ${path}`);
      return res.status(200).json({ ok });
    }

    // ========== SYNC: push local data to Supabase ==========
    if (action === 'sync' && req.method === 'POST') {
      const { chapters, settings } = req.body;
      const db = sb();
      if (!db) return res.status(500).json({ error: 'Supabase not configured' });

      // Upsert all chapters
      for (const ch of (chapters || [])) {
        await db.from('chapters').upsert({
          id: ch.id, name: ch.name, icon: ch.icon,
          songs: ch.songs || [], updated_at: new Date().toISOString(),
        });
      }
      // Upsert settings
      for (const [key, value] of Object.entries(settings || {})) {
        await db.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
      }
      return res.status(200).json({ ok: true, synced: (chapters || []).length });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (e) {
    console.error('API Error:', e);
    return res.status(500).json({ error: e.message });
  }
};
