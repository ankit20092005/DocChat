# DocChat client

DocChat is a React, Vite and Tailwind workspace for asking questions about PDFs. It connects to the Express API for sign-in, uploads, conversations and streaming answers. Each source chip opens the cited passage with its filename, page and retrieval score.

## Run locally

Use Node.js 22.17 or newer. From the project root, run these commands in PowerShell.

```powershell
cd client
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open [DocChat on localhost](http://localhost:5173). Start the sibling services using the [server README](../server/README.md) and [AI service README](../ai-service/README.md) to use your own documents.

- `VITE_API_URL` accepts the public Express origin or its URL ending in `/api`. The example points to `http://127.0.0.1:4000/api`.
- Set Express `CLIENT_URL` to the exact browser origin, including the port. With the example configuration, visit `http://localhost:5173`.
- When `VITE_API_URL` is omitted, the browser calls `/api` on the same origin. The Vite development server proxies that path to port 4000. A production web server using this configuration must route `/api` to Express and serve `index.html` for client routes.
- Vite embeds public configuration at build time. Keep MongoDB credentials, the internal service key and model-provider credentials in the backend.

## Use the workspace

1. Register or sign in. Open **Document library** and drop a PDF onto the upload area or use the file picker.
2. Select the checkbox beside a ready PDF. The library refreshes every three seconds while a PDF is processing. A failed document displays the server’s reason.
3. Choose **New chat**, enter a question and press **Enter** to send. **Shift+Enter** adds a line break. The first question creates the conversation and becomes its initial title.
4. Open a citation below the answer to read its source passage. **Copy answer** copies the Markdown text. **Stop generating** cancels the request and reloads the messages Express saved.
5. Open the menu beside a conversation to rename or delete it. Document deletion also requires confirmation. On narrow screens, use **Open navigation** for the sidebar.

## Verify

The stream unit tests use Node’s test runner. The browser suite uses the sibling Express service, an isolated temporary MongoDB replica set and a local test double for FastAPI. It exercises real HTTP uploads, streamed chunks, cancellation and persistence. It generates its own accounts and credentials. The first run can download a MongoDB binary and Chromium.

```powershell
npm test
npm run build
npm ci --prefix ../server
npx playwright install chromium
npm run test:e2e
```

To use an installed Google Chrome for the browser suite, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before running `npm run test:e2e`. Playwright writes the desktop and 375 px screenshots under `test-results/`.

## Assumptions

- A new session starts with an empty document selection. Selected ready PDFs carry over to new chats in the current workspace. Existing conversations use their saved document IDs.
- The 50 MB limit means 50 × 1,024 × 1,024 bytes, inclusive, matching Express. The browser verifies the PDF header before upload. FastAPI enforces the 500-page limit.
- The token and theme preference live in local storage. Sign-out and session expiration clear the token. Conversations, document selections for each saved conversation and completed answers come from Express.

## Artwork

`public/reading-room.webp` is the locally served, WebP-encoded ImageGen illustration used on the sign-in screen and new-chat cover. DM Sans and Instrument Serif are bundled through Fontsource.

<details>
<summary>Image generation prompt</summary>

Portrait editorial studio photograph for a document-reading app. A single sculptural open book made of many thin, blank ivory and pale lilac paper leaves, fanned and curving upward in a controlled dramatic arc, spine angled slightly toward the viewer. The leaves form a tactile three-dimensional paper wave, lit with cool violet light on the left and warm white edge light on the right. Saturated deep indigo seamless studio background and ground, with a soft physical shadow. The book floats in the upper-middle portion of the composition, fills most of its width, and its entire silhouette is visible. Leave the top 12 percent and bottom 30 percent deep indigo and quiet for interface typography. Refined art direction, crisp edges, real paper grain, high contrast. Portrait 2:3. No lettering, graphics, people, text or watermark.

</details>
