const fs = require("fs")
const path = require("path")
const { getDefaultConfig } = require("expo/metro-config")
const { withUniwindConfig } = require("uniwind/metro")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// Workspace packages are bundled from source so builds do not depend on
// prebuilt `dist/` output, which is gitignored and therefore absent on EAS.
const workspaceSources = {
  "@repo/utils": "packages/utils/src",
  "@repo/types": "packages/types/src",
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"]

function resolveWorkspaceSource(moduleName) {
  const parts = moduleName.split("/")
  const isScoped = moduleName.startsWith("@")
  const packageName = isScoped ? `${parts[0]}/${parts[1]}` : parts[0]
  const rest = isScoped ? parts.slice(2) : parts.slice(1)
  const sourceRoot = workspaceSources[packageName]
  if (!sourceRoot) {
    return null
  }

  const relativePath = rest.length ? rest.join("/") : "index"
  const candidates = [relativePath, `${relativePath}/index`].map((candidate) =>
    path.resolve(workspaceRoot, sourceRoot, candidate),
  )

  for (const candidate of candidates) {
    const match = SOURCE_EXTENSIONS.map((ext) => `${candidate}${ext}`).find((filePath) =>
      fs.existsSync(filePath),
    )
    if (match) {
      return match
    }
  }

  return null
}

const upstreamResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const sourceFile = resolveWorkspaceSource(moduleName)
  if (sourceFile) {
    return { filePath: sourceFile, type: "sourceFile" }
  }

  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withUniwindConfig(config, { cssEntryFile: "./global.css" })
