"use client";

import {
  ArrowRightIcon,
  CalculatorIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  LockKeyIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginView({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!configured) {
      setMessage({
        tone: "error",
        text: "Supabase no está configurado. Agrega las variables de entorno para acceder.",
      });
      return;
    }
    if (mode === "register" && form.fullName.trim().length < 2) {
      setMessage({ tone: "error", text: "Ingresa tu nombre completo." });
      return;
    }
    if (form.password.length < 8) {
      setMessage({
        tone: "error",
        text: "La contraseña debe tener al menos 8 caracteres.",
      });
      return;
    }

    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) {
          setMessage({
            tone: "error",
            text:
              error.message === "Invalid login credentials"
                ? "El correo o la contraseña no son correctos."
                : error.message,
          });
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: form.fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setMessage({ tone: "error", text: error.message });
          return;
        }
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setMessage({
            tone: "success",
            text: "Cuenta creada. Revisa tu correo para confirmar el acceso.",
          });
        }
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "No fue posible completar el acceso.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <strong>PROInv</strong>
        </Link>
        <div className="login-story-copy">
          <span className="login-eyebrow">Inventario sin fórmulas manuales</span>
          <h1>Registra el producto. Los números se ordenan solos.</h1>
          <p>
            Stock, costo promedio, valorización y margen se recalculan con cada
            movimiento.
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
        <div className="login-benefits">
          <span>
            <CheckCircleIcon size={18} weight="fill" />
            Historial completo
          </span>
          <span>
            <CheckCircleIcon size={18} weight="fill" />
            Alertas de reposición
          </span>
          <span>
            <CheckCircleIcon size={18} weight="fill" />
            Datos protegidos
          </span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-form-heading">
            <span className="login-mobile-brand">
              <PackageIcon size={22} weight="duotone" />
              PROInv
            </span>
            <h2>{mode === "login" ? "Bienvenido" : "Crea tu espacio"}</h2>
            <p>
              {mode === "login"
                ? "Accede para continuar con tu inventario."
                : "Tu empresa y almacén principal se crearán automáticamente."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              className={mode === "login" ? "is-active" : ""}
              onClick={() => {
                setMode("login");
                setMessage(null);
              }}
              role="tab"
              aria-selected={mode === "login"}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={mode === "register" ? "is-active" : ""}
              onClick={() => {
                setMode("register");
                setMessage(null);
              }}
              role="tab"
              aria-selected={mode === "register"}
            >
              Crear cuenta
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <label className="field">
                <span>Nombre completo</span>
                <input
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  placeholder="Tu nombre"
                  autoComplete="name"
                  disabled={!configured}
                  required
                />
              </label>
            ) : null}
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
                disabled={!configured}
                required
                autoFocus={mode === "login"}
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
                  placeholder="Mínimo 8 caracteres"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  disabled={!configured}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  disabled={!configured}
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
              <div className={`auth-message auth-${message.tone}`} role="alert">
                {message.text}
              </div>
            ) : null}

            <button
              type="submit"
              className="button button-primary login-submit"
              disabled={pending || !configured}
            >
              {pending
                ? "Procesando..."
                : mode === "login"
                  ? "Entrar"
                  : "Crear mi cuenta"}
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
            El acceso usa Supabase Auth y las filas se aíslan por organización.
          </p>
        </div>
      </section>
    </main>
  );
}
