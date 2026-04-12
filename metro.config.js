const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const escapedRoot = __dirname.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
const localDirPattern = new RegExp(`^${escapedRoot}[\\/]\\.local[\\/].*`);
const dbMigrationsPattern = new RegExp(`^${escapedRoot}[\\/]db[\\/]migrations[\\/].*`);

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  localDirPattern,
  dbMigrationsPattern,
];

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
