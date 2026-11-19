// Gig Desk · Supabase connection for song requests.
// The publishable key is public: the database rules decide what it can do
// (guests can only send requests; only a signed-in DJ can read their own).
window.GD_CONFIG = {
  supabaseUrl: 'https://oqnqwczgacfzykjzzeaf.supabase.co',
  supabaseAnonKey: 'sb_publishable_i0-Td0InMJ1DNvMyO2DoBg_3pp4vfZg' // Project Settings → API Keys → publishable key
};
