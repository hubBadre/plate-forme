import { createClient } from '@supabase/supabase-js';
import { Upload } from 'tus-js-client';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;

export async function getCurrentProfile() {
  if (!supabase) return null;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return { user, profile: data };
}

export async function uploadPrivateFile(path, file, onProgress) {
  if (!supabase || !isSupabaseConfigured) throw new Error('Supabase is not configured');
  if (file.size <= 6 * 1024 * 1024) {
    const { error } = await supabase.storage.from('private-lessons').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw error || new Error('Authentication required');
  const projectId = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
  await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: 'private-lessons', objectName: path, contentType: file.type, cacheControl: '3600' },
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(Math.round(uploaded / total * 100)),
      onSuccess: resolve,
    });
    upload.findPreviousUploads().then((previous) => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
  });
}
