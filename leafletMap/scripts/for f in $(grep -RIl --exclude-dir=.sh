for f in $(grep -RIl --exclude-dir=.bin '"tsconfigRootDir"' node_modules); do
  if [ -f "$f.bak" ]; then mv -f "$f.bak" "$f"; fi
done