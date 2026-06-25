module.exports = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "babel-jest",
      {
        babelrc: false,
        configFile: false,
        presets: ["@babel/preset-typescript"],
        plugins: ["@babel/plugin-transform-modules-commonjs"]
      }
    ]
  },
  testPathIgnorePatterns: ["/node_modules/"]
};
