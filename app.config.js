module.exports = ({ config }) => {
  const isLocalE2e = process.env.EXPO_PUBLIC_APP_ENV === "test";

  return {
    ...config,
    android: {
      ...config.android,
      usesCleartextTraffic: isLocalE2e
    }
  };
};
