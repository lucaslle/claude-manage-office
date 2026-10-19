import { element } from "./dom.js";

const TONES = { pipeline: "bad", conflict: "bad", rebase: "warn", changes: "warn", discussions: "warn", blocked: "warn" };
const ALL = "all";

export const brokenSpecs = (specs) => specs.filter((spec) => spec.room === "fix" && spec.problem);

// Compte les MR à corriger par cause, dans l'ordre d'apparition.
export const countByCause = (specs) => {
  const causes = new Map();
  specs.forEach((spec) => {
    const entry = causes.get(spec.problem.code) ?? { code: spec.problem.code, label: spec.problem.label, count: 0 };
    entry.count += 1;
    causes.set(spec.problem.code, entry);
  });
  return [...causes.values()];
};

// L'atelier en liste : chaque MR qui casse, avec la cause en clair, filtrable par cause. Un clic ouvre sa fiche.
export const createProblemsPanel = ({ list, filters, meta, onPick = () => {} }) => {
  let lastSpecs = [];
  let lastSignature = "";
  let filter = ALL;

  const render = () => {
    const broken = brokenSpecs(lastSpecs);
    const causes = countByCause(broken);
    if (filter !== ALL && !causes.some((cause) => cause.code === filter)) filter = ALL;
    meta.textContent = broken.length === 0 ? "" : `${broken.length} MR`;

    filters.replaceChildren();
    if (causes.length > 1) {
      [{ code: ALL, label: "Toutes", count: broken.length }, ...causes].forEach((cause) => {
        const chip = element("button", cause.code === filter ? "problems__filter problems__filter--active" : "problems__filter");
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(cause.code === filter));
        chip.append(element("span", "", cause.label), element("span", "problems__filter-count", String(cause.count)));
        chip.addEventListener("click", () => {
          filter = cause.code;
          render();
        });
        filters.append(chip);
      });
    }

    list.replaceChildren();
    const shown = broken.filter((spec) => filter === ALL || spec.problem.code === filter);
    if (shown.length === 0) {
      list.append(element("li", "empty", "Aucune MR cassée : l'atelier est calme."));
      return;
    }
    shown.forEach((spec) => {
      const entry = element("button", `problems__entry problems__entry--${TONES[spec.problem.code] ?? "warn"}`);
      entry.type = "button";
      const head = element("span", "problems__head");
      head.append(element("span", "problems__name", spec.kind === "robot" ? spec.title : spec.name), element("span", "problems__cause", spec.problem.label));
      entry.append(head);
      if (spec.kind === "robot") entry.append(element("span", "problems__mr", spec.mr));
      else if (spec.title && spec.title !== spec.name) entry.append(element("span", "problems__mr", spec.title));
      entry.append(element("span", "problems__why", spec.why));
      entry.addEventListener("click", () => onPick(spec.key, spec));
      const item = element("li");
      item.append(entry);
      list.append(item);
    });
  };

  // L'état arrive en continu : on ne reconstruit la liste que si elle a changé, sinon un clic en cours serait perdu.
  const update = (specs) => {
    lastSpecs = specs;
    const signature = JSON.stringify(brokenSpecs(specs).map((spec) => [spec.key, spec.kind, spec.name, spec.title, spec.mr, spec.why, spec.problem]));
    if (signature === lastSignature) return;
    lastSignature = signature;
    render();
  };
  render();
  return { update };
};
