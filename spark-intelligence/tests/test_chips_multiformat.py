from pathlib import Path

from lib.chips.loader import ChipLoader


def _chip_identity(chip_id: str, name: str) -> str:
    return f"""
chip:
  id: {chip_id}
  name: {name}
  version: 1.0.0
  activation: auto
  description: test chip
  author: test
  license: MIT
  human_benefit: test
  harm_avoidance:
    - no harm
  risk_level: low
  safety_tests:
    - no_harm
  domains:
    - test
""".strip()


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def test_loader_supports_single_multifile_and_hybrid(tmp_path):
    chips_dir = tmp_path / "chips"
    chips_dir.mkdir(parents=True, exist_ok=True)

    # Single file chip.
    _write(
        chips_dir / "single.chip.yaml",
        _chip_identity("single", "Single Chip")
        + """
triggers:
  patterns: ["single"]
observers: []
""",
    )

    # Multi-file chip.
    _write(chips_dir / "multifile" / "multi" / "chip.yaml", _chip_identity("multi", "Multi Chip"))
    _write(
        chips_dir / "multifile" / "multi" / "triggers.yaml",
        """
triggers:
  patterns: ["multi"]
""".strip(),
    )
    _write(
        chips_dir / "multifile" / "multi" / "observers.yaml",
        """
observers:
  - name: obs
    description: test
    triggers: ["multi"]
    capture:
      required: {}
      optional: {}
""".strip(),
    )

    # Hybrid chip.
    _write(
        chips_dir / "hybrid" / "hyb.chip.yaml",
        _chip_identity("hyb", "Hybrid Chip")
        + """
includes:
  - hyb_triggers.yaml
""",
    )
    _write(
        chips_dir / "hybrid" / "hyb_triggers.yaml",
        """
triggers:
  patterns: ["hyb"]
""".strip(),
    )

    loader = ChipLoader(chips_dir=chips_dir, preferred_format="multifile")
    chips = {chip.id: chip for chip in loader.discover_chips()}

    assert "single" in chips
    assert "multi" in chips
    assert "hyb" in chips
    assert chips["single"].load_format == "single"
    assert chips["multi"].load_format == "multifile"
    assert chips["hyb"].load_format == "hybrid"
    assert chips["multi"].load_metrics.get("file_count", 0) >= 2
    assert chips["hyb"].load_metrics.get("file_count", 0) >= 2


def test_loader_prefers_requested_format_for_duplicate_chip_id(tmp_path):
    chips_dir = tmp_path / "chips"
    chips_dir.mkdir(parents=True, exist_ok=True)

    # Single variant.
    _write(
        chips_dir / "dup.chip.yaml",
        _chip_identity("dup", "Duplicate Chip")
        + """
triggers:
  patterns: ["single"]
""",
    )

    # Multi-file variant with same chip id.
    _write(chips_dir / "multifile" / "dup" / "chip.yaml", _chip_identity("dup", "Duplicate Chip"))
    _write(
        chips_dir / "multifile" / "dup" / "triggers.yaml",
        """
triggers:
  patterns: ["multifile"]
""".strip(),
    )

    loader_multi = ChipLoader(chips_dir=chips_dir, preferred_format="multifile")
    chips_multi = {chip.id: chip for chip in loader_multi.discover_chips()}
    assert chips_multi["dup"].load_format == "multifile"

    loader_single = ChipLoader(chips_dir=chips_dir, preferred_format="single")
    chips_single = {chip.id: chip for chip in loader_single.discover_chips()}
    assert chips_single["dup"].load_format == "single"
