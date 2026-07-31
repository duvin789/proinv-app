import "server-only";

import { cache } from "react";

import { initials } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole, Viewer } from "@/lib/types";

interface ProfileRow {
  full_name: string | null;
}

interface MembershipRow {
  role: MemberRole;
}

function claimString(
  claims: Record<string, unknown>,
  key: string,
  fallback = "",
) {
  const value = claims[key];
  return typeof value === "string" ? value : fallback;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;

  if (error || !claims) return null;

  const userId = claimString(claims, "sub");
  if (!userId) return null;

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const membership = membershipResult.data as MembershipRow | null;
  const email = claimString(claims, "email", "usuario@empresa.com");
  const metadata =
    claims.user_metadata &&
    typeof claims.user_metadata === "object" &&
    !Array.isArray(claims.user_metadata)
      ? (claims.user_metadata as Record<string, unknown>)
      : {};
  const metadataName =
    typeof metadata.full_name === "string" ? metadata.full_name : "";
  const fullName =
    profile?.full_name?.trim() ||
    metadataName.trim() ||
    email.split("@")[0] ||
    "Usuario";

  return {
    id: userId,
    email,
    fullName,
    role: membership?.role || "viewer",
    initials: initials(fullName),
  };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) {
    throw new Error("Tu sesión venció. Vuelve a iniciar sesión.");
  }
  return viewer;
}
