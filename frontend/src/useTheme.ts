import { useEffect, useLayoutEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const key = "nexo.theme";

function preference(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === "dark" || value === "light") return value;
  } catch { /* Storage may be disabled in this browser. */ }
  return "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(preference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const syncSystem = () => setSystemDark(media?.matches ?? false);
    const syncStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setTheme(preference());
    };
    syncSystem();
    media?.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      media?.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function choose(value: Theme) {
    setTheme(value);
    try { localStorage.setItem(key, value); } catch { /* Keep the session preference. */ }
  }
  return { theme, dark, choose };
}
