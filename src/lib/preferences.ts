export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";

export interface AppPreferences {
  theme: ThemePreference;
  density: DensityPreference;
  stockAlerts: boolean;
}

const defaults: AppPreferences = {
  theme: "system",
  density: "comfortable",
  stockAlerts: true,
};

export const preferencesChangedEvent = "proinv-preferences-changed";

export function readPreferences(): AppPreferences {
  if (typeof window === "undefined") return defaults;
  const storedTheme = window.localStorage.getItem("proinv-theme");
  const storedDensity = window.localStorage.getItem("proinv-density");
  const storedAlerts = window.localStorage.getItem("proinv-stock-alerts");
  return {
    theme:
      storedTheme === "light" ||
      storedTheme === "dark" ||
      storedTheme === "system"
        ? storedTheme
        : defaults.theme,
    density: storedDensity === "compact" ? "compact" : "comfortable",
    stockAlerts: storedAlerts !== "false",
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
  applyPreferences(preferences);
  window.dispatchEvent(
    new CustomEvent<AppPreferences>(preferencesChangedEvent, {
      detail: preferences,
    }),
  );
}
