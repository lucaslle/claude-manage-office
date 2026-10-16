import { DEFAULT_BRAND_ID, findBrand } from "./brands.js";

const THEME_KEY = "eddy.theme";
const BRAND_KEY = "eddy.brand";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const store = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
};

let brand = findBrand(readStored(BRAND_KEY) ?? DEFAULT_BRAND_ID);
let userMode = ["dark", "light"].includes(readStored(THEME_KEY)) ? readStored(THEME_KEY) : null;

export const currentBrand = () => brand;

export const isDarkTheme = () => {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit === "dark";
  return darkQuery.matches;
};

const applyAttributes = (toggleButton) => {
  const root = document.documentElement;
  root.dataset.brand = brand.id;
  const effective = brand.mode === "auto" ? userMode : brand.mode;
  if (effective) root.dataset.theme = effective;
  else delete root.dataset.theme;
  toggleButton.disabled = brand.mode !== "auto";
  toggleButton.title = brand.mode === "auto" ? "Changer de thème" : `Le thème « ${brand.label} » est toujours sombre`;
};

export const initTheme = ({ onChange, toggleButton }) => {
  applyAttributes(toggleButton);

  darkQuery.addEventListener("change", onChange);
  toggleButton.addEventListener("click", () => {
    userMode = isDarkTheme() ? "light" : "dark";
    store(THEME_KEY, userMode);
    applyAttributes(toggleButton);
    onChange();
  });

  return {
    setBrand: (id) => {
      brand = findBrand(id);
      store(BRAND_KEY, brand.id);
      applyAttributes(toggleButton);
      onChange();
    },
  };
};
