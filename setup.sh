#!/bin/sh
set -e
command -v pi >/dev/null || curl -fsSL https://pi.dev/install.sh | sh
command -v mmdflux >/dev/null || { mkdir -p ~/.local/bin && curl -fsSL https://github.com/kevinswiber/mmdflux/releases/download/mmdflux-v2.6.1/mmdflux-v2.6.1-linux-x86_64.tar.gz | tar xz -C ~/.local/bin mmdflux; }
npm install
mkdir -p ~/.pi/agent/extensions
ln -sfn "$(pwd)" ~/.pi/agent/extensions/sekar
