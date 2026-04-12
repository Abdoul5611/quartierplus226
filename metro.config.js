const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const escapedRoot = __dirname.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
const localDirPattern = new RegExp(`^${escapedRoot}[\\/]\\.local[\\/].*`);
const dbMigrationsPattern = new RegExp(`^${escapedRoot}[\\/]db[\\/]migrations[\\/].*`);

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  localDirPattern,
  dbMigrationsPattern,
];

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-modules-core") {
    return {
      filePath: path.resolve(__dirname, "node_modules/expo-modules-core/index.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
