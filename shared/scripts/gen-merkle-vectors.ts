import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { merkleProof, merkleRoot } from "../src/index.js";

const leaves = Array.from({ length: 6 }, (_, i) => "0x" + (i + 1).toString(16).padStart(64, "0"));

const treeRoot = merkleRoot(leaves);
const proofs = leaves.map((_, i) => merkleProof(leaves, i));

const out = {
  leaves,
  root: treeRoot,
  proofs
};

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors/merkle.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", file);
