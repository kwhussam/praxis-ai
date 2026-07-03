const { withAppDelegate } = require("@expo/config-plugins");

const PROVIDER_RETURN =
  '  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];';

const FALLBACK_RETURN = `  NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  return bundleURL ?: [RCTBundleURLProvider jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"
                                                         packagerHost:@"127.0.0.1:8081"
                                                            enableDev:YES
                                                   enableMinification:NO
                                                      inlineSourceMap:NO];`;

module.exports = function withIosMetroLocalhostFallback(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "objc") {
      return config;
    }

    if (!config.modResults.contents.includes(FALLBACK_RETURN)) {
      config.modResults.contents = config.modResults.contents.replace(PROVIDER_RETURN, FALLBACK_RETURN);
    }

    return config;
  });
};
