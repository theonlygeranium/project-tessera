#!/bin/sh
# Re-applies the Worker secrets a branch preview needs. A push to an existing preview
# branch drops them (see CLAUDE.md). Usage: tools/preview-secrets.sh <branch-preview-name>
# Reads WRITER_API_KEY from $WRITER_ENV (a KEY=value file) and the Cloudflare token from
# ~/.config/tessera/cloudflare-api-token. Never prints either value.
set -eu
NAME="${1:?preview name, e.g. night2}"
WRITER_ENV="${WRITER_ENV:?set WRITER_ENV to a file containing WRITER_API_KEY=...}"
grep '^WRITER_API_KEY=' "$WRITER_ENV" | cut -d= -f2- | tr -d '\n' | npx wrangler preview secret put WRITER_API_KEY --name "$NAME" 2>&1 | grep -E "Success|ERROR" | head -1
tr -d '\n' < "$HOME/.config/tessera/cloudflare-api-token" | npx wrangler preview secret put CF_ACCESS_API_TOKEN --name "$NAME" 2>&1 | grep -E "Success|ERROR" | head -1
# Preview Access app AUD (fd773727…); must not use prod ACCESS_AUD or JWT verify fails after OTP.
printf '%s' '87812bb9fbbdd7b8bfc537e3f42688cfac00219a5370d2c11813a229f0621e33' | npx wrangler preview secret put ACCESS_AUD --name "$NAME" 2>&1 | grep -E "Success|ERROR" | head -1
