export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";

export const productPageSizeOptions = [8, 18, 36, 50, 100, 200] as const;
export const movementPageSizeOptions = [12, 25, 50, 100, 200] as const;

export type ProductPageSize = (typeof productPageSizeOptions)[number];
export type MovementPageSize = (typeof movementPageSizeOptions)[number];

export interface AppPreferences {
  theme: ThemePreference;
  density: DensityPreference;
  stockAlerts: boolean;
  productsPageSize: ProductPageSize;
  movementsPageSize: MovementPageSize;
  imageQuickPreview: boolean;
}

export const defaultPreferences: AppPreferences = {
  theme: "system",
  density: "comfortable",
  stockAlerts: true,
  productsPageSize: 8,
  movementsPageSize: 12,
  imageQuickPreview: true,
};

export const preferencesChangedEvent = "proinv-preferences-changed";

function isProductPageSize(value: number): value is ProductPageSize {
  return productPageSizeOptions.some((option) => option === value);
}

function isMovementPageSize(value: number): value is MovementPageSize {
  return movementPageSizeOptions.some((option) => option === value);
}

export function readPreferences(): AppPreferences {
  if (typeof window === "undefined") return { ...defaultPreferences };
  const storedTheme = window.localStorage.getItem("proinv-theme");
  const storedDensity = window.localStorage.getItem("proinv-density");
  const storedAlerts = window.localStorage.getItem("proinv-stock-alerts");
  const storedProductsPageSize = Number(
    window.localStorage.getItem("proinv-products-page-size"),
  );
  const storedMovementsPageSize = Number(
    window.localStorage.getItem("proinv-movements-page-size"),
  );
  const storedImageQuickPreview = window.localStorage.getItem(
    "proinv-image-quick-preview",
  );
  return {
    theme:
      storedTheme === "light" ||
      storedTheme === "dark" ||
      storedTheme === "system"
        ? storedTheme
        : defaultPreferences.theme,
    density: storedDensity === "compact" ? "compact" : "comfortable",
    stockAlerts: storedAlerts !== "false",
    productsPageSize: isProductPageSize(storedProductsPageSize)
      ? storedProductsPageSize
      : defaultPreferences.productsPageSize,
    movementsPageSize: isMovementPageSize(storedMovementsPageSize)
      ? storedMovementsPageSize
      : defaultPreferences.movementsPageSize,
    imageQuickPreview: storedImageQuickPreview !== "false",
  };
}

export function applyPreferences(preferences: AppPreferences) {
  const resolvedTheme =
    preferences.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preferences.theme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.density = preferences.density;
}

export function savePreferences(preferences: AppPreferences) {
  window.localStorage.setItem("proinv-theme", preferences.theme);
  window.localStorage.setItem("proinv-density", preferences.density);
  window.localStorage.setItem(
    "proinv-stock-alerts",
    String(preferences.stockAlerts),
  );
  window.localStorage.setItem(
    "proinv-products-page-size",
    String(preferences.productsPageSize),
  );
  window.localStorage.setItem(
    "proinv-movements-page-size",
    String(preferences.movementsPageSize),
  );
  window.localStorage.setItem(
    "proinv-image-quick-preview",
    String(preferences.imageQuickPreview),
  );
  applyPreferences(preferences);
  window.dispatchEvent(
    new CustomEvent<AppPreferences>(preferencesChangedEvent, {
      detail: preferences,
    }),
  );
}
