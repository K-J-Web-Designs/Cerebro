"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv, isSupabaseConfigured } from "./config";

export function createBrowserSupabaseClient(override?: {
  url?: string;
  anonKey?: string;
}) {
  const env = getSupabaseEnv();
  const url = override?.url?.trim() || env.url;
  const anonKey = override?.anonKey?.trim() || env.anonKey;

  if (!url || !anonKey) {
    if (!isSupabaseConfigured()) return null;
    return createBrowserClient(env.url, env.anonKey);
  }
  return createBrowserClient(url, anonKey);
}
