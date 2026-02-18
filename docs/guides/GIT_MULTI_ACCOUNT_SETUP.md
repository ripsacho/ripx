# Multi-Account Git Setup Plan for RipX

## Current Setup
- **Work Account:** `ripon-sb` / `ripon@splitbase.com`
- **SSH Key:** `id_ed25519` (for work)
- **Personal Account (to add):** `njrips@gmail.com`

## Step-by-Step Implementation Plan

### Step 1: Generate New SSH Key for Personal Account
**Purpose:** Create a separate SSH key for your personal GitHub account

**Command:**
```bash
ssh-keygen -t ed25519 -C "njrips@gmail.com" -f ~/.ssh/id_ed25519_personal
```

**What happens:**
- Creates `~/.ssh/id_ed25519_personal` (private key)
- Creates `~/.ssh/id_ed25519_personal.pub` (public key)
- You'll be prompted for a passphrase (recommended: use a strong passphrase)

**⚠️ Important:** 
- Use a different filename (`id_ed25519_personal`) to avoid overwriting your work key
- Remember the passphrase or store it securely

---

### Step 2: Create SSH Config File
**Purpose:** Tell SSH which key to use for which GitHub account

**File:** `~/.ssh/config`

**Configuration:**
```
# Work account (splitbase.com)
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

# Personal account (njrips@gmail.com)
Host github-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes
```

**What this does:**
- `github-work` → uses work SSH key for work repos
- `github-personal` → uses personal SSH key for personal repos
- `IdentitiesOnly yes` → prevents SSH from trying other keys

---

### Step 3: Add Personal SSH Key to SSH Agent
**Purpose:** Load the key into SSH agent so you don't need to enter passphrase every time

**Commands:**
```bash
# Add personal key to SSH agent
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_personal

# Verify both keys are loaded
ssh-add -l
```

**What happens:**
- Key is added to macOS keychain
- Key persists across reboots (thanks to `--apple-use-keychain`)

---

### Step 4: Add SSH Key to GitHub
**Purpose:** Register your public key with GitHub so it can authenticate you

**Steps:**
1. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519_personal.pub | pbcopy
   ```

2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
   - Title: "Mac Personal - RipX" (or similar)
   - Key: Paste the copied key
   - Click "Add SSH key"

**⚠️ Important:**
- Make sure you're logged into your **personal GitHub account** (njrips@gmail.com)
- Don't add this to your work account by mistake!

---

### Step 5: Configure Local Git for RipX Project
**Purpose:** Set this project to use your personal account

**Commands:**
```bash
cd /Users/m.a.k.ripon/Desktop/RipX

# Initialize git if not already done (skip if already initialized)
git init

# Set local user config (overrides global)
git config user.name "Your Personal GitHub Username"
git config user.email "njrips@gmail.com"
```

**What this does:**
- Local config takes precedence over global config
- All commits in this project will use your personal identity
- Other projects will still use your work account (global config)

**⚠️ Important:**
- Replace "Your Personal GitHub Username" with your actual GitHub username
- This only affects THIS project, not others

---

### Step 6: Set Up Remote Repository (When Ready)
**Purpose:** Connect your local repo to GitHub using the personal account

**When you create a GitHub repo for RipX:**

```bash
# Add remote using the personal SSH host alias
git remote add origin git@github-personal:your-username/ripx.git

# Verify remote
git remote -v
```

**What this does:**
- Uses `github-personal` host alias → automatically uses personal SSH key
- All push/pull operations use your personal account

**⚠️ Important:**
- Replace `your-username` with your actual GitHub username
- Use `github-personal` (not `github.com`) in the URL

---

### Step 7: Test the Configuration
**Purpose:** Verify everything works correctly

**Test SSH connection:**
```bash
# Test personal account connection
ssh -T git@github-personal

# Should see: "Hi your-username! You've successfully authenticated..."
```

**Test Git config:**
```bash
# Check local config
git config --local --list

# Should show:
# user.name=Your Personal GitHub Username
# user.email=njrips@gmail.com
```

**Test with a commit:**
```bash
# Make a test commit
git add .
git commit -m "Initial commit with personal account"

# Check commit author
git log --format='%an <%ae>'

# Should show: Your Personal GitHub Username <njrips@gmail.com>
```

---

## Important Things to Be Aware Of

### ⚠️ Critical Warnings

1. **Always use the correct SSH host alias:**
   - Personal repos: `git@github-personal:username/repo.git`
   - Work repos: `git@github-work:username/repo.git`
   - Never use `git@github.com` directly (it will use the wrong key)

2. **When cloning new repos:**
   - Personal: `git clone git@github-personal:username/repo.git`
   - Work: `git clone git@github-work:username/repo.git`

3. **If you already have remotes configured:**
   - Update existing remotes: `git remote set-url origin git@github-personal:username/repo.git`

4. **Global vs Local Config:**
   - Global config (`~/.gitconfig`) = work account (affects all repos)
   - Local config (`.git/config`) = personal account (affects only this repo)
   - Local config overrides global config

5. **IDE/Editor Settings:**
   - VS Code, Cursor, etc. may cache credentials
   - If you see authentication issues, check IDE Git settings
   - May need to restart IDE after SSH config changes

6. **Passphrase Management:**
   - First time using key: enter passphrase
   - After adding to keychain: should remember it
   - If issues: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519_personal`

7. **Multiple Projects:**
   - Each project can have its own local Git config
   - Set local config per project based on which account it should use
   - Or use conditional includes (advanced, for folder-based organization)

### ✅ Best Practices

1. **Naming Convention:**
   - Use descriptive SSH key names: `id_ed25519_personal`, `id_ed25519_work`
   - Use descriptive SSH host aliases: `github-personal`, `github-work`

2. **Verification:**
   - Always verify `git config --local --list` before committing
   - Check commit author with `git log` after committing

3. **Security:**
   - Use strong passphrases for SSH keys
   - Never share private keys
   - Use different keys for different accounts (which we're doing)

4. **Documentation:**
   - Keep track of which projects use which account
   - Document your SSH host aliases

---

## Quick Reference Commands

```bash
# Check current Git config
git config --global --list    # Global (work account)
git config --local --list     # Local (this project)

# Check SSH keys
ssh-add -l                    # List loaded keys
ls -la ~/.ssh/id_*            # List all SSH keys

# Test SSH connections
ssh -T git@github-personal    # Test personal account
ssh -T git@github-work        # Test work account

# Update remote URL
git remote set-url origin git@github-personal:username/repo.git

# View commit authors
git log --format='%an <%ae>'  # Show author name and email
```

---

## Troubleshooting

### Issue: "Permission denied (publickey)"
**Solution:**
- Verify SSH key is added: `ssh-add -l`
- Check SSH config: `cat ~/.ssh/config`
- Test connection: `ssh -T git@github-personal`
- Verify key is added to GitHub account

### Issue: Wrong account used in commits
**Solution:**
- Check local config: `git config --local --list`
- Set local config: `git config user.email "njrips@gmail.com"`
- Amend last commit: `git commit --amend --author="Name <njrips@gmail.com>"`

### Issue: SSH agent not remembering passphrase
**Solution:**
- Re-add with keychain: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519_personal`
- Check keychain access in macOS System Settings

---

## Next Steps After Setup

1. ✅ Generate SSH key for personal account
2. ✅ Create SSH config file
3. ✅ Add key to SSH agent
4. ✅ Add key to GitHub
5. ✅ Configure local Git for RipX
6. ✅ Initialize Git repo (if needed)
7. ✅ Create GitHub repository
8. ✅ Add remote and push code

---

**Ready to proceed?** Let me know and I'll help you execute each step!

