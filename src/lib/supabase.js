import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ztotxkjnhtaozfcsodjq.supabase.co';

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Ma8Hq01qp6qHc24Dx0d7pA_SkcWQPko';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

