import { writeFixtureFile } from "#0ss24zzupv8u";

async function writeFrontendFixture(fixture) {
  await writeFixtureFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.tsx", "import '../features/card';\nexport default 'home';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/about/index.tsx", "const Page = 'about';\nexport { Page as default };\n");
  await writeFixtureFile(fixture, "src/frontend/pages/reexport.tsx", "export { default } from '../shared/reexported';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/helper.tsx", "export const helper = true;\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.client.tsx", `export const hydrate = ${JSON.stringify("x".repeat(2048))};\n`);
  await writeFixtureFile(fixture, "src/frontend/pages/home.client.defer.ts", "export const deferred = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.client.scss", ".card { color: red; }\n");
  await writeFixtureFile(fixture, "src/frontend/js/global.client.ts", `export const global = ${JSON.stringify("x".repeat(2048))};\n`);
  await writeFixtureFile(fixture, "src/frontend/shared/reexported.tsx", "export default 'reexported';\n");
  await writeFixtureFile(fixture, "src/frontend/css/base.css", [
      "@font-face {",
      "  font-family: FixtureLocal;",
      "  src: url('./fixture.woff2') format('woff2');",
      "}",
      `.base { content: "${"x".repeat(2048)}"; }`,
      "",
    ].join("\n"));
  await writeFixtureFile(fixture, "src/frontend/css/fixture.woff2", "fixture-font\n");
  await writeFixtureFile(fixture, "src/frontend/public/pixel.png", Buffer.from("89504e470d0a1a0a", "hex"));
  await writeFixtureFile(fixture, "src/frontend/public/robots.txt", "User-agent: *\n");
}

async function writeNodeModulesFixture(fixture) {
  await writeFixtureFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.tsx", "import value from 'runtime-value';\nexport default value;\n");
  await writeFixtureFile(fixture, "src/frontend/js/global.client.ts", "export const global = true;\n");
  await writeFixtureFile(fixture, "runtime_node_modules/runtime-value/index.js", "export default 'runtime-value';\n");
  await writeFixtureFile(fixture, "runtime_node_modules/runtime-value/package.json", JSON.stringify({
        exports: "./index.js",
        type: "module",
  }));
}

async function writeTsconfigRelatedFixture(fixture) {
  await writeFixtureFile(fixture, "tsconfig.json", JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "#feature/*": ["src/frontend/features/*"] },
        },
      }, null, 2));
  await writeFixtureFile(fixture, "src/frontend/pages/alias.tsx", "import '#feature/card';\nexport default 'alias';\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.client.scss", ".card { color: blue; }\n");
}

export {
  writeFrontendFixture,
  writeNodeModulesFixture,
  writeTsconfigRelatedFixture,
};
