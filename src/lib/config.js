/*
 * Copyright 2026 Christopher Moore
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Google API Configuration
// Reads from Vite environment variables

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
// Google Cloud project number. The Picker needs it (setAppId) so files the user
// picks become readable by the app under the drive.file scope. OAuth client IDs
// are "<projectNumber>-<hash>.apps.googleusercontent.com", so it can be derived.
export const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || CLIENT_ID.split('-')[0] || '';
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

export default { CLIENT_ID, API_KEY, APP_ID, SCOPES };
