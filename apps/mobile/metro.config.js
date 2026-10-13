// Metro config: lets the app import the shared package source (packages/shared/src)
// via the "@shared/*" alias, while keeping apps/mobile out of the root npm workspaces.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../../packages/shared");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@shared/")) {
    const target = path.join(sharedRoot, "src", moduleName.slice("@shared/".length));
    return context.resolveRequest(context, target, platform);
  }
  // Bare imports from the shared package (e.g. "zod") resolve from apps/mobile/node_modules,
  // never from the repo root, so the app has exactly one copy of each dependency.
  if (context.originModulePath.startsWith(sharedRoot + path.sep) && !moduleName.startsWith(".")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "index.js") },
      moduleName,
      platform,
    );
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
