#!/usr/bin/env bash
# =============================================================================
# Nearbit Platform — Monorepo Migration Script
# =============================================================================
# Migrates 3 source repos into this monorepo while PRESERVING full Git history.
# Each repo's commits are rewritten so they appear under their target subfolder.
#
# Prerequisites:
#   - git >= 2.39
#   - git-filter-repo  →  pip install git-filter-repo
#
# Usage:
#   bash migrate.sh
#   bash migrate.sh --dry-run    (validates prereqs & prints plan only)
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
MONOREPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
B2C_URL="https://github.com/ufonaft12/Shoppy.git"
B2C_BRANCH="claude/init-nearbit-mvp-pA2dr"
B2C_PREFIX="apps/b2c-client"

B2B_URL="https://github.com/ufonaft12/shoppyb2b.git"
B2B_BRANCH="master"
B2B_PREFIX="apps/b2b-dashboard"

PARSER_URL="https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers.git"
PARSER_BRANCH="main"
PARSER_PREFIX="services/market-parser"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo "[INFO]  $*"; }
step()  { echo ""; echo "══════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════"; }
die()   { echo "[ERROR] $*" >&2; exit 1; }

check_prereqs() {
  step "Checking prerequisites"
  command -v git          >/dev/null 2>&1 || die "git not found"
  command -v git-filter-repo >/dev/null 2>&1 || \
    die "git-filter-repo not found. Install with: pip install git-filter-repo"

  local git_version
  git_version=$(git --version | grep -oP '\d+\.\d+' | head -1)
  info "git version: $git_version"
  info "git-filter-repo: $(git-filter-repo --version 2>/dev/null || echo 'ok')"
  info "Monorepo root: $MONOREPO_DIR"
  info "All prerequisites met."
}

# merge_repo_into_subdir <url> <branch> <target-prefix>
#
# Strategy:
#   1. Clone the source repo into a temp dir.
#   2. Run git-filter-repo --to-subdirectory-filter to rewrite every commit so
#      all paths are prefixed with <target-prefix>/. This rewrites SHAs.
#   3. Add the rewritten clone as a temporary remote in the monorepo.
#   4. Fetch and merge with --allow-unrelated-histories.
#   5. Clean up the temp remote.
#
# Result: `git log -- <target-prefix>/` shows the full original history.
merge_repo_into_subdir() {
  local url="$1"
  local branch="$2"
  local prefix="$3"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local remote_name="_import_$(echo "$prefix" | tr '/' '_')"

  step "Migrating: $url  →  $prefix"

  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would clone $url and merge into $prefix"
    return
  fi

  # 1. Clone source repo (full history, no shallow)
  info "Cloning source repo..."
  git clone --no-local "$url" "$tmp_dir/source"

  # 2. Rewrite all paths to live under $prefix/
  info "Rewriting paths to $prefix/ ..."
  pushd "$tmp_dir/source" >/dev/null
    git filter-repo --to-subdirectory-filter "$prefix" --force
  popd >/dev/null

  # 3. Add as temporary remote in the monorepo
  info "Merging history into monorepo..."
  pushd "$MONOREPO_DIR" >/dev/null
    git remote add "$remote_name" "$tmp_dir/source"
    git fetch "$remote_name" --no-tags

    # Merge rewritten history (allow because these are unrelated root commits)
    git merge --allow-unrelated-histories \
      --no-edit \
      -m "chore(migration): import $prefix with full history from $url" \
      "$remote_name/$branch"

    git remote remove "$remote_name"
  popd >/dev/null

  # 4. Cleanup
  rm -rf "$tmp_dir"
  info "Done: $prefix"
}

# ── Main ──────────────────────────────────────────────────────────────────────
check_prereqs

if [[ "$DRY_RUN" == true ]]; then
  step "Dry run — migration plan"
  echo ""
  echo "  $B2C_URL  ($B2C_BRANCH)  →  $B2C_PREFIX"
  echo "  $B2B_URL  ($B2B_BRANCH)  →  $B2B_PREFIX"
  echo "  $PARSER_URL  ($PARSER_BRANCH)  →  $PARSER_PREFIX"
  echo ""
  echo "Run without --dry-run to execute."
  exit 0
fi

# Ensure we are inside a git repo
if [[ ! -d "$MONOREPO_DIR/.git" ]]; then
  step "Initialising git repository"
  git -C "$MONOREPO_DIR" init
  git -C "$MONOREPO_DIR" commit --allow-empty -m "chore: initial monorepo scaffold"
fi

# Run migrations in sequence (each modifies git history)
merge_repo_into_subdir "$B2C_URL"    "$B2C_BRANCH"    "$B2C_PREFIX"
merge_repo_into_subdir "$B2B_URL"    "$B2B_BRANCH"    "$B2B_PREFIX"
merge_repo_into_subdir "$PARSER_URL" "$PARSER_BRANCH" "$PARSER_PREFIX"

step "Migration complete"
echo ""
echo "Verify history was preserved:"
echo "  git log --oneline -- $B2C_PREFIX"
echo "  git log --oneline -- $B2B_PREFIX"
echo "  git log --oneline -- $PARSER_PREFIX"
echo ""
echo "Push to remote:"
echo "  git remote add origin https://github.com/ufonaft12/nearbit.git"
echo "  git push -u origin main"
