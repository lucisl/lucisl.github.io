// 让 Metro 支持代码里显式的 `.ts`/`.tsx` 相对导入扩展名（Node type-stripping 单测要求带扩展名，
// Metro 默认只认无扩展名/asset 扩展名）。在解析前统一剥离即可两头兼容。
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && /\.(?:ts|tsx)$/.test(moduleName)) {
    return context.resolveRequest(context, moduleName.replace(/\.(?:ts|tsx)$/, ''), platform);
  }
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
