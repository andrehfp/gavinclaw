#!/bin/bash
# Build vertical reel (1080x1920) with:
# 1. Title card with sketch+render side by side (3s)
# 2. Transition video scaled to fill (8s)  
# 3. End card with MoldaSpace branding (3s)

set -e
cd /home/andreprado/.openclaw/workspace

SKETCH="out/maia-reel-sketch.png"
RENDER="out/maia-reel-render.png"
VIDEO="out/maia-reel-test/transition-veo.mp4"
OUT="out/maia-reel-test/reel-final.mp4"
TMP="out/maia-reel-test/tmp"
mkdir -p "$TMP"

# 1. Create title card (1080x1920) - sketch + render side by side with labels
ffmpeg -y \
  -f lavfi -i "color=c=0x111111:s=1080x1920:d=3" \
  -i "$SKETCH" -i "$RENDER" \
  -filter_complex "
    [1:v]scale=460:-1[sk];
    [2:v]scale=460:-1[rn];
    [0:v][sk]overlay=(1080-460*2-40)/2:(1920-251-200)/2[bg1];
    [bg1][rn]overlay=(1080-460*2-40)/2+460+40:(1920-251-200)/2[bg2];
    [bg2]drawtext=text='sketch':fontsize=36:fontcolor=white:x=(1080-460*2-40)/2+230-60:y=(1920-251-200)/2-50:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[bg3];
    [bg3]drawtext=text='render':fontsize=36:fontcolor=white:x=(1080-460*2-40)/2+460+40+230-60:y=(1920-251-200)/2-50:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[bg4];
    [bg4]drawtext=text='do sketch ao render':fontsize=52:fontcolor=white:x=(w-tw)/2:y=300:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[bg5];
    [bg5]drawtext=text='em segundos ✨':fontsize=44:fontcolor=0xFFAA33:x=(w-tw)/2:y=380:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf[out]
  " \
  -map "[out]" -t 3 -r 24 -pix_fmt yuv420p "$TMP/title.mp4"

echo "Title card done"

# 2. Scale transition video to vertical (crop center, fill 1080x1920)
ffmpeg -y -i "$VIDEO" \
  -vf "scale=1920*iw/ih:1920,crop=1080:1920:(iw-1080)/2:0" \
  -r 24 -pix_fmt yuv420p -t 8 "$TMP/transition.mp4"

echo "Transition scaled"

# 3. Create end card with branding
ffmpeg -y \
  -f lavfi -i "color=c=0x111111:s=1080x1920:d=3" \
  -filter_complex "
    drawtext=text='moldaspace.com':fontsize=56:fontcolor=white:x=(w-tw)/2:y=880:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[t1];
    [t1]drawtext=text='em breve':fontsize=40:fontcolor=0xFFAA33:x=(w-tw)/2:y=960:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf[t2];
    [t2]drawtext=text='sketch → render → video':fontsize=34:fontcolor=0xAAAAAA:x=(w-tw)/2:y=1020:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
  " \
  -t 3 -r 24 -pix_fmt yuv420p "$TMP/endcard.mp4"

echo "End card done"

# 4. Concatenate all parts
cat > "$TMP/concat.txt" << EOF
file 'title.mp4'
file 'transition.mp4'
file 'endcard.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i "$TMP/concat.txt" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -movflags +faststart "$OUT"

echo "Final reel: $OUT"
ls -lh "$OUT"
echo "MEDIA: $(realpath $OUT)"
