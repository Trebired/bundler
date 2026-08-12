import path from "node:path";
import type { Syntax } from "sass-embedded";

function inferSyntax(filePath: string): Syntax {
  return path.extname(filePath).toLowerCase() === ".sass" ? "indented" : "scss";
}

export { inferSyntax };
