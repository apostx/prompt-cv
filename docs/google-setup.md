# Google Cloud Project Setup

This guide covers creating a Google Cloud project and OAuth credentials for Prompt CV.

## Security Recommendation

**Create a dedicated Google account for this project.** When users grant Google Drive access to Prompt CV, the application can read files in their Drive (needed to fetch templates). Using a separate account ensures your personal files are never accessible.

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** > **New Project**
3. Name it `prompt-cv` (or similar)
4. Click **Create**

## 2. Enable Required APIs

1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Google Docs API**
   - **Google Drive API**

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type
3. Fill in:
   - **App name**: Prompt CV
   - **User support email**: your email
   - **Developer contact email**: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
5. Add test users (your email) while in testing mode
6. Save

> **Note:** While in "Testing" mode, only added test users can authenticate. To allow any Google user, submit for verification or switch to "In production" (unverified apps show a warning screen).

## 4. Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: `Prompt CV Web`
5. Add **Authorized redirect URIs**:
   - `https://YOUR_AUTH_API_ENDPOINT/auth/callback` (web login)
   - `https://YOUR_AUTH_API_ENDPOINT/oauth/callback` (MCP OAuth)
6. Click **Create**
7. Note the **Client ID** and **Client Secret**

> **Important:** You must use "Web application" type, not "Desktop". Desktop type does not support custom redirect URIs.

## 5. Update Your Deployment

Use the Client ID and Client Secret when deploying all three AWS stacks:

```bash
# All three stacks need these parameters:
GoogleClientId=YOUR_CLIENT_ID
GoogleClientSecret=YOUR_CLIENT_SECRET
```

Also update the redirect URIs in Google Cloud Console whenever your Auth API endpoint changes.

## Scopes Explained

| Scope | Why |
|-------|-----|
| `drive.readonly` | Read Google Docs templates and instruction documents |
| `drive.file` | Create and update generated CV documents in the user's Drive |
