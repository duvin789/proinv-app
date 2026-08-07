"use client";

import {
  ArrowRightIcon,
  CalculatorIcon,
  EyeIcon,
  EyeSlashIcon,
  LockKeyIcon,
  PackageIcon,
} from "@phosphor-icons/react";
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
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <strong>Almacén LuisGB</strong>
        </div>

        <div className="login-story-copy">
          <span className="login-eyebrow">Inventario calculado al momento</span>
          <h1>Control claro para cada entrada y salida.</h1>
          <p>
            Consulta existencias, costos y rentabilidad desde un solo lugar.
          </p>
        </div>

        <div className="login-calculation">
          <div className="login-calculation-heading">
            <span className="calculation-symbol">
              <CalculatorIcon size={22} weight="duotone" />
            </span>
            <div>
              <strong>Cálculo automático</strong>
              <span>Ejemplo de una entrada</span>
            </div>
          </div>
          <div className="login-calculation-row">
            <span>Stock anterior</span>
            <strong>18 unidades</strong>
          </div>
          <div className="login-calculation-row">
            <span>Compra registrada</span>
            <strong>+ 24 unidades</strong>
          </div>
          <div className="login-calculation-result">
            <span>Nuevo stock</span>
            <strong>42 unidades</strong>
          </div>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-form-heading">
            <span className="login-mobile-brand">
              <PackageIcon size={22} weight="duotone" />
              Almacén LuisGB
            </span>
            <h2>Iniciar sesión</h2>
            <p>Ingresa con la cuenta administrada desde Supabase.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="nombre@empresa.com"
                autoComplete="email"
                disabled={!configured || pending}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <div className="password-field">
                <LockKeyIcon size={18} />
                <input
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
              {pending ? "Verificando..." : "Entrar"}
              {!pending ? <ArrowRightIcon size={18} weight="bold" /> : null}
            </button>
          </form>

          {!configured ? (
            <div className="configuration-alert" role="alert">
              <div>
                <strong>Configuración requerida</strong>
                <p>
                  Agrega la URL y la clave pública de Supabase en las variables
                  de entorno del servidor.
                </p>
              </div>
            </div>
          ) : null}

          <p className="login-security-note">
            No se crean cuentas desde esta pantalla. El acceso y los permisos
            se gestionan en Supabase.
          </p>
        </div>
      </section>
    </main>
  );
}
