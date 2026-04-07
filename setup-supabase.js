// setup-supabase.js — Create tables in Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uhwmfuwpydcmrawfftkb.supabase.co';
const SUPABASE_KEY = process.argv[2]; // pass key as argument

if (!SUPABASE_KEY) {
  console.error('Usage: node setup-supabase.js <supabase-service-key>');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setup() {
  console.log('🔧 Setting up Supabase tables...\n');

  // Check if chapters table exists by trying to query it
  try {
    const { data, error } = await sb.from('chapters').select('id').limit(1);
    if (!error) {
      console.log('✅ Table "chapters" already exists!');
      return;
    }
  } catch (e) {}

  // Tables don't exist - we need SQL execution
  // Try using the REST API directly with fetch
  console.log('⚠️  Tables not found. Attempting to create via REST API...');
  
  // Create chapters table
  const chaptersSQL = `
    CREATE TABLE IF NOT EXISTS chapters (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      songs JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  
  const settingsSQL = `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Try to use supabase RPC (requires a function to exist)
  // Alternative: direct REST API
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Try inserting directly (this will create the table via PostgREST if auto-create is enabled)
  // Actually, let's try to use the Supabase SQL endpoint
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: chaptersSQL }),
    });
    const result = await resp.json();
    console.log('RPC result:', result);
  } catch (e) {
    console.log('RPC not available:', e.message);
  }

  // Try direct table operations
  console.log('\n📋 Trying to upsert test data...');
  const { data: chData, error: chError } = await sb
    .from('chapters')
    .upsert({ id: 1, name: 'CPR Basics', icon: '❤️', songs: [], updated_at: new Date().toISOString() });
  
  if (chError) {
    console.error('❌ Error:', chError.message);
    console.log('\n💡 Please create tables manually in Supabase SQL Editor:');
    console.log('   Go to: https://supabase.com/dashboard/project/uhwmfuwpydcmrawfftkb/sql/new');
    console.log('\n   Run this SQL:\n');
    console.log(`CREATE TABLE chapters (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  songs JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON chapters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON settings FOR ALL USING (true) WITH CHECK (true);`);
    process.exit(1);
  }

  console.log('✅ Data inserted successfully!');
}

setup().catch(console.error);
