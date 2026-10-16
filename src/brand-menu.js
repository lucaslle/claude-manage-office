import { element } from "./dom.js";
import { BRANDS } from "./brands.js";
import { currentBrand } from "./theme.js";

export const createBrandMenu = ({ button, menu, onSelect }) => {
  const items = BRANDS.map((brand) => {
    const item = element("button", "brand-item");
    item.type = "button";
    item.setAttribute("role", "menuitemradio");
    const swatch = element("span", "brand-item__swatch");
    swatch.style.setProperty("--swatch-main", brand.swatch[0]);
    swatch.style.setProperty("--swatch-base", brand.swatch[1]);
    swatch.setAttribute("aria-hidden", "true");
    const text = element("span", "brand-item__text");
    text.append(element("span", "brand-item__label", brand.label), element("span", "brand-item__hint", brand.hint));
    item.append(swatch, text);
    item.addEventListener("click", () => {
      onSelect(brand.id);
      refresh();
      close();
      button.focus();
    });
    menu.append(item);
    return { brand, item };
  });

  const refresh = () => {
    const active = currentBrand();
    button.style.setProperty("--swatch-main", active.swatch[0]);
    button.style.setProperty("--swatch-base", active.swatch[1]);
    button.title = `Thème d'entreprise : ${active.label}`;
    items.forEach(({ brand, item }) => item.setAttribute("aria-checked", String(brand.id === active.id)));
  };

  const isOpen = () => !menu.hidden;

  const close = () => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items.find(({ brand }) => brand.id === currentBrand().id)?.item.focus();
  };

  button.addEventListener("click", () => (isOpen() ? close() : open()));
  document.addEventListener("pointerdown", (event) => {
    if (isOpen() && !menu.contains(event.target) && !button.contains(event.target)) close();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      button.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = items.map(({ item }) => item);
    const index = nodes.indexOf(document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    nodes[(index + step + nodes.length) % nodes.length].focus();
  });

  close();
  refresh();
};
