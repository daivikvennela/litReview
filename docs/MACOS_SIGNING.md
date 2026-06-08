# macOS code signing & notarization (optional — paid)

**Don’t want to pay $99/year?** Use the free workaround in the README:  
`xattr -cr "/Applications/Lit Review Agent.app"` after install.

This guide is only if you later want **one-click open** for all users without that step.

## Prerequisites

1. **Apple Developer Program** membership ($99/year) — [developer.apple.com](https://developer.apple.com/programs/)
2. A **Developer ID Application** certificate (not “Apple Development”)
3. GitHub repo **Actions secrets** on `preethamam/Papers-Articles-Literature-Review-Agent`

## One-time: create the certificate

1. On a Mac, open **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**  
   Save the `.certSigningRequest` file.
2. In [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list), create **Developer ID Application**.
3. Download the `.cer`, double-click to add it to Keychain.
4. In Keychain Access, expand **Developer ID Application**, select cert + private key → **Export** → `.p12` (set a strong password).

## Encode the certificate for GitHub

```bash
base64 -i ~/Downloads/DeveloperID.p12 | pbcopy
# Paste into GitHub secret CSC_LINK
```

## App-specific password (not your Apple ID password)

1. [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**
2. Generate one labeled e.g. `lit-review-agent-notarize`

## GitHub Actions secrets

Add these in **Settings → Secrets and variables → Actions** on the repo that runs releases:

| Secret | Value |
|--------|--------|
| `CSC_LINK` | Base64 of your `.p12` file |
| `CSC_KEY_PASSWORD` | Password you set when exporting `.p12` |
| `APPLE_ID` | Apple ID email used for the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from above |
| `APPLE_TEAM_ID` | 10-character Team ID from [Membership details](https://developer.apple.com/account#MembershipDetailsCard) |

Optional (Windows SmartScreen):

| Secret | Value |
|--------|--------|
| `WIN_CSC_LINK` | Base64 of Authenticode `.p12` |
| `WIN_CSC_KEY_PASSWORD` | Export password |

## How CI uses this

On tag `v*`, macOS release jobs:

1. Fail fast if any required macOS secret is missing
2. Build with `electron-builder` (hardened runtime + entitlements)
3. Sign with `CSC_LINK` / `CSC_KEY_PASSWORD`
4. Notarize with Apple credentials and staple the ticket to the DMG
5. Verify `codesign` and `stapler validate` before upload

## Local signed build (optional)

```bash
export CSC_LINK=/path/to/DeveloperID.p12   # or base64 string
export CSC_KEY_PASSWORD='...'
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
export APPLE_TEAM_ID='XXXXXXXXXX'

npm run dist:mac-arm64
```

Without these variables, `electron-builder` produces an **unsigned** DMG (fine for dev; users need the `xattr` workaround).

## After secrets are added

Push a new tag to trigger a release:

```bash
git tag v2.0.4
git push preethamam-litrev v2.0.4
```

Download the new DMG from Releases — it should open without **damaged** / **unidentified developer** prompts.
