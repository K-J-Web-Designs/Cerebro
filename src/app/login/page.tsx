import { getSupabaseEnv } from "@/lib/supabase/config";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const { url, anonKey } = getSupabaseEnv();
  return <LoginClient supabaseUrl={url} supabaseAnonKey={anonKey} />;
}
