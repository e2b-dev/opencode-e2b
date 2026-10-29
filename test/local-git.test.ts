import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "bun:test"

import { readLocalGitBranch } from "../dist/core/local-git.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "opencode-e2b-git-"))
}

test("readLocalGitBranch reads the checked-out branch of a plain repository", async () => {
  const root = await tempDir()
  try {
    await mkdir(path.join(root, ".git"), { recursive: true })
    await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/feature/nested-name\n")

    assert.equal(await readLocalGitBranch(root), "feature/nested-name")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("readLocalGitBranch follows the gitdir pointer used by worktrees", async () => {
  const root = await tempDir()
  try {
    // A linked worktree stores `.git` as a file pointing at the real git dir.
    const realGitDir = path.join(root, "actual-git-dir")
    await mkdir(realGitDir, { recursive: true })
    await writeFile(path.join(realGitDir, "HEAD"), "ref: refs/heads/worktree-branch\n")

    const worktree = path.join(root, "worktree")
    await mkdir(worktree, { recursive: true })
    await writeFile(path.join(worktree, ".git"), `gitdir: ${realGitDir}\n`)

    assert.equal(await readLocalGitBranch(worktree), "worktree-branch")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("readLocalGitBranch returns undefined for detached HEAD and non-repositories", async () => {
  const root = await tempDir()
  try {
    // Detached HEAD stores a raw commit id: no branch to mirror.
    await mkdir(path.join(root, ".git"), { recursive: true })
    await writeFile(path.join(root, ".git", "HEAD"), "9f1c4dfb0f3c4b9a8e1d2c3b4a5968778899aabb\n")
    assert.equal(await readLocalGitBranch(root), undefined)

    // Not a repository at all.
    const plain = await tempDir()
    try {
      assert.equal(await readLocalGitBranch(plain), undefined)
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("readLocalGitBranch reads what git itself writes, in a repository and a linked worktree", async () => {
  // Guards the parsing against the actual on-disk format, not just fixtures.
  const root = await tempDir()
  try {
    const repo = path.join(root, "repo")
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" })
    await mkdir(repo)
    git("init", "-q", "-b", "real/branch")
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init")
    git("worktree", "add", "-q", "-b", "linked/branch", path.join(root, "linked"))

    assert.equal(await readLocalGitBranch(repo), "real/branch")
    assert.equal(await readLocalGitBranch(path.join(root, "linked")), "linked/branch")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
