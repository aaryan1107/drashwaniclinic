import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://aswxzeklbabtflgmjszz.supabase.co";
const supabaseKey = "sb_publishable_zmxYzhCfFFZLr9Y3GMFgNA_XbmRQ_t7";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
