#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/module-cache
SDK="${SCLSHI_SDK:-$(xcrun --show-sdk-path)}"
if [[ -z "${SCLSHI_SDK:-}" && -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk ]]; then
  SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk
fi
swiftc -sdk "$SDK" -parse-as-library -swift-version 5 -D SCLSHI_TEST \
  -module-cache-path "$PWD/build/module-cache" Sclshi.swift ContractTests.swift -o build/contract-tests
./build/contract-tests
