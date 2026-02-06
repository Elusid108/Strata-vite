# Environment Setup Guide

This guide walks you through configuring the Google API credentials required to run Strata locally.

## Google Cloud Project Setup

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** in the top navigation bar, then click **New Project**
3. Enter a project name (e.g., "Strata") and click **Create**
4. Make sure your new project is selected in the top navigation bar

### 2. Enable Required APIs

1. Go to **APIs & Services > Library** in the left sidebar
2. Search for and enable each of the following APIs:
   - **Google Drive API**
   - **Google Picker API**

### 3. Configure the OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** user type and click **Create**
3. Fill in the required fields:
   - **App name**: Strata (or your preferred name)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/drive.appdata`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Click **Save and Continue** through the remaining steps

### 4. Create an OAuth 2.0 Client ID

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Web application** as the application type
4. Enter a name (e.g., "Strata Web Client")
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5175` (for local development)
   - Your production domain URL (if deploying)
6. Click **Create**
7. Copy the **Client ID** value

### 5. Create an API Key

1. On the same **Credentials** page, click **Create Credentials > API key**
2. Copy the generated API key
3. (Recommended) Click **Restrict Key** to limit its usage:
   - Under **Application restrictions**, select **HTTP referrers**
   - Add `http://localhost:5175/*` and your production domain
   - Under **API restrictions**, select **Restrict key** and choose:
     - Google Drive API
     - Google Picker API
4. Click **Save**

## Environment File Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your credentials:

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key-here
   ```

   Replace the placeholder values with the Client ID and API Key you obtained above.

## Verifying Your Setup

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Open `http://localhost:5175` in your browser
3. Click the Google Drive sign-in button
4. You should be prompted to authorize the application with your Google account
5. After authorization, you should be able to access Google Drive features

## Troubleshooting

- **"Access blocked" error during sign-in**: Make sure your OAuth consent screen is properly configured and your Client ID's authorized origins include `http://localhost:5175`
- **"API key not valid" error**: Verify your API key is correct and that the required APIs (Drive, Picker) are enabled in your Google Cloud project
- **Blank or unresponsive Google Picker**: Ensure the Google Picker API is enabled and your API key has access to it
- **CORS errors**: Check that `http://localhost:5175` is listed in your OAuth client's authorized JavaScript origins
