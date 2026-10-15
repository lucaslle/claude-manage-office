const STORAGE_KEY = "eddy.theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const readStoredTheme = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
};

const storeTheme = (theme) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
};

export const isDarkTheme = () => {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit === "dark";
  return darkQuery.matches;
};

export const initTheme = ({ onChange, toggleButton }) => {
  const stored = readStoredTheme();
  if (stored) document.documentElement.dataset.theme = stored;

  darkQuery.addEventListener("change", onChange);
  toggleButton.addEventListener("click", () => {
    const next = isDarkTheme() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storeTheme(next);
    onChange();
  });
};
