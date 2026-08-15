"use client";

import {
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  LockKeyIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginView({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!configured) {
      setMessage(
        "Supabase no está configurado. Agrega las variables de entorno para acceder.",
      );
      return;
    }

    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (error) {
        setMessage(
          error.message === "Invalid login credentials"
            ? "El correo o la contraseña no son correctos."
            : error.message,
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible completar el acceso.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-logo-frame">
            <Image
              src="/kadmiel-logo.png"
              alt="Kadmiel Multimuebles"
              width={482}
              height={452}
              priority
              sizes="112px"
            />
          </span>
          <span className="login-brand-copy">
            <strong>Kadmiel Multimuebles</strong>
            <span>Gestión de inventario</span>
          </span>
        </div>

        <div className="login-form-heading">
          <span className="login-eyebrow">Acceso administrativo</span>
          <h1 id="login-title">Iniciar sesión</h1>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Correo electrónico</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="correo@empresa.com"
              autoComplete="email"
              spellCheck={false}
              disabled={!configured || pending}
              required
            />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <div className="password-field">
              <LockKeyIcon size={18} />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Tu contraseña"
                autoComplete="current-password"
                disabled={!configured || pending}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                title={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                disabled={!configured || pending}
              >
                {showPassword ? (
                  <EyeSlashIcon size={18} />
                ) : (
                  <EyeIcon size={18} />
                )}
              </button>
            </div>
          </label>

          {message ? (
            <div className="auth-message auth-error" role="alert">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            className="button button-primary login-submit"
            disabled={pending || !configured}
          >
            {pending ? "Verificando…" : "Entrar"}
            {!pending ? <ArrowRightIcon size={18} weight="bold" /> : null}
          </button>
        </form>

        {!configured ? (
          <div className="configuration-alert" role="alert">
            <strong>El acceso no está disponible.</strong>
            <p>Verifica la configuración del sistema e inténtalo nuevamente.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
