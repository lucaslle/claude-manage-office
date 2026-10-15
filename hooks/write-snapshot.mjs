import fs from "node:fs";
import path from "node:path";
import { baseDirectory, connectorsFromStatus, usageFromPlan, writeJsonAtomic } from "./snapshots.mjs";

const SNAPSHOTS = {
  usage: { fileName: "usage.json", convert: usageFromPlan },
  connectors: { fileName: "connectors.json", convert: connectorsFromStatus },
};

const kind = process.argv[2];
const snapshot = SNAPSHOTS[kind];
if (!snapshot) {
  process.stderr.write("Usage : node write-snapshot.mjs usage|connectors < sortie-de-l-outil.json\n");
  process.exit(2);
}

const record = snapshot.convert(JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, "")));
if (!record) {
  process.stderr.write("Sortie d'outil inattendue : rien n'a été écrit.\n");
  process.exit(1);
}
const filePath = path.join(baseDirectory(), snapshot.fileName);
writeJsonAtomic(filePath, record);
process.stdout.write(`${snapshot.fileName} mis à jour (${filePath})\n`);
