import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const isSupabaseStorageEnabled = !!(env.supabaseUrl && env.supabaseServiceKey);

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/** Upload a file buffer to Supabase Storage and return a public URL. */
export async function uploadLogoToSupabase(opts: {
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<string> {
  const c = client();
  const { error } = await c
    .storage
    .from(env.supabaseLogoBucket)
    .upload(opts.filename, opts.buffer, {
      contentType: opts.contentType,
      upsert: true,
    });
  if (error) throw error;
  const { data } = c.storage.from(env.supabaseLogoBucket).getPublicUrl(opts.filename);
  return data.publicUrl;
}

/** Best-effort delete; never throws. */
export async function deleteLogoFromSupabase(filename: string): Promise<void> {
  try {
    await client().storage.from(env.supabaseLogoBucket).remove([filename]);
  } catch { /* ignore */ }
}
