import { element } from "./dom.js";

const isWorking = (spec) => spec.kind === "robot" && !spec.agent && ["open", "bug", "meet"].includes(spec.room);

const CHIPS = [
  { label: "À répondre", color: "var(--color-bad)", matches: (spec) => spec.room === "acc" && !spec.agent },
  { label: "En cours", color: "var(--color-accent)", matches: isWorking },
  { label: "À l'atelier", color: "var(--color-warn)", matches: (spec) => spec.room === "fix" },
  { label: "Agents en réunion", color: "var(--color-ghost)", matches: (spec) => spec.room === "meet" && spec.agent === true },
];

// Chaque pastille est un bouton : un clic liste les conversations concernées, et un clic sur l'une d'elles ouvre sa fiche.
export const createHud = (container, { onPick = () => {} } = {}) => {
  let openLabel = null;
  let lastSpecs = [];

  const close = () => {
    if (openLabel === null) return;
    openLabel = null;
    render();
  };

  const buildList = (matching) => {
    const list = element("ul", "hud__list");
    matching.forEach((spec) => {
      const item = element("li");
      const button = element("button", "hud__entry");
      button.type = "button";
      button.append(element("span", "hud__entry-name", spec.name), element("span", "hud__entry-title", spec.title ?? ""));
      button.addEventListener("click", () => {
        onPick(spec.key);
        close();
      });
      item.append(button);
      list.append(item);
    });
    return list;
  };

  const render = () => {
    container.replaceChildren();
    CHIPS.forEach((chip) => {
      const matching = lastSpecs.filter(chip.matches);
      if (chip.label === "Agents en réunion" && matching.length === 0) return;
      const isOpen = openLabel === chip.label && matching.length > 0;
      const item = element("div", "hud__item");
      const node = element("button", "hud__chip");
      node.type = "button";
      node.setAttribute("aria-expanded", String(isOpen));
      node.disabled = matching.length === 0;
      const dot = element("span", "hud__dot");
      dot.style.background = chip.color;
      node.append(dot, element("span", "hud__count", String(matching.length)), element("span", "hud__label", chip.label));
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        openLabel = isOpen ? null : chip.label;
        render();
      });
      item.append(node);
      if (isOpen) item.append(buildList(matching));
      container.append(item);
    });
  };

  document.addEventListener("click", (event) => {
    if (openLabel !== null && !container.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  const update = (specs) => {
    lastSpecs = specs;
    render();
  };
  return { update };
};
