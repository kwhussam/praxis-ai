export const Colors = {
  navy: {
    950: "#050D1A",
    900: "#0A1628",
    800: "#0F2040",
    700: "#162B55",
    600: "#1E3A6B"
  },
  electric: {
    500: "#2D7EF8",
    400: "#5599FF",
    300: "#85B8FF",
    200: "#B8D4FF",
    100: "#E6F0FF"
  },
  critical: "#FF4757",
  warning: "#FFA502",
  safe: "#2ED573",
  info: "#2D7EF8",
  white: "#FFFFFF",
  gray: {
    100: "#F1F3F5",
    200: "#DEE2E6",
    400: "#868E96",
    600: "#495057",
    800: "#212529"
  }
} as const;

export const colors = {
  navy: Colors.navy[900],
  navyDeep: Colors.navy[950],
  navySoft: Colors.navy[800],
  navyElevated: Colors.navy[700],
  navyBorder: Colors.navy[600],
  electric: Colors.electric[500],
  electricHover: Colors.electric[400],
  electricMuted: Colors.electric[300],
  electricSoft: "rgba(45, 126, 248, 0.16)",
  critical: Colors.critical,
  warning: Colors.warning,
  safe: Colors.safe,
  info: Colors.info,
  white: Colors.white,
  ink: "#F8FBFF",
  muted: "#9AA9BF",
  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.18)",
  glass: "rgba(255, 255, 255, 0.05)",
  glassStrong: "rgba(255, 255, 255, 0.12)",
  lightSurface: "#F4F7FB",
  gray: Colors.gray
} as const;

export type RiskTone = "critical" | "warning" | "safe" | "info";

export const riskColors: Record<RiskTone, string> = {
  critical: colors.critical,
  warning: colors.warning,
  safe: colors.safe,
  info: colors.electric
};
