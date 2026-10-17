#!/bin/sh
# Compiles (once, cached) and runs the reference runner on the installed JDK.
#   ref.sh --check            exit 0 if a usable JDK (>= 23) is installed, 3 otherwise
#   ref.sh --version          print the runtime version line
#   ref.sh <scripts> <out>    run the scripts, write normalised output
command -v javac >/dev/null 2>&1 && command -v java >/dev/null 2>&1 || exit 3
VER=$(javac -version 2>&1 | sed -n 's/^javac \([0-9][0-9]*\).*/\1/p')
[ -n "$VER" ] && [ "$VER" -ge 23 ] || exit 3
DIR=$(cd "$(dirname "$0")" && pwd)
BUILD="${TMPDIR:-/tmp}/ts-cf-diff-build-$VER"
if [ ! -f "$BUILD/RefRunner.class" ] || [ "$DIR/RefRunner.java" -nt "$BUILD/RefRunner.class" ]; then
  mkdir -p "$BUILD" && rm -f "$BUILD"/*.class
  javac --release "$VER" --enable-preview -Xlint:-preview -d "$BUILD" "$DIR/RefRunner.java" 2>&1 | grep -v '^Note:' >&2
  [ -f "$BUILD/RefRunner.class" ] || exit 2
fi
[ "$1" = "--check" ] && exit 0
if [ "$1" = "--version" ]; then java -version 2>&1 | head -1; exit 0; fi
exec java --enable-preview -XX:+UseSerialGC -Xss8m -cp "$BUILD" RefRunner "$1" "$2"
