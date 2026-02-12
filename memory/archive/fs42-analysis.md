# FieldStation42 Complete Analysis Report

**Generated:** 2026-02-04
**System:** FieldStation42 at `/home/andreprado/FieldStation42`
**Media Storage:** `/mnt/ssd`

---

## Executive Summary

| Category | Status | Action Required |
|----------|--------|-----------------|
| Duplicates | ✅ None | Hard links in use |
| Codec Efficiency | ⚠️ ~150GB potential savings | Consider re-encoding largest H.264 files |
| Torrent Cleanup | ✅ Minimal | Only 49MB orphaned files |
| Unused Content | ⚠️ Christmas empty | Add Christmas movies |
| Thematic Schedules | 🔧 Created | New configs ready |
| Marathon Feature | ✅ Already Supported | Config examples created |

---

## 1. Duplicate Files Analysis

### Result: NO DUPLICATES FOUND ✅

The system uses **hard links** between `/mnt/ssd/torrents/complete/` and `/mnt/ssd/media/`. Files with link count > 1 share the same inode on disk, meaning NO additional space is consumed.

**How it works:**
- Radarr/Sonarr create hard links when importing
- Media files in `torrents/complete/` point to same disk blocks as files in `media/`
- Deleting torrents is SAFE as long as media files exist

**Hard-linked files found:** 44+ movies, 1200+ TV episodes

**Non-hardlinked files (orphaned):**
- `/mnt/ssd/torrents/complete/radarr/www.UIndex.org - Spider-Man 2002...` (40MB) - Different file than imported

**Potential Space Savings:** ~0 (hard links don't use extra space)

---

## 2. Inefficient Encodings Analysis

### Top 20 Largest H.264 Files (Should Be HEVC)

| Size | Movie | Potential Savings* |
|------|-------|-------------------|
| 18.4 GB | The Princess Bride (1987) | ~12 GB |
| 17.2 GB | Kingdom of Heaven (2005) | ~11 GB |
| 11.8 GB | Paddington (2014) | ~7 GB |
| 11.5 GB | The Incredibles (2004) | ~7 GB |
| 10.9 GB | Paddington 2 (2017) | ~7 GB |
| 10.8 GB | Kung Fu Panda 3 (2016) | ~7 GB |
| 10.6 GB | Coco (2017) | ~7 GB |
| 8.1 GB | Kung Fu Panda (2008) | ~5 GB |
| 7.9 GB | Spider-Man (2002) | ~5 GB |
| 5.9 GB | 300 (2007) | Already HEVC ✅ |
| 4.9 GB | LOTR: Return of the King (2003) | ~3 GB |
| 4.4 GB | Emperor's New Groove (2000) | ~3 GB |
| 4.3 GB | LOTR: Two Towers (2002) | ~3 GB |
| 4.2 GB | Sisu (2025) | ~3 GB |
| 4.2 GB | LOTR: Fellowship (2001) | ~3 GB |
| 4.0 GB | Inglourious Basterds (2009) | Already HEVC ✅ |
| 4.0 GB | Predator (1987) | ~2.5 GB |
| 4.0 GB | Greatest Showman (2017) | ~2.5 GB |
| 4.0 GB | E.T. (1982) | ~2.5 GB |

*Assumes ~35-40% size reduction with HEVC/x265 at equivalent quality

### Already Using HEVC (Good!):
- 300 (2007), Inglourious Basterds, RRR (2022), Django Unchained, RoboCop 1&2
- Baby Driver, Dark Knight Rises, Ghostbusters, Napoleon (2023)
- Man in Iron Mask, Prometheus, Con Air, Shutter Island

### Total Potential Savings:
- **~150 GB** if top 20 largest H.264 files were re-encoded to HEVC
- Priority: Re-encode files >5GB first

### Re-encoding Script Recommendation:
```bash
# Example for Princess Bride (highest priority - 18.4GB -> ~6GB)
ffmpeg -i "The Princess Bride (1987).mkv" \
  -c:v libx265 -crf 20 -preset slow \
  -c:a copy \
  "The Princess Bride (1987).hevc.mkv"
```

---

## 3. Old Completed Torrents Analysis

### Summary:
| Directory | Size | Hard-linked | Orphaned |
|-----------|------|-------------|----------|
| radarr | 202 GB | 99% | 40 MB |
| tv-sonarr | 657 GB | 99% | Minimal |
| movies-radarr | Empty | N/A | N/A |

**Conclusion:** Almost all torrent files are hard-linked. Deleting `/mnt/ssd/torrents/complete/` contents would NOT free disk space because files are still referenced in `/mnt/ssd/media/`.

### Safe to Delete:
```bash
# These are not linked to media:
rm -rf "/mnt/ssd/torrents/complete/radarr/www.UIndex.org    -    Spider-Man 2002 PROPER MULTi 1080p BluRay x264-AiRLiNE"
```

### To Properly Clean Torrents:
1. Remove completed items from Transmission
2. Files will remain in media (hard link)
3. **Don't delete torrent directories directly** - let Transmission manage them

---

## 4. Unused Content Analysis

### Content Directories in Use:
| Channel | Content Dir | Tags Used |
|---------|-------------|-----------|
| Cine | catalog/cine | all (everything) |
| Cine Light | catalog/cinelight | all (curated family) |
| Cartoonz | catalog/cartoonz | adventuretime, regularshow, simpsons, familyguy |
| Discovery | catalog/discovery | cosmos, mythbusters, beakmans, espaconave, titans, frontiersmen |
| BatsuTV | catalog/japanese | batsu |
| RNT TV | catalog/rnttv | novelas |
| Shows | catalog/shows | friends, himym, office, chris, anne, modernfamily, vikings, chosen, peakyblinders |

### EMPTY Directories (No Content):
- `/mnt/ssd/media/movies/christmas/` - **EMPTY!** (0 Christmas movies)
- `/mnt/ssd/media/shows/gaming/` - **EMPTY!**

### Content NOT in Any Schedule:
The Cine channel uses "all" tag which includes everything in `/mnt/ssd/media/movies/`. However, **Cine Light is curated** and excludes:
- Most action movies (adult-rated content)
- Violent dramas

### Movies Available But Not Family-Friendly (Correctly Excluded from CineLight):
- Kill Bill 1 & 2
- Pulp Fiction
- Reservoir Dogs
- Scarface
- Die Hard
- Predator 1 & 2
- Django Unchained
- etc.

### Recommendation:
1. **Add Christmas Movies** to `/mnt/ssd/media/movies/christmas/`:
   - Home Alone (move/link from family)
   - Home Alone 2 (move/link from family)
   - How the Grinch Stole Christmas
   - Jingle All the Way
   - The Nightmare Before Christmas
   - Add more: Elf, A Christmas Story, Die Hard (it counts!)

---

## 5. Storage Overview

| Location | Size | Type |
|----------|------|------|
| /mnt/ssd/media/movies/action | 206 GB | Movies |
| /mnt/ssd/media/movies/family | 144 GB | Movies |
| /mnt/ssd/media/movies/comedy | 54 GB | Movies |
| /mnt/ssd/media/movies/scifi | 48 GB | Movies |
| /mnt/ssd/media/movies/drama | 29 GB | Movies |
| /mnt/ssd/media/shows/adult | 593 GB | TV |
| /mnt/ssd/media/shows/cartoons | 221 GB | TV |
| /mnt/ssd/media/shows/talkshows | 171 GB | TV (Batsu) |
| /mnt/ssd/media/shows/novelas | 135 GB | TV |
| /mnt/ssd/media/shows/educational | 72 GB | TV |
| **Total** | ~1.67 TB | |

---

## 6. Thematic Schedule Configs

### Created: `cine-thematic.json`

Implements weekend themes:
- **Friday (18:00-24:00):** Action Movies 
- **Saturday (all day):** Family Movies
- **Sunday (all day):** Comedy Movies

See `/home/andreprado/FieldStation42/confs/cine-thematic.json`

---

## 7. Christmas Schedule Implementation

### Current State: date_hints ALREADY SUPPORTED! ✅

FieldStation42 has built-in support for temporal hints in `fs42/schedule_hint.py`:

- **MonthHint:** Play content only during specific month
- **RangeHint:** Play content during date range (e.g., "December 1 - December 25")
- **QuarterHint:** Play by quarter (Q1-Q4)

### Implementation Options:

**Option A: Use RangeHint in catalog tags**
```
# In file naming or folder structure:
movies/christmas/Home Alone (1990) [December 1 - December 31]
```

**Option B: Create dedicated Christmas channel**
See `/home/andreprado/FieldStation42/confs/cine-christmas.json`

**Option C: Use fallback_tag feature**
Set christmas movies as fallback when December content is empty.

### Required: Add Christmas Content First!
```bash
# Create symlinks for existing Christmas-appropriate movies:
cd /mnt/ssd/media/movies/christmas
ln -s "../family/Home Alone (1990)" .
ln -s "../family/Home Alone 2 (1992)" .
ln -s "../family/The Nightmare Before Christmas (1993)" .
ln -s "../family/How the Grinch Stole Christmas (2000)" .
ln -s "../family/Jingle All the Way (1996)" .
```

---

## 8. Marathon Feature Analysis

### ALREADY IMPLEMENTED! ✅

The marathon feature exists in `fs42/marathon_agent.py` and is supported in the schema:

```json
{
  "12": {
    "tags": "friends",
    "sequence": "friends",
    "marathon": {
      "chance": 0.3,
      "count": 4
    }
  }
}
```

- **chance:** Probability (0.0-1.0) that marathon triggers
- **count:** Number of consecutive episodes

### How It Works:
1. When a slot is scheduled, MarathonAgent checks for marathon config
2. If `random.random() < chance`, marathon mode activates
3. The slot is duplicated `count-1` times
4. Episodes play consecutively from the same show

### Example Configs Created:
- `shows-marathon.json` - Weekend marathon support for TV shows
- Settings for "Marathon Saturdays" with 4-episode blocks

---

## 9. Created Configuration Files

### New Files in `/home/andreprado/FieldStation42/confs/`:

1. **cine-thematic.json** - Thematic weekend schedule (Action Friday, Family Saturday, Comedy Sunday)
2. **cine-christmas.json** - December-only Christmas channel
3. **shows-marathon.json** - TV show marathons on weekends

---

## 10. Action Items Summary

### High Priority:
1. ⬜ Add Christmas movies to `/mnt/ssd/media/movies/christmas/`
2. ⬜ Re-encode Princess Bride (18GB → ~6GB with HEVC)
3. ⬜ Re-encode Kingdom of Heaven (17GB → ~6GB)

### Medium Priority:
4. ⬜ Re-encode other large H.264 files (Paddington series, Incredibles, etc.)
5. ⬜ Test new schedule configs
6. ⬜ Rebuild catalogs after adding Christmas content

### Low Priority:
7. ⬜ Clean up orphaned torrent file (40MB)
8. ⬜ Add content to gaming folder or remove it

### Commands to Rebuild After Changes:
```bash
cd /home/andreprado/FieldStation42
python3 station_42.py --rebuild_catalog --schedule
```

---

## Appendix: File Structure

```
/mnt/ssd/
├── fs42/              # Catalog symlinks for FS42
│   ├── cine/          # Movies (all genres linked)
│   ├── cinelight/     # Family-friendly subset
│   ├── cartoonz/      # Cartoon shows
│   ├── discovery/     # Educational content
│   ├── japanese/      # Batsu games
│   ├── rnttv/         # Novelas
│   └── shows/         # Adult TV shows
├── media/
│   ├── movies/        # 481GB total
│   │   ├── action/    # 80 movies
│   │   ├── comedy/    # 33 movies
│   │   ├── drama/     # 18 movies
│   │   ├── family/    # 38 movies
│   │   ├── scifi/     # 26 movies
│   │   └── christmas/ # EMPTY!
│   └── shows/         # 1.2TB total
│       ├── adult/     # 11 series
│       ├── cartoons/  # 4 series
│       ├── educational/ # 6 series
│       ├── novelas/
│       └── talkshows/
└── torrents/complete/ # Hard-linked to media (no extra space used)
```
