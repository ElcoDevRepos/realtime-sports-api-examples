#!/usr/bin/env bash
# List the sports the API knows about.
# Usage: ./list-sports.sh
source "$(dirname "$0")/_common.sh"
require_key
api_get "/sports"
