import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <span>404</span>
      <h1>Esta página no existe</h1>
      <p>Vuelve al resumen para continuar con el inventario.</p>
      <Link href="/dashboard" className="button button-primary">
        Ir al resumen
      </Link>
    </main>
  );
}
