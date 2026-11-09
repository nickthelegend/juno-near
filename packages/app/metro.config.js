const { getDefaultConfig } = require("expo/metro-config");

/**
 * Metro for a pnpm workspace. Expo detects the monorepo and watches the
 * workspace root, so `@juno/sdk` (TypeScript source in packages/sdk) is
 * bundled straight from the workspace.
 */
module.exports = getDefaultConfig(__dirname);
