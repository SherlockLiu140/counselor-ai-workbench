import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pdfPackageRoot = join(projectRoot, "node_modules", "pdfjs-dist");
const publicRoot = join(projectRoot, "public");
const target = join(publicRoot, "pdf");
const assetDirectories = ["cmaps", "standard_fonts", "wasm"];
const conflictCopy = / \d+(?:\.[^.]+)?$/;

function removeConflictCopies(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (conflictCopy.test(entry.name)) {
      rmSync(path, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      removeConflictCopies(path);
    }
  }
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Some synced desktop folders create Finder-style conflict copies such as
      // "UniGB-UTF8-H 3.bcmap" inside node_modules. They are never PDF.js assets.
      if (conflictCopy.test(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const stats = statSync(path);
        files.push({
          path: relative(root, path).split("\\").join("/"),
          size: stats.size,
        });
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

if (!existsSync(join(pdfPackageRoot, "package.json"))) {
  throw new Error("未找到 pdfjs-dist，请先运行 npm install。");
}

// Synced desktop folders may also duplicate files already copied to public/.
// Remove those copies before validating the existing local asset bundle so an
// otherwise valid manifest cannot leave stale files for Vite to copy.
removeConflictCopies(target);

const version = JSON.parse(
  readFileSync(join(pdfPackageRoot, "package.json"), "utf8"),
).version;
const sourceManifest = {
  version,
  files: assetDirectories.flatMap((directory) =>
    listFiles(join(pdfPackageRoot, directory)).map((file) => ({
      ...file,
      path: `${directory}/${file.path}`,
    })),
  ),
};
const serializedManifest = `${JSON.stringify(sourceManifest, null, 2)}\n`;
const targetManifest = join(target, ".manifest.json");
const installedVersion = existsSync(join(target, ".version"))
  ? readFileSync(join(target, ".version"), "utf8").trim()
  : "";
const installedFiles = assetDirectories.every((directory) =>
  existsSync(join(target, directory)),
)
  ? assetDirectories.flatMap((directory) =>
      listFiles(join(target, directory)).map((file) => ({
        ...file,
        path: `${directory}/${file.path}`,
      })),
    )
  : [];

mkdirSync(publicRoot, { recursive: true });
for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith(".pdf-assets-"))
    rmSync(join(publicRoot, entry.name), { recursive: true, force: true });
}

if (
  installedVersion === version &&
  JSON.stringify(installedFiles) === JSON.stringify(sourceManifest.files) &&
  existsSync(targetManifest) &&
  readFileSync(targetManifest, "utf8") === serializedManifest
) {
  console.log(
    `PDF.js 本地资源已就绪（${version}，${sourceManifest.files.length} 个文件）。`,
  );
  process.exit(0);
}

const temporary = join(publicRoot, `.pdf-assets-${process.pid}`);
rmSync(temporary, { recursive: true, force: true });
mkdirSync(temporary, { recursive: true });

try {
  for (const directory of assetDirectories) {
    cpSync(join(pdfPackageRoot, directory), join(temporary, directory), {
      recursive: true,
      filter: (source) => !conflictCopy.test(basename(source)),
    });
  }
  writeFileSync(join(temporary, ".version"), `${version}\n`);
  writeFileSync(join(temporary, ".manifest.json"), serializedManifest);

  // The generated directory is replaced only after a complete copy. This also
  // removes stale files left by an interrupted install or dependency upgrade.
  rmSync(target, { recursive: true, force: true });
  renameSync(temporary, target);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(
  `已准备 PDF.js 本地资源（${version}，${sourceManifest.files.length} 个文件）。`,
);
