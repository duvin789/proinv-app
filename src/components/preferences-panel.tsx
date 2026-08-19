"use client";

import {
  ArrowsDownUpIcon,
  BellSimpleIcon,
  ImageSquareIcon,
  PackageIcon,
  RowsIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import {
  defaultPreferences,
  movementPageSizeOptions,
  productPageSizeOptions,
  readPreferences,
  savePreferences,
  type AppPreferences,
} from "@/lib/preferences";

export function PreferencesPanel() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => ({
    ...defaultPreferences,
  }));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPreferences(readPreferences());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function update(next: Partial<AppPreferences>) {
    const value = { ...readPreferences(), ...next };
    setPreferences(value);
    savePreferences(value);
  }

  return (
    <div className="preference-list">
      <label className="preference-row">
        <span className="preference-icon" aria-hidden="true">
          <SunIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Tema</strong>
          <small>Usa el sistema o fija la apariencia de la aplicación.</small>
        </span>
        <select
          value={preferences.theme}
          onChange={(event) =>
            update({ theme: event.target.value as AppPreferences["theme"] })
          }
          aria-label="Tema de la aplicación"
        >
          <option value="system">Usar sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </label>

      <label className="preference-row">
        <span className="preference-icon" aria-hidden="true">
          <RowsIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Densidad</strong>
          <small>Reduce espacios para mostrar más información a la vez.</small>
        </span>
        <select
          value={preferences.density}
          onChange={(event) =>
            update({
              density: event.target.value as AppPreferences["density"],
            })
          }
          aria-label="Densidad de la interfaz"
        >
          <option value="comfortable">Cómoda</option>
          <option value="compact">Compacta</option>
        </select>
      </label>

      <label className="preference-row">
        <span className="preference-icon" aria-hidden="true">
          <PackageIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Productos por página</strong>
          <small>Define cuántos productos aparecen antes de paginar.</small>
        </span>
        <select
          value={preferences.productsPageSize}
          onChange={(event) =>
            update({
              productsPageSize: Number(
                event.target.value,
              ) as AppPreferences["productsPageSize"],
            })
          }
          aria-label="Productos por página"
        >
          {productPageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option} productos
            </option>
          ))}
        </select>
      </label>

      <label className="preference-row">
        <span className="preference-icon" aria-hidden="true">
          <ArrowsDownUpIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Movimientos por página</strong>
          <small>Elige cuánto historial operativo ves en cada página.</small>
        </span>
        <select
          value={preferences.movementsPageSize}
          onChange={(event) =>
            update({
              movementsPageSize: Number(
                event.target.value,
              ) as AppPreferences["movementsPageSize"],
            })
          }
          aria-label="Movimientos por página"
        >
          {movementPageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option} movimientos
            </option>
          ))}
        </select>
      </label>

      <label className="preference-row preference-toggle-row">
        <span className="preference-icon" aria-hidden="true">
          <ImageSquareIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Vista rápida de imágenes</strong>
          <small>
            Amplía la fotografía al pasar el mouse o enfocar la miniatura.
          </small>
        </span>
        <input
          type="checkbox"
          checked={preferences.imageQuickPreview}
          onChange={(event) =>
            update({ imageQuickPreview: event.target.checked })
          }
          aria-label="Activar vista rápida de imágenes"
        />
      </label>

      <label className="preference-row preference-toggle-row">
        <span className="preference-icon" aria-hidden="true">
          <BellSimpleIcon size={20} weight="duotone" />
        </span>
        <span>
          <strong>Alertas de stock</strong>
          <small>Muestra el indicador de reposición en la barra superior.</small>
        </span>
        <input
          type="checkbox"
          checked={preferences.stockAlerts}
          onChange={(event) => update({ stockAlerts: event.target.checked })}
          aria-label="Mostrar alertas de stock"
        />
      </label>
    </div>
  );
}
