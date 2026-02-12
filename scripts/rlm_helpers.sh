#!/bin/bash
# RLM Helper Scripts - Recursive Language Model utilities
# Based on arXiv:2512.24601

RLM_DIR="${RLM_DIR:-/tmp/gavin_rlm}"

# Initialize RLM workspace
rlm_init() {
    mkdir -p "$RLM_DIR"
    echo "RLM workspace initialized at $RLM_DIR"
}

# Store input as RLM variable
# Usage: rlm_store <name> <file_or_stdin>
rlm_store() {
    local name="$1"
    local input="$2"
    
    rlm_init
    
    if [[ -f "$input" ]]; then
        cp "$input" "$RLM_DIR/var_${name}.txt"
    else
        cat > "$RLM_DIR/var_${name}.txt"
    fi
    
    # Generate metadata
    local file="$RLM_DIR/var_${name}.txt"
    local lines=$(wc -l < "$file")
    local chars=$(wc -c < "$file")
    local tokens=$((chars / 4))
    
    cat > "$RLM_DIR/meta_${name}.json" << EOF
{
    "name": "$name",
    "file": "$file",
    "lines": $lines,
    "chars": $chars,
    "estimated_tokens": $tokens,
    "created": "$(date -Iseconds)"
}
EOF
    
    # Generate preview
    head -50 "$file" > "$RLM_DIR/preview_${name}.txt"
    tail -20 "$file" > "$RLM_DIR/tail_${name}.txt"
    
    echo "Stored '$name': $lines lines, ~$tokens tokens"
    echo "Metadata: $RLM_DIR/meta_${name}.json"
}

# Get metadata for RLM variable
# Usage: rlm_meta <name>
rlm_meta() {
    local name="$1"
    cat "$RLM_DIR/meta_${name}.json" 2>/dev/null || echo "Variable '$name' not found"
}

# Get preview of RLM variable
# Usage: rlm_preview <name>
rlm_preview() {
    local name="$1"
    echo "=== Preview of '$name' (first 50 lines) ==="
    cat "$RLM_DIR/preview_${name}.txt" 2>/dev/null
    echo ""
    echo "=== Tail (last 20 lines) ==="
    cat "$RLM_DIR/tail_${name}.txt" 2>/dev/null
}

# Slice RLM variable
# Usage: rlm_slice <name> <start_line> <end_line>
rlm_slice() {
    local name="$1"
    local start="$2"
    local end="$3"
    sed -n "${start},${end}p" "$RLM_DIR/var_${name}.txt"
}

# Search in RLM variable
# Usage: rlm_search <name> <pattern>
rlm_search() {
    local name="$1"
    local pattern="$2"
    grep -n "$pattern" "$RLM_DIR/var_${name}.txt"
}

# Count pattern in RLM variable
# Usage: rlm_count <name> <pattern>
rlm_count() {
    local name="$1"
    local pattern="$2"
    grep -c "$pattern" "$RLM_DIR/var_${name}.txt"
}

# Chunk RLM variable into pieces
# Usage: rlm_chunk <name> <lines_per_chunk>
rlm_chunk() {
    local name="$1"
    local chunk_size="${2:-1000}"
    
    mkdir -p "$RLM_DIR/chunks_${name}"
    split -l "$chunk_size" "$RLM_DIR/var_${name}.txt" "$RLM_DIR/chunks_${name}/chunk_"
    
    echo "Chunked '$name' into:"
    ls -la "$RLM_DIR/chunks_${name}/"
}

# Store intermediate result
# Usage: rlm_result <name> <content_or_stdin>
rlm_result() {
    local name="$1"
    shift
    
    if [[ $# -gt 0 ]]; then
        echo "$@" >> "$RLM_DIR/result_${name}.txt"
    else
        cat >> "$RLM_DIR/result_${name}.txt"
    fi
}

# Get all results
# Usage: rlm_results <name>
rlm_results() {
    local name="$1"
    cat "$RLM_DIR/result_${name}.txt" 2>/dev/null
}

# Clean up RLM workspace
# Usage: rlm_clean [name]
rlm_clean() {
    local name="$1"
    
    if [[ -n "$name" ]]; then
        rm -f "$RLM_DIR/var_${name}.txt"
        rm -f "$RLM_DIR/meta_${name}.json"
        rm -f "$RLM_DIR/preview_${name}.txt"
        rm -f "$RLM_DIR/tail_${name}.txt"
        rm -f "$RLM_DIR/result_${name}.txt"
        rm -rf "$RLM_DIR/chunks_${name}"
        echo "Cleaned '$name'"
    else
        rm -rf "$RLM_DIR"
        echo "Cleaned entire RLM workspace"
    fi
}

# List all RLM variables
# Usage: rlm_list
rlm_list() {
    echo "=== RLM Variables ==="
    for meta in "$RLM_DIR"/meta_*.json; do
        [[ -f "$meta" ]] && cat "$meta"
        echo "---"
    done
}

# Export functions if sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    export -f rlm_init rlm_store rlm_meta rlm_preview rlm_slice rlm_search rlm_count rlm_chunk rlm_result rlm_results rlm_clean rlm_list
    export RLM_DIR
fi
