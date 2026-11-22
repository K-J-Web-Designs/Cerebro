import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LOCAL_DEMO_COOKIE } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().email().default("kris@cerebro.app"),
  name: z.string().min(1).max(80).default("Kris Jones"),
});

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Local demo login is disabled when Supabase Auth is configured." },
      { status: 404 }
    );
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  const email = (parsed.success ? parsed.data.email : "kris@cerebro.app")
    .toLowerCase()
    .trim();
  const name = parsed.success ? parsed.data.name.trim() : "Kris Jones";

  // Deterministic UUID-shaped id per local email so repeat logins hit the same workspace
  const id =
    email === "kris@cerebro.app"
      ? "00000000-0000-4000-8000-000000000001"
      : crypto.randomUUID();

  const encoded = Buffer.from(
    JSON.stringify({ id, email, name }),
    "utf8"
  ).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set(LOCAL_DEMO_COOKIE, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true, user: { id, email, name } });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(LOCAL_DEMO_COOKIE);
  return NextResponse.json({ ok: true });
}
