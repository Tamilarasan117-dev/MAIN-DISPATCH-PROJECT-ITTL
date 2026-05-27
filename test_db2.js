import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
async function test() {
  const { data, error } = await supabase.from('master_list').select('category_key').limit(100);
  const categories = [...new Set(data?.map(d => d.category_key))];
  console.log("Categories:", categories);
}
test();
