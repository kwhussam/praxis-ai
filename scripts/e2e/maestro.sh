#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${JAVA_HOME:-}" && -d "/opt/homebrew/opt/openjdk@17" ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-true}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

if command -v maestro >/dev/null 2>&1; then
  MAESTRO_BIN="$(command -v maestro)"
elif [[ -x "$HOME/.maestro/bin/maestro" ]]; then
  MAESTRO_BIN="$HOME/.maestro/bin/maestro"
else
  echo "Maestro is not installed. See docs/E2E_LOCAL_SETUP.md." >&2
  exit 1
fi

exec "$MAESTRO_BIN" "$@"
