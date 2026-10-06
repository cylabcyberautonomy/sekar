#!/bin/sh
set -e
command -v pi >/dev/null || curl -fsSL https://pi.dev/install.sh | sh
command -v graph-easy >/dev/null || sudo apt install -y libgraph-easy-perl
npm install
mkdir -p ~/.pi/agent/extensions
ln -sfn "$(pwd)" ~/.pi/agent/extensions/sekar