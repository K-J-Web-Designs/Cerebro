import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveAIProvider } from "@/lib/ai/provider";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured(),
    databaseMode: process.env.DATABASE_URL?.trim() ? "postgres" : "pglite",
    aiProvider: getActiveAIProvider(),
    timestamp: new Date().toISOString(),
  });
}
