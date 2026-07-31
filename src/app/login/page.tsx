import type { Metadata } from "next";

import { LoginView } from "@/components/login-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return <LoginView configured={isSupabaseConfigured()} />;
}
