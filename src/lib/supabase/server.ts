import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ensureSchema, schema } from "@/db";
import { seedDemoWorkspace } from "@/db/seed";
import { getSupabaseEnv, isSupabaseConfigured } from "./config";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export const LOCAL_DEMO_COOKIE = "cerebro_local_demo";

export async function createServerSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called inside a Server Component where setting cookies is a no-op;
          // proxy.ts refreshes cookies on the response.
        }
      },
    },
  });
}

async function ensureUserProfileAndSeed(params: {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}) {
  const db = await ensureSchema();
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, params.id))
    .limit(1);

  if (!existing) {
    await db
      .insert(schema.users)
      .values({
        id: params.id,
        name: params.name,
        email: params.email,
        image: params.image ?? null,
      })
      .onConflictDoNothing();
    await seedDemoWorkspace(params.id);
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const email = user.email ?? `${user.id}@supabase.local`;
    const meta = user.user_metadata as
      | { full_name?: string; name?: string; avatar_url?: string }
      | undefined;
    const name =
      meta?.full_name?.trim() ||
      meta?.name?.trim() ||
      email.split("@")[0] ||
      "Researcher";
    const image = meta?.avatar_url ?? null;

    await ensureUserProfileAndSeed({
      id: user.id,
      email,
      name,
      image,
    });

    return {
      id: user.id,
      name,
      email,
      image,
    };
  }

  // Zero-config local fallback when NEXT_PUBLIC_SUPABASE_URL is not set
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCAL_DEMO_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as { id?: string; email?: string; name?: string };
    if (!parsed.id || !parsed.email) return null;
    const name = parsed.name || parsed.email.split("@")[0];
    await ensureUserProfileAndSeed({
      id: parsed.id,
      email: parsed.email,
      name,
    });
    return {
      id: parsed.id,
      name,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}
