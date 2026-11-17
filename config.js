// Gig Desk · Supabase connection for song requests.
// The anon key is meant to be public: the database rules decide what it can do
// (guests can only send requests; only a signed-in DJ can read their own).
window.GD_CONFIG = {
  supabaseUrl: '',      // e.g. https://abcdefghijklmno.supabase.co
  supabaseAnonKey: ''   // Project Settings → API → anon public key
};
