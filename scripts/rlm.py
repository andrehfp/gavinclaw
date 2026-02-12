#!/usr/bin/env python3
"""
RLM (Recursive Language Model) Utilities
Based on arXiv:2512.24601

Provides programmatic access to long inputs without loading them into context.
"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional, Iterator, List, Dict, Any

RLM_DIR = Path(os.environ.get("RLM_DIR", "/tmp/gavin_rlm"))


def init() -> Path:
    """Initialize RLM workspace."""
    RLM_DIR.mkdir(parents=True, exist_ok=True)
    return RLM_DIR


def store(name: str, content: str | Path) -> Dict[str, Any]:
    """
    Store input as RLM variable.
    
    Args:
        name: Variable name
        content: String content or Path to file
        
    Returns:
        Metadata dict
    """
    init()
    
    var_file = RLM_DIR / f"var_{name}.txt"
    
    if isinstance(content, Path) or (isinstance(content, str) and os.path.isfile(content)):
        # Copy from file
        with open(content, 'r') as f:
            text = f.read()
    else:
        text = content
    
    var_file.write_text(text)
    
    # Generate metadata
    lines = text.count('\n') + 1
    chars = len(text)
    tokens = chars // 4  # rough estimate
    
    meta = {
        "name": name,
        "file": str(var_file),
        "lines": lines,
        "chars": chars,
        "estimated_tokens": tokens,
        "hash": hashlib.md5(text.encode()).hexdigest()[:8],
        "created": datetime.now().isoformat()
    }
    
    meta_file = RLM_DIR / f"meta_{name}.json"
    meta_file.write_text(json.dumps(meta, indent=2))
    
    # Generate preview
    preview_lines = text.split('\n')[:50]
    (RLM_DIR / f"preview_{name}.txt").write_text('\n'.join(preview_lines))
    
    tail_lines = text.split('\n')[-20:]
    (RLM_DIR / f"tail_{name}.txt").write_text('\n'.join(tail_lines))
    
    return meta


def meta(name: str) -> Optional[Dict[str, Any]]:
    """Get metadata for RLM variable."""
    meta_file = RLM_DIR / f"meta_{name}.json"
    if meta_file.exists():
        return json.loads(meta_file.read_text())
    return None


def preview(name: str) -> str:
    """Get preview of RLM variable."""
    preview_file = RLM_DIR / f"preview_{name}.txt"
    if preview_file.exists():
        return preview_file.read_text()
    return ""


def slice(name: str, start: int, end: int) -> str:
    """
    Get slice of RLM variable (1-indexed lines).
    
    Args:
        name: Variable name
        start: Start line (1-indexed, inclusive)
        end: End line (1-indexed, inclusive)
    """
    var_file = RLM_DIR / f"var_{name}.txt"
    if not var_file.exists():
        return ""
    
    lines = var_file.read_text().split('\n')
    # Convert to 0-indexed
    return '\n'.join(lines[start-1:end])


def search(name: str, pattern: str, context: int = 0) -> List[Dict[str, Any]]:
    """
    Search for pattern in RLM variable.
    
    Args:
        name: Variable name
        pattern: Search pattern (simple string match)
        context: Lines of context around each match
        
    Returns:
        List of matches with line numbers and content
    """
    var_file = RLM_DIR / f"var_{name}.txt"
    if not var_file.exists():
        return []
    
    lines = var_file.read_text().split('\n')
    matches = []
    
    for i, line in enumerate(lines, 1):
        if pattern.lower() in line.lower():
            match = {
                "line": i,
                "content": line
            }
            if context > 0:
                start = max(0, i - 1 - context)
                end = min(len(lines), i + context)
                match["context"] = '\n'.join(lines[start:end])
            matches.append(match)
    
    return matches


def chunk(name: str, chunk_size: int = 1000) -> List[str]:
    """
    Chunk RLM variable into pieces.
    
    Args:
        name: Variable name
        chunk_size: Lines per chunk
        
    Returns:
        List of chunk file paths
    """
    var_file = RLM_DIR / f"var_{name}.txt"
    if not var_file.exists():
        return []
    
    lines = var_file.read_text().split('\n')
    chunk_dir = RLM_DIR / f"chunks_{name}"
    chunk_dir.mkdir(exist_ok=True)
    
    chunks = []
    for i in range(0, len(lines), chunk_size):
        chunk_lines = lines[i:i + chunk_size]
        chunk_file = chunk_dir / f"chunk_{i//chunk_size:04d}.txt"
        chunk_file.write_text('\n'.join(chunk_lines))
        chunks.append(str(chunk_file))
    
    return chunks


def iter_chunks(name: str, chunk_size: int = 1000) -> Iterator[tuple[int, str]]:
    """
    Iterate over chunks of RLM variable.
    
    Yields:
        (chunk_index, chunk_content)
    """
    var_file = RLM_DIR / f"var_{name}.txt"
    if not var_file.exists():
        return
    
    lines = var_file.read_text().split('\n')
    
    for i in range(0, len(lines), chunk_size):
        chunk_lines = lines[i:i + chunk_size]
        yield i // chunk_size, '\n'.join(chunk_lines)


def result(name: str, content: str, append: bool = True):
    """Store intermediate result."""
    init()
    result_file = RLM_DIR / f"result_{name}.txt"
    
    if append:
        with open(result_file, 'a') as f:
            f.write(content + '\n')
    else:
        result_file.write_text(content)


def results(name: str) -> str:
    """Get all results for a variable."""
    result_file = RLM_DIR / f"result_{name}.txt"
    if result_file.exists():
        return result_file.read_text()
    return ""


def clean(name: Optional[str] = None):
    """Clean up RLM workspace."""
    if name:
        for pattern in [f"var_{name}.txt", f"meta_{name}.json", 
                       f"preview_{name}.txt", f"tail_{name}.txt",
                       f"result_{name}.txt"]:
            f = RLM_DIR / pattern
            if f.exists():
                f.unlink()
        
        chunk_dir = RLM_DIR / f"chunks_{name}"
        if chunk_dir.exists():
            import shutil
            shutil.rmtree(chunk_dir)
    else:
        import shutil
        if RLM_DIR.exists():
            shutil.rmtree(RLM_DIR)


def list_vars() -> List[Dict[str, Any]]:
    """List all RLM variables."""
    init()
    variables = []
    for meta_file in RLM_DIR.glob("meta_*.json"):
        variables.append(json.loads(meta_file.read_text()))
    return variables


def describe(name: str) -> str:
    """
    Get a description suitable for passing to LLM (metadata only, no content).
    """
    m = meta(name)
    if not m:
        return f"Variable '{name}' not found"
    
    p = preview(name)
    
    return f"""RLM Variable: {name}
File: {m['file']}
Size: {m['lines']} lines, {m['chars']} chars (~{m['estimated_tokens']} tokens)
Hash: {m['hash']}
Created: {m['created']}

Preview (first 50 lines):
{p}

Operations available:
- rlm.slice('{name}', start_line, end_line) - Get specific lines
- rlm.search('{name}', 'pattern') - Find pattern occurrences  
- rlm.chunk('{name}', 1000) - Split into 1000-line chunks
- rlm.iter_chunks('{name}', 1000) - Iterate over chunks
"""


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: rlm.py <command> [args]")
        print("Commands: store, meta, preview, slice, search, chunk, list, clean")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "store" and len(sys.argv) >= 4:
        name, path = sys.argv[2], sys.argv[3]
        m = store(name, Path(path))
        print(json.dumps(m, indent=2))
    
    elif cmd == "meta" and len(sys.argv) >= 3:
        print(json.dumps(meta(sys.argv[2]), indent=2))
    
    elif cmd == "preview" and len(sys.argv) >= 3:
        print(preview(sys.argv[2]))
    
    elif cmd == "slice" and len(sys.argv) >= 5:
        print(slice(sys.argv[2], int(sys.argv[3]), int(sys.argv[4])))
    
    elif cmd == "search" and len(sys.argv) >= 4:
        for m in search(sys.argv[2], sys.argv[3]):
            print(f"{m['line']}: {m['content']}")
    
    elif cmd == "chunk" and len(sys.argv) >= 3:
        size = int(sys.argv[3]) if len(sys.argv) >= 4 else 1000
        for c in chunk(sys.argv[2], size):
            print(c)
    
    elif cmd == "list":
        for v in list_vars():
            print(f"{v['name']}: {v['lines']} lines, ~{v['estimated_tokens']} tokens")
    
    elif cmd == "describe" and len(sys.argv) >= 3:
        print(describe(sys.argv[2]))
    
    elif cmd == "clean":
        name = sys.argv[2] if len(sys.argv) >= 3 else None
        clean(name)
        print("Cleaned")
    
    else:
        print(f"Unknown command or missing args: {cmd}")
        sys.exit(1)
