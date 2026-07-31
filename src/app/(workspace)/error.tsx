"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="fatal-state">
      <div className="fatal-state-icon">
        <WarningCircleIcon size={32} weight="duotone" />
      </div>
      <h1>No pudimos cargar el inventario</h1>
      <p>{error.message}</p>
      <div>
        <button className="button button-primary" type="button" onClick={reset}>
          Intentar nuevamente
        </button>
        <a className="button button-secondary" href="/configuracion">
          Revisar configuración
        </a>
      </div>
    </div>
  );
}
