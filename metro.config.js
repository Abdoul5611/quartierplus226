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

module.exports = config;
