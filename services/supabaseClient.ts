import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbwlfeirltbfgitgmiuz.supabase.co';
const supabaseKey = 'sb_publishable_iSKEv2kkxQ8u-y0eNiDuHA_KLihXWRi';

// Realtime desteği ile istemci oluşturuldu
export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});