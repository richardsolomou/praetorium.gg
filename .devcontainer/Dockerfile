# Keep these pins equal to mise.toml (Node, just), package.json (pnpm, spacetimedb) and Dockerfile.node (SpacetimeDB checksums).
FROM node:24.22.2-bookworm

# `just check` runs the Python script tests.
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
# Enabled as root so `just install` finds the links in place and does not need to write to /usr/local/bin.
RUN corepack enable

# scripts/lib/spacetimeCli.ts looks for the CLI in the pinned version's directory under ~/.local/share/spacetime/bin.
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) target=x86_64 just=409044617b6f06517c1035e55ca38c8c856ff8b650e41bc2aa1ef82d5903a23e spacetime=2d8950dc3c67910aa80aa7612efddb5ee6ed53c443573f617b3ad65fef2aa084 ;; \
      arm64) target=aarch64 just=23871b1702bfd550fb5f901778fd4290ecf2ee034a45a889fbe96d89b188086d spacetime=d7ef1efcd40776b80d60d962d02d3ad80aa94d9dce2bbe5993920d054cfb2113 ;; \
      *) echo "Unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    fetch() { curl --fail --location --proto '=https' --tlsv1.2 --retry 8 --retry-delay 10 --retry-all-errors --max-time 60 --output "$2" "$1"; }; \
    fetch "https://github.com/casey/just/releases/download/1.59.0/just-1.59.0-$target-unknown-linux-musl.tar.gz" /tmp/just.tar.gz; \
    echo "$just  /tmp/just.tar.gz" | sha256sum -c -; \
    tar --no-same-owner -xzf /tmp/just.tar.gz -C /usr/local/bin just; \
    fetch "https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.14.0/spacetime-$target-unknown-linux-gnu.tar.gz" /tmp/spacetime.tar.gz; \
    echo "$spacetime  /tmp/spacetime.tar.gz" | sha256sum -c -; \
    bin=/home/node/.local/share/spacetime/bin/2.14.0; \
    mkdir -p "$bin"; \
    tar --no-same-owner -xzf /tmp/spacetime.tar.gz -C "$bin" spacetimedb-cli spacetimedb-standalone; \
    chown -R node:node /home/node/.local; \
    ln -s "$bin/spacetimedb-cli" /usr/local/bin/spacetime; \
    rm /tmp/just.tar.gz /tmp/spacetime.tar.gz; \
    just --version; \
    spacetime --version
