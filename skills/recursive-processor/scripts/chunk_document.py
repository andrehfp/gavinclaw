#!/usr/bin/env python3
"""
Intelligent document chunking for recursive processing.
Splits documents by sections, paragraphs, or fixed size while preserving context.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterator


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return len(text) // 4


def chunk_by_sections(text: str, max_tokens: int = 10000) -> Iterator[dict]:
    """
    Split by markdown/document sections (headers).
    Merges small sections, splits large ones.
    """
    # Pattern for headers (markdown # or numbered sections)
    header_pattern = re.compile(r'^(#{1,6}\s+.+|(?:\d+\.)+\s+.+)$', re.MULTILINE)
    
    sections = []
    last_end = 0
    
    for match in header_pattern.finditer(text):
        if last_end < match.start():
            content = text[last_end:match.start()].strip()
            if content:
                sections.append({"header": None, "content": content})
        last_end = match.start()
    
    # Add remaining content
    if last_end < len(text):
        remaining = text[last_end:].strip()
        if remaining:
            # Try to split header from content
            lines = remaining.split('\n', 1)
            if len(lines) > 1 and header_pattern.match(lines[0]):
                sections.append({"header": lines[0], "content": lines[1].strip()})
            else:
                sections.append({"header": None, "content": remaining})
    
    # Merge small sections, yield when approaching limit
    current_chunk = {"headers": [], "content": "", "start_idx": 0}
    chunk_idx = 0
    
    for i, section in enumerate(sections):
        section_text = f"{section['header']}\n{section['content']}" if section['header'] else section['content']
        section_tokens = estimate_tokens(section_text)
        current_tokens = estimate_tokens(current_chunk["content"])
        
        if current_tokens + section_tokens > max_tokens and current_chunk["content"]:
            # Yield current chunk
            yield {
                "index": chunk_idx,
                "content": current_chunk["content"],
                "headers": current_chunk["headers"],
                "tokens": current_tokens
            }
            chunk_idx += 1
            current_chunk = {"headers": [], "content": "", "start_idx": i}
        
        if section['header']:
            current_chunk["headers"].append(section['header'])
        current_chunk["content"] += f"\n\n{section_text}" if current_chunk["content"] else section_text
    
    # Yield remaining
    if current_chunk["content"]:
        yield {
            "index": chunk_idx,
            "content": current_chunk["content"],
            "headers": current_chunk["headers"],
            "tokens": estimate_tokens(current_chunk["content"])
        }


def chunk_by_paragraphs(text: str, max_tokens: int = 10000) -> Iterator[dict]:
    """Split by paragraph boundaries."""
    paragraphs = re.split(r'\n\s*\n', text)
    
    current_chunk = ""
    chunk_idx = 0
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
            
        para_tokens = estimate_tokens(para)
        current_tokens = estimate_tokens(current_chunk)
        
        if current_tokens + para_tokens > max_tokens and current_chunk:
            yield {
                "index": chunk_idx,
                "content": current_chunk,
                "tokens": current_tokens
            }
            chunk_idx += 1
            current_chunk = para
        else:
            current_chunk += f"\n\n{para}" if current_chunk else para
    
    if current_chunk:
        yield {
            "index": chunk_idx,
            "content": current_chunk,
            "tokens": estimate_tokens(current_chunk)
        }


def chunk_by_lines(text: str, max_lines: int = 500) -> Iterator[dict]:
    """Split by line count (good for code/logs)."""
    lines = text.split('\n')
    
    for i in range(0, len(lines), max_lines):
        chunk_lines = lines[i:i + max_lines]
        content = '\n'.join(chunk_lines)
        yield {
            "index": i // max_lines,
            "content": content,
            "start_line": i + 1,
            "end_line": min(i + max_lines, len(lines)),
            "tokens": estimate_tokens(content)
        }


def chunk_by_fixed_tokens(text: str, max_tokens: int = 10000, overlap: int = 500) -> Iterator[dict]:
    """Fixed token chunks with overlap for context continuity."""
    chars_per_chunk = max_tokens * 4
    overlap_chars = overlap * 4
    
    start = 0
    chunk_idx = 0
    
    while start < len(text):
        end = start + chars_per_chunk
        
        # Try to break at sentence/paragraph boundary
        if end < len(text):
            # Look for paragraph break
            para_break = text.rfind('\n\n', start + chars_per_chunk // 2, end)
            if para_break > start:
                end = para_break
            else:
                # Look for sentence break
                sentence_break = text.rfind('. ', start + chars_per_chunk // 2, end)
                if sentence_break > start:
                    end = sentence_break + 1
        
        content = text[start:end].strip()
        if content:
            yield {
                "index": chunk_idx,
                "content": content,
                "char_start": start,
                "char_end": end,
                "tokens": estimate_tokens(content)
            }
            chunk_idx += 1
        
        start = end - overlap_chars if end < len(text) else end


def main():
    parser = argparse.ArgumentParser(description="Chunk documents for recursive processing")
    parser.add_argument("input", help="Input file path (or - for stdin)")
    parser.add_argument("--strategy", choices=["sections", "paragraphs", "lines", "fixed"],
                        default="sections", help="Chunking strategy")
    parser.add_argument("--max-tokens", type=int, default=10000, help="Max tokens per chunk")
    parser.add_argument("--max-lines", type=int, default=500, help="Max lines per chunk (for 'lines' strategy)")
    parser.add_argument("--overlap", type=int, default=500, help="Overlap tokens (for 'fixed' strategy)")
    parser.add_argument("--output", "-o", help="Output file (default: stdout)")
    parser.add_argument("--format", choices=["json", "files"], default="json",
                        help="Output format: json array or separate files")
    parser.add_argument("--output-dir", help="Output directory for 'files' format")
    
    args = parser.parse_args()
    
    # Read input
    if args.input == "-":
        text = sys.stdin.read()
    else:
        text = Path(args.input).read_text()
    
    # Select chunking strategy
    if args.strategy == "sections":
        chunks = list(chunk_by_sections(text, args.max_tokens))
    elif args.strategy == "paragraphs":
        chunks = list(chunk_by_paragraphs(text, args.max_tokens))
    elif args.strategy == "lines":
        chunks = list(chunk_by_lines(text, args.max_lines))
    else:
        chunks = list(chunk_by_fixed_tokens(text, args.max_tokens, args.overlap))
    
    # Add metadata
    total_tokens = sum(c["tokens"] for c in chunks)
    result = {
        "total_chunks": len(chunks),
        "total_tokens": total_tokens,
        "strategy": args.strategy,
        "chunks": chunks
    }
    
    # Output
    if args.format == "json":
        output = json.dumps(result, indent=2)
        if args.output:
            Path(args.output).write_text(output)
        else:
            print(output)
    else:
        # Write separate files
        out_dir = Path(args.output_dir or "chunks")
        out_dir.mkdir(parents=True, exist_ok=True)
        
        for chunk in chunks:
            chunk_file = out_dir / f"chunk_{chunk['index']:04d}.txt"
            chunk_file.write_text(chunk["content"])
        
        # Write manifest
        manifest = {k: v for k, v in result.items() if k != "chunks"}
        manifest["chunk_files"] = [f"chunk_{c['index']:04d}.txt" for c in chunks]
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
        
        print(f"Wrote {len(chunks)} chunks to {out_dir}/")


if __name__ == "__main__":
    main()
