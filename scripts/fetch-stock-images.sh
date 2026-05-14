#!/usr/bin/env bash
#
# Fetches Twemoji SVGs from the maintained fork (jdecked/twemoji) for the
# 80+ most common kid-science-experiment supplies, names them with friendly
# filenames matching the supply names, and drops them into
# server/data/stock-images/.
#
# License: Twemoji is CC-BY 4.0 — attribution is given in the project README.
#
# Re-running is safe (curl -f -o overwrites).

set -euo pipefail

OUT="$(cd "$(dirname "$0")/../server/data/stock-images" 2>/dev/null && pwd || true)"
if [[ -z "$OUT" ]]; then
  mkdir -p "$(dirname "$0")/../server/data/stock-images"
  OUT="$(cd "$(dirname "$0")/../server/data/stock-images" && pwd)"
fi
echo "[fetch-stock-images] writing to $OUT"

BASE="https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg"

# Format: codepoint=filename (without .svg)
# Multi-codepoint emoji use hyphens (e.g. 1f9d1-200d-1f52c).
MAP=(
  # ---- containers / kitchen ----
  "1f50b=battery"
  "1f4a1=light-bulb"
  "1f4a1=led-bulb"
  "1f9f2=magnet"
  "2702=scissors"
  "270f=pencil"
  "1f58d=crayon"
  "1f58c=paintbrush"
  "1f58a=pen"
  "1f4ce=paperclip"
  "1f4cf=ruler"
  "1f4d0=set-square"
  "1f4c4=paper"
  "1f4c4=page"
  "1f4d3=notebook"
  "1f4d6=book"
  "1f4da=books"
  "1f4cb=clipboard"
  # ---- containers / drinkware ----
  "1f964=cup-with-straw"
  "1f964=plastic-cup"
  "1f95b=glass-of-milk"
  "1f95b=glass"
  "1f943=tumbler"
  "1f377=wine-glass"
  "1f375=teacup"
  "2615=coffee-cup"
  "2615=mug"
  "1f9f4=lotion-bottle"
  "1f9f4=bottle"
  "1f9ea=test-tube"
  "1f9eb=petri-dish"
  "1faa3=bucket"
  "1f6c1=bathtub"
  "1f36f=honey-jar"
  "1f36f=jar"
  "1fad9=plate"
  "1f944=spoon"
  "1f95a=egg"
  # ---- pantry / kitchen ----
  "1f9c2=salt"
  "1f9c8=butter"
  "1f34b=lemon"
  "1f34e=apple"
  "1f34c=banana"
  "1f35e=bread"
  "1f9ca=ice"
  "1f9ca=ice-cube"
  # ---- liquids ----
  "1f4a7=water-drop"
  "1f4a7=droplet"
  "1f4a7=water"
  "1f30a=wave"
  # ---- electronics / lab ----
  "1f50d=magnifying-glass"
  "1f52c=microscope"
  "1f52d=telescope"
  "1f9eb=culture-dish"
  "1f9ec=dna"
  "1f50a=speaker"
  "1f514=bell"
  # ---- hardware / tools ----
  "1f527=wrench"
  "1f528=hammer"
  "1fa9a=saw"
  "1fa9b=screwdriver"
  "1f529=nut-and-bolt"
  "1f529=bolt"
  "2699=gear"
  "1f9f0=toolbox"
  "1faa1=sewing-needle"
  "1f9f5=spool-of-thread"
  "1f9f5=thread"
  "1f9f6=yarn"
  "1f9f6=string"
  # ---- nature ----
  "1faa8=rock"
  "1faa8=stone"
  "1f333=tree"
  "1f331=seedling"
  "1f331=plant"
  "1f343=leaf"
  "1f33f=herb"
  "1f33b=sunflower"
  "1f33b=flower"
  "1f335=cactus"
  "1f344=mushroom"
  "1f30e=earth"
  "2600=sun"
  "2601=cloud"
  "2744=snowflake"
  "26a1=lightning"
  "1f308=rainbow"
  "1f319=moon"
  "2b50=star"
  "1f525=fire"
  # ---- misc objects ----
  "1f388=balloon"
  "1f4e6=cardboard-box"
  "1f4e6=box"
  "1f4e6=package"
  "1f381=gift"
  "1fa99=coin"
  "1f4b0=money-bag"
  "1fa9e=mirror"
  "1f512=lock"
  "1f511=key"
  "231b=hourglass"
  "1f9fb=paper-roll"
  "1f9fb=toilet-paper"
  # ---- toys / sports ----
  "26bd=soccer-ball"
  "26bd=ball"
  "1f3c0=basketball"
  "1f3b1=eight-ball"
  "1f3b1=marble"
  "1f3b2=die"
  "1f3b2=dice"
  "1fa80=yoyo"
  "1fa81=kite"
  "1f9e9=puzzle-piece"
  "1f9f8=teddy-bear"
  # ---- music / instruments ----
  "1f3b8=guitar"
  "1f3b9=piano"
  "1f941=drum"
  "1f3bb=violin"
  "1f3ba=trumpet"
  "1f3b5=music-note"
  # ---- vehicles ----
  "1f697=car"
  "1f6b2=bicycle"
  "1f6b2=bike"
  "2708=airplane"
  "1f680=rocket"
  "1f681=helicopter"
)

count=0
failed=0
for entry in "${MAP[@]}"; do
  codepoint="${entry%%=*}"
  filename="${entry#*=}"
  target="$OUT/$filename.svg"
  url="$BASE/$codepoint.svg"
  if curl -fsS -o "$target" "$url"; then
    count=$((count + 1))
  else
    echo "[fetch-stock-images] FAILED: $filename ($codepoint)"
    failed=$((failed + 1))
  fi
done

echo "[fetch-stock-images] done — $count saved, $failed failed"
