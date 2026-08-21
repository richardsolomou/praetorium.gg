#!/bin/sh
# Removes one run's containers and network, whatever state they are in.
#
# The single implementation of taking the stack down, because three callers need
# it: the stack script before it boots, Playwright's teardown after the suite, and
# `just e2e` before Playwright probes the port. A container left holding the port
# is enough to refuse the next run outright.
set -eu

port=${1:?port required}

# These names are the convention `stack.sh` boots under. Renaming there means
# renaming here, or a run stops being able to find its own containers.
docker rm --force \
    "praetorium-e2e-${port}" \
    "praetorium-e2e-postgres-${port}" \
    "praetorium-e2e-valkey-${port}" >/dev/null 2>&1 || true
docker network rm "praetorium-e2e-net-${port}" >/dev/null 2>&1 || true
