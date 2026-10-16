import { element } from "./dom.js";

const CHIPS = [
  { label: "À répondre", color: "var(--color-bad)", matches: (spec) => spec.room === "acc" && !spec.agent },
  { label: "À relire", color: "var(--color-accent)", matches: (spec) => spec.room === "rev" },
  { label: "Prêtes à merger", color: "var(--color-ok)", matches: (spec) => spec.room === "mrg" },
  { label: "À l'atelier", color: "var(--color-warn)", matches: (spec) => spec.room === "fix" },
  { label: "Agents en réunion", color: "var(--color-ghost)", matches: (spec) => spec.room === "meet" && spec.agent === true },
];

export const createHud = (container) => {
  const update = (specs) => {
    container.replaceChildren();
    CHIPS.forEach((chip) => {
      const count = specs.filter(chip.matches).length;
      if (chip.label === "Agents en réunion" && count === 0) return;
      const node = element("div", "hud__chip");
      const dot = element("span", "hud__dot");
      dot.style.background = chip.color;
      node.append(dot, element("span", "hud__count", String(count)), element("span", "hud__label", chip.label));
      container.append(node);
    });
  };
  return { update };
};
