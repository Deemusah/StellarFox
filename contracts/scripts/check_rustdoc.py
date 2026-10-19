#!/usr/bin/env python3
"""Fail when a production Rust public function has no rustdoc summary."""

from pathlib import Path
import re
import sys


CONTRACTS_DIR = Path(__file__).resolve().parents[1]
FUNCTION_DECLARATION = re.compile(r"^\s*pub\s+(?:const\s+)?fn\s+\w+")
TRAIT_DECLARATION = re.compile(r"^\s*pub\s+trait\s+\w+")
TRAIT_FUNCTION = re.compile(r"^\s*fn\s+\w+")
EXCLUDED_FILES = {"test.rs", "tests.rs"}


def has_rustdoc(lines, index):
    previous = index - 1
    while previous >= 0 and not lines[previous].strip():
        previous -= 1
    return previous >= 0 and lines[previous].lstrip().startswith("///")


def undocumented_functions():
    missing = []
    for source in sorted(CONTRACTS_DIR.glob("*/src/**/*.rs")):
        if source.name in EXCLUDED_FILES:
            continue

        lines = source.read_text(encoding="utf-8").splitlines()
        in_public_trait = False
        trait_depth = 0
        for index, line in enumerate(lines):
            if TRAIT_DECLARATION.match(line):
                in_public_trait = True
                trait_depth = line.count("{") - line.count("}")
            elif in_public_trait and TRAIT_FUNCTION.match(line):
                if not has_rustdoc(lines, index):
                    missing.append((source.relative_to(CONTRACTS_DIR), index + 1, line.strip()))
            elif FUNCTION_DECLARATION.match(line) and not has_rustdoc(lines, index):
                missing.append((source.relative_to(CONTRACTS_DIR), index + 1, line.strip()))
            elif in_public_trait:
                trait_depth += line.count("{") - line.count("}")
                if trait_depth <= 0:
                    in_public_trait = False
    return missing


def main():
    missing = undocumented_functions()
    if missing:
        print("Public Rust functions missing rustdoc comments:", file=sys.stderr)
        for path, line, declaration in missing:
            print(f"  {path}:{line}: {declaration}", file=sys.stderr)
        return 1
    print("All production public Rust functions have rustdoc comments.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
