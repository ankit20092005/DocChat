# DocChat client

Each file is complete. The WebP image is encoded as Base64 under its path heading.

## client/README.md

~~~~~markdown
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

~~~~~

## client/package.json

~~~~~json
{
  "name": "docchat-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.17.0" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test tests/stream.test.js",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@fontsource-variable/dm-sans": "5.3.0",
    "@fontsource/instrument-serif": "5.3.0",
    "axios": "1.21.1",
    "eventsource-parser": "4.1.3",
    "lucide-react": "1.76.0",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "react-markdown": "10.1.0",
    "react-router": "7.18.6",
    "remark-gfm": "4.0.1"
  },
  "devDependencies": {
    "@playwright/test": "1.65.1",
    "@tailwindcss/vite": "4.3.5",
    "@vitejs/plugin-react": "6.3.0",
    "tailwindcss": "4.3.5",
    "vite": "8.3.8"
  }
}

~~~~~

## client/.env.example

~~~~~text
# Set this to the public Express URL or its /api endpoint.
VITE_API_URL=http://127.0.0.1:4000/api

~~~~~

## client/.gitignore

~~~~~text
node_modules/
dist/
test-results/
playwright-report/
.sites-runtime/
.env
.env.*
!.env.example

~~~~~

## client/vite.config.js

~~~~~javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5173, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: true } }
  }
});

~~~~~

## client/index.html

~~~~~html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f9f9fc" />
    <meta name="description" content="Chat with your PDFs and follow each answer back to its source." />
    <title>DocChat — Document workspace</title>
    <link rel="icon" type="image/svg+xml" href="/docchat.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>

~~~~~

## client/src/main.jsx

~~~~~jsx
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./styles.css";
import { AuthProvider, useAuth } from "./context/Auth";
import { InterfaceProvider } from "./context/Interface";
import { Brand, Skeleton } from "./components/Primitives";
import AuthPage from "./pages/AuthPage";
const Workspace = lazy(() => import("./pages/Workspace"));

function Gate({ privatePage = false }) {
  const { status, retry, signOut } = useAuth();
  const location = useLocation();
  if (status === "checking" || status === "offline") return <main className="session-state">
    <Brand />{status === "checking" ? <Skeleton label="Loading your workspace" /> : <>
      <h1>Workspace unavailable</h1><p>Check your connection and try again.</p>
      <button className="primary" onClick={retry}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button>
    </>}
  </main>;
  if (privatePage && status !== "signed") return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  if (!privatePage && status === "signed") {
    const from = location.state?.from;
    return <Navigate replace to={typeof from === "string" && /^\/workspace(?:\/|$)/.test(from) ? from : "/workspace"} />;
  }
  return <Outlet />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode><BrowserRouter><InterfaceProvider><AuthProvider><Routes>
    <Route element={<Gate />}><Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" register />} /></Route>
    <Route element={<Gate privatePage />}><Route path="/workspace/:chatId?" element={
      <Suspense fallback={<main className="session-state"><Brand /><Skeleton label="Opening workspace" /></main>}><Workspace /></Suspense>
    } /></Route>
    <Route path="*" element={<Navigate replace to="/workspace" />} />
  </Routes></AuthProvider></InterfaceProvider></BrowserRouter></StrictMode>
);

~~~~~

## client/playwright.config.js

~~~~~javascript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  workers: 1,
  timeout: 45000,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1360, height: 860 },
    trace: "retain-on-failure"
  }
});

~~~~~

## client/public/docchat.svg

~~~~~xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
  <rect width="40" height="40" rx="11" fill="#5141BE"/>
  <path d="M9 11.5c4.2-.5 7.9.8 11 3.7 3.1-2.9 6.8-4.2 11-3.7v15c-4.2-.5-7.9.8-11 3.7-3.1-2.9-6.8-4.2-11-3.7z" fill="#fff"/>
  <path d="M20 16v13m-7-12.6 3.7 1.6m-3.7 3 3.7 1.6" stroke="#5141BE" stroke-width="1.5" stroke-linecap="round"/>
</svg>

~~~~~

## client/public/reading-room.webp

~~~~~base64
UklGRsxLAQBXRUJQVlA4IMBLAQBwzgWdASoABAAGPj0ejUUiIaMjonHJWHAHiWdALMYB9/auqysO
TxKE+dyM81HnrIc6j4fXLA/F6tv2H23/Y/lp5z7YH+Z9gD+Pf0v/XetNoJdvvYF8wP9X5t/s50Kv
+H6vX0f/vemN+uvTx9m4mjTNX/mH8Xn/cr+Rv2nyj8hn+byT+m/83nKe8f03/X/zf+W/cn5i/8/1
pfq//2f6b9//oF/V/9fPcp/3f3e+BX91/7nqv/r3/A/cf32v+z+4Xv8/2nqFf1T/kf///ye/z6rf
7xew7+6frJ/+/91/iE/sX/Z/c7/2e9//+f+p7gH/59ufpt+Ynpn+Sf0n+/8Q/yb7f/Yf43/Q/9j/
DdECJT8z/NX87/H/vF+b/0B/yv9L/oP2k9afzL+W/6n+Q/0n7V/IR+L/zb/H/3P9zf79+9X1gfRf
7j/LflR6wW3f6f/i/5P97vgO9p/p/+Q/uP+o/9H+D+Uf9b/h+lP9X+5/uA/5r/Df7r/E/kd9Xf9/
w2PWfYC/oX9t/7/98/OH6dP7L/1f5//cfu17pP0b/L/+b/Qf7X5Ev5j/a/+b/fv87/+P9r/////9
7f//96H7p///3mv2y//ou1FFlcwCnnp+V9lY2IGKQhTUZUWUYpPxvn06nnp+ZPcUkGKSDFJBbmNT
/Ix2Sdrms1qf9zlpRRZDhqUUsbGFsdrNTfp0/K61np+UPz0a6lqbtkAZZGJGrLX89PzdFX9bwwVh
v4yO+zsgxSLMOtQ3lVrssu7+k0HhRViCj7EkNET1oOQoPLDpNdVVBPhTHU8hRZBuOyDxDcMIf3nm
BZ4fE2oosrH1oFs+20S3VFVbvxC2en5XVUeXmt8KDzqiK8+nU89PyvspoHqyzfNiMTGO9Q+b8U9f
Z8QEfY3970wsMeuGVDJ2QBl5X2VjYgY4BXR6uqEhvBbR6hsn36hX5xkzgxP6pY13X2p+V9lY2IGK
SDFE7I8peYUCQTb14o8kfGTsgxC2dj9iZkFArrWenkQU89Pvu6tlZjTC29xuo0gUddrDfTqeRTQN
56flhsY7WVLGxAxSQYpIA6ffCiypNaF6Yq9Y6VK/+0XbVCUAdbYfSKM0FfZWNiBb5wkGIRBYyl0C
LLcb59Op52Pd289GhY6VLHtdUWWsqWNKGGatIUWQa8fqiXvNSdAnjM3on9CBRKRSVjDOhkqmp1PW
c4RA4/Z14t++B/TllzSpDeL5sHaGheUpUT0NU+0LhAAIfKoFEaTTZi8qIf1V3z/5dyhO/x2OR9Ih
VNUaCF42WtWs1ms1mtPk/6U+QHANs01fDLG+Kbh36kWceCsQ5MNSXn04TTKh6rhxwSa7gmRIw3xF
faYjKphKPFEarWazWyu8anVCPbzAtez0aINHDZRePTH6AVQfQ91m8mjF7SbrJLSWTs6NjcvzTkiJ
iC/mDu95eUxH4s069UOUrZ19mLpLXIf6dLXK76EqdMAH+SCPk6nme0GkpWZubny7+VdJuUUddKFo
qpxxZU63BZVcUIRNJ/9Aw9FU79/PfcD58/jYnIcePCEIYkIA3qPlp+UrMY8pAfjZXXkEAHXLCxK/
3I55IbLArnUYj3OazWcb7MAm6S1ALAozSldHLst4C+hEK0ySiDnNF/RdOsPFk1SlzJDe7lG9s1Om
UdH0b2d8Ha7ecjk2xIB2lQsl4tLxmQdj7NuLk1LpMNuykNOrvpVNRdDu7V2MDyzXsqQeqHRxCzM1
C/a/aEUs1m9c1mt5NmQVx4PjzciMzTLEafaSGECxo2Zw9XIjlg/oe9TgGQBONHAtxfZ1QLk7IKK9
4CdBz80I7emmHovMg2xYWaGkvdGMtgTffGR+7xIjmdnc1q7TN8ssDLnbjGESNoksseWNkiTl5u22
uazWot/bE9Xhfr1BJtt1IzCrnaRe7PlzjsmGD5EIWyRiukLMFKNxg839ZVDBYZniCYRGRGzAvY6I
DEToVB83Av6e8nd6Tdz5BeqrZysm63TKOzBpkYTN160rIaP9T2z72P1aNUSPHvO3CISpGAVNAZR4
9T0ODAKzICT9sExtVLCT3l0cdCaGNvLfDhUkd4SPt4xdeNYI1Lz9VPAIqPJ9sauyunGSIKqAt1Ob
rNziD/LQlmn+YY0vR3nLe8QH+4hIFu6JHUg9s3Wh2XpfE0McNwrreBd3gKhDcClAGWZXRmI5pTLe
4ZBg2ZH3LZQ6fXeS/eG91JjprOnk7g1F5zGUwPKYYDZF4P8XmZ9JKXr77XWQTtMeY/TUH0qYs+Wj
mo09XJNLgLU7W5MuS1D34yQEZNgpNkonr9i8lx47vjx8kbF636q/fEU9hIK5Bkz0/XjXHVVT6ECi
yHywsycqT0ncJk5HFzh9QMI7RnBcTWPdv6xgky5RfN0H7aPFJQ6smp3o9tgknfTXJ1XcmpkBKhcC
9BEa79F7Y7e7XP+beLMumL14edRx/Aijp7NaDeWmg+GN76zJlethairXedCV6GUMXrZ92aQjCgYY
U0GFX14FQupT8OpGnpx0WM4f1pm3DwPGtKoFqCtZz+hBYbCkm/5uYe7tDOoTFc4yBgPfcS5MejYG
liXMeGBuIr+5MU9FMGMALtuquSI7ydwz+Y5s/KC6MbvHfWXpO1/V85WVvCkNvPtPvhZviXsKJNfi
AEZkbMVRYQwjGC27M9wiBD0QEW7+kbKBFidt/iwaq1Od/0JsGaUkKFLjvxrxTDEDsI28I8y5d+aC
BDlLN8p0e5NthIfwXIOeRJzwgUSsu+aztD/CfTmRFryGiYP7Mucq9J4zcpJVJN/1SaiK6S9XyTYG
srx5uOFY5DUiPRAEAyoEXN/fJBid9CB9wHkbkPM8x3m3A/ZbY52wScbqu/hNyIIIjxl9b8a0iRRn
qoN8cQgkBa4pzF/pmdqJWgT1CddH/rtXKhFozaV4yEDZi0MHxWaCG0ekT9y392oggOHfPZ1FYPdW
5b1LnImbHnMdlrWrWdB4+tj5Eo6R6JYjIKuXyAUWs8K2QGz5+rRMbzEXLtoSxKWZvhrIzgjxUt5u
gXWYUQ+NZpV0chi2m8SwRcQfkZg3Z3haoEGbFjlIbsCLskOWbFsez0imzNLDR5mXfNV8t6bHPMg3
42fkpldmzTMdH2ccBL9MHeuhgf8skbRNrobyfqM4sBFfDUb7m1CjM3qURp2Og4RpDu/DEevN7BnJ
xfvnG3uS3asOdd8uBkgk7RyIvi700qeSChSo8EarbXyGNTmgXVtyiykNI7XXsgsd9mVrT2DhFjB5
d9XmupCgDeqVmMFtUy4bJs61bOI5Q3aCPgz56M0pj+oVCTN2lpFpDd9FdpzrY7yV3izcTslVzVSU
A1q5gJs7r2fpCcHc9dRQLgLhqEGInq2C9/TbEEl8PB3VtrYKGDZmQp4ivphxE4nporvlqjApy02Q
OxHxgOBW+ff56o+uv5jk233iL3ZkALUfsiDKEzkNRCFxw7tlHeqmbEkH/9VBS0zNZtYftBqNSgI3
sJ1OfRLj+t/XvLG1kf4GAPUlfxl8xMxoLdOShdHW8p0dzWyDINeqhhjwSkkkn6nvpKtOwVWzu/Zb
JlHYTm7l2Yo0V0OGwsMNFvUdXWdZwQ4jYK4F2dmEx1xyCiZiTMhQF7BJiPTtDM2SNQ3MP0aH40Rc
DpQlFrS66OumCQyva8giHjqBcvndXNAC7IEaFymH3IjcCket04q20V7GgvnKTRdDped+MdZc0fGs
1u5giIBNPevrQh4MIATXmI0orcCz1KNLlBwh1p+g/VlIPl8QBknE9pZJ+W2MGS80fMBB6UbegQCb
9RV8Fu1vvAQbnAR7l1HEjYldE0i4R/rsw7ZipiO3154tsJQcbDodIKmzIoHJsILK+gYE3wGjyV6E
aqP2Wbqv3DuTfJvuDzNbcA8MUujMnkR1ezLDLjBXIa38c2xu1d4lhScl1BFdFLoezlDJSVyY48Rt
Z/IPHQ9PUZh0j/gk2SWigLWe73zE2pnryxkOV0/obZY3wxrAGbqTcX30bVKubim5Wnm1V0sXn6Mg
Rrf+835ZrQl6MgUbVgja84sofpct2sgzh1fjrCDJvtaeYJkTkUBpkP9qDrFHI/K1E3bQU88BjPZL
A3mfJ55yO6FH1x7oY/8NMzYZK0ZEqRfAk9dqm4yIH7g5BDuxVrbDjVgNoJJgpenzhX6pRmHXkMOO
KpG02bCrqY2u+mIgNs1OZ2oYDXJMsnjZ4sUHHx56sghT5QvRfZNkMxcFys7l3OXQ5QRSKwynN/SX
GaBnHs/bRnI/wpRc7+Cso7rb2CDlw5uJar1wXhO/5P2IgmviaicDGbQTT+Gxfk2aXpX2Td/GXq/S
rB6SDsB5Kjrtmn9zQiIqILYokv87oEt55QZ7eC+QXATe+o7tBa47hwAffAanWCYQER1hI3GjbK2X
+6KT194xiOBqyI3gafmVVtm2mNT7uX2NHG8htReagA5EnGxhMEIKjK7Ad/KPypmdkLmiek+JJDWH
Qms9QBbzYwCAsYznGe+pZSDmFI1XL/kJgqMrBUZE6zQ0NM1bNenj0e6AQUm3NAIgkxs2hTWGuKRq
BoPxFNgGXnCzciQ28myZrmPEtYhDecNU8xufrQ7cGDFy5S10jLEKdbcGaKTi0gBPf7nYMm7eRN3C
xTiA4+TrUloIHUqAnPI7h+Gw9ZkZswe5duBJj/MgsZfAlCQ0eQEBv6h1/vA6aEFeF7WLfs+5QorP
xJlaCJw3doMkXPpdAG8SojmElw2CI1gJqh7+Gp0ouPJ48F7RqDgZxvTJOljDsBpZ87wO/UaS/5px
GaRY9E75ViqKLEq6ac2aH6eU5NlP6lEORu5rTORjvjMEZyOdWOxvyyWUN/0ILkpaJG/QSHwEaUqs
V/V4E4UJ7/yxxMTFNxs1D0Ocv6hT/JtOVkD8FNlMxDUlG6hgpyD33/Oyo+xYP+uL5YsljwlsVZP1
Bmcb5eli15TxMD5p2ORUSvzPDq/wqbAmkiHtXXWIug+Ft8PcPqOWBx/MjnFIVIcECJo6umCpENXY
DKj5hXLehCugPgCW/vthjJXITaj3lCoetnD2sxvRzZop3z9GdH8luq0D9oz2VCPJXl01XqElpMO0
rTNb4ybL9a/RrllQwEUgJNPsE5Yyfg5f44/niFL6BsU6o4gwPT8PucD8uhWn9QS0chFK4u7KzGR1
k3suPM8fBN9IwDVFRp4Nlo+ez/dRGom6bjQdYJXgAIApCeOmOnH3Xjebg1cWm0aYK++dx6muolSc
MMXVNWPtLxDLO09QwLSXXJHe6Al5ETVPP7RkkUul2vCPAtCQkmvZwhnnpQMEYES2wi1iLuT5m0z/
Xl7alR2LKKHY2pwFR0LLPfILShVCfMh4SaRjc4b82aBdoLhIWVpUN/o2RZMAT4gBQxqrztLbXLrc
6Encjw1vzLRFcpms/tGTu3Qj7+tz9WMcd1LJxUZ68VRqaak/N1qaizK/3J35+O4UmxFEzaH7yULJ
y5RSF8whL/vjgV2n3dA4bpRgnQFGaKkWlkL2BLhI5dxgcodZ825i9KCfW+3lQR97e0+LFcsYPQcd
1x1beGLS9o3ptkjPNMKrwZEMXt84rTo1y/c1qYasEPasqUUcbT0N5UfbBxPyLRqMQXRzlQTTwnjy
E8XSUrDk3PS2erIoqNCTVRml/MbDiq9EID/F17czn0gQbBgkAkyfvk+nrWsEYlfVYsnAKsl/R8CN
lCHiyHFqQ2oEOjT2TqJAn16Cg+66bFvJUVXr+9XgFhQgE5idmetYCPOGjF+0VSSSHgeKFKU1Fhoa
vM4nfJCrvd/HXRZrZxKtgAzUe9KeW7jzt+hkmmE9q9m4Ht/TOLdtAVlQDOWEHv96ehL8mKB/Pnw+
u1O7FDQVSK0vSsH4JW5KcfGBwk/Y+4U7T7GPyQ45iTWRAR9hW+f1CWK+DD1iCn7zeMrAiKFLb0Ml
pmRS70WEtu3R/TOUnB+cc9K8UAV58tWZqS5e19MXSzv14qlPCc8CE/ASAfa7nYJoaLj8djNeSBUo
eUsYL3ZmHqIWMxioD1u7yty4xTs8q58iSCQJ+7/ICifDSFqLrMcBIEEHBnCXRdccZvKn2SK9abHB
tY+8v7EMm3OYD9oxlziTnvR6wJ/Xy4WE8FOt8AJhyQRVw7EYZHeLgXv6VRjosVuGKczSbmVhdS8+
whzLpWUi7gT4xDMBSE89YtV1ZIHXK92d1YNZ4N2pgYOxhcctI5NiNMfvnpsQmfnK4znQmvXWlw34
R/q4bCbJrnDN3EdMpwPG8HmzEYQKK5W446TLI46CSMK4lC+I//dXp0UPTaik2sqd270YjPFYF0Nw
dHf0akEKGOvEmdqkpb1XUAS7d38Jfxq3u8PeSkiSXfjS9NB0rWi1qRxAUj8HE908XgLC8KRdwDAx
QG4hzJJ4GRkS5IXFepYpX/FAraJahQlCr0j4NXOsCYsV1/JqgwfA/8TMyR+PNUgg4x8g7nr35/6i
wLEoZZatH0mlzk3zUJKAvTPqZhIytVGTXGRYfqINxb6vhhLhOS2vD0iW+Qz/7S2l77C13vhxbjCs
onMnVeZDgq39Z4P/8gmMZ8MhXdtdvlFns27oZayVMwEH/SLkIBS6uXPrdy/ixwD2RyvhqkaX7jpo
Eu7HAGT2YVBtYpJyxU7dTOrP9RK4HI31U//4SfcwWUJWsGOcElEPPTIpxs/cO6Gh2lMrwUvs7Ck9
1UKU8rYpKCZMDFosugG+BP/xW0JhZbQp4wq4wy1ctBWaOpsEmnPChZyA4RU4UoRMXHoVS3wTQGUK
L79EpMMpjQ7pWNodPHs15VeBPanAtfJ+bdYDBUA39g3n+1a5UKQhLGj1qU081ajFWWHcmfTzZjQE
Y+vYEgrfB+afPbODVnZXzvypQt3c7yvQrOd/zdYHvpmCHAbuGeUdFG1O4fTf5IOtFY815qpFZeYv
X98jX5VXodr/QhQhOp1HGwXGSBSrTmGJgzJBNg7b+2JSXxxrlDh8F0o6UbUi7N0au9I0vkIUXmy7
eb6oqethdrW+UKqZsn8GnA4KzuAo0uBe6ZMRkBxqvu5gARdW0+wKag+ovShDFcsqXdQVwZTQYXur
DQCJyeejalfPGYZD3+B4gTQ7HKGuMdH6QXKIipy/JpTCnqdZ33U4qRHORV2kAWDaSQ3KV1LDJT/3
6VsM+sPPy77U3JOdAs2e1seuMYkf8Eyr/JWBLQj9XuRkeOBlGspob905tjLWEjMCsn+fq4lSMkCF
y7RcLwAe6AXTAGl8XrwCuf6jqWW083BQkfdBnDXqPLMABS09vJO/e+RfTumRJP5hqODqdRIDNI6X
xg/msK6N7zlHCr0v/uvbCiNUFydpnqf++WjGe0IVdXnC8vUFSiTyskqY6MkGuOXe8jt7uwNcy2u0
M6q4cfMY44FgWnTXsk4JfJ7FjMVnK7RsC4TUXEYffBVPY+wiEWkmj7TNO0wXRmRJn+hZNcKUtvOo
X6pt4BcfC0CccejEn1+IhsWc9cfuQsJNfP9l0mRtIX51jssq55VL6l5n/sQtOf+6I2v/AhJnOgId
kZmObxAyuZY48SqqUeT+XnFM0m7M1E6hQhxkvYb+84fcnu1cG7FtXChZmaaDMEthAa3hVEVpKv0U
VduaiunCNESlZymYN8CidKxXomI8byVcKDPkgrOroXd9HgTVbVfD9Vkv4ZGjTJD2/GWYB7VzCHvA
CFLk+2M0uVT5xhqzgrZGKnS5/BsmTJ6YhVwyMvP9C/d8qzypMD4P0cu2UlDDsHUdpFm0ERHE8D1Q
zG2zjy7ErCCnCKoO5eaPdzYbjhWz4Cv2Uk//xslf//O60f/xzASfZbMiQp8w7ukpMif85CEg8Ktf
zIcK3dQXYNOH8IF+xFQ97+ax2jp2VGAFxJHRKZnf+U8fHDnqTW8gyI7/7JpRMc+LYLiqSdB4n5ed
cXGUakNnk69eT+Qqlu0buxquaMX7glgTIeYNflI/2W8KIgGjVgQp0PzkWesazA1Tk9s80ZKoke/S
9PxBeCYQI3Ray8WqLmBkF/VNFRwr4LEFvaVdh0+938Zi1CuPifZ7NGsfk2nO1ZvYtvFLCvmDSeaW
JmQ+IzyrIaVLpqImtKLh9wdubLyhW608A2DZwGwRABE89Zb9E/AdSL5ZTkS4jtB0J70u1mqNS3//
eY4f//+YKRtMq1flsNg/Jhwv4T6r0kYqs4sHV2ZBxuPVmAHLNVSR5b/+MQSb9359AuTfFEanUE+L
eex7cKHKUyUKV+S0A5tOcltNkCYbEb8AzrOCOb5SNY5qQ/CncB6yDWw1+R8ffWnuhyh6uyjEoCez
CKJWhDo2O1gr4BdqkUy2ngarBFB2zzcHTECsSSTPipdrrxQIp8aUyzb/Wk187RwnnGVBNmHM90vq
kZVTkaar98jTk1uJ5DPhL1p7Ws1bgIMbiHflyciz+USlWvC8rSj8vNTuIVSK+TZPUexidzzXm/YF
LmJnJcU8CbCyKe7pmA8NVwnOarsKx9/QwOAFnBg60f8k4d/F72qjvWPMvV/4f/UXlRunY0aGAS24
2phQ6lr6PiYuIR4jDpBNQzYM2c+623nImM+wKEAP60DEDNegjm1Cod0un9xpow/hWjawVoZJPAi3
+6ys2pkRmm8QWQ81ZIVZzmZ2jY/3nlArOfY8VD8JNNb4Ajeqk97X3EAFt7OhpWvMXOsXLZdWRQKg
m/Lky9jIeH/2h7D/hg0O3S3kf/2nZQzfv3+7NiolsG939MbEtWUsKoIywt5Bf+9Lc9yQTOe7ddC0
LRpnWZbxiOFsVsE6HCLovNM4WoKWy0PGEHOXYyIUkZOCvPZYtdI0xXfgXOd1cfLtt2mfQptXHKyc
6S+z+smlSCdYjBFTzK+vBhAGzR+1oRTRLWO08Ic7r8G3WkdOGKNuJxDfbD5sNdcVfS/+1X/90ZdR
A7d09e7iPUWK8KfjLCbNcAraLUsZxntgJyWy462hCEGaJziPnpZbzfVYBuwpZ6mGDTX0rIGCiqN1
t9p+0xejjHlf6+gf4czERqZDULoh9ss+lJ0W+M4Kqz/oBAbqLS+sSpLH57b4tXNW/ddRrDLf0uLc
vyYjKuZqomX3HmpkpqfBNfAkj1/rfYuGZ+H1vyMcS+086eGl92ln87DClrAitnBezj3fwlnwBgqd
/8YdZmOmCbQHzGeJcSMvMVWpQmzUzEyDFIyq+8njJdnZLe2f9NnZ65vByvMjb7FeZPrOvb0Krm0t
ABgBZuB9Tys8uyCf0hp60A2G4rRom+kpB7ofaysiDQBd44aHaJgTyjGYe6FP9Y7eTOsn+Di57vCm
cyf70d2eH8O/mdLf/9sPmimmAlZBvdxPu2b3wWu2PhnJKg/nan/mP+ZThIlR7d5iGfnP0jRKGdXi
fIysCGqoqRRCsuMrMhxBi2c1awVn3GO82rnSXbzPLr3jW9RCBfIsh8W194y8b3BSY+w1L/eMkZ6x
KsOZKi9lvBmbcnVmJ9/sZM3zsMIPvmX//yiVf4P5RNkKIyO3DcydoMEtZvxHlZb371kZ36SrxYsx
Y08Fk1vyMKUC87DygU2lQNpewsoRtQlXbMZYKqIwCjuBccHI24QquIQT/wpeCh9TUHdAubiQLjS8
Uc/0db0MI+2UMh39zSIRKlVEueIjJk9sLweZSezlTjbcl+WUbUfqjrZ1elP/Djg0f9xB/+aExSJJ
LD0fc43/SLHcLq/7oeQ7aErKh6RtezXnsL4bUAveyzHJrFK/7IQK+5OhslXLUZxZGmzQziDcp3Sj
KVZWBEGEq+GyFVdPcxl6GEjwuEpFmLOls/pBKLgFHOpGzILb5mv1FtCtsRLWVZcMOCsIdn5WBomq
ugFde/bIpyQ2qvkX//3VCwtiDYvpqwPv/7B3yn6LurglEDH6mbfOZVaPsl+5r6AFsYVrbOg5Sn+w
X8m8MbDAJKao4i6rUlr+9+kL0TTtTc/dR3It2uUCK31CsKUJBMDrpcS6g0W2X5jNYuRYeU7X484y
heX/cmjAYWrHet+2CjltQIeMoTSpw/rXJXl9+0G6+f+R6EuVE3EuWBnk/XdnwbhqbVnatlZSfGFa
0bM/ZCsT1k74sjuMDgIByQvo4P/ldONr1jzi8sdskinq95av1exrne7AT/Liekop9kRcCDP/KRRj
AXQhiFy/AUCyVT4u/Y/xFYF/8hef/CxJa7o2Tn956+G2CLoGqvRr0eCH6k3e3J7VjeP+A+Rz1rL+
D/wiQ6CZaxKNFf+BH0Yj/2xPoFm/XTYeopK71nsWndc5/vMQmoDCStaPZcmUYpEBiTe8y/TgbA2E
pYLivv0uP0wybMaRBiCUqui6+0so5RDi/6DhnNj+V8HOcEb83gIfb1UrS3Qy0Qg4bzpYI/lIymNC
FPXeCn/srNr/Lnnvs+/0o//7KSENLHbuCata1w281thSHBu7D5l6K00yXpdlvqnJwg0sX0S1EfPG
9wLfqO/iEOGAHy8Cd6dUcd/ihh2iX/VGT3C/iCCIfwJtgGPcrk9TiPcLRv7fmF2hrDQaUHIvKee2
zmViz3zjUyFtd6IfiJBFfcKLiOfIhtGaVWi6JOUkI+byy1LDlZr6BRRf+eN3jvVQQsl+g5MFnX5c
6AqecDdND3LGjH//4WIJW+z/WnTWbL8jR0T4w9ExMtJtzRTtMfwzpU0eTMsmReOi4D+VUeFStlWP
feoi9dk9EdPSx38fPjyAOs4D0gW1Fv47RWja7+cVMLvMvt8/IC3wFn9rJRPcnZ8HeFTBmhDeaBaO
aGKBjFEFYJuya3eEE1H/HcmWf6Pd7rwQNX/4Sz/5psaDfwSQ1/frXngiTMuRARZvQOhBvwfekA0d
3/CiBnpTlFBatOJFI2Yk5RIAc7FJ5EU1UWtQpPw4B2Lc8Go8Xx/NmXwSUHvjlv7KUIEh0nZJxj+N
CFnyMyy4bGSyaSq2JVGdiQEjNDEleIAOa0mFntPoQyiOE9zgsnlGZfZEfeKxZo0j4kCY9mSZ7Ssf
52Qj8pFijFSnS7ZU/4Zup/8SIpbyEf/9PGv/2nD/5w6uk7y38Ef9fcRRV/f6aVaCb5OUewqKgRww
pPthRpiGpTkBwrxTdxhBw5HG/9QmmtrdRHUEn1oh7GttCfciM2YBqOskeITX7DbRku8BwFDDTXVz
uJeuTgG5AvATg5g17vGtM55fr4hOMsX/3+nvJ17lvx3rj6BwTZHPYI/b09rjOPidVn6FqMPJvM2V
yZLYq25hSkt0sX458usDywAfwo42dRQm6UoQg0A1PPvU1R4zGg1Ls7DZdoy5/qRQISHDOKOOK+pS
eOOti1RAFRa2+N8iLCJYcTWceJ4zf/aRsjCeHRM5LRdxKOU7/klmnxbKw6lGBcx8sHu4FmA89FKJ
6fLhoMn1VbXQuyhoPPFNINPEa1/R8mUL++XvU4/caL2TlFu5pNk1RXm976ywsH4yOJ3vEvC9d4bx
wUixMLPwGhypoHaURt3YM4LjVWSzGGEN2xVf9CyKVz4ZaoDD7ezSxJcd9o+YP6GaIg28CtTBzMd6
C/PqOI5oyaHBetDswQtVzsbbrgteDJvcxNV9yQ24s5WKdfUBjXqUrUv/58Q92wqpcNELCmkcOZqL
sf6vF8aEXtoL68F+Jyc07QC05ZcBLg1iO33tDC/y3N21ycz3U6IGLkedmKVUEhF11rllA9nsw6Wq
7s6MyZS8LWuAbfeXTBA29Qz/ChQtDBgJST2zDMpUIqu0t/u4RA7wcY7FTLxnPpkzyAc4EV2ycLJg
TXS1w86LrBkIh8lf78mymWTifI6fLD1ohPkayemL+fu8ceaC5sgfNHB6pRaM4RYSB2pTjnORQI+a
EVLtB3YW3wBAO1KhX7x9K0SwpoaetrFusCgRSKsWncoBUlIKxlsUdwKY+OvFoO01T9IsxYFai70R
sflYlm5pAj7v+K4VIPMY+7C45UppnogoTyt0vgPwx6D83iBIYxFIBrf2BJ3nC0BN4oGsp9lKUjMP
sZkyS3IlkHakZbtC///VQCwYLneH70gD29gM4VgDsY2SHaGMIlGnrwpBvb94GJjFC5yiW43rn0QD
aRiZmmDMMn8ahSiGPfZ4xx/keek+SBpLsgpVgK+dlyjNU7uvcpZT0ol23PMgnYhqe1tm2Y8vjEGi
3JtzR1fj189ZCsZ/J3uJ1WsErsFrh5duSgQ4gb05iesKEpHbTmycSZiwXubMbvidMtiJkuJKR9R5
0uHeGVELqTl3QgRJaGtx6de4pOK3vSJtx6MLTtY8lnC+X053CA7kheLj+ANxDIBbY2jJsoPw/6Fz
MeUryq1sglVW2RGB0jUjX3vVrlbKA/9APTy83TpFtoCn59Ht6udpb81vItvfGyqgbCNOSSl4Y3J4
SePIUsc8aGzbjTanluQwsTlKNEo2g1YsrxZT6/bcJOTD3jlZlNzUkcBDH6K9IlbI0UNOcBJfZUXc
k2ESo8L8JGQeIqZDy8wJ2Y51fh8E6n4YZZigRPv6NHw6po29RvVoqJQb+EnpQ+ob16NTi3E+vdyq
S+YXYlatso17OBFq52ycKnmbVlx2XfjFegySK/qV7bMpkQzll4eGcvL3MT8DpIGpS4UV9+JuXY1Q
welA15bwlxWVJWWj7WZHx0lFDRd5LQWIR854Y5g6fJrdrW2vVQqRP4rFpDQPGV0I2bj4gU13QV21
8BnAYIzXt1ljmM26J0ONwLsxeqP/6VjmKfGx0sqPVTSIYE4LZjrQizw3/P8PxToAfXLh87pj/DW5
bpsdwCDgCD7mIa7/XFLmtvVdAfpV1IEcKr7wj6hyorPZM2mgENAzatdHmpEN5JJA/pZGyXl2EDJ3
vhk2Hin+GythbSpbDJUxJK8vFSYSscZ+OYRqji6Jn+EGH/PCNxA/RaXeuGn/tX2jJObS4cdn1qF6
o+U+9ifkA5zhvYgo8IbrKvyVCt0t3wh+T3nVIDnmQnsCQ2YD7CgDetnzpre7ufMiP87BmN3muk7i
a72sF1+MvDtDSCLPDPEHAuAalIDe2Fxy80W6OQ+OEJ8HSQcfpiXdfdSl2XnH8yejjftVp/6QtGSE
M2xSWFAQWuK0NFnvuT+bXlhJpa/7gwW6a/j549WGPXZjHILqceTLcmviEJBlxG83a3827vJW+0de
VZxat4Dvd9SNY1G3fkAnsVmTU9um/321ANY9E65y7SAT6CCRqooW8lva/jXMT0paUtZItz1HElFZ
yeYOEP9pdeW3BebYKfsY+y38BlLBMsZ+7seXph27WlGFYvnUfBoaMq68zoZ4FU3durQ3qb3z0LSd
1oqBxeseJ26wMg5AsCDrZSyDCwXxEsfqDZy6PX+2hdWz0GB7s5qOr3JfoaH4MI/G4fyAoVM/pwFK
B4b2ii1pv+KrCKFCslrU4w9oioUDoy8zGBTU2YcQRpO7q3pKGqxp7PU7rEIdwtX5nUEbuONBA7lV
iiuuz8s5WGhC2+pYkdBlUPy+Ol4GIOLo2YYkvAg1CtWBHjL67XtC8d64SVNHM5fPsSXsgsZjbS7w
WEk9OLM2qFbSDkEucn2Vi61N/vUYQTO6tQVaUf+QQYjJrrmNzglWn5sSd36bJoxtRc3ZTOyNcwMK
m5WM03Eksiqi3FMZw/cNnptGtXG59YQoivXqwj+AIjfPLd+6DYWekHpbffRoz2kObMjyGbnvc/fp
x5t4FtSZCEyfqZclThCJZ5bGHOwExhqkeUi1AH8D9jk0Cm+VS7HEgtdWP0YVCDwRTnZV7EF69FT+
0vnEyC9C9mW2PmnWiTSQLGAsdqg303iJ5pRPNqx1t4NIWr3fofnZumFU+GoWjOHGUbMqH1QgNEYi
egmpqzh2CTRtH96oE8DkxWyilXqOWYan4VcpGxrUj+zlUp226GjHXubI14DMfkcyp3PgRPSE5RNi
dxsFVyV+MSszWlTP0Epf4+CwAh4m5YVG7l9xgOl6U/f283VHO42fI1dQ3XUsaPPVLIQ9H++gPHIg
9l02A6GK40fcRz0B/nIIWyWwCMv9cCLXSC8SDJSPW+tucpTm8x3AXHm9irlBZquhG3u4roGAJ5+H
6k1OhO2e6j3IZKymG8HnX/X7k/Z938YH2oG7gw3sndIldEVvYbsfTmvIJahwQXYVLyFsIclPRiEm
pcXX92svA8f3F11rR2axVTJtbZenATWly+yOfkrxEgD4hjh9Z3wnHJl1Ryw36ACCl6v9Jp9opK9U
yMRgy8FdSNLWSooDFhIUowlCFvhSwr+VWgGAv1FguWhDL5TGyZuC6sWOLrRi2CgfVRpHxJYsXwly
PhLw4TAyyFx7W15E555N6BAnMk6HtuuDj9sgkoBDcIAK4M7CRsJrjYOjsqqhfJe4hLqvdlrOVtQC
4Odev2Pme0GSgB65VcroJXWeCNj7Fy0FnVyeJv+hBzTIwOfwppTogACD4J/tj8EINQJXKljIYKpl
dZ9rjP6zNiRWZeCL6cDblH5DQaSu4uRdqBCUKKg+15KLuLBIDWuyKl8OY+qQACHA0M14pgYBsDiX
ke2snbZlPMOXhKYSgMAfWqrE5EDgBmFECAILV5mJIZ/Vv5hnQ1STnOrzRwlMEH74RVfCRAEqEqr1
X5kUjsTSZkTzxCHIqxXOa9yNidHinxOZ1PM9oR5jaec1vHTmfMBFjaioALbgkUlhZ6vRmffgfutV
rToEKJvzqVY+coFEpFKjH9IOEKGDfbTv4ZunToelVrVa6/9oNNnY5HNbupVQKJ1ibYUSkVocjWRu
z1OqDrToyJXmiW6osvYraluIhfCQ1oz+R0rjPlS0ZBjorHUjYQ5X2VNTCOTbSYuwymg3xZptZ6fn
2U1TLSak7g+/7jEdkRZyqCqx2qrFGKnjQ2V90qCvsq/9PfhmMZ3g+2VnNTwH9X8g141rYqg0KKTG
uFTy1T2oPzPhYVzmwnZxdbIVl1oJ296YJwKp41QPT+ma7ckeWp7c2XM9pfdx1PNHxxdVBYaGmx8z
4enAVREgT5h7O6Una5xJZve7wKopMcQsgqbVCsUVBGvkcRyUSkUikUikuqeR8+MN1mywbqmEAJak
VFtW2MnUarWba3gMgA9SqBRKwhweCBRKRWFCLa5jqBGUgb+HqeejC8jkrme0GmZms2sP8Dm5IQVT
xtCD8z4/MrIzNBf3Zw8ECqIXjU/cFkLORJSNCgUSkq5jbY/zPt3s0x71IgOeZlvyVK0nrGq4v8hg
wwVq0FwU+LrVoQwE5jU/dBPq+7jrYlsp/kaPiyayh+RFW2/GeYicENNMfVjhwgU8xSBeEaZ1rNPQ
9cyCX+8QqQ8EMGgfM7KxsNlZR/pl03L+hRvVOf0KPL4wj6D8yaAXdyqkobI/yZBPCJtEmAxldVAo
sR3nv3zW7rHK04Tfj6s+OuV81p0AXyH6WenAUSzc3w9wVgJiqUVXOEMFVhHJkOPPCmmYFi2uzWmZ
xkzqejLhgQre5Hdx1+W2oz6vxKBJacpmoJ2azl0WcUIVmtOg55AOazlyOnI+VVywsRECDhVD/U/8
4b+6QXCGr5rYoXnjcDSKvonvhDQGvKM9W2cnhqiPNwPan0KVMtrOgAbCAK5LwpvQtK+ENFzDj206
6t/pwFFVzhIx80h/MYB4A30ZX7D/6g898oObIIsreby2u55j9EjuUolYUyy4vVzIutAEAHW2jhRA
DD6L0j7XAC9q1pz+hAowEM3gFEpFYQwCwFVeqN6NI4j6eESbFLMbPxQ6blUC7jypEQhAolm5eCdl
5pleTqeZ7QahgrRAs86s+pVAoqufJ+6Lys/64+rMCwg4dx/Zrac7+/WQ8an7oIlxY6Ll3iEWhoq5
21cEI4UIx7Qwoshnid9Ab92zNatNZqx367bm/uXlqIeU6dhYuuIMN1ajCfcicHtR+7A2r7xeazW+
FMOQiS5B5CizjTg4yE7Pja0zcmUM0yqOHqbFh2UryvsXDQXK9JKoJIUIO47+ymfCKQYp/hRKwoTq
gLl1UqwrAAD+/b2g//mT3+sH/dbURZlVFAm44alKTVnp2ArEIFuYDPdL+18JbGBvx1twSflBbQ5x
1EQt6thZWYGQTsPxl4ActAs3EgTIp6AFE+XIXAllwCWAelrTGx7aps8CTlyAt2h+QO7SmgF8576h
t4nITze9nBiUvBoAcWbs3QuYEyaBDdtvVYGmjg19B6nroGmWQy1mn6jqkzlemWLtcz5LSDeq4yvW
QAIBfhc+sP1Won5y1k+5GMA0IzepiVytdzTamW9Xi84TCkSc2gU28Cnys+twTMOQhKiaZkWENO7s
v5uuLOBoO4b78U0BMsQABYzdaujHn/v//6X8b02eOzH0/IKqovAky9HyuAVyBM0AAbG0bUJ3OeB3
T0S32JiD6UhP5bl2WWLeEUrYmJfr2yXSDJnFTgv7OkgAKPiowxMnd9kVZmTHffX/0PC3vIJ5yM5D
j11lxwccTbPtAHg4tqOj7ckgm8n9NdAZ53HRgSnIIqycdAPuWhY+3SlwIwfm3Vyt/v+oeI4aCvAj
flDTOgvTZHr1KcpjccEpYAekJ0ojV4AAOwGmQCLnLRhUcAwqK+EVwnTFYdr2AyqNFI2uvrujxZJV
pBUZCnGdcQEE2pBWNBeI0O4QZgz13C1AVWCgNYkgTK+KDnMAYXbXlGQAaLoZtpAABkhSZ6K5CLjF
xdE16IuAsB6QOyPvPmLTKXPZXqEgTogQ+yq4h0w1MV1/Vy52FMbdL5Olih/SMgAKNahdEwAH17Gu
P61Zk5xVNA+DKTjFm1P5IYM3gJ7mCPbDrlbU6RIGHAR8q2oCRAFaRYgaCkwALGYxfrMf/1ox2yA2
aC0NjhrEow/wY13M9ehvDY9Xx730Zjn9AAAM2GPolwAArAAhxWoosQGeXCC6V6qXhphGJ5Qq75YD
qwv5FA4apwBx2/Fw7/LkiDfOhz+umjPuzYyemt+02ONfHtup+j189mW/ycqIX51EZidmkzI74+sw
ePLCT9oMIIwAIzPB9lLEM733tySAtEYRqVFy2xWyxlLShtKGiv+F+sUofh57NuhnxW8ntUbQ2NXJ
xznHrxR5JPsQzIbj7U7jNhEwEQ4LW4FYEn3bxOpZAgfpBTB/tyF5C9GzS2BFQrvD9L+bynhoKI0H
gF/VZgGN0GhRjvDRsVNgCvTg1AleTADjWCTC0UP1xxC+9jPVFRuilVbTUdPvQX+AyKe0QDBZC6Kr
jYHuRMCmRjzuIbXqZH3NnacAnrTO0KwMtGnJcs31crOTv5nhV/HpRx058pIuLhySp4vSuSExYepx
67t94mZSw+IS0eByAx5me8zXMDXillr+eES2Yz86vIvY+wz2gSo7LAY2APHf8lWERcNZIsOqBKi6
X7om9WNj81WPtWntiY1DM+8p0aMQpViEkhhUhDVTcA22a1JJIvPxgQJkyxYVS5EK0j0KAuxOnMLt
QRkMh52xa9yNc9VBoVJcYFV967gqB3Uadl/RBJ4Ek6uaA35V1p7ZF3xkyMh15Zpv88Lqo4Q0eorL
kr2GHdFgBa+iF5nSoN+uGy6MSynFlR2Ndv41WQi2iBcPWH5h+JcsYkl4sbXXVx99JDUKh0ALFk27
gYTJiGPHSh2/3bkJQ4WayF5ifpSHVkJTF7mZ9Pp6W+2H6+QFWo8Wr0hTqvcHJo1FaRT/SlvfJeKK
gADpbmvogMBTEQMwU75Z2K+GuXEr0l4A1plJHdidKlRXG/dDqxVKvvgw5CKzjMHooPyWji9L6OQh
N/DyvmpPPaprsYPTC27iQXX7gLkq6XFubOoSAWBplArlLnwekg6JmK4WCik7fNAN5REprtGMSLW5
+gUeAYfKMTRA4MnAruxZq9e/c4cdez94Aa0Vav0HWDsLyRbqAmg/+Ift2+7NQgBCwbDTXx0BwmVw
AAzOsEI+zK6PD5Ax+Zth6gVhAIcFTr31cWvv5FquGdyGNsQiyZB3OP/uOWLQTG0pw1vJEfbV/ELl
l6yXUYsQ2XwDh+g1IpyeYGMLtEGqQ68/Qy4FEgB1npcsymTgZhwtuKJi3XsL2fXhMEUUFHsPUe8b
ywm3LOsSQ1RMi7j4QNUejrOpuYch8k4v3+oLX3oGs+epHqzv7+ta1wdClab9+bv9G06KylE+srX6
afkw25fo/X/PGDtBxkLEX4oovhb75860I0fv6BhanoVI+Cx6kWiJMNj9j0DZN7JyCxOEuyMy8ryV
uRSQLi9PHYKp3qwhK1GUNSqaCWvynbqjkXf4TCz6f/p59I78TtfHR84CtGBXdUztWQ5yX/bNomLq
EEzMNRiZMheseIpxCIom4BjBtyO3fULhBPNK31PBjVAMGv1Wc9bsUL+8Sp7p/DtAIPT48KbO5Mot
ny1+BdZT33s/AHA5eHbfdq46LJjQu4jAQeuqB4gUFsRscBGyjSFE2if6EbLPkrgpNGxOfSyZt7bX
9Ou04zxQcbOOxHdHKn6rb+YWaYS/rfeFCZ1F+Pp5coP2+gx3ZVme+14eWIyQl/evungTPPLkL+pv
SCfwvMxq2Yypdff0v014OCj2qjdmmYgIzKMgyB7LWTQJRYZOtUreTNdjf6aEMeMZZbPrVEEujpJD
Q4Ob19fl+rxWKTYDSL9TQIFExfbWNIhvPzIOXk6/Q041NXCvpBKQyC6IkgiwPFmjNU2iyJ+dkRPH
F3Ufk2ILtYWk0RCAy26+oyixCID9Nb9eqsVXef1jLvOKYRXT4C7tXJDlHqiggRx3IHFS0q54LXY9
a/oDla1aDe/uF2A2FNWMVNzwIgzZikPaP6asZeOXCQ+uADd8xLh8zQ6FZiQhEvaBpRZX8f6j8m8e
e5henq+qYhj5VnTeyjZkXhPUyEe/TTHtKC0gJXQ06LJGo6sK5HH9+sXxD16MrCXTGsNuNUio95w6
rZuDujhBIgC/2Y8A0U+WPsS8qtjMWT4/38suLIbCMXs40OhyAFykTMNsDoMdt3WlEzyZBfRQFuHm
kiSPoloeOZI36JG89iIBMgc5WEU9VUtcQIA12EYHc5O/2dTtsnNE+3O4oNw8JI2QoAzqHkbY9aAH
JB/GHxmmjcx1KbD4JxiVleK/VJU6TZMUjzXnrxZ5nYH0U/J7yIjuetgLRnfy345Gfo8GTbSBNfVQ
qGopyeqPbdOl41frD5Ve61CcQ0C7AULBXSNncCFM8zUF5yJ5Jg4u766+QSTw2Z/ZcGXgQUBe3EMu
/SlsCpmqm7ircQUn9CmQUzixEiesMni8daO7GTxJId1PsoqNRq4dNnT6BWARsZIZCAIGvnoFgSoj
F9LAanFru7hH5dY54iLlQSm7+h4xPB+yMGl4onsZfFVB38Pj8dhlZmMLYJLguLFU09o2jy1jQnRi
+bMVmpgfmrz/BOVdjQuM8H4JTsc3NxvsDwjLIz+SoWecrKRx+4moGmHZI+12pM4QZcBy3YZXjEwj
fsDAHy2XALl76GYi35ifF48sPeuK6w7njl9xRXx90RD540XujiUu9nUUPRwG3zWiEYoylrlcv3JW
UKz8yDm0/JnPJ1pRn+NolFdgkzCMoX39+M10V8ExV7+B+5o/IivtLLPTNeM6hGV87F/n1c0snGKH
aqR3203661+2qiOYE2WpsufQ0Vq2ecPE3kC6fitji0qj7bb1OMGV/TpjZEDXB1/nbvvbdDmu27f4
onpGVe+EJBS9MxFgIpuTWpYLRqUdUy9v0ztiHneMVL7GUmDZfdeEfJvGtM4E2J15NH4Q5bPgCT/p
zvsJ5N29ngezVjFKxkRSBUKPkgLX+GFFHV+rHyCevumgz67zHDkMz19huiNV+VmhM1V3Vfgdb11y
vs/df3R0orRK76ETsPgR673GRIeOSdMs3/8Y79da78n0Bai69Lqfdj/O27nHD+gTbxVE7DDgrKst
u2XVKxK1NUqCr/Kpn+M8bcs3JF/IEiZKn3KQ2lTWzgjGgB0naEaYRlbB9zBmIORD+ko5bVLcChxt
/aTfoE1a2ynRJ7iOdJsEJGho9KYglcy0TlgxM92tXCych8CsRPXbER1RE5FdZg2p1KYC8txFys2N
72cf+pc3u7AXoxrXJBE6ldaJqGAXWNt9xAaPalx/GyqX+B6Ri3VqmYCHkItz8M315O9CEabjSMbu
q5JJor8uLOBF8UVHHM3LkMRcC6ePmzVibJCSeoJ17Z7FHUdIddO3UsiIsXgikyzpoZmgcMsON9cX
P8Od5DJWocAwN1ac/v607dE3frS5bw5iWjzqx7CErOPeGGzht7oTuj2Po9w5JuSroVOErLmGHmtn
xsrYvvRd6BHNDqBGJJnYqGd+FRCsLgXQlGfDIgzOeeZHVxxuZGq1a3TgvDL17PswVVqn6fOfpb2n
7ZXOToP4JqhjgEA7YoXwFo47x9YAvPnhgwEv84ssOz55UfotetdMe7vhUQ4lebTUBbIKV3jZc/3u
7i1wA7DRtdv7YOKgpW6YJWY6lRBslqovFtKCRKyAVypu7jqlL6bwzmh/x4IBOYvzBO+VU4y68VtY
EQuyMKsMZ2iZ2KL5VWJ/DBJrBdc4yaMIi9Kw17zaZYx0ZL1JNSjZFjL+CQYBDUrZcKiSSx/Us9j1
o3r7X6tXsZM1z057KMWm7oR4bvLUEwHv2N4gN6ah57OftR80/HJtYWKRwB+KseZgu5/JtoI6JHPy
U4j8BETWHUJqPWuHvUZQLmCNoVgkAqVh0QzXXih3+GPzRFq119W/k09PVFsjp7bhj6v9prUOhQk4
4C1orCUB9jd/7pt2wHvu1uskml//qEmkCRKTGF5gGoC9Q7uRFNG4upp6JE7me6q4MAjW2WH/vg1l
g4p5br0T+QcPRYe5hNyWLH6VIuAu7SNOfAhP7MzG3mZCFwDwzFkiPyYWc8j7VeqhFhuKVkCf4k0A
3Wb7ZVtjx1i5u0JI+azNsUp/xM+uf3iYDRGwc7tG5tJW5ixGawlxv64gGAMeB43jmPygtpQo3JdF
JEGBqG85/hWcy5Bj2lDvNJm41L/oyWCNAkh3qIsdv6f+AqgIjBZ9aPxA9b+wcczxDG/ipPOQH/Vb
XYufXZ2kx191RvHfHE15/m4JxkstfQIQcWhFVTJG2tbdNjwDkNUtUS9vG8x0jPQcZ9FBul/H4Z25
u8Mn5HPhVTeOsrP2PKsKN6qtDOujKrUgvoB16vn4p3iUhulrolnYKD0MC5FB5JoPgqNt71NMs3Yo
kiPWHVmSnKk9y9JbVDt0gqR/z/se6oE5aE3Ybz0cNNKRfCcXEuZI8AViIdDUGEV8E8Bhx5DE0TBF
jbiYzKCSYj5jv2htp5dBT2h6TWuNXiEOp4fN+Gn+1XYZrEwQmR7abccG3Eh6QAZZ9xO8pwbg8fFo
hytzb50JvBk7jQdnKwmFcSn1xPEWI4BbDhl2+qSGGO2DFonXg2DrbdJmUq8tpdjEFEq5vQS1FXK7
EaFKTiXH1yg9io/vP2VVDS6ZkNjyyWEBC8bJ2P5IQLxpr6W5pSZhvbr1dAkan353X3Hc9vRGbAGT
gfRw/MVqHsCZsuyBsotWFcY4I1CWa/6A1/wIKNkfBMNeC64bv0mf8QCs8jK/KXHpQrZkKwfcSlKd
qkYtOT9Uic3FA/pRjPHAu+eMZEXDguJljuwtcw7ncw9Xqy18cIf80Ha8lF2ldIlWzHGlmkj2R/XN
MPy5XZizLTyugW4vmR0xtPUUvpsgN8EO5fJWVS/GwoOZWr/xazOOUkg9ZVhwpdg0pmVIPqodaCZ/
xXN8EMrjOGmxM3ILmRtxYeWc2IiQQe5hWIcvlghcwOWLCzEtf0FEvuUHjYoG0GJa0r3VLzgKrPgM
tMIVoImKwoTyViJAqapE0AJP6DV4yUhXiQ00BcCafC+QAPzHaTgWs5lP+vo6wL4V/T6EqmpWUcsr
Hn8utNIblyV4TpAUnGaEOApw8a0drEyWfpXkrmH8jtJUkxMj2Rv+bVYkkvP7OLtd9FHxJngajLag
GCiGg6vCdOM3F0mcMEDY7jUkm7L4kFOlOpdzxKJ6xp/cuA8iz4mfo9dnbSuqrzZ0xZYTUC9uCFDc
dSK6Yhu2xNO0WblP9jhdKamYjr6/ddLRM8/957oBCWTrLsJtO6JUr76Upk1FpTLI7/5mV+PsHH+P
l+q9tfyBg67Uib9DHMoocqFbLX4iT/qA5HOeBkzO/Lz0DBO4ENegsca1HVeTEs1/3zfKP6rUU/R8
xpkxIlJq/LjDfDNS5X06DUKfJDcAqPEjMCykOGLiWj4QCxxXmwNOsGWa8GABglY2cgDmm6nOtwTr
2t/HIusANw/xDEAiFDsEkIOqlixmA412MwWmLApG6FfjN8vdsplyF0RppCiR9ewbWQxankLOHGs1
WznuY3xgjgP2PH+fVZeSdUWGfu7CCpRD4AYV7JyhQGmeT0tDTzneoansJSI0NujvspegLwPbnbwj
q6UEVmCrBOmR6PDnHR0kbH7xpgD//KclFFBIX6UQ1uctKZEvu4lzAcCFvTIJFjhldVnvU+yxO1H7
rezxkf5/S2qZyEm85Ncqa+bBUtt49EOqlhfpIuKTOMc6r4QpVxFV3qbm0sV08WYXRz+b/QkeT7iM
jQmcAWq/tLMqXikR2nHl7Y3LOsLxa7iu6aH45CuzVqZ3weN2xIGcJfybrU4oVcG3VwfW+MOkekGj
OqhfaD3/lbpWM5V61gMTYDkJSbsNns4VfXKs24hzRJt9SzHzIpx4J4pTB+jJyGpAfdjQSSuu99cf
77s3iH4n7yZor+8bpGJ0feHYOlKGTKsLMbEoIkMFJRb563z8heuDhSFxWGo+5N5nExalAt/+tmf0
trj7oDyXijAMr2wiB82fSTugwSjiN5sLXbjmA8iWgTtfvUi1SDVdg83vbNvBPZ4ddyzZGYPVW8qR
/rp452X8hP8zCQGPlnwdQV18I0Tw0s+YJXN0Lg8vJ7z/7aa0ybFS8Pmko8lQDsMq0nm6RXI97A5U
Myl1G/uFHfwoSETonERSThbMPlk41UizOr3W1D8NICNwu3Ercly1wksEzLgbosF45bNk1+lvlrqO
rGvpu5ZRcMW/mdRce11MHWi+fNX1KRA7I6jIDSjcMi33IYNcGI248mNA3MJxvL2Q6OMoWf/0mMH9
Blm3UWWCY9CTQA7a8h7fDvT80oUjI/LPNnLRNk9OU8S1eFdWhrNdWTtItwINzgEBHN+h7wdsKtCl
Tt9ccLRvyB44YOle8ML75gLmKHOS8F7mmk2roo5lXK5xMQaOuFHX2mA+eZsQP6yystD71lksDknm
qzm+cAeAJrlFsTglhmZ8JPP9fH7XPp23Jgtf2vtMADDuDUSG4XDWYKrfFyZdwPB+TygZbWwOfzoJ
DdVEF/p5FYx9trBEM4/zhET58xbT4ZXwOq0+Y+CQqhscABb1vkOOmzebCDaNmNk6wv0TiJf2ayMA
Fwgcj1CSLwqn4A2Dw82OK7sAr/YCIC10eoIfkJAVj0AyZgLBuKel+W86FOzwHddHqh1JiBe/vOWi
g3owMcXee9vI+50BxvV8xSht5aIBZ4Hqi4OZtGuO/sQE7o42rFMzh4EuNKxCO6jNX1qasF6Ofgij
eWVlu2AihuxCOKRAXrFIkLSgcKUGdyUZ/uDl3glkiJdalAhrYIzhwyL2wB1T/23fMDFa4eCW4Ykm
OfkXlj/oDU92tVjjSi4HXBP4TQxZyIz/1xah+8X776PD0s8mmA3IPY15mu2RWSsnuueVleq/0NG/
v5NYWaEqqIdVoelsaXkqrjSFKQU0MPLWcN7W7qURKMplkT9evVJphuaZ0tseTu3W5dxvcgPqxp0a
nVTJMkCIkwZyjNj81cIiNe0+5PfI0NGyzU/IkYS3Ja2DJnyCAgpwYHFIG+oc0g/bLvhhhLye6IRJ
p35KaDO4AeoMiblW3qQmHfMa6A0LySDOYplqpvjQNqZdKDuN5BmCI2jrKFSi9QQqQ30i0qQZW4ZN
yLNMXzTKlYkQDPo3myWvOo8LoCPhRsO5irjrYYTN9TpTiU9nmXWt0EG1dzDTjVHjdeySF6V4JGRG
IuGjzqqoyhUXlPHei9SHiMAmrnacJpE17myI3aO2komQtuDr3hDuI9fyb2kTSNH+k3jEwaz0MTLE
hLgYh+83dG/ndEgmG6mpwGH+/eehIp248zWtO0lKDip1MS4FLepafCzhs0s5M7O5Og6HNY3BaI50
OZvPt/k51gfJVQ5YyxVAk0akxh3VzpchDMy/D9qzjfLEqiqi8WzICZwni3UofQIcsb6+bm0bGX8D
HaSOrenRGCcggSqxsUM5eQm3NlQmOE49ldmh/xt+9Iv+i06ZL66Hy/T0oAcjbrI2ZjKOq/bzDCyx
1cNn3DLHQLZT+ocUeoa0/9P50z7M4/NZzhrP7UPKlRUcnaScN/UHMStC1jkeGL/bnHZzqJRYfPEw
8EJp8U6DtQMA7wCEOEUZCB3QNXHTdULoSwPQhfwDTHCC+0k36iEKej0/qU2FNd9PMtLQj3MLaDma
u/OU2cyDgXNxuXOmv9JNZBc41wyoP0Y2USkWhPYQqcUmyzoUui2vy4M6DwzBz7GwEXL03tv1JNtC
oSZH7L/AXP+dCAjIlbLmsb8ptomQ9Dy0Tn++5MQTzC42WZQG1yHOBuPtl4WrSA4vIouWkl9JS+GY
YqKtHquRfvpLI4xTs3oWDuDRGlugbcE3/4z2kCUzIfA/tJLiPgaMGJL18kQlnesp/nzPx01HRCjF
c02D/a1B/dUEE6HufVMlZU+iYrbFZqrEOqz5LDpf3lxIaZaJ0qqCIX1EXWYIOqRJyEK2Q9+84L7b
5vGneUI9R1MUjkrarr4jYqkkovKazEQf6zLX/eI6nP+4OwUlVN7iAci8C5dRZP3Z+Tjt0yj5dKlW
5CJpl45xWCDz9PHF1rEUWQXewsoJA8apIlMDqxPTS6EELApO+3zKL8U1qSiU15ekgYNxOX9B4Bcr
p3JdlMoBb6zeqguKH+FaejcYwqc/pg6rMdXrckaLxENVdumDIAQpuamF9fXNI0TpYKF8UgZ7kjhw
04Qz4+qJ2xeC8ys3+WvxwQmog8eN2K1W6G3FCpu3XhLCrXvaimzjiMxo5FEv0NI3NgAjKqIsMfQ3
KvmNGvtNsX8VCbGdtkxd7FQBEBVryN/pdXCS9FtFC1SI7m4cKw4lrQ1et4v+qakX7pJLjjISUvmp
a/Je41EDA3dClYYYhrWY0myGMSzZyHzuVNG6HDP5+/UhWPr3i9mMSjAH/DgHeOTQHOQ6UfG55Xpk
0XsSv5I70rQYVD+/lVgLwDdSFJiyQagGvWmi/YKs5yOOUbzAHDF4Uiep2OzTAq2cuMEKKnBPb/jA
+RrFs2pFGjxhIkVfq1DuV9UW6285xzYQQlt0TLvwRpoeZUXTq+j+MXWZ/NGWR+enZxarDDRZdcgr
g3LBL3QlrYhfzBUHVzAwy9YDeQKWZkZnRhTe1puwXcBa94NaQGbogE7sa2e7IqTPVSbDzxEMV32c
MYotwcYch0O25ME7rOKokiMrAbVhKrU6dQu4kBQVp8ntlXXAkZolG9bcYJrqvfrfETSxWrXjAvQx
uigAYCXF/W9Fp6hWJgtF7mHBrxKvsRvkij5T5qkMp4Jshu98wUXbzbP7SJLNjrov9d3jRdHhzaQA
6ll4bbdcwT94demABC5JIpMieNC2D5XDtVNlNGcqS/dDdyZQBCc1BByUpJX+vpTXaRsKenDySQ1V
MsUQIltPHphAH4CgonlUWi4atJuxi2un4+fnVbpR8Ukxyks0rLfq+WXpKuBiD898yAqAsRtLLfPV
fow/BZ3Wx/mJkAyijZ+DTO0zkSfloUxKE2FhHbjOQPgg9q72zjNLeqF68gOIL8EEXBNSrj00J5Fa
d9tv0uUbMt//KCIHI8BgJZe/4vvSmQjQfc+ljJWq/L7E2zRejoGcN3aqlcR27L1KzKccITM4gDfV
I1mXIOwajm7ZXto1V+eUCzN5rOEDDz5MSUPsUl7qzFMR/csax3XQxAaqa49b/L9VlywbI6WTyzm2
mJcXtadVay0oIhjeSgZaAnOGUaMNruBcTxQHaSdqbEqHrJlmez8y8k2MM/f8lDHB3Uo+KqrXGIIv
YBXuUFrxrF9V7nzBCU96ZvGeWJEH4fTLMSKJHduHsEZkY6b03ZPAWmm7CDLCsfMDFHHcRFDLl6rE
sUui9lZTMN7ScL276tOuD7wk1X5sRVUNPSrh5CuwajtNagH43CQS49OKn83U/JekN7v9SzE4N2Ht
dy9wzoxqrBxC3Ec7MYeeDEn9vOICFQbgfw2GTHwzwC1Q2w4Ahk0aGMFBlaMUYf4gR2AbL1cjltvV
VuQW/5bgm6RCLXaECv0OnvP1sNlEPU1seFTSLRK96dcm/eEONmO5fLc9lVNfh6Hb+BT8G3j5SKU8
yuBHxF8JZm3hjKMc1XAt2hf+XxV1vTwZZtwlCKP9QTTpMvl8nmQeFx+HxZ7Jp39rFxSpQig3SAOO
R9/s+QgYCNe5Vgkuc+pFMHcj4wRhBvOcu5ojCiJhjl7Ww8lrBVCMd2sEOUvGc+K7a4agc7m6Qupi
teZx5qu84N36jQA9a6HuYrt9u9F/fhL2GLcAiFJ1etFgW1uT20a3NYHv77fOSzHcFYZ5X53jKFol
GYBfJYn6YcwuI8+KuiV1LiYJ+Homyo4fIxhaXQ6Y2jlmxrsDjkFPgWqf6zYldyE4SMWFCzDvnAgU
tB6YEq1NExpEmmA0mL4KmEF6Fv7lmiyVcusrvobUrsU7zuc4cvpAar2n09W1RXj91oYd34fEBdXL
uKznuKt5f0NbxEI61sdxRiqG87Gv/cEU/mlm0IlfDRH7foC/R0mx0wxFtPupEX8v2WXtIj/gBMIX
odylDkRuYVhIJNDPYUfiukerd4F7LUiSaMRg//WH+MJqn3jsiqgCXGsYqsDxf4B9XFywSl5wJwz9
S8wTewLK9qTp9YQg6bAsHWUWhr6dXkJVFarrrvEM+3zNdZTMshjZ9qgbEXGPH5U4HZRby6SVBL8K
IJziGu3EUDf2FEtjumG1IAVfJOcJlYp1BZRhtyHicgA817y7W5V9SVcGdKQqEXfD9E9vf5FtCJno
+8g591keeEd3xOtqTCG6140Ic5Rjxii70xBSNtyclYcOYw9JPztiY8HgE+VBTh9jxu4n3y07jMyw
rFFvQWFQlQF6f8bzDD0GcWbw4638r8n0G6OWkA41O6Ke2BEAJVATwWr4sn17DVXcPNLzbEXWhKfq
YeGG0zYCezniLrXIjoEz30S6vvSzoa1RCLt1jzEeJGvnUnXt0hR0oXMG+F3LHE+P6yqa5ldAljHj
FbDLeYcm98W+7qZd4+CLnZPEfJnZFDyMzXXCkiCFYBEWtzAp3DJXteL9APbrgKVPtt5UUusc0gv9
RxeTJuzxdFUmrMgwSKZQ7MQgdRfgvwPNMoLhh/Yw1kJG50FInsAMjE4N9iBN8Kjuf7Om0mrA5mBo
acGqJwh7fTHI+wxcx/1x/GVV+qxTPvsEkhN6CgWjVpsowvW0QYGvxVQPAtIssNH9HZCA1lZZWkdc
RdEifRfKCBJTGd8Ie01cp1JLsqHBkq/vIZbMDf6V3D+jMbbon58Bmum1QSZBNAYK4KYj4zGhsk87
vXT8sEoZrWZyVhEDqUlkk+q8EknwGo/Wf83zld8Ehs4l8i66r83L3s2QrHnsvpfci8UXe6CRdrzp
DrD3IX7zNjG7z2rQJxGTk+B4Wsf+SStsQ8Qr9RrDSXq4qzxQ5/A3qnJ5pcT9fde5AekQ5XKbPFYq
1uJqym7U/D/l3/TFdjunn/R1ZHeDw7oPItv5cHgpH5i5kgqkwp4ybOPSm/xmisWMd6yim7JyW58Q
Bybee6uM/lUOAAZgIqj1d+HVTNOyv1tUI4wtlfbDsBhamYBbZrU1R60vQw0I5VbdufOnja1A4DCP
sd2+WaPyuq3SiFpfGuWiR4nHw9u1XBNHkKcc9OBdilBVZBmRlJaHbPBk5VI7iv5O8Bu9Bz29zg+r
creeekWKp48ka3xi9NOj5E2ETiUbbZPLph/C/VPV3UI07rJkhIeps0KiMxlGa8G22Cess9brv9He
m91NIE/BdtK7tJog9LS7J3C5XcETeE1HRNFheq6V079LhWkzQlta0Jd1EEQ97s09N8MZWNNcw9qO
jwxkgsUnYhMzdx4gI+YWmbppkJtLOdFw5TyNV0NbNvN+Hbye2Bfn5QNdnvAqwTkIChzDCDfoZ2Yk
6dBzMvfdDY7QL+EAl6KaC2fJHdH3R+N46H8fPLvPJWv02hx7gzuf7Zw+jdixdtZ5t4QUrohVY12s
NF2dmy8NcWoIKJ9otPSZYM+JWsngYFV2OeUzLFLRx7J+CJUxZAg1zx/f0svt4NTMfgym2dtTzdDR
thGjDnAkPOW1qJh+zZhdlZNkhZmpoDkaLGfEIfqIhl1dxxAGokD8dBOHBHeh7XEXsUIPZ5XDgBUu
7Q/2jAXkho2uyRP7K05mbvFln+TtxMcLEA08SvuEJ1TRM8jbLEpcBVF75NFULTAa4hc6mVlAJ8Mp
X4mryz5tGP4oo5AfzLhwJI5tgSn/IkVlH/PU7bI1cIxe3Eq6RGEmKvhkT5+rO+3Zp+Rs9/tchIHW
nBPlzlpmrGAxNTnxWr8OJR8vroyWt9EI/tL0zyzAkF5OZUAPtyxnAeT6JiCBd06O78Lg3iyuWMUj
RA8wH+lBwZCR4T792wo7aERwopovbtNSF/v/ieg+Ob33M1RoiKlKVSti6cgUcNDcctmhE6x1LVgF
0I27GKD+gGS4Utco6SxUwi+9S3k89vqMZzH9MQxITSwJ3OHf6fGzY2NGjsbJWTkgsEheYyYpO813
7woQJGj7imJ8LWwVXhhzpeyPOSgG9rz1MtDUVtA9iAirz42VEvdnL9oGc6TEOJESu3HsBcvAFECQ
ovERoyegCM00I7yW+cB9vo3Rn/gzadi6tZZtKx8RvSSXyxbphtbBDGbQOJw+vMEMYIoVzfP9Iytv
9duZea2JgFcKp2qt7KeCnW/jt6F6LvwHIPVoYCeL1P5gbGbHqnhrJLXHt+pppFs0Pyw9ODdepHAX
aLbMOlcQ4YpQ/22xPq3naG5nlykRC0qY0qY+W6SgCUoqykQFRCdxlMSV3K8TZTTuhwP4u9Dbp3//
hpR7mhF4HX6EH6vEeJyGuTr9DO0PcisxELeTiWd423CXk0dODJRHqmlfJ8dOxQC21AJDSiQq1po3
Qv6EFgih75mYS1v5SiTCQnmtBmcUqoy4D+jv7ePHiUww/key1wKn/BDzSuA9RuBYg7/MCpm+HMXJ
xjmQtRWm9E2y0UZRRv2j8An4OqBo3regw+OMEB8rTU9AugErgKfwRG7tW2r6b4aLBBtHR/8BVp5B
kB5KQI6WUGEHJ0b4ggRvFinLWJPifGctkPZzJpUBW8/t6Dc5eZCsXsG/o9SaT0guNm6ERoh9i/Ln
mw/NVuEtSDTr8Ohht8zQ+rRcEkaMQ/ahsZ9t9Bc3Wt8kk2GHsQgZrANObERVK2KFD5XiuxgvrYWn
XKgATW2yJmZVQVLm2G/aif5xH8yWPO6cO/M4oM1RQIDC87P/XKBW6QT7OIGOp/C/lQRUJ3C5FeFC
uCf/iZq+e+3MmuUKeZVXuTJ26qihNGaK3V0RlpYgrEBW84KhlJszBuhxU2/fufXzp12M65TR64ir
m0QhdtNOVj1XooUFWtI7y6GI8sk0bS3yB+paMpcSAApqcp/oYOE9MiEhQpHsHV7ym8P0vUUts6wg
B0jUpI6PX41Kf2On908Fa7RODK4aBCGzwZQX3ONcG3ZmSdbunDtZ5Wq0325+OwJq+q9B/i3ogOPi
RIYQ/HGR7wRoFkq37GX6VNjiZqtwP86S2P0SYEA54FvmTiX5VmYM+7m2v8bzMeJu4VssRzBPwt32
PBArBNQmlnraN0YdW9nUD/mVfUEl0HPOkyKnjP6Jo4eGCvO5ihHy89GlyyOfGwJS/sDA80dQyWuQ
BIIoqPX8csBTgD20BixfG6CEPbpa1vDLi+9AZsoOMCo/4um7hVxfH5FAoeQiGtGScN44TzrnA45y
5/zQXxaDNZ/yawWzbo2e+TC0d6U6K8SQ0Zs2bhTxeX52YcMpcEMuq3hfDvZtgV3H1bgPA0GvIYkK
vn+jg9kGZ96DKj0k4W5v5MYMhjpqCKIZ9KHUHBEG0CkERd77ly7QpqP9xjo1unPzMFfPgYobaUg2
2sX/zNJ8WEx+5mQnGCtx5TTRmE7eSCildYkYzFdtNJWbtncLjQxlsNm7MH2otLfYwSbNvuVh2ZFV
8v9yy4+e5pbQRr3hRDvJZxWO5G3G/t9rRAPIAjmUcp5g7k/wIPJ7TaUcNqR/RfCt6kpijNb5LkOW
6uHKplz8nGRy2ti1T3LNsYWx5YlPDvzzXyWD5n9PZ8lBLYXZhbBeEU3i6kSf/IVhQAEGPnTfNBCr
gD1RfhqfVm4m9RdLkKcX6GBPwfhM+ziu75H9wv5LmqrdG6VN8a0K396rtOlZDzSWV5ZOxoyZgvoW
QDO+0kqscxk/iOkyT7ZjejeYbUPmV9p2SC8HJRjE9Yg6aN6/eW7yGjQlAw7kLJcn7wpL+aqPHmNU
mDedUSE3pnviiJCLFeIWLdpk/OOiJeZuuqA91RK508s5n7qJfcRfiSW9kjYBBgkmOI11G5og3KxV
cAvfUPxPsUsttZ8I+38ujpPOaejVoYUyz+87JtUtm77Y3RWORBIKoHnnNi6+fqL06AQfVJG4IABC
+mJrQ5RY0PYst0/9YFsx1WIqe51pscCmQRKe8cwSa897ctpRpVAUMBJhNlEXdb7T+jdhrf0dd6ob
5Ta2j4suPSwiAX9B0HLR4fFezFpxQUCwxEAbfUkuVUdeV09hAftvrP7IOWuiA54fR0U3PiCMisCV
UO7haWyuHSr1jjwUGZCAhkdLYxhQgAdRZOGX60dDBpt/YBgYx2F73pb/+9Ee+BWjdQjvVm3QIZTl
60NdY4OSGOAW5KTfFP494gINprp/7eOVxLz44apIV0pjZrb4Rh4dWKeWOUUkXQu3SVVHgrVSafZG
1sHShqeFcWQdNvDANuRt8TpdNPJQL2ea7uMX35v5Y0E2g/VJGJ/j+/CA99/dyq0X5/LecLeLa0vv
GhLoxwIkUIZgwi3o1/B6QeRbaH6obAXOy9cHm4/NaYullDKZPuD2lEUHbdjMqrEfmfR0Y1IzcY+p
MdHZglbyFyikcKB1MBTeyOVLmAQVIqg+w+/vpTOiOvobLRi//3n8OI9Y0u3l5+f+AWETetz2W3zD
h00Pq2mtXWEHl6C+8qBvRt5kHSRadp3eCj2JfjunPkp3f4I93Vp63Ca5OIIGfLGN8Tpy3TMBl4+Y
xpWtG1wtFUc5c+luvT2OPKIUQHSmVAjo6z782+Q/W/liYaynsSpyLRZJZ7lBwm8C2wgSLdhmObj6
xm30roHgXR9D9Gfk3brwHC4IAV4M6jDSMrRzBIDHHsfqVP6kd5kR5bwUh4FpCi/JUtQv9dSwcj+C
/TMOeWsLgqP74vD9zwb0y5/YdJx4nRBuj/fGIdcjmgd4wc/sF58jvI/bw6xkE3vsTaTRzieti1UW
tAKdjWgbZ6hVdYPupMxsk7lY1+XJ5RyecQVaKuwpBUfiqde2V1l/75i5YPQ+4bzWF+1u8pVxA6Kz
UKxERYD8/rRZz5034zUS3JaI+irgZXfPHphqL8fgM2XP/ya42sVkyuYO5+TElV8F9jpgs2ikRRPk
7GxwHcHxKUPqEr86AqabYs3SdzMa8CYuf1kAmkUrArj3cC5UupnbKzPKu1hjbNompkp/d2tuUhxM
ra8u59H5bCKyt4YHsvbFjilc40YVfdB5yadvpZf/kVMlXZoRFDXCkVLMXnJSejNe7yqSWLnB+Ilx
87K5hUEKijLugx/TpnrwtFt9+GYrjE+WowksoKIvu1qIv6yEzbUv5JvFcCtfwBZgtPuOVRwnUdgB
1KkgDLfJidwJw35NxAKr1qSDLW8b6tgSaXR2BtigtpjVGjN5LHDXQ6xzYpOOPpTK/sWca6vVMorg
eZIXVKwCzLmArRKLyVph4mF2p7qkuuKeJyCWnUgG3Si90ALJ94kUMZ4dmI3IZNRx/oMtQvW+KTnt
e9IIX/C8UIZ1K4VzZxRpaumZFxfU7NUYHH4MGeXY1qplVqVOipU7ZYKEuCC5kByQR6q8r+1XVWL3
v9YVdeJ+fdmEq0c2TPcXZSXJBX5IZS4yoCTHA6W09LvsebWLuxSJ4GmtIRZ/QUzvCRn0afMI9anq
UL797JC1TcMXdik3jtsILhTdLA4DFZH8hDU8DMmRfL1QoTVV6RxsQhvxBaIyKGO1f298znlZvwbw
3wAuwjvKZPFHe6Po1JfPFENxSmeV2zD9ukq8z7E30F7S9VOfzTZMDLLwD5GTC/b51cKWjq5KxPtU
VkVy6wC210R04tVOnLGV6vkluYFh49i+f/pIB23pnTI/U1GuZcD+1lKWdKg7FRKR8FTwZpQE8QAR
kA0APLNVSVMFQvX4/g1a/H2r2TWsAq0jyYERXx183FjiIQZBoByDrLJgTbZJ1YMVw0YPeoviycn0
8BLfcHHybhn2mjCnpUYHMr6F3CyrT1REhZ2BaTUWeowBFWI8WwHk9IsLajosPeHB5zwrQyUFKQ0X
usL5UCelVZu0CBhBjM8Kjo3YwP9NRCvIVtoh+WNu5u/KEGQ41uW1NOakNIChPWhIroPNyUQyqFHL
drFTsyiUytNvD5wZRiY8axxub79oN8y4mRKtS0u/Z0GDJcfu3nP0F6pLG8BVpYxlhMP5SLyKH45K
BmpLJz3reaS9JLv865gLEWOQIuRd6B/ufZRnedipe5jAybNP2Y/LaRnnY0tLFQnDbpf+z1CH1Sax
XNCqTFCTCbTxSN5aCdfxecb2XDjDf3n00wqKmbGrogNoOHEZOBhhc3+xkn7u7JTybXJxKKs/jCfn
DPglKIcc30a6uVaAvwyKQOCUVCsc3HQCA7AB2Z/TE1OeAhhN9Tfey9g9Fuu/IGc7zxEdBp5Z/lxN
yd0Y7EpvOZKAxqB2Jeilf1DVGmgtxIZMuKyqGoEBgvh0v1ORLGQyAj+fFYfbMZ5OOjN+FeqEdnEm
843fEzohstGVr5eF3zMkmQx5gnOYmqlK9RSE0Um44zY3FfL7uVCejcRLFk8MzV1gxFUw2939yTsQ
/IbWjUcfxzYmas+XBqztfzVP2c2/b+DDtBIJ9WCcYBLlMKLaQH+7hVHe0so7GH0TLqrSbE//hfum
9EP0L1A7lNPucezxtexPNJlpZE42X35inkU9vFhuaRo+qr2jX/eHDXQ+O4BBHGeTr1JD+clnfdER
D0Gm7uyI+A8A5xI19U8hAMhjHP0YYJ0vrOoA+WeUAPQw+L1fQ+4tdZpXnZFqN61CSF7f4Mvh3dBb
zflkUY5xRih2ofTAGCaFKmrhd/JoSm6nRec4iT/ZF96yjRCF6uVu/bJUeN21qmZzM1CvIYYqsVaj
I6z1pvoNRcJ3UNWVXdUE4R3cpJj3repeRUZk3+WJTlEr2HYzcqA+9Y7IvXlVF86Y3SxyIH9xpeBZ
58BBwEQE7UNweZ4WdJz7bjoaswL/PMFVE4Zc/zdYQq/S0nG5bYUAQndA8Fld/NW9/OpL2Obr9bVT
hqwdKFsx8U/C83SablhJtkuyrDJL/avtyvYqVKnAdQUfAQy5JIOHrkM/mkVZqOzj2xIPEzdefCJy
tMHXQQ/2wkjd2AyTZcSlQBiZaCzUe79zWX4/E0EDW1g3CgMmIofaQl255ygRvxabTljwAgaz0JsH
cdj3VaaIe+N1Fe4FZEZrkBVQPjXlDUEpXINoCzMUorb7C2JuHwhb0yiUL1fuH3UEqzga/X5a01Jk
FJXfgDPdzDA8PaUkJdSXZBU78f0vWKbsrS4m5ziUeAvmg/guGcQSpPbIkeKyzx4Ch+Kvlp4PR5j5
BSbyIl8xf6l1PohdV7lUGQSZYDGHsAMmnPRgjSk6sC5DGGQkQdghWVYV0sYqJeSfVnqY5bTCid5Y
Ia7GWyRbMeb6J0rZM3jPri1xOLnL3qrFCLs/MXHj8AAD3gwxEHSJgbE/oZ8cP2Ck7+5yV/8CeAdy
DpJHaoKLm2hLcm2PetOl5g7K/yTTPLjrwrqWowZJwmhI5Ptd+kNmM5Gf42J5Palhxyq0t3fOwuM4
Lb6Vc00PHmwFrulLY665fme980kM/B2IrgPpcLCTmFpHJwkaPv3z9n+AoN0vLPjGvOS3t3+dNKi3
lVCijmVIaN1e1M3conceJZTibW3/ApBy3RMDcHYmzWa5hYF4qp/DAh1KF+Vqjsz6oZ3iLCcFWOzw
ppdnlVsjtvzSZmGZZzdfn4Ecy6wtC9XN2n755R7uigcm+oKeZ4GnPKzxJH2/HTLW+oqeA6t9HHSb
n1UOIR9zQr3rBhdK4EE64NIHthNiS45ip+1PHDjPhWNAi7uzl7g+uGnU8H710CJ3lylnVCnbSG8S
ts21H4RvIZSN7XLEU1xUupWFgVQyaSgwcoQ51NKOAk/w47kI5iZMZQiKq1Id8tMvDAEepstlqV1+
fvqBkT4MQtKmWJe/PRFyILAUSlGs0vD3AsB6e4JDsKSooU2kowlYq5iEW6DLWDQJ8NfJkGb0325P
iSTAwTUjjFXWvJMuI9LInW8ITUFcxo+jjbG6QMfwkxGpNhcNC96fuNpT62yIcq8g0jJ7PZiFueNS
HXuEjS8nwKX/YRejUk/l+g1jDvuZ6b9j0I9KBEPmiJTXSO0mNoXIEcHDNGXMYhsehceFtD0Z/E3N
7+ZTZojFKbK/TABtyoWHMNABb8rynAGJU+Tw0ufp1mJY0oqYF8Sh1iU4YcWRHOsAzAEVj6LilY6g
0qm0J18UazYJRd8amF+c4GQPeRO4s+q1LgT4IRs6KbMjI58zRHdT/IVWtR6f2fItDtr/VuD+B9xV
FA/CE8ReKBK1lanB13liBa7my129bT7KmcP9fs0MO0zdY6fcbLjNHQoLLFiHYrwG7nyuB6hpb10J
GYC+gYp+BmLNhnIRiRgKzDBUhjrzXZd4pFgQvOqFzEVDD/l6chC64bes+ZWcn/epp8FAawQXIbW7
Qj+QHsbxi5Ul5NfGZhAgWjccvBy03AaJis/rwmSvuVl5leafSc2PlOm6msEk61fIb9DkL0L14+ew
I0Os2kpifW+9dYRNPGkubp2d5Y759V4t//p5957fB2TsCeuVEdIPhq9sXdEKtlQ/etzbWMDEvrWp
ktFPyRG1w5ABsBHwGBia21b6jia/qiWZopsy1snUK9Ypia3M9GA/F/yp4DJKo0Vnllh9GTSFcOy7
uHlM6QYFUOhpqyGMjJkReVAz6b4EGAk89RZ2Z+hgcE1YPRcj9PKGHu32/nx6qBEVSIaY0gIudt2W
JBbmSLbjXqYjuvh0ZDlURHJ3kDeDGT9pfnwGrhyu3mYuFTVxqaiyQI+h2r90wNbo63164ObxkGYC
vzwJnChUlJTk1FJUeNyZYcoPt9+ov/pyNO0Wl+zB1lk3NfunrY6gJ/njcg+3M45G/HSf4VpaV/QD
pBaQPgTKmUoV1S2IOwFnitT+ICi7O0qx+/mXkhvTHMRjdPRWHF10OM3g8xi/aKg0nVNGU9DQNkSV
0x9QD3FGQKEw2+blDhk3uv+zmy8zsXq4D7xyfDcpvRscZ2cXbQU2iTCINYtYXe0QFZpDIxUxslIW
OWKd53yE4vKX75sYNTiW19afygxSnFzjr+AyJs75HVgt4YPY0nBHW0/1/NvnIy1L0JbsP1vkSYab
kn5FxA/QUw8dca2F7nub8wQPHeNU/C5yqftr8jIHiY7h8VWmuHjwyfQKe1l3yHFofEm4k5jP9mzM
K4N2zCwvYI06HELSzFwUVSvOZSBWeqlhi4+HkuL+B2TQW/bEYtkh8Mp8lnUFs6d02hjkTg1wg7iz
qCfSpv6SIfCE8wzFj9XnoJhrjR+mDL6yjs0eWOzK235VpzKrskN0JRu1ZA1M036EP2YNwMJ2cuZh
Hm/ASVU/RrmnTJoZvCu/Cwk/a5gVlYG70Dha6hv5QF9obj/K557oqjOrVWlcOfzqeNUpw9GDKTVL
dI6RbuUIBkdAbk6tpsDbsaALvmGnNFtkcgK3EJ3Q2niM7VtMWJV80TqTBPjmrj6dXaQJFgaYQcrw
BUyOMaJRgS2Ds3mzYonvW5qItdzRlFRuKSIf+c22JyCYrEAeagTNnDLtU9r8etkoB6Dt+n37g2Ps
l35IZfdeGGIeVbPzw8Cwbp02Gy8HvfBFfCk2h6kGK+Wyv5Jg9qpkGvnQZT8VQGgwL7i79WTEFTDA
Ze+oKet0Ey/sGXViZFjRUOfUHY7nE8aX4KbvA0ICaqh0svw+2pyxT69cvJ0qJmJHTuC3D67pyIuQ
7v6qhix3d+qvuGozT6iWHUryYmGCCTis5BjVAqOlJM4fTNxJCCUpZbH4/YoDD8ezdER1nlIeBwuV
00BRk2GvMVUyZTbd4rPrElgAS3CbkVFLoC8BOOX2qaZnPr4l0AQJ9cBMSmPD3VlBG8uCp6gaIS+D
FJiYoEs0Dly0QdmnXgFhv26KvCBXAysbkOXlkJh2yk8Q2se6rlTJD4nFDtTNxlZUy/J2Efh8+8C5
TXt0DrY+rY33m3f4SmCuYwlkZilgmvJU0j3H4mSaBqd3iXX6uiQGFemEIhGrvfZ2pqk2ODLIGS+/
15AmGGVsxrBl3kfeUo9cx80doZlZAHXtxTUSJwfHrer1jI07tNmZ7XfLabqjRQpjeuYpEvkXspWW
g0akGWuWUcEVzmpWHMDxv7jLGvWuMmmg9LFkm8DqTPBeUnquCuyNKB9kpOsyoVJRVeYeJS5hUokv
YjxZ+CBlnKDS6Jhg+4P/rJd7UHKyLSaqxeN9ka/5v9714ni9X08Am5tBxNcEO6NqZwd6RpwLQ+r3
YGPJx3Qj+3izPFYZjK3RFvqen02J8z7eapY0Begsf7ZtWtpGBK0QPupblr2MBRxbCQE9i2UQv5Ad
YARP8eL1DcPGPvF6ZIIbPbe82yZ3SuSc3VfkUbrQjcpn93X2VohjWm4lajZbRHa8Pez3Qe/bzC+6
x6+alZQjTiVhkC25Vc+3azPx+oQGfMbv30iyPtL9gq5EdcmR//qVWhdQboWnrQhuI/dfbBJu3ZN7
+UblxZ5DgOMmlCz1Dt7lYTvX/cGNjQi/SGxrf2wBwIBy9BxUHbbnkPWFaXWUKdsn7J04BId1WN5k
38pPTyaN4KQaJbqbvmgpQUB7KNTSTzcQIgX2Elcnq/OBbxt9TYjDyf6c60X4oXLh0K5QsdcseEmy
cawbvHGXyMP170beJR2cL8yMLq8SRt7ruXXss6Jg4LDCCs8eWytizsMFRVYnpJRHOcleJEeI4tww
rf4W+7oeCu1pocKPqVND0g/U0ZVija7AJP2qkj9MHw59R8GRImbzK8eu+h/cFhXkMHwzsXquqeIt
GJ+sZHRtOx63aDqZ4Y1X/62wBRufMuk2C0fn9Pc6VO2XsseNSbIAVzvuOVBwh3CLQ4M0WS0Ngum+
lbk2I40caZugO9pyGYWbiF7zRLIYTwTqQf0b/56CquBTeUPdTWSSYuq9YfyTHpvG9QxObm+3w7f0
i/VacEV8bu9DHPM8cTDKrY9KWd1lEaT9yGO9wihvK8+lwfh/4K0E8BPtDaDIjHI/IFdR7H2pSpfJ
EigUSpN3WReRm/bh4AZDIvw0TQZYqsRFz/Lomz/JvOW5Mrr7/m42Ilf8r/y3qzAeTpKOAJcsFuik
xBzhale+ISatl97y9IYk01UFc78KJja43hyB6ubCIFJ8GPJHJguuOICiDwmjuOMlbo0YIq2/pFAA
NcKU+OQ8CwrbTBxcUw03PeNREIb9lH3yvI0bLtA3gutEoFG1wjpt6OQXQfnowOhtFg50s2H/vm+M
65XSBSVNEKlQ1dos6TRPyFfingNBAdaxvcBQer00egE+WhQ+5oV4KIlh4BLEcU4kjecA4++4ENCc
6AAJu70liDUG+cBlGzSh6GKynb32Hzx0OpwN0rVADKvgUgGuuqigAaLK93XbPJ5s3FoDttJeWGl9
ry/30fCMYFMdfQrwWHxru7v2eLZRhSUPFVz/4M4xgSXWQ/fFZh0rx8VVnPARTBW7x8GFCfXAuj62
sVDuJSyOgOB9+zcSTi//viwz3rotlSr1+oMIASi5bci4beP6s3jck+Ej2r6HzmbLCjZG1U1GJBqn
bXpvh+Lw0enY+ffhGMyveuDP9xHNGAPylB9rVlqb7sb6B9S4cCl/ZvpnyDUf2dBRKz4vtp1VDYuN
n1gMoLZjgunH/Tn7Y3N/f6AMvd7VJ1EjcRC0L5Z+4WcLUMB/l7/Tg02SMmYSYwxLaQ6zf+eDnU1l
JXwbB6vFrAUgjbW79UUkOTXE/ZrFP+vze8PAV/iRDzFdnPUYDAGaKBLlqoG/SRoKpuLPCD+4S29W
0kjTRbF4BTXySMDmJ1YziURDWlLmVd4UmW/AgF+L6Khz+7jz+turx63F0ygZ5ZEgjpLCGwxNeBv8
DANxGK2rX6d5C3MmfPs2RjMeVN8JIV+HBhFpsrtwtioQZmekvivj2fnfe9EwTprILal2KcRrvIH9
7E7E0br43y4SgwCbp1jNx3uBYITXm6HKGwtnhl/1jpWi693NqzJtYYi/pqKeDfyRvgVQth+bN4yO
mhA/++yQQwGxIguuFmp0JQLlzvnGV5M3CFQ7sY9JD9VsymMeLnehxiqQSsUrS4RlxyR4+YqXa/Oi
MYfpxHA/v3FNT7JfWrqOENAEWI4mdrXBH3iaYtZruQ/4OjXo9YfAYIlTqi+mFsyqMx30WnW4yuEk
01YVEKFxS8VMxIFRKHhxhiH9ZkEPz1ndfMquMDQiOkyK83ThLU2DuSTfGo3ZCFby5/a/04GoDvBd
G/B8HRH33cyuvnhQM2oYgiI8Co/xdciKkfThcfcKleqttZhai6DoB7YtvJ+dl99BSlUpAmi0DO3u
qK3ZW49h/hG2E/qGlQrMHmL1+EGpNDjCZnR7RrHChTj7J7K4DYNo6zuGoXLyMP4yTgac6rLVMjqC
ZgeoW9QQkVlL/9JVyVvxsT2TGpOiM9jX2nNTu81t4kLziU2qyAhgxzrFdSNXRBVLgQSSSkleb6Td
2ych6sqnogpPIYVsPRbg1AJJvjrIPBlGW+CVrM7d9mpoAuVscbXsSkFpbGWowPttsRUU/PX1O9cD
QatV2RlwNy1UfT8yFG9dV5CxK168L5DesbNlFjX7Im2diNQTrc+DqhPwkmEsmqzcSGPFrLOoBVdl
pIfjGJRzXQ98rywvlex6BbLDQzsVAjBbJ9QtEVZum/hUKC8yKpA5uly6AExHK6utORWDj7hEqbbc
RjJ7q5pwLygawzZ/MN60q34dvTHfMdGQhm6hgkKEFwXYPG/vsoSqBx2ZbVPSl4SAZgLgHaEvMr36
PS0VnkDGusX1Kww+JrDJSi3k7yaXuEpXOOqv1wOWxrQI9JDOPKWbKaE3674Eu0SNwauKO/ZRMrJI
fvK/AAcNBJIaplXb2ieibUuOyC8sm8v0w1FN25JrCX49yK8ri/cj9rYyQ+bXYqQLBUv7kMlYlpIk
1bYtDAb99fDbDAxOHOu6xbeKWaSbayY5F+7nDsIjsZY4KIoWn3vNV6mQeA4HXjA1GUMTeWQ6KyFq
CRw3wo2hrnxmyV/noLJxowloDr5WMn0iKEdDoUzSsAN3b8fk2wZPs6vngQmZaewXRKsNCp5A7YwN
afX8cop6KQ8s1dpHRFU/1FkIVEqWfGFMwMhLy4RiQ7V+K/VIn77zHlsl9dbGzUIjAdTUcvjI6aqF
TkuNerKAepdJ06HGA6wVx+twOjh1df4FXrGm0V0L41167h4QAj8BUFVbWKN+kOBfl65h1OGi+sg0
pvxiP5/l+8ZpYI4pMVLqOBNZUb0NfMfj4mE50Tv6DX/90erV5ZmMTE/5MtzsX74tx2pLZQgm2tfy
2p8OlGQI8WjFb/TsVSZX2g1ptrAZhT+2Dj5UT0l9Bdyk0f9x5w6XHu6+jSHy73ZOU5fUfcSBEt8R
OBISd85oB/vQ9Io8dH7eQIL7OiQRb2nfbznhAT9wQyDC4S2kroSb/tKJCTbfJvAyMmqt+j+lq5f+
A/NRtnEgS4lyJB4lIecTX28hqRYeiGBytMjg2xsKfenvI0ubp3+flfJ4jodqjjPMxxR1ei3x2Wbm
AmfDRe3Rnnq1JesGBs9qnXqpGe9dofoAbrQUQ7+kIzsaa+bbTxm35uOjmUaz5dnUTunr9bsWC3F/
NhOyoDT4gPLj2/BxL1uH4Y6uNMo9VEA8IXmxvZbYSCays7ghTVfR45gGMuBWbNnUetje07RZijf2
V986aZGRfVGmVk9JnBlUOO0jgpkGdDq/RA2/Ro0j83mQLgPrH5ziuHoTWC1ehV+zOqeoSk/GOKlJ
LzdGDqg7GhOk9Er8Wiw8QCiRTT1gcb/rrVBFx2cPfyCZ10bBoauSbihehTYLFSJQgnowTFHpaXsR
x3/3EnfVmYq68vgD5JXBsHRee5tbLgZRvs7gliooCZOxmNKxrsbrvQb1gro49WW3yuAlRd1qB1XZ
zfwdlwii6fY5dzyldB5WmtGBsUWtIEvz0kSJ9TyoIPZDPLv0b+P7/TypS21DofnFTLheBZ4kMTXE
4uwZDmhuZzUJOS3HS9vEyxzC7XNwZVerRzXePU0sn6kWP/8NY2H/MUiAxVqlgcF5jdCukyEjzs3c
UuX93Nf6wqkbyhlpEJH+tRDP06sb/BcprwSdevv9XjLsy5L4/eOxylOr6PiSBhVjFUasgOUu8vcR
ignXgBVs9nRAyEgmEYFR4aHkMnDFnuu67SrFAyVKwkH69btBINHEGNyPUtM7Ob3QEZsBa9wcUPJD
zdqtcKtHOQfbq5od1+/Jqg9uiWZirmuB2E6murzrplAAc+TZvVXlQOLxkaTTdZkEe6TRVIHyr9C5
nbL8mFa9TxCJNMo2N2InmtwxEuEHqYpaCTNEGduj/tnq8oH/BHEsMBh7dw2QTkYogwwX4KqNOJnb
UPZuTY8NpiEph52pnYf8SyPErKoeTZp1u/IZAZ0JVScqc3aBOajcWk3z5bobcCBlJO1Q33eKg7WT
zewyZQAJcIXx79G1hx+QcaAp+C+SLBt7szHBq8scKpwnGu9Z1vLxcfblUccaXKepcap/uKc3NwHy
A4+DCVQ+8bF010hwmsxpS47xl/bf7d0qWy84YPCnWVDZWFmT+NErW9gJ4ohzDMNyKVqgXQpo9fwC
mH8bCgxvX3VH9aAZ/IOjmx2jCaUMyYfp7sJ4s4W5C8NxXlWw4c/ozQBvV7u6ZWI0wtqkgAiY/scl
6yV2WgKP0v7LF/4KKhGDUv13Zk1bjsiXyzdClzrRvIy/IAzmMkj+67JwUuZLSQRVn0Sr05r6XNim
zydyn/8lqjaZ1r0UgfhEDbn56cLF9PQvsAosSHMxGtYlv4RBWGkF6bKF2GBEPB8FMj21QWrpfmsB
dVwPf3th+FyFgNA15DTkhGt0/f5SjUOj8r92alYW6OXeEIILsR7laCSs+6ruhMq5nYyB9rPN5VoH
E7KI8zm9t55h+6LGZNUBRH3N7KWE/l/rOf93PSxs+Oxzc5I9TezhAa7f+PG7vig+UdkhxgvNY8KA
6gppLCHdG+h5w9mTX15CqkelTwww8fT1nWCFaR9Wn+NBl5EnJk5dUlG/55373uu9Mrgkr9J+DR+/
2EQ7WBb7QbSn5zm/FVpPbVdMbEoOH6CpVWkUCaoD3r1aQ+JZt88jCjiKw0ujVR/dAaCqun4V0F/k
oxNRZfH9ejdBBC/RQc5y6e0QTwhc6sZP6k5W8WJEeWSjnOsedr2vhsP4ei+7zVuOEfSlpoHLcx/t
TwKflQkGebfLKsp6PPHTEfQr3kjCcp11JLQFVXPHqG+VfQg98pGzx0Af+9dWqM0HhxNHexM/suHf
YXoqdF0TuY1SP/rza2IjTBizVy09yUXnA1rYRjY8QdXeo2yk+76gPG/r6vo0j1mQbHPV+0TD3Lhn
Cmp/6tIcnyToEvVFODPo6SzxkBM+hahGtfJBLbr3kbnAF9KuqIRNHAnloSl2X0E0DdWCHZ3pvVQc
x9WIq1yMl5ZjM/AyFJ12ZgDSzcKzf3z3spjXPgngumjCP8Avu9iRDLzAob86AgJJ8LSX8Du3XjuU
PmjKQRMgJPPave31mXF7pelPJdcD/gqAFmsGCM2M3odR71tfuWJ+b1c6y4+Uh3br3ra3L47c7x5j
VnYszMx1PECCUYSEeFXddqgMlCUj0WupNa0n+jdJSmFKNaPGykojT/GN+K9nnMeExMOsODUPBnWS
D/V0EulBHVCMXMaxnb+gVeVI5x72/NafPIgYJmauhULk2IdrImQTSsYjx6eCR1dbxqhPE7LzolcK
o7jR1NN0/4p/1pR0DAMzzeKI/tEKyXxsfogac7BT9s76OODtDMvh8IGxS/ayiXyW/KHPaU6F99sb
iUayxVVSpGGaFUz6th/gFvme+XZvNbfrGTLton8KdYDvFa/BjyiIH44th67R8H0E44cfU9D5h2CW
sVykx8ttQK5xe8Py7toa3wG/OZJQLFIYWrPWDyRHCdqGZkibJDkSuTam+a+J90RDI8G8O4HJ6bvL
Wlp77th8hROwdcHaCBrmYpWIxq4eiGT2pN2iMM3wpYYJJY1bD/4k3eEV2vBDFZOkb1YiFxRCOuUl
0zPQVudomswMIPAxnocZBZwEHlM4th9EVRYYDd/VcW4mgBRW+P80TWNchsk+UmXJvWHhMawg3qhK
H7d9BXVI80BspgC1WEHsKlGsrcRZM9tq7sTlV8YsAof4RuatCvVSnsv2xdlEruPoOxc7itn4GG0V
IwEGFM2hFlGyhcC/aQ/6oY8Su9zln9pQevvQ5umF6MMZJRmr1cTQwgIiQPm3c2iGQ9WUmgqfmi2l
pbyQ1pQtxfUOIgLz33HNelDMz0hs/zJD4n0vSfYEVbTgmg6SjbRdSM51F2D66nM5FJv9YSmMBzuN
Bw0DiUK06mWRxxyhmklRUEwZwgIolD4Iv6A1yB4IiiFrZHy5UbNUczSLbkYUFCXAfXnFLnmbf3SA
g0VKZxd5hz3Itjd0+JaFS/Dldo/o+qJ60aQUM7vljHHR9EF470Vx+zzdTit1wKidr0cIgXtwTYnK
iOHffuI5Wjvrgy2Bi/T3Fg7Z9RmyHUiIXvdh5PnAtsirjcL4HlkGLKeT9AdBoh4mORAMQv4lZRCZ
xQw5UlMRtZMuZAQEZ4iAlFDITr2lh9iN7LiN32HNFJh16hN7jfYqctuCnLQmqKJbMO6ww+LoC0Zl
OJbN9jf5WcasHdpztFXhNEdYPVbsL/br72XDjs0sXEjBFvSdVSRi4R3R86Z0ZbrpEKfBvCFkqmi2
LekdYlkllO+Qscityja48gXNZ8/hU+2Mtq34Mi/iWPGDUt9pVyX3ocCGqE3ImHamAvaRbFY/9lhF
dkdQR7L0xyrh7n6HrpEPEXStLqaHW0G3o0sYHYsUQnyJml2BoB8sSyDaTuM19/kwE1MSJWwTD11Q
LWE48sFXKvJ0gbJZ01ZL0g/9DuyvGGliOvACawU4WGz4qEMj3SZDEZBmXbuTETt2gXmxn+XPWv8W
8M6WEFE6gM1TzRNjS8yq2rMSB8c0rTkhqhS0GKAYTB1EQ5OUIlML6SLaht8+RRkg7+fT7mDvlXjd
pMEv5ybgVNVVP0GWETUN4cpi7/dAQGuU6byzR9MdcNXBsQ1IKknKCBRDlntg/IlJPkFxRRMUk3Jm
Kym/D8n5yAaDojwY13mt3bNm/JV+M8jBRez6ooJ2Y6Jzq26b4tp15X8pnJsW4ocmLLvYSYQGWrCS
qYDie17zPcKo3JJdsu7o8pjRGY+If8zO8O/6k+m69K9OSloPUCYWlWYpewwh+EYT1EqpuSR2ix4d
nulItMNNrqKIgLjObp9LtyMFCXOOJyzN0UkRs37Zv8h6mmQMTHWtwsaSaT1bqqewBdvzNHiBSlRC
kNYb5F7T4r319KzBxzusjg+Rzol+irm9doeWLEYwXYUjSiiaF1MDD6KkrDAGcgZp2u8BNMWgW71A
lSMmNthRgr4rciv5YwYINo/Nqov9JHjDY/95EIhCUNSx8Noseou2gzG9p/sXABBLxlUxaq1kDirR
5qksNE7S5PY8lYZHUXicBUFiLuTHsIVj7pRFh5owlKGA4/2hS9qpg8lPuFDG+ARBwvrrkiDo2uZF
r3pp/2eYTKbBSi9VdB6rW3e4JvhglH+TlIlcpJtJx/9eepR7cWFrVEZ4EQAOkajgm6bEJqty1NWo
4+ILD+1yfOXXHBRogXImgwaROxmnDpYDbykLFYgu/yggIzAPXKpdqrfXKYJ3MuXcJfqoSgMGu7FM
xAxzOhqRNJyzaftyxBq004nKUbXbqps1xOE2F8/tYGlvQxVx2UWndcWEklb0L7Prb5eAUI81Zgf+
5+yupNmIzIhtrIJbFFRiqI714045PzbozS1WTG/nVw8IrgtF4GI52Bp4RB1+bPTO3/iiZPybRFBv
EXHj1fSLEb68/In+T0NwFvTkKTDFWxLh3pW/OwRLgWrft33D3ayQ6Uaj4a2CzmJTcg/tCriAJJIo
Qw6/wPo//YJSz+bZ6eCHAgyTlv+OJbu7P1SBjiX4UmBkpg1oplwlR1oBfED3sGMJxkuKB8pJVO/F
ONwI6uW1NUAEZsR5fKYEYVxEwi/LTHkg15RQzMJhqQVDe5p0l8U8YPod9LeEQX2pAc3NPX+CaEz0
/PpPbcT7qoFgcNumZ+4ZpKj8kTE4opBim27RpUKL5BkgRNGYuWIRqA0kVCQM8rityTQ+XLlJYaKM
zMOliIOmHwChza83iiOqQuHZPMpXz3lo84VUJsRfqm7Wv83ZLx81DrsuyVGqQ+ene/o0egWNyJoA
YIS4tAz3i+6L9p7RNf1hJu1qXOd2AVzAQ8bFf53769fV34QgdRGhlRbuWMXPHZosQiop+4HqUi4q
GipIpQ6l66shHHLVp/zAy1bPJwO6CTJCFi7XFMUStSkYgN9G0O9UO8IVgI6QBbob175s3szFjDXE
rDk9FcpMYzKN9UREPguo0JB8eWFtYyeNnOnD2c8SrkU/cPqPZ6li6D/FZXcM1eu0JJAIYF+qgCnb
OXu/YHF6Y3LBzYu67glKEdTYnT1GvuoO/I4qTil5nCqlfowhfoKqWgYICMRr68YUnlp0IEyn0vwN
kiNm3xI6dWDHGMaFau2DxBrWjbAsNWjDD9DI6jd8vzCY7Re7kVoSpfKWujAnc2VnIgMrf9ph1VZ3
ri5GOWFxs1+ZP2EkjqNiUZ9Wzr0LG61iHQFTDwsQ/ZHJ+yoda+uWC2qcJzJtVhezuqG50TxIhJXJ
n7f64poNDePcfIycv7gBsF2Rw9e+Exp1eno9J07CVZtlnx6EcPqhUiwTHV1rvyu4Bj7bcaQ5nwbq
AzLO4qOcFZJ3Y4na2wwG/unJuEPWrOwjues43wJMq1hq9bcyoq7BXT9jWf5o1A6Tfpstx/x1HhJH
nko0Oot7jZV/MfZ3j0IDQQq/njSspoDbW3Xt6yfq52d7CLyjfehx10mZQ0i5GiDVjxkqrsRK2386
RZIRQ43eavIN3XvQOx1f5w7eBaXzg220yU/RQPwlqacu24cM6Elmberw3ktDPVvVUYohMDO33l03
3NeVpO/+nbry3n4ktX5rHaTOnaBwf3HbAPK5eK1sjPRE2Wnt74M798H0uZIHm/Avb8+DIgU/O/Lp
tXdILIs+XB8ZPG5RI4/cfySNnUpdKepdNJmcnAMCFBD1tRPy5H99waoVsjw9WrfyAoc+Y4e2/P88
MP/civyKaB0Lu8Mv+C9hjeXhgonjJ+Y+6V7G+tRlYtNd/Z7N0xI8WRNWR2aj5lSCALQUDKpy/6Oq
PqwdIHRdRU5I2Sc9v6zrjUSe6mROjKoWB6XRUU9EkGafP7yj9mESwobj7QA23UY4Za5DsDvNil8s
qPLKSscd0aMTtCYr89xLqICKiJZzvoyOWKcYS9qRBZ/VdxVJgQ1PRWO/NOwEVq1Tl6CHhpmNfxVF
Q9FINe2T57G23o4Te6QaqEMQd/bG/3lmtsoswdNqXdMQvUDR2KoQDsyk71YvEuOribNMWtqI0oHw
Z8+X+fuqIQj6gAduVjwsht7akp78d0a9Sn1XPVZtLxuDQ7O3H8DPYrM1xYVqW8FLSZA1VGZIEiH5
67ggcasL6fnGgvaZNEQ+ki36GNNNylvfPBSy9zZgchjL7g0NocLc6skB4C52iUWSncHFpFsJ6bQS
1n0qiM2a4Qy/+pNhlQBNAFapJcJCkFParYE5390XLQGvqyLbbOQYxa72BCH8c88ccoKqyKp8LaiU
tMsHeq7A9IxXn6Wu+6T9ehut7zEQpAlHF8JdrTTMB/3Qu6oDOji3p8bRElEkFzzFHqevR71qfL7P
JRCCtwbhoue8U57T9e0Q4TtXn4SLY6RViWIFrEMrKxh7z0IxFVniR+0HQIifeqMEJWDZ5pzz6TIc
8PZm9y80lqMu+c5eKuBeGjEexTAwMck/GQsFHcsduJYSLllqYPg2EBlmmGOhKQ4zQ/BdevE0hTkI
ndqccxDB4tCCsh1NdskKDTffYOliQhCXo2jNuyFCcdeE1pEhi/bB+NEra2vWxA/QURZA75v7qgj+
DdXeMJa6WotIaUmeQY6xfXnwSf3peRPZ9ncdGPg1YovJ0RgMfa0+GQlSLDwzEUQhKFOIfmo3fozn
IOdYc+Q0ka/z15Ot67439Y1F/ITOhxqsXjgT2I67kWXQTADTFYDaL4ueuPhUD/6Chw4KNXSzphPF
JKb2oD+dmIjMCBiydnQVWTHE+BlvQ7j7NUQIOagTaR8399YAhdXs4VOaMYGDbcCy20qBR4VnE4bl
kn1HaxZhRg0WFvCG78YYfmR1SUiVK6uE1YrxgA+h0NYfAOC4AVuiywAN+JiUXMkCfx6bHYI9ApUZ
lKJeD5FbZl5ojNQdH0VQGXsMH5WCb4oGuKdz/lffzI6NBL6rz9xmOvw6L/8x3ckA2p9/Gen5Bg4C
3Hid1ud61cUAjDrTS6c2YlgM1WGoAs8Wdvk8IiQrFEpSUP7SWByqpQyY49D/+mlQ527vrdO6T6QD
0md+7FBgBQuRdwSzuTX/vJYKvU0jTk8bHKpgS4WVpjOFjM5GhGu8mBU8uwOJvfHPLu601IhMg2Ne
AHs1RAk7oWa9w2OPkhuffMqKzsiXUqpvTVYzC6IkLrnLZFWcQgvjakAz/JElmXPXGkTsQsFrhTP/
2+9dqRTy8rOcrhVDdr0XaiPksUMf/QWb8G0P9cAxMKFbwvliqw/0j8HZYjvuf5NDLLduSXWVGr0L
dWsZ74Wev8LMvIfBoUeHcuZHX0Kp8GPccaqlv9K0QoSGo3BRyDn5B60H2B67Cxij7BDik81fp9fM
5G7iJm5RbjjuqS0oRO0QprY1JoUt5KOdmOUPFcCauTXNeoxqkavRmDOrP/jR3U++RQwogC1QvU/7
2ukvbYzAdFRtnDkqKtn7RfV67njm6+KaK5KDKBK8xtcVw5AblQLithVlk3qGBJO1N6xrTy67kon4
lmpKayFayeeNNrR6U8qvDu+GYW2QIqFDuTNpO/kVGPzPeX57fnUlAC++P1kTIvDP0zqFVs9TUfLH
ATdSmPHVLdJgnm79UHX10E/EmJF0LhzfWZcJc56/YAEQeFaEeZZQzpBd/9HrT8Xf5cBtvCFo9psv
gHfCZ4FWFa9WAuPh1ci1cRArWORaFMSYnFwQ9GzrdiN8na1Ytvs17vP2dtaksOO/5LeWV2ymKf03
zCu6PPa5d+YeNr9XUIEsEQa40K+bdkBWf7DGJAMH8SyGRyAxHmB3+4e1bbGxiyFFEsK2xigfob3o
49kmXgZ9vPxh82W/pyow7TjcpnhF/L1oNcrCLyXXqMIpGytBvwysHO7vN9Z15BLYIm2imcy3sscc
EY0YSp0eUN1snW8lvsARlIyG2ZKenvWnU2qlmnwFJMWVecamA2bNxbBJncUzubfb3ApS91Pm2gNO
shctz0L3PdwtVhVWnG5rpinIjzpZVU4O19HRZO/8DFg9g8ybb9Kdi+ivCbeObR+hh/Bl72qKojqX
+Bi4Av3VCtUpt+/wXKjNuVIt7abF1CX6LTuhtdHPXqoJljJrbiXqYVBt598cLHDH/PVhVQoBT9rc
GKdlhUL0hva2OiCuhbOZ/arl7kp2ip74KRMXg2m8K7K2CRrUjvwv2/sXwFdyXjazRqS4B2/aEoGE
0lPcuYWgIEIDsn65SeupGfcjS79smJcLDylb2Qlxrnee7t50er/5QTUX0YqnH++r6L/ueby3BmWS
gGBDUpTp8c5qoh0p4nCh7KqmvDx5QtJjgPy551CHr/hTG/bJ6VElztoa2EZcodus8e5ZEAPN/q6e
tfIpaETHN2UDN9el5SXUv6dYy/dCJWCaMnIzHHu/N/skbSPZqXDepse22dkSGVfvhYsYS10FLc2h
BOyuj2hcfm0OVApeAOf+1u/bV4sZYoe0Ljp7a1iGKqGzFJHSJgxA06/asamXMwQHBuqA+hKOlKLG
CEKtpc4wMCT+lgB0aCFxF7BaqjEk3CTyPkGo/hm0xAPq0YONuEy6XPdya1LWImth4+4clrRWnvjD
lhVTWiP/DaogmT94hjPTn1OyNCkIVdHVh0h3ilbEc8kId2Z90lDWuyh1SjdlsyxRj3S167Vs5kx6
Ug6DL1y8UD16+CduNfpmZKcXu4RXdnBvXjLQlJE5mCzw96OAE8wCH9Cu4nCP6btBYQUFR7PoIocc
Bwgj4pVqFLiPgPGHI1IYgAL6y0n0ITriE6Dnq1Ssv8uPy6HOCbVifkhyxFZVWzPOTGM5xViLt6r4
Z9l3hZq19oIar47tbvfAhRISFyhrV9QcFPHrxZDvZiL+gZ9SkPQDAWS7ZySKoIgZXJgyKL1w6L8w
kb+tFZQrAIdO1n9HOr3cxDxEbCAW0pAZEjI7r5vvKW4ueh847Rre7JJDyfyUwqYOHjirA7W0grDy
q96iBjC5N2hPdljbk58bUHOyf31M6kAXjja1embwG2Ll0M3+5grwR3VtvkmhVn9Ii/dc/mi8dy/9
LsulQHVY35rAT9ejCeS/cdHgBfYhc0YTC72fvtm67//hJMOY2NjQLV06c3T9YgSpBYbIkckvJu3v
87LjKWNrZUeitCMtO1dS63wIvcv7dYjNuo6sBr32b9YFPUBoKDX3wk0p9jyqTqMrdxeIZj74ZWXM
lO4h1sYVXOPhgfiTziXf6+AaG/N4ISfCP/D82qhiicGj/vYBGRK9bOKg1KAmtgGpywu1e07jKjML
2jmPSzKSeuGJ9GHq1e2eXXeZLidF55WlX1p0jiGotC+4kzQjnbsL8ttBDu34czF/yI/DMNQ33YGP
zztrXDUEUzse2FIGJKGNLULMRn9fq+8J9hEQcmtTPISHvv55fuI/83n/ROKn7ZpvD9UcxY7Uc3xv
ZaV8mJaYixx1bzi8j1bnEW02mPC36JZAMYdLVHvzRngV3XlpXeqN4lutEqbABAM3D8O0igYhV/JC
1ZDKAcCIlYALpmOwigebePmOPyg8dVeF66nfF3AsNhb3PbFe6MN0DwdEpBCUv2QEGU6t4WIo26qY
UMrciZiiiHpa0UWBhPuaSxZ/dJfVSybUzDG0HbwcYgLkMloXKIIXC/SbtjjceqFI5AphMtS9ssag
JTn+0JaX8aSJUvztaf5ltemVk4t5QmAdAQJNsTp6TtsmTthQD515fffM04gt3b98pa8OVeaPF8N4
9U1jdo5omKgcgxgxgf1B5X4khy2DfTIjYvNsshiufz5MoGE0I8OhamEf6C/U8mdWUPbiE7m/eyHE
zukjTevu+g7WJqvg7d79wcBd0ca9yjQY6gVr9m3rQh/afj3kQy4k/T/M/YMzVZjrIP3Qn+M2b16I
wdifTwHdhlEm96O7i8+xVGiwGm1ZH5dycfuDA7m5ZqyECP3/3fSzltLngXYXh4zWTvniVNbsRS8o
rF6vex3kjTQGc+twB2i3IJq4imSXLtHmHfWU0WtORC/iiJiDfsLzgeNP+qwj+SSCHXPF/VfzOaMO
yGK1VsJJ0xZFxvIEgnJVV3EvuQQ/BBdMVEbzX+iiblmbFNkF97rwAwyvz+ajHgEbbM4l7bTtP+Bt
n7i3VHeMxKrlNvRlFrm59EqGhBbb3L5kDbmmtZY/RNISWCBqgbGowAFe79GuYZ0lTn4pZrD6JHRs
rnDFXYtYN0RP1jbOIuXYXU5eXQFVMDraaD7t+ooogx0XBleDOYpZxq5OcADczzTzghqGpmWIJG6a
IVckViLD1vCVYi5KV1f5RlOAU6F+cptC5Xd72IcbHYVrgsjwXW94Kwj11ND1sMf0JyjoMZ3Nwz8U
Udvw52C/j4uG0t+87Aymy7nruFulVpf52lNaQr+MFAG/6HVSSsKOqrMcMe0jZgJ0VJLpqn0iSnn6
L4vWpdH1diwKTjtq5WdEtGhlZD/tH+bysfpTJxzMnkKmiNdj2VRqlLHPqXxphAdMKtMO0xBHSA3O
/Z4vEQnb/cmt3oEi+NvDNgUAsP9FDVpdeHds74BafyPuoUIgYG+aHlCRfh74oTGFR9/+2KVIx2/P
FDAM45y3qt1VjpwQX9vTMYXV07tZbzHeOVIKO8tKkKJRJCzGVR2B6fO7TBE7a4rpkioeqZP9D/pZ
j5UzpDf1+p5vLo7uvTPTr/sq7FEXrXR1zkjmXiECXovDZ+wupCFk65OkGgFV55bFQTC0JdIR8jEI
efCv/lBplUcXTK3CM59M1zhz/ye7IT8hM6C9eOIRrd4+jftOXaHUpU8zTIVtYJ1dgXxMZz+xu1b/
vJXOWUC2L6qKa2gKsZfi5zKYd3BCR97zpgWf+JNviFqIZybqb2DGywJ0quYAEhJpKrnphCcc+NqP
j4eoIHfIcd1nfgCxPwNGbClq9JYqd1fnUJiz7QXoxBup4tdAkNy4ZXbxbNnoAR8vo159Dlt0U1FH
5Pf9ECT+ukVtU4InAHK7DjXIcbi9c7BtjzBYy6gDVyUvJSKsg2dgk/OOvy8TYhJvXXqeZtbjXweh
EO4ihBlaT/DLHOpRkfXM8QqLgZa2rX36hDkFWuu9q7RsklnpuMC1ZsapZDb6JrU7+nWzXY7rm4wS
FDemShduKzenpKLr/Z6GyPPQzSFg4qjAW5KeZYjem06zmzVRMUaklajLt6QFGh8EHrT5NQ/h8VNa
zYiFaCOGt0nS5Wz6ei7vBuSOrha6xCKUERHHpnGI0YKzX+bKJVUNP4Q/q/uvf74KhDjAvPmbxWHK
CPaloLjojgWNJZdyh7iR4ybmvsEmZPB9ajaYkg3hv5Ikb11rRIMLwAaJC806Ix9o4hhPaMSNjkoM
7WwyivNwwHip0NSE3Q8pzL8SZxLMZj/+GELNJSxRCOFY9xJ7lCnWyFLMS5yGxg6TouOkcffnnfs8
Aejz8qWijneOUv4iOC+KhCWzUk6Wa7IPV5obUgc/+6Rm479aLNNv+qlCj+Sr15qTcAyoHJqv6egd
xB38RXVYO3qDLmNHMZ1HhHIqEdYX1tlzv4canqfeewjh66+dB6cg38p9CBb2313XdCnAyl+lEUt3
QaYEzzJh+/tsT68jq1bR0f46fc5G8kg5YwIKjKN9DLU/SAoMd9krHQtXGSRYJKA4gfjSlJ66MlaM
JDE8Ua8YTWT3rX/JkhlyETdcsiYyxEvseiQF0b6TFfvnu4UomwZ/f+sid5BXRaHugZYW5XEbkpf2
S3STty8z/cBl/OQ1bIsYHvu/2x6WpqjjQmD34Ftgjzk2qLlE+P8m9dJcXAGzcpYp76qbpP3U0lza
L1jG7DkRQL53/la4UhO/sgls0K6j/fFjvDVb4zvV9lIxyICMAWhIPb5UUE4DUES9DoQCZ97QN4xC
KzFksK31VcsEykWI2khkTSYYUhPNGSCSTcEwqiRitFIwVPUEtZWVhV01rIN3vdrry4nv4P2kVr1S
Jx4ZtM5OMlJDm5EKSbx9CSQkvvqMcEXpH79prLgAmG2VFjRgYsz26WmDRWg+7kUOyrVJb7OyxOr7
B0bwiShy0SdjxMLJDmnSL49JA45uLhmjVcvi9pUSngPlXX/feow5ZVmS44aC5zBkQ06NJ1q14zJx
vhNyvP6pUixDlSxglmJFVVy8zoFDA6gcecREUcgStv3SsyKP2FbTcSJa4ZAyGuk7oE4yBq5ubVXj
Kjuk4ZwhocG3Ge1+fb1wsfp4Rsz4faVqG8AmsEvqPjWz2PEPacjRRikfqB4K4OKZqTmm81uAnmjA
l4ts60DgHe5T6mnn165eMTsWjFkotZoZBeKU5y0zSGRXPJ4gtIe1EXxxXv2YtQg3nVOLwqpgU7fL
5yYSIZmkO/VdT71WxW9CiwD9bHMHk6mYuW7cVEa10AjAh/12iDz7LaG1Vmj986gfetpKlmgYdyB4
PwZBOKxD+u/Nzem3OZTXKfJomaZ1vn+qydui3rNO/oICO6UUJnHw8U3JM9xoqVoPqyuee36lPRVo
51t92li0tubAWJ9eCZBGwfszXkGb28hCE8SsmfwK5E7zxIZbbQ/DEoBNtMYdgVIk9wxy/GKB+2ES
6Cvm/JiIH8PNREU7tIm+fwVW2xeDXkrbBnLqu4qz84i11AXmuW2F4w3vSmvFW81VlBLljtZXk6QC
cpu1Suw6tNMpvnUB5ZfEuSJpMoIwJaRn3bvGGRzUWfheVw9mzwNZU76RuDpQ7hjccJZ1JS1+4HPo
W7csm7nqC4YApfIMk1EP0ICUNhhHlqEu6+2vd4nAha/O/o2lkUnyeMVW9XAVGN1NhdtzTNe2WgkD
DXHYBzviqT9k117VK/7UbIBFNfGjYgeW5Xy8he1anq7CkClMawWLssPfjiqTIMJP+queyhqMsESY
WZt3/huIgchHtYv0bNBfX62cevvmH3UQLJejb7PXJmU1BZev57o6rEahbat/2Et2mhn+G6WOP7P0
2TM6MBwW+V33EPxWSxZdmKKHsb9uAS4xuKc+zxOvQzOov4iSMFAoN+Ok793tqTDGdN2Rq4L1iBHT
zzzZ+6yEhmMAEWXdDnBNbnnZID9x7RBOFHOHCEp/5xxVihrIiyKBz/WnHXQcM/queCXVtNRIY11/
tJUr2LU0uC6MlJ1ww/ki+rcRW0DwF1ui5ur6btxyEKzKDcpMkKtaKJdGjkXHte9rckV+l5Y0O2WL
J5ZNTiqy4u/OTSEWbej5bRbFP+wXaaGcL7UHxaGzMRMVAyd0GQkZCraoveaPZRjh5ri29QTacjOQ
8gsJyZOs/NH20tBDsbyoyR4Rm+SPdU+8LCmo5ivKwtEjwoOgVZ0PA8s0lBErWg/1jUHzdSzkgGeU
LrF1fogBNpm3swAmR1mAF7lk2LGiWtZii+brQg6BLnMG0vscHP7ufwAf5D16EsDJwNgLf/qAICEv
pV4xaArSRP4HIfg/d4sKMVymCT+Wl/ZgaKI0kOpF/OPFA2jWarnRDSmqru01gZNIXCL9ggI9+42g
g8xITs8+XsNYlwc8/wPzwW1in6YupKAVeUsC4/82NvEih698hTHgo7NxsqQIv8KylAbi7TZUuKCj
X72HFCmZ4OrYV7UsnDEQphdpK3oe7ZHjrUrT1xEHdufUgDAhLwNUsh6yLFPk4w0WXgEL2O7KEgOf
AzeoQa0VNYiO0aZwnuv/OZh2N3/8l29/KNZrCe9UoAlnIrL33I9+Sbp3tmeW2eVoFRo4b3j8KYLH
aDg+L+fViyD/7DWHeT8ge/39CC0jSnhIhc35q0GiPButYJcimUgxt+LNwc5q/LyMMKIYLw54CDER
Yejw2tcAVBDrVJwnJ/+eBc1pG3PxK7zaHt5Jp/KynTw/qK/rytDp0RXb3Q2nvX0Dn8KMYB5R13ib
LweII7syTUC90D0RTPmHq7BjJUFXYO58mVBpjawgMG2lRsN2qRH8vvisgVqv3Sjg+1/wexxGUVwn
Xs39/1y/n560m8UeNqHyL2BToER52ggfF/oxLn2lg0JhG+a/ItdnqZaHXFCiFEo0Syjgs/uZNb0q
qWDGChshkW+jYbIfb1ZWD72jespHQLLAMkZW58W/z5tY9an9jkvHVCa0mQiv3G5XZoduLDMIr5Ep
FPErnEQdSaDctV5CLv5zVb+nS4se+Sn29DktnKLoKYWDfv2nwEBF8xtGXLXu7u/BS6FA0WXxQPFV
VXwPfL9i5zdp20oCnq823oRCBuH6WVeK+gLJIhvKR0fETIMLO7zw+ZfsxsnuvJBhe/m24PZcIqej
mFAAXSpKYx4mUmU5FkpmHNB7YJCo/Ar50pc60oy+tQVK04GRlegekkpfQmKzE7eK/mNtGLNYjOi+
KWl9PIlNWD4M/7Rs/SNoDIJiXq0lSS3S2w6wmtUgF2tFIRfKR4soSUvQ3soM7zJjUqHH53SjASV4
ZDXp8wvdIvwVBzsHhPl975/v6s76vEm8ZQDC7OF+tvBkoMwi7onKUX7AQXSpUCEovEOgM6NFSaor
xRVZPluYooIw0/wPAJndY22UI+A0Cb19JXkNFE1mzjKkV87AM/98cygNIqWCN104O/82ggXawSYM
v8l2nfKz9FvqHuMFDFnQ3i/uWEGPN+rYpt1U+RA7WQ/lIGbOW8HPStJyWJsn68KSLIR2lztUy71S
tCyUSt1pVZGThCIND+gFcdQ99xWQ6qYGjNinxvGnaNrOIw+YvNjJSxnNv7nSaRJ2cbO8u1MyfrCw
ZUmXeAKVE8GddArfb4AFymVSw5ZMS2nLHexbGFs4YfMsx11djdW2ItZt4XDOpVeZcqv3cxaFykCI
Zw0SvE6X5kf/KTVgzvkuZZ/p73+tcaDkwXEN5fVWxfi2qsx2H716nrj8pIV3tbQQz7ZRmBnncjSN
u3WjB5CwqNplxeQ5X4D2kCW1kOPOw2Sswr2VwMfu8hQmweMYm8TzzSRkGCojl+sm6AnsecHboyUg
QjaHThttwOOd+WKNdlByvZ9WRrODkIwellaI1LoQXbjmb3QolbRxqtewySQG6E3L5vwV0mgMwkCK
RmWYMi5NpRJ/6fOe21J2+DRRgqja28h+brJntrZLx7Oahseh/VRuKQSEC2aCgEkuNGOnUpSI2117
I4f6nb1IFmlJmysXimZx5pXlG7Q3kz/dmgdpzbNTKgx2eD7XZqgUOvHVfhZ9zszHV1xXG/nxiyTe
PGe55BfBn/Wkk63pWTPUZ7WPGxxCpbtGwyq5ZdfDJTWD9SjJssupCSOm/axNwWcfY2Iq9woPIoCM
j0Vf4k+sKpmd7A/A0JA3ZxtEqbm5hU1V+qTPrgGWdBq/ANhbsITPTxK4fsveqAnNoniu9X0Nb+Bj
q55bg2AyAAMcDUJ3enmP3azcdMidoZu1vUYwNrvyMzF062vJqv7vpO/fy+xHxmFwsOEg8idzNcWE
RvJsWX2xQEMacX/+yI7Fn1worWLVk5h/vlZzswNTPuW0aIC1M4lh/GbfJJ1np0vXuh0NkoIMukXv
KJcdZCr3gQYVRopOPlt/Oq/xKRlpgZdGPQHNq1v/93Oz1Oo6/zSkNqHizw/kHTSZuXfO23uak5n8
2NT+NN/KIHJ7qhSx8gYc+suLl5LmSjVSL3M2LcLTJuK6bzYkPKk4C705lzLaeoNs/H42Atp6nQos
FITNJWuppG5pTisgAYQuGpF9NMu5T9S8LGnAvY9c+ANV2rVlUMiYplH4JoBfLz5L8bHJHFRSoogv
9XolYg/Cnt0ptly9nSa1uXKToi2L8MSRSQIqfDVOiHySfu9o6E/uRSI5zK/NVc02Z581+eYs83Xw
DIPi4IAB0iH1EiHp3tzcCKSO4ReNXWbubiERBFRdSWa2kU7ToQKKvFzZCytres2LKke2fmAWr62E
wVMbNeeR9rbw6MetwwAQL3UY5DEMiBNUYhyU7NWE6cwJtL9EI8ZFtF4ngtswCmDFmRXrkV1qINeX
PCq9WcAhi2hu+SVPmJD2CxWmQ4x9E8XMMkDpNdLNSZ9UNx1qvm/qydMHYPABNcDPqGHlQwqpvyqT
TYknMHCqL2XsQ8P/BmC2l5gCr22SH1fQN9VEoQQ8D9x469p7CHVc7w4r0N8ixz/xzUMBd9REGRYm
hK+FTOQf2grtLs63zc+TjcAdl/yFD7rpVyzwkMJvt37A2gp6qrziGQw+AEPJesV9n9t2QLbkdvw0
6YVqfhGoALZ5bCMVl2umV2i6xqrtOVe3YrIyNcOw3sjIPZrM81LUgWQd5gHkaV/S9JynHAYZeXP+
WD9/cB3PHi2MBsdZ3FsgnHhJmiiMP860S9eGeK6G1ROXmDUV2HqD6JFpa3UvKwEbR5T46aO3txkm
+9vSICH9emfhdGvu1/oXxEWeRmSCo+kDGxoS5tiFEEcBk87k3Ll3OF+wlMOvhJZYGUc4q/9uIssc
sOnGkaL2yEh2p4fWKSrtqeLfr93mqdR2lR+xLVLGkhhRMfxYfUc5YX5Y7nb4Xo1Qb7YfireZp4N/
gR4PeS5V0Q2eHNrAdvKPmDhoOCQ6WvN+ViU+MpTQpAzGYVEwqNn5AJiUOxNH4WMm2Y371Z9cxu33
/Vi3s3MKw6w+275q8TcS6l+dPLh2mCuq1/RxmojVEg2KXCtkV5JQJZ6R8Ny0mpG7BsMIvqb7vNYc
gn7MuWkL36Tn3MRIA8+4t3LJA48SICjIHwqEGDsDphUgsKgIjfAoplcsdYSEfYH5vJg7Wg1pRBRx
JGwQyxyel+DW+LdZ60orOeDQJK8piy21/b+FT6Bs4UZxA+RT1AysHRbs/KBgkaghRk0WjusAUwHT
+bhu5fZN7TZHw4cO/0owFZAgoQ3h2QKuVALGYSkaND395kQfwDz6W1HAgAyE4XI9oJC0zKHBvstO
nhe1Wl+DEmOPYyOzEsL6D+vjO3gplIE+0pMIbe+YyLnanVZ6ng9O06w4+CAOXUA7KG71JQFaIerI
VDtxn/i3bzRINfGkJ2WopLZ621bjuwlXdeza0A1xRLQhqcBqoZ29SL2VSpoy840JLLLtz1iWQWrQ
rKs1UaRGsBw99QaCX0WmhRPHinFywZggWM22O6Z998UKqpsVGfAc8WXWvP5Z47KP8zJaJ++i/1KQ
QIuyIahtLG1F3UGfZsnnx82aChvnknGA1rQSaCdtks1t3pCvxj0G/wPyO2uwpbQ0HE5qSx+xMCY7
nDosRrpBf455Odhdlwqh0H5/4weY9iyYTyVUuYDq7qa9eu6TFJ4ZSilMMPsNaaYJXYtJdpuDr7W9
Wuyk6BZ9A0GY48Ol5UM5NBI12jumHOWLqeu77b++JsUiIzoLPjhOqYr2q9fKkilCYrTm7wDvhcMz
ZO9WbaM1JCkLQiSu6K33jVWVHFkVeO3JIIVbccXziK2jEnu9qn9HQGO0WeuW97xo9opnLN4Vhx22
IV07j0UuUCpI0trR85OFPDh/smBVNgGhRXMv+2a/cxeRxzOg+LdqtZIfLN60UtjOhBQBq0US1vA5
QdbvKTMWkRu3obtMeoP50pOobnZgH5iXPYWwK8YWQ8qYAOozOsZztUgGeqaihEc2a1pqBkgJ+YwT
G/LZkZi9VmseBekF8RYqJpnuXwwaZDzz9YquGTuDnmk8bf4umlT7JwMp3+Qsr6TbAYoON83rWs2q
WG0qJXw/sFvxHJ/mH6PZnZH5N+Eq634ovTQQgikRj2FDDiSXU5m2iZc79cfryuVOyLQ0kgZtIJ7d
rXgI9YNuo9W2y6Gmib00Ds2tnfTDnkciFCvX4/zxk8ig++SHzOMHZdgvQUyTA63VCc4g/RmCcHXZ
iRIfuKnzFsyiVyg1D2ddjwwVqCu3nV6vWsDi9jEi269ZOg24TDyQdyhhiisbUrTHLI5oW1MeuRg0
KPd1s3XwUGoswaAicG+FlrIBdL9a4rfpjGh34PsRLvGwoztMlAXX/bHNa0h0ulDTevr4IF0ari8d
zCLFox7w39pjGFX2si3U6RAzf+RML+uj1AmCHQ2n+pgaX+ABvfac+6ZylTEwP1BLSv3b29Ej6BQL
m/+L7tEiNcP3ilL1fe7EkDhzgzq/yBUAVqRvwsgZE4cW3IIP7QvsjZkGHRczfYG8pNKgQSkPN7Pf
ER+2rO0OuMrq7IHpjLFNtseg4IZB7xm4X66MS6uj8fg8Mkop0NNPvcrFkTWbYJ8itI83Sm6QPEHc
G8Y6v6L6cEyR2BrGoSbTbS61BpR+pLR7gDlx7Ac+zgW7qWb8HzSEAoR5FSaGgweAy4OYuJjeOF1W
n9FFoUrrHRheehU7mhcDNaO3Vm+Y0fsN/VD4OXcVypK6lO0F59muadxVMoDEVASI0n8+WBhm6OvM
SnwCRx4AZctfqpy0lh6gIgHuWCYTdsrW4fKa/LmtypG1WmGvO1G24PUM6GOpQyuaxfqz3KGPiLmk
WzqEuTegzXme/0J2iwgUGWW1gYB65DNzqm4YhiprrZizsRPoZV6iGcOkpzM9eSHIuHvrN0Sf3HxZ
U6Od2b4GBGvC/6X2DSknK4Ocvy2ufUIpq9jw7AlAtMiJCuO0Sjv6HseUnnD97x3pkhM2kYklC/hB
d2nTHpd1gcWEdBc2NhnhZVqHPv/nwErv7iw9cBaQCfJ0gJa22f2FmdKIvRMt4Dcs/J1nZh/kEUlT
CvmxziwjO6PvNK7q24NmkUcUyAvBEOoFsk/yWR6Fqgrrb2e9hcE2QKyB+5Rbb/Wi9OOHsCJm4xQF
FDa7VhS08TgWAm9qO+oNZf8Q4yO82dCI0nzOpdSG2wI8DTouUeyCXWpBB6H8JiKl2Yfbkg3+Z3TX
/Ul09zWpKGN/jsFlWdUjGqEcDU4qUxYmbCQa2IvfQ6CdUBLyX5btSd8HNgn8b8hIcuvnYRYoqv8y
8roOxdo5/oneJTqV8P998fZGWIByb9La/pFO7pZeF/5lBaSkGNh5fBVCvxXSkMb+kJGPe+I7gX/1
1s259/m6qroYl590gQHdW7+M/JwKcUKwigh7q87+QRmkYw9qb11c8A/yFuEyQwqHJsC1+39eapSX
ncy3Vg5coioBgp57LqeSv5/kCwbUBePiEVxZ0EWTbIs1HLH79RoHj8N+UQrT9zb1xvBMUO93Z8/1
NwaqGnx0zg4sjt8vy2EKTqJtX9Apkw2vQFXO+4Bjy0ZvyWa+Aa5AwA6GqdKaBxzfI4BKATLIvmuL
6i7nbvzJFHFnEyNBNp7OCfFLG8sESQ1fST6faIiKPkMndNXky8ryEfYC2Bayc7UDmkOpf7lPhfgT
pHTrjPGaUss2rMqgnHyiy4E6L0Jw2bL8n47py7ezLd8HEn7Oih87oZ2lzuwz+rC4ROyFFaQZFKQn
QKWsJYGstF5AYtPJoHTlUph2+nXq5tShEvJ5VHRTeJVvNOGdxvA5Dnn4KEWSvHDA7n7wN/QgcoH4
Mu7RluUWECA3Oaa1WRvZn5UeTRTtvvxS81XU+UG9ip6rU1RveIDNGpkFY25i3AkycQUYlrXqNZDL
tEBXtq8zpPwvXQiM6vDxpwSuNcYnuTL+v/tyRsz/rASayN6x0/DrQueNhmhccvZoa/kdG8XA0ZBN
/etFWumLsiIceXjMV3AyAFCGvLEpNar2RZoPXIWddcfsj67i5M8FdMLHgXTAuIuluTYx5zSfcbrl
L2nbY2SbZMpZ9FZU3UwiTPqBdk/5gRgtst6+N5lQ0lyeVAxPNUpWCnxJ/9WyTcFvqOuOew+cAa+f
Y3cI+wTPyYs+BF47eVxHD8NMxHfrGapbFCAWP2B+pDM7utVrm3KS4ycT5oeCV2sbQoNtQ7/sI1Ub
s/YyI0RqjYJqkKHcqu3dfDYmPqxWdkGd1MLbtoJ3ZDiJZCxSQMHGjnB6PD0lNc01nkW+NOSr/dLs
jIogT1Oj37ProbLvVLS/VFFzjP3JcIdffg/ppm6K0MDrXzm6dwWP4vswPuLK6b3cAYoFMPERWp7a
42Vi/QkCQi7TKCORpHOZD99X++5iimC6vvL3L0uedem8XPEYqwX7Lm61vCPRMP77WD5dezI7VzCO
7i2lSyNji4lmyB7/9IHIAy5CoL9owPDUDF1cQ9uNW8ZXgjBm/gaeo+cQ81LTt3jUdhNcp9ss9I/M
X+2RbEvr9oD6uEu1pUQqKEm710IjPHvCSymXsBqZeGnZSJErOdtSi+DpOqYYP66KN4UVw6bKH4/y
FGq+uUgMt2+yBENEf/n34ltn63637Rag7YZi16vxWEFBMKf9uwEGfjhNyT7GV4FNJ//8lWEeUSVJ
3QUWLO5Z9wNZAZfYbAanUuhgk0A8ceqh/l86nOjsesM9xBDiSw/DmfANLIuajA6D4Kp21KMCZ2eF
OwM4KAFTzIWB2by5gJ29xiEVERNNPu63PejIpiuTzxstm0aRw7OcVo0wsiVPf8S8qdmnzBXbDGY6
ze2AEeCvGtF5qBM+cl9dsPTeowB53yhDtfp0Azyw3q78TKoDBnYjaQCUTXuHGucW+Bgv9k4zQiln
w4DJ6gNJxXyXaie/1B420yKK4pinrBH1sIYNttBuEntroaJ19p56yRHKQTKtjAxHcNQbXRU1bPy2
U7LQcJSjCZlOV34X5J2M+FinZqYQUMa+BWwTJiZk5IAbbhs6N5Hxf5hHb4Vnvct45lYEyhnzR/qT
pWCLpILtkd9uWaQJCt7SxBqlOk+nCLRYbIP594VPWXtQ+4kIz16OYuX/4Iq/wUpjj8OZOt9WVuc9
5YO6/buPqW8zyUvt4wMrn3Sp3NkXvCTYY48b+ZujX6u8Yf/izbVj/zdDc0/BOjmbp2Lwnt38WA61
kY6O5k9AOyjQHL3m5IfZWvay3c4gV5nZpugi0Tzb7/GIDpEFloLcyCdXbOegYMbZqcAHQeONVzOc
kqVF2I7I1tPMYQfTbhydvHQsU6P3JQwNWhKgJkD4nYs13at465uKKhwsq3E3L1zaF6/i6xXa4kbK
YMnuJv5MYJVO3lregLldtfkVoMTR+VqBAwqgp+BcKKzt99j9E1iQefFGboYJ0T29KAD5E23uH09x
Fw+7tbpV1iTY3EIMZGqbiLqwR9mEa7CRxy2ODdOQd/PoqbJVoq+xy3LBQCyoQM+VulCFuMNXnHCG
WehsFvqesh2cMM5+O102RstR195A0r0yAqXGvzYUXHt5PaokG55GDABSJ2FcTDAMSyhyVihNymMp
efvDC9iGlbh+nayf0lMcogKoZqleAP91J/N1hS/wMkeI6SVTCVgYgm6sUwRG5WOR7Zz3tbFyVICY
DhPAqdmPhWkWVrha0o/Z6KPBqyuGA8/ipTPrxkARUXLy1hmwoH3S5V1YxkXTBk7x0EU0mTbRQXOR
k6/r56ugwmJjCnjPHq1tjXKRTRhTXXW0zeiOk6HRgQophlHZXsBYDHZNu4YXlPYz9JPd8bngzpeS
HXuZINTgbfGppEad8TkHt+D/C9+9IzuFtTRosr7pMarBvGwBa1NiKYJjA4xtP0LOLcCBnGqnQseM
J+285/RA0rMVUWvRy7KYS73UIOjMdX/OqSqpnlyBFoPRb1Ygc5YDiqa0to6N97WnvG5c2vxSmkf+
9z8VdIwR1cJH2YX+7k8y8xCI8sf/WtI6WCmFY9BZXBgdh9Ywn7drMRVa0ryjF2ELuDCFzRqWko1D
u6fZuvl3ld2C8jHQrTj1T/qz8JHhk/HNVtDGAbRNVc8+wwoJRepfK7T/5Tb8ZdBj5UspXjU43VVu
ooQh7sxR8hDI6LUHML95xe4Hwsr+wjXZcd6aeG58AfNxKytRBzOFcC1+OqQPzoe2J3N7w3HfeyMD
vdORQnY9rl6fvDJTxgkQTi6WMU9UkIXpn6cOt/nDaqP5lNA0/Bo68GpdI/4tqABIQ8Czdaip49/6
sGKvZVyDCYVgqaoUinCReqxAwkD/DV9PPjRm1NLWRVOzPhsWjUWvXWfnIjHbXC4lxQYALm5EKAkd
67msmAQDm6zI5tNJTmv5lCWL2bn0QUQ/K+pakV3roaKQO7ZUnCHrGXEEoyaeKCsBBqfvY6N/pwTQ
ZZam9/4wer6mrUEf8ISOFEzWEuorj4tSqjhfkNPerFDsMs74u0qKs2b7FLTY+n7FJ++Q8jTY1SPn
G6Sky70ig3ZTTxkfIXWXXw3/pXLB2UBAID/9AknzIwo/5nIiKWsTGq2yRw1K5NLqXhcdvRObUiQv
P7hb2hB2I6GVbXxB2sqjbf0uyZ4QV0zWrJnej5GIJrJf13dVIvMnaIVB2KCql9bB1QcozsmLqKkM
SO7DT1cJOF5NZZyEV0F+kq5ZCr0zqlTWNHnzGWao9K6X/kBk7xBguOwLJF2A3si5xCXlQ+FVc83U
1ZJUxHKdjfTQ4s1r2L72Ga/yJsCFGkvMj6NC+FQVW0XxjchcEW2pwfA8QwVpnpodKW4mNqT6bafT
+HAo9mRuz0o33cSUup3UcG9VhoLunugyGesXC8bhPoY9hMqfaf4CP0G8usM97sZzrkh2CvGerH02
trd9wTkCPoAFLJ2qQbzsF7AHDgmlhf08cNfIfpdcoal1tPMZN5CufdTTXm99w2VAPjE9AjvNNid0
ierIt8GdKNTnAPXpED5zX5+GTB+ojhTpzMVaDbP5GEFrV/KxL3gnztPoXdq9Uwux8TOZZuhIK0oD
HTVZxaJxdAppUPrRqPfnfkcOZKFla431xpiPXi9Z2Vw26WfxP+C43RNDH3630zUlMXEhrrog63RR
1l1hIApA4hYVm210+IdJkT17GpgjOksfq6sLfCL+rDtW4pR/BIJsRbNYeYIrGbNzG9mhfmuTzDki
7x4saFB980mn6Wz/ngFGdxXnAUXb20MrtXrK6FAj/akBjtvV1fvdn8+R3eo9k0Zhp3HJgb5C04g1
yCpBksXrOPSGqkAI9EjHKjyjpVlmkTV2dYOVCjRayJmnm+UCoWIXhGLrjslWH9RfGHNNxW9e8r8E
AXSgKSDHnOPmW//md6F28kmIuPy8jnvpO796KPwSY1tYUe+3btJk0cB2VDgoRlhj5b2nRI/XFctz
PJigoK9+jOuB/T2+8PjwNUK2v/AmmmppxUGV/6qyvKd115a1jk+4GU3GxW1WhLFH8ItrZwslT2BW
rko5vyJvFIPZfV2sy9QXXJQ4YHcNfC8oo3M0Bj0tNrsAUf5Ni5oWdnT3+fPPWTOvQZiCDpA0SVog
eMw4yiJPfKoiCtz65EL87VM1URIUMbSFgRbYf81VDB338SAh9Ng9N+vRrUnO+fUTY4lErjpM3xuO
sb+zR1r5MOlUHJyvShrbpsJjljx1l3dLvHZEgEd0CKU2BhXA9hv1QE/3bM/S6JCGR8/UG+J5jRoC
/03ZAkqXbNljtAiFcUAa90tf9NnJS3seixMwRoFVW5HtzaSvfOoONQFyrJWXuyXBdcP1XrNUemv2
HT+i/1N7JwoDa59uepst+ZShpQIqh1aV0zX53XqvfPzAlffqmEihbaS8fMOqwhPWg5FrqbrybGfo
f9UuiBhPAcRKlR54Nn6zr9/aJXRW/fkaljMKtSRKdXZYGzTC19/UIIB53gogWKe2+7UDIXpwbsFu
PLfc37FmlAcF7/wKeK5cfLucIhBqwi45KCX9aspVAgBbcY/wAOvFL78OfPK2YBY0/uA1NHX54/jY
yRh03PA4WDEmUK5nzKq0+qsguV2SDUYQ+bcY/HLQ32DQXjwPXBHk8tUztrQvH+SzVFQ7lEZHMwfR
p0eD47pf4G9cbsr+ngeaetVbieO0nFUe12G6TdfqQKv6MQK6lu6T55o6vfXXkpTzsRC8FNxQB7Y/
EOqF+UkisVPL/WZLLnqwoIanNcxPkwKBtUXz/5kIwi7eHNWkSEv05VqtH5AD/O4aXplroxhECruY
DIFH6/lWPiix1uRlo8lZAirhCqPKoFh4iNn1v/9xz7g1pXqo+Smin7UsgYJgHeKIhKFQj+kRSgYq
d4tZJPlGtU21yF6FhCcv8AGfm+1OmaC7HMFgMUvlgO4FO/8KZoX2A6N3hSpKIrqSlZgaGqm/rCdM
V8LCbtcuqNhisfqD5OeU64aSRgHvFpDFzVFohAcywGoUvgw+AvY/VJM7/OfTWKry21z/QGrXp55C
4fdyJp/mF1HxrM0nfhX8kzL1ErJwi8/5YYdDdIL4n5SfNdjzblZ57a6eOMYQIlLCR60OEpjXRam/
RzrJiBPPo8vcifVZOtRofKvtAIrT8vWVOE8HPpGVgW/nfcorpI2GfWgIK4aHkSVT7YtkTA593atc
2a+M/pWQ/imCk2smtn21UI1Gi2K8B3pQ8Jl8ArxAgT9qtKn/bolwVJArCAfxAq8JnZyq/o59Z2UG
hhYAnLI7SD82lyI/nU9tdzpZYx54Dlv8dwBBS2iJem5irDlxZ3S/Oj57qAF7WBoWvRelnVjE6RBf
ypjDIsbCxoRX7gWQtkubbZ2W4I6upeKynEGy5fOlQOuy3abmpkdyb5yWAX0tMB1kXQ1lm65WvvAK
qT0AWFZhXGI/pnZ24NE8yJwBI4TIXpMQatLnGOFW8cUlhT6FHTHSj+9wB8C3Yq/j8LHoxxpxGc8s
UtONXQuQt2QOtyvSzZmOyvlH76umFlgxDhlzyH5KGWVo516l3Y5XMlb5+J075VZnPokjZhVuy2M3
eVXpbisBIQ0kmfIkiqYvmoEyYJOMmFLqmegk0Frk/C4IVn+UMAABvs77CqokboFMCvukwKgNF2Wc
jlMx0HJWdkXp+fhzK6CDB7lfEXR4TATe+GqdEwdFCbYLlhJtqIktQ2LvLfYNPuMdjz9BjuAO581Y
AfZ16MNfo4Ts5ZO8S5Qj0BYvJqSY+PvyOzludDtQHRHmQKLfKrcWCzK2SguN2ak/98PP/m5LIpZA
qtWn8av3lOeuyBwm5Kds3gSj7L/5iyY1Xz77qAH4p9OZa0sZ9A4xaUh/6cY+dIE5S86npajfWupU
yVC3aGg5HsACwmHRsdU1k42MlA7lJPLvVL8WvJBcMKL4D/c0c0vJdwt8CVgutL7qvvO0Nulyo+1Y
zEQExJ4wnhFAzvaiomhODNIu5zuzbWRsUFCNetZcWeWjNZQTzgSp6Vbq+ySRtAZXdJdsjxB96oMd
ilJhygV55LoBDZ9e9BleTTxktaH+FCqNluKn4VXAanb4dTEQeXd9LhhAyxuA0MHBVC/hpUiV/Vgc
T0MWgQTsahNqnL50XzKvsVBdtfNQQ9l6/QPjcQlr9WP8+65DXuTyKB81opgWFseN22pK5szLzl2w
GTyIcMarjK4KbIVBY0vZAN4t6WWMMu9G3MNRjUQblTPh3ak5rpdfIlk5uqA/hNT31uxtIfs+feLP
DATm8fjcIfhKGO0QRtnFcivX7EjeOSod3rJcWHSmax0/W60LGvtn/pPfjTPmk8bmYBojQ6uagNTy
mQGTR2Rfz4MM2tdj9T21Qcc/mSA12hRPyj0vzaBKBPBqTOWZ+yt55hETXR1cA/c9HjIOWgEHwgJz
7tbttzejFOYPGXEdbQYyIJSEhy3XPkeA4eNMLHqykPBrxJuu/naIVREUS+3OfdKXeZ4lsMPRKob0
XjCnI5re2Sk0AI1S323m+lTLysgGi6cfrEeEyPXYb6oVpRrqNNh+foujlBnULts9oxbODcAfNt1c
42yzMVlUqrf1AwgFQYQI+NAr/MMnWJlEXPwiZd3SvuYHavWCHWhVNHfurEXzOl1SqvazOqHGmlwD
kvAItwf5JonqDmgrnY76O17asO4h9hVhQIY9tH65VgHn1lfGn+qkJO2Xkfs9oIN2KgigWZHuIzgL
qLOW7vvhyoDz72aeTzsEBCVY7KYzEyKGwsDaW+rNFBvaplYO/4lPd8OTVI3Y9JW9QNELHGIZDSf2
nn6TFaIRcktWZ/a2fO3VP/J/AOpMLB0QsKOSckObwkab9RjYGNBp1WJX+xd7Cvl7eu1lEymHIY7C
SYyCmmP4AtyCoJl4VdYuifOSnKNXOe0KqFCUxXHJ1OZup8Ogqy57bzJuhhX6NVslYMnkDXZl9TAC
QPDml+lCr2YSyChZCA5nRg/uQpWUlUBCDm6K0SBcFIzav+lVRuFj0LujXNM1qY0Q3iokq5HLwRnf
eKa3xiBhHHyuUAI+H2aNUXxIIysj65vR14Ei4UTui5OZu2cYywqi74jLyhVEtjAiK+ouqBxa/O1w
Vi1M8zMSy/XWr1j1zfGuLmAOcl9SN/ZrkUi+BoAZbWPx7rvTNpZFFcTJB1/GdG08IH+7lPQebDlG
Szu3dlwcLi7cE77dmEiDg6hrmgXlIzR2haeTiNdC9WTspprU0whiPM2DORERiKU0ZLIyZwr42o5R
pi6rE29mzAtvdMJNqoA2wpqVMIqmnWxAkuIxVuEpnwlVSRtbh2wfmPdycaHheXLfeIKpCh4CYM1s
pF/WzLC8MicFsBL7Ken0drO7mQ9pxvvVEMJJKdoIwBOJtsPq5iUafMEZzl45RhFWHgeF5tnmGmvc
GQnSXopC00QWR47+S8DQJCdxEJ2aBQJ+r9Zfrr4GPF1pZA32AKj0uvL/S6GWiSZU7zo+wdv2FaCK
WjJlZwQ5YQ8QSOz27Co/vwvXVcSEWvWttXhHY8woVSLugpQZs7a280vsWzA24XCEoowmAARh8rEW
YtCx3qkYc3Fcp7FEmxQEOMnejZaxPe29XTLLRDbBvDbWFy1J1/l8jSlJK0GGeyGRa3hPJDEaPTYj
cDK31Y10V+ecgIGaVQ+EY0Ul8q14bThvUYyk37497oti0pfpKZogvNOt0OVWxdvSX2O1xu8uMkrL
hExbAiTNo6UXLNs7bNDrnXy6rFTu5xNWEqWdZXmgm9vYkybMOMmpbCnVg7tKR9a5yr63K00kafDe
7kT7ljCeL6fB1IFSbZzSLADcRUYHG0UHhczGR4UKymX1MLAA1Y3kJkhQSGoABG7xp3u2L2JOGkfG
2RplsgXBHixcDY9ltwqe4E9VlKtinH2bv0BrWEv6KgHZWkB4z/NQbmy7UKNQp4p1UZJVexiOKll5
5WLyhYLs4a77N4eVEGHWlvGh3dx6txTl4ejFTPeG6w5DEvdgZjFqA7nysvMb6i4o03uNdooKT2zt
rFDSN8mm3IAhFfrcSsWt24gC4XwOA6n+oiGiGY9Q9m8MXfXsH1Z0RL3LGBzGT6kinIAoPi6iSp8S
c3TmlNHrBLZh1B8a8tv/hI+ApY+2ShQqJvKTlp0tu31hkYU+VGaAghLRNotNK3CyhQHlz1D7BOYZ
1l4EoYUJm48QgE3bK4etVyR8DG2kn7mpJ0aRuxpO0dDVc8TkVIFmPVinfjY0DoPurJsBvvMH5v7f
ry07m9b6+GgSJZusGvuTEvTVzlTEkVGUhjEZvnJBiSxa/cF5UJsGej6PsQWl/IfvCRWSBoe5Bd1+
Y05+C0w0va8Acbd71KDN0Y5SZL0K4eQ4I8D6EhaJ5a+xaabCBpOWUFH4I9CrtVJ5PStFi96Ncg7P
6Bc2LdWNl9ongNdljBQLoT72a1MCdU4hFluwbRhZO0pULY5jprEsD5Xkr0IH6bCCJPn4SnK/FAFv
f7oAJ4/qraYeuwlBVTABfxF3iX8fObhEVxrwC/jfoCwUn6Vq3ViTZXLPdfcHu4hnQ6q/sceAB0hp
QRu5UiKPSm7Ls6jpWWH5pWSkMl+WuPCqS5zbNQsMkK0yFZC9/aQg/BHPV0kY0xXH8YI+LYrqpEq8
23mBdQcMPfbNAGQ7+2DeGGHfyxT4OpKH80wV34SoBoVJhfZzvpkrS0BNYXBlxHtUMrDrdA6Rj7m1
Z9uxURM/QdwI+Z1Q/LLOKiT6LPLpNhirln8/EhUqDj2tTH34myNHLmWbAGc1m+52rpFCD/VHHWkO
/7E5iw6PDl9uWXplrKmKLTDagh1jrvRe/2Fl0U/BzIU/clcLuXN980R3DXMpBYcxAM0nHzMx1GtJ
vwEqyQvTaDM1tOixwDSkmipcj+8XKxntDBQv+m1zOGee7bfC2W0vS0Zv7rG+KqfrgVMHJgyc7UQO
l/n9G8pPu56InkvqbmNeRGvpGVTNniBIl5uDqZ4fwAy6yIiCy6BVUfnGcDf/x6x7vX+13CwH1N3l
pd+i0ENJLS6TIdDyq23DrMXWapKLL2KgDt8oLeKdlRNTEWCqpavdN1ymqLAzRwgKVN4eU9HWGPJD
PqdNoZZ3jdImwPwKKepK7jXRY0/H01S51+1NUeOvyJB1EQEepE34Jz3YZfjLM+aOeUBmRchPagBj
TqRdkyzWu5Iiny9vW9K3fMcWAKwI8oXOIKYYplNAdg83+CXAW92ruBgrkISG4nIAHmldJzuJRh/7
exrDiqeDOvr+AC1AkeXjAM4I4d/bEylONoJK5RF0F0wEWBl2ghR2UBfipBB55BdRXqKWmjQIQpvk
uG5XLwPtU4wGqcGBMAMu2d9QktPWEWNk9oau9V4zBULyPbklEEML+Qk1kJRF88u7JvkN5uW6+lXf
VB1E1mQCknpAs5NhTQlB8we+iaqT1rS2ySmir5sPYB9uIQWDXRMhsJt3mZ2/C/nmJgjhPVqBplEx
DvU9/Wx9p65nDdLnSnqy96XjOShby+NUzTZ7mYTeG0z7AQ86cLDJjSRrZ0CREW4VeXOnmmBdgSqE
wBgoznFxMSzLgOshy4jJ4poBU4M+OzMbQIeqF3RkKtfJ6CPh//UKRs+rVXZwBfXTF/i24p9zammr
4HJj+qGZ4BLk2A7LEMGDQOLoU5vIqP1v/NfIXJ7yiaG4i1yaBz/TOzPnEcRy9Teoq8X1qCM800Rj
yEmpgc6oCL4gtsyvaTjaDXFA9TP4indbI/q8/e1kO0fjt2oDHaCd28kihyAQ8RRbw1jf+rigo8qx
vmaFMid4KBcFWsstNHCWUA/njWZQFPOzeRDOPtW/RspIUy8s2yKZdwZPzOjZpLfkvVqnLgMEjWcN
+W+2GOW7arRJtReKBJ2yCbVmDAFGRt06gqmP77OP+KhvnfEXZzuVcrC2VS5Ey/OMQCN7Do3YUTBz
edzLF1dG9wp66wTgmBdiHus1priczSMZ4zO5L6OKUDt83SztVNOxFuRZWrEvfYd6Tl3O6/APJI0+
BpZ07CRKR4FIeUS10KjEVfvAP+Z5i7P1fVowY6mYSGvMlV7OZpwLH5N/Hp3Bxp9RJ594f+JvXs/j
J87bYMw5PVmtUPd2FMRhWM8h10hbq1aaWxVbRuqfst1nZjXFw9ly46pHz6VYSAsEJbpmtTTzXKcU
gImSfhxszuwS6YVTl6Bx9kUYDGIZTHvLgnBk83ztFD/DSS5J3PbTdMaCY6P2jMnRV/iNI4m9L9af
6sy6j29wdhQ7Q5w5RfFIzrWeeivCLIK9NcN4b/ljlOXxN2cqy3jKnr+34QIMYgECiaORZFftQRHZ
rD7SZIrSre6GpOQ3IpV9M/gMFtklCEIpYFOahJl5ORG+roxnhFNAXg2QgPsGicder1M1Zoa+NG+H
wlzs0okIcA+Mzbo1p139F8nFQEKWoebCwXsSR/alzTHnQ85pdNF2IE1R/49fHlG81ND2Im5kaurt
f7tRuZ7uj0jr630nh3LKxqnGWvJfW2rgbXuV0+u2yFCeFbHwFXOzo1ma6LyzzKVsc3oRIggrPeAq
KA4l3FcRNNCaZxmZh3zEfDq3b6G56cvryEKknWu2EJpeER5OtBA5SXXFecU3+CRiDSfQwn4/FIth
BLgN7eI6jaZCNjd9VscSpQxX7M3vY+RCoshGY80U3cGd9PYqToEE8NWQ5Iv+H/PaXdV7E7OR08oN
yIl6gR0yrdbetEUV+RUiXArf26zhl5eHee42FAoVM3632D1poHrMbD9LYMM13meWAkElRIOzXRyA
3y0ioVxA4Fz1a9XtuqsFWWAzF7hLusPA/m6jD/TVV+mcUodUCTra49tKQA8zool5w6ZW7DBLjJBn
uUhF7bs/YWukorrs4FbsJzOegNiXNNJVub8HSACZfamFAIAWxpGpEKkgMC8Z2glgtUbiV7YMagse
YGz0a/DRtZjWQ1YU9y1VYm0mw2MX2G+u5nqjD9XMiNAnVum1/a+jBgcuqyBXGsIawz0jbVwVtii8
XZ9OUs9N46VqAeh3glIenppeCQgHW3SXxYMsctvAHgrplRHjcwnTdJ/sfHukFqGB1cnPYfbZ9xko
f6YQCE0jvoWtiwCfK7mgKOEGRa5/0MpMo8QW25j5SuApDIWBmnVJb1bpY07IM4IyDivFuL7imK0e
CKKO8WLhPb7mfiUJcbPjKT423ezBDpSdqOxDR2mEXBlUHQ1u0+yTLF3aIWfwY7Q08eg4JCBkkQUn
jQkHaF9c5vOvHNNCJj1oqPM2p9g3p4Rg3LFtBNN4ucJ6erC+9d73rwomSWXJD4O+i43QJ5wVI8rN
csPF2afX4LkyHeIj8c++Nqq1ZZXQtYyTBZLsW0aT8c7pd81Xng6b2sYQWtAtUJAb9dpqbI+8LpUm
izRyYKAG/aCUaj0WkfRvY8rocxISPcm964OZ1M5H/u78En16oSg1h6/aihvSLhQRjiQp9FoKQPPA
LdG5pDNmB6eF3YrlVTDACeaiT8Y21UkWVMSLDKC/68HUYz6n/0EV8Wi11uub3JiwNtBxIJAwSHvy
nA3/f783Oo7AbO5KTMg4crIURuLh2y+jQvdBMHdEaPvyxBAApCqlISvJYYizzulAnNgj2l0jvh7b
XlfaH5gV/Rk0FNlw3PKC8ZgnnM78ItTfwwkR2l5RqvxqrnRdtLaPMaM7TXB2JwzdX1Vw3lR9XKlS
2zxHMrZH/irUD8ENklglNucW6FXqcGYSncnRMych71eyFSKQkNvFs0tDyO0oO9HAB+OzfEbU0PMz
6Pc8GVX2IAcZzAEEmjXQlbW6Er2ZX9OLzyZu0f9ainf/HsULCh8y2gWdcoORIXaUDcklTDK8WfmU
Pdva27vOikrFuqynM0G4H2/Gm748s43Su3MkOZzo+mGYjgXr0L2hgSrJvk7l8S8PDKYNANbBnDn9
hmA3KyYHJQU2SkpKOcD1lcdk2xmsH6QEKrMoHWD04yD3uYeMWzK35z0D8InrUVD71/1+r7GU1NA2
V9XzCKCAiGdGaKk+T8hyXc2MZ8yfB89rd0XTPDFlFv2tfDYksEj3qcrdeboXyOOxGZhwT7N5rmTM
V4MWXo6GQrB69bIrTEM9T0ZEv8u4POTRzDmB1jm6SOdAuHHUQehZVaIDEEN1LDvrotg/2ch220kd
ZlDSAbp70LkaPsLs8cPTMwELdz0uHM0Rot3a8ntvVIgD1XvfpqgWJ4ukV0bhtqLcy8pWvI9xFLgl
9gvdr5rQC4dI78t6mFYBKppgkrixcVuIIJJqiuT/ID6nxcR6P95issZDTXz/pxfp37VsWpWuJmXO
oYiqS+EYEiO9mhRoEav191/+woBOdK1SC5Lt8q7st5lY/riAvSzDYjUZ9EXSTV+APxNYJXJMME7m
buNeLOact2s9KFLfpJm9D3jWkJayvi4NMkW9xYf3dTgFT0fvL5cCKh+KZhvYx1Na3QWaNSTsaxBF
YOr0z5qvf1ZIFZOnBob8ktpqfvAbervirg35Q9r7tkWdERM0Yv9/0RxyxiNtqnISyCaqDVKexbOs
VNqEmCjiWkX7326hX4xjkFFRRgUPZFk0GeTKHegAn6OfkCl8Uh9FsLwW7sljIncV1ERGmmcQIsG3
r3PtaTQHK8xSFh3uod5GeZOwq9QalVWrpPnNj98fgDZS4A3aYr7HRxSd0OSK1W7woLd6ngczhx2x
cw0HfavMM6NN0V1+zkUAvZaPH04ngCQ0x3xVZHsDFgqZ+QcuvSehJSEpgAy5GHwSKNtMhXSZqn2y
3NT0e+V9CQpVUzNGu+3quAdjk62ZG0vTO6fLvsYXmu4+i1C/saRjbi03M3BiLr/4JkGj0pY81NaV
u8btqLZpGnSTVTBnRdqt2AfwpZIveOh9u3urLZpac+gSJny/GWOWbmrxyubpqWlqIKzymfj1Jiya
kBpwS+XCTVRhDzn4RsWuB56P1YVvwHuUa3vl9EXjms4vs1E/dzAuF2Zdoa4iEshWAR2nnlMXQwlk
5TscyPTR3dMMZQ3dwpvhxzgFYRUqCQMprzRzVcaORxNnGW7ss2935tV/FN6wWcQ/qxKO9j7RlL+a
KTk6r8uUSiq+iUD8Lh/uTymrtUCEfoorFx7KSuLgMu3Y/1NTQYOOBwx40gPQv1YyiprIwKLkVSFb
dAxJu6mvtt5QNIrQtWi+W5mCDsf+PW5jcXOHLljolpXOWfBOEYy8ve7dVjNf8BGaeY7Jr4gvEYH3
OUm8wm59WW4yLbLJj2esUoUQtKh6ZC5sybds/KD/Y04z7phi/BIvCd18WHzUDdMC1aPd/T4rUz5C
RLiBwckMOoHn7e3Y4Bo/xXlm5YTIfi+RVCpRWnOHYrxNgpyd99S/x9b4rGrYFzB01Fd1yfkcIPD1
p/qe0mw96PTM6NF18tguZhb+a0EdOXuwO7uveInuVnz3iWI7JmbpWhPeMW7eIKW6DuFmitAgiM0D
ZHaUjoIuelrC321Kt1IqgGHtbRA3hqzkC1SvVenqvzIOzC7xh250h1vbo/yeoqB9tuYdW1RegJ6q
J6lEd74KKxM3ccoTdSjwPQfQyQfvbBTf4LAaIsoSRuraKpkrI9VjQyL9A4w10TPuN/s8i5H88U3Y
45DbDYtD7NPH7QMNb1JoUJviyu5EdSvrspDP5YYr7GQQvEbYU5rnXTaEPG6BXD2NQPtsw1HH4G49
HNCnjUK3izwkdP9k/JEj/N3SGpIpCb8jVIDaamkPwVjG6E9uA/Q4Hyz6Mu/WiSp8RyrGecQRCcew
hXAwBYRE3LKv33eccJ+qgGaLdKzaEI8jOXrRSogOXCViodcLc49SpiKtP2p+8jLl+C1aOM9u95R5
xggkor5G78mp2aKQHQ3lvPnaBpaUok1niXA+h7pVsDqCwYFrVdpAXN4u/w904pPTrF3hTQIVIRCC
EsVfa/VK52gziLhtKcRVamzQPxKl+mTx2d3MV8qKCNekkppkN84Sr1amtG13/UeoSL7LW7wusrfN
p4/NDgiL2lTxXC3GhLbzmkwhao00Dkx34qzYN6t2PA9a5xo+cbzoYYi+W+IK/ZGFS90PdLOh7fE+
iHWMvbLTO59VbVBY+CBKLVbvns05HD1nOIJqTk4wcojy6L+Awti+WOgNq5DFVTwo+mbvUvxImmto
z5lZzPx0bC85OrkMp8ciLrYZJMKZ0gdzmwSkJuGMtvg9xPcoMdQNywJeCBIu4pc8mBmvbbjdgCMv
6cDIrGhj73Q9M2bK2IGcvzxVwGytp7rGIhOCdglWCJQPImayAJAN1eGyg2KdocjgA2hxAdf2vw0O
zRFkf4QKTy4dZx2VutcMp1Zehubz3sOeipCdSBHI3EH7XL0KVJbmcbudjslDgmp8mSNudTXoRMdD
Ntn0R+LmPVesoamnE7gAT0ToEfJ7Qrg+kbiYg2VqjnhIjesqpJcYjp09rYhlrPuopa/CmVkcwwh/
HLWWE+d/6huFUiCt7WMyWwiRipt9eEi1M0gO0CCr4Tq6edXJ4gt4C/6XvoStXJfupZRvAEk8Ity8
xzq2ckIdqAX9qqcmmHWxQ/qyEnmbHJW/csdQxGuDIMCXcPFOmSyttE7cso1U5PUD9wFGzRYKC5Vf
UkMsMsa4KHdzlH+rc6LiZSv5WvDFUg1nOcEO3yjSeNBf5jt/Jkse11RzLpJ+DhpEoTiMofaal74R
/zWD0y5RAUnwTD9pBBJggNrAG6tBiILODOGQTIszZLmI1O034m4ZEn6OPPBP6nyAfnHFZeMU0Qh8
x8JonkDNm/71M1kdC+ZW9Lj5c8iA78gQZUnLT7K11m138u+PZhATSgEDEHDlSo6g2NRac4V4qb6c
kDMOwjgHPWdHy72ym/9K/zsFgdh4/bK2jeRQCeYMxvcteskbSDYR2r/tuLdJwfJhxVXGuWtdrPZ1
m6CCmHhE1+iTTCVtrqLjaTEI7+ay2Moj5s5I1zLywOkg+zd6xxGV1HFSmaT21xuMYITLFN+e6++Q
ufV4SeHSrnRPWr2da1aIETR8QeM+3aKBeCsKUkLupejlBJgvA3N4B6NEzJdAQYuDBhMFag95aJ71
CXf1g8kESy6woUCV5c6CIqoTsEBBdhQv6B+tLMlTbyGnca61gIT35/3LZfCU1hWWldIFIvlHRudj
OfOy24lnFraqDbP+WMQrKxbA/LN4rZUVH0wBFnu2HgVuq/FhoeomjXWR/3t64v/zG7yTEo8a6uv/
/DfRQGtHqyaQuDNwCnDWPt2KUm1js+mTfYOVRoQqgCg79aGq5qQV+Wf5AfxIudLX2KxEef3Ad+3c
chjy7b5Evu2b8iC+GRbq7v43VXVXu2MXhHLJYAsFRvZh5twWTX3s0JKa55uVzd0Qt/3jfRZPD46b
ncAnF8mGBhzsPJC1QK7noLI6ReRRVi12VfmHMSGs1P7Q0Xl+z1dK+sAxYMgRc0YPyrGOco0JBINc
SMa7K6Sr56tA0zb/I7ErmYP7bily6dSaCmr/9MLbUaJGd0J5xfZ9P/CWeVjMak6oj+vJHxcl0bJC
bFg/nPeaBi5CmLDpzQR9EIP7Ff9e8MJ8pNDB8jqbJKOhYeY6fuxYLzoseiEHWLY4lCBsk8tRwfuc
XYV1IDn4Devv/h6evVrp0OI0MyHksXMovDUXVYSR+6GVXR/QOPPIPGvO0q4IgU0c/sue8RD/xB8g
1/3ZIxSNM8ZUxB5v9nGMnQjqpdlPiKjhYVt9O9zPP/GzVax7KuJnYXH73KbfNQ8HxaxM3EEJXRyP
/DE+ez5Bj14//pmjxx9ZPWBPysY2ZzwhdtfJqYe6Q8UfEGs0AGt+5x1gk5RR//Jv/901HnaqQhHN
BgUhWZNOyucCPjmCvbRx1xl6MpIHdT1+/9qgB53ePfOU9OvcEKTCRsZIlRM0M3wAs6k0N37s+7d2
m1XNeFsPJKKzuv+jm6aIb32WPWYMvK4lVMA+zpxiAbUA4ggNUTBVfpWrZICSs6QbAY4ZMFRHnrJ2
JrQxR0lkLEfWS1utheQmUqTdiqRm7pAIPDjOixGW0DrGunO/xcZ2u5k1yU/s6ZbXGyvfYyZ5jIsV
eJj9QZ3bdwL1ylXJ5y7W5AOCTJ2YKbVw+bjDPQY4kzFU0/Bk2f2UmTyP3DI+bxd9b1N37f6K14IH
SpvCHJLqvKWay6jYFGLPBSMH6PC3QmilF3Nk0JGWRyrvxV8PCCNoJVTTNV/zQtayIubrQIBtuyOO
WRUmLThuHqyioRlR6AsdHqLwk5s7lNYn3pOS8Bp/I5titmuqUqROaiucB66u/0Ctkl+dThiYStlk
vjZKqACVx7pOPuPeUiSH9Dr5WC9J7MqJWxAppHzJQePrd9ivrg84BXiWiRJdeP5DVC88DLF2Wu4Q
YvN7nPSt6wzqqwBSZqVsHJOlA1dkV6JnPVSIbTvfkfRCS58f1F3SuGuGLFxBUiU14l5gQRo1b2H5
1Dx80vY7A8dFwoGaA0dqRE0wsL1glCqySG2tFnqvAQv633PEGwHL9/4TCLA8a0Pt6sR8V27Kf0dN
W+8yunFSiipLPspwLUWWOyer2X/4NviM9jZYxmQEct++ORK12wa/dGDxjW7INlk56cpw7qooZu8C
/OkTnFi610YDc1P020T4Fql22YL2lyeWiFpkNHqx27yLdN+sZcd9XcT5LxcEn3aw9yjxHIJ6QVwz
iAo3NRaucTxcUhp1wNKCtBKlp2SCVlc1JcGAB9fqPpHNFayZBZzGW2j2eHi1bq9ziT9NVFN3H2xo
73Fj65zVmC2uuGzMJkSWmrt+8Wm+Ht9YVKSlbYmmUmvlw1GbCYd3sBCbPqwyboYWokRALbCJoaB6
/nUUR4EZGhclPVbI1xvSbp/yG5DJ+nb/PdCJOLWCRP89X+AFttLokzhsQHvWc8mxaPVA/sQjNZjv
C0hAX5bw2vnC2+eRTemBvU+EFRdBJvhiTovrmqFEtHeGasHxSbcjyeAA2Rax+fs+MdfOC1oWk9Nd
TycLrsHR68tqp+/MAhFpQBChs3wNwD+2eS+y6Lym91OAlWnj4YQoPFOqkj1WsZ4ndZ0ofz2k609M
0ADpPJbPd2gGSljgZHAUqDYFz9WknFbEXwlgS7zgnizQkYotDI2Xnu+c7IYlwFbjLwUDEagEAm2o
RhGJZPkyth4V14BMOK9g03C5r3+ItJJhk8d6YrjAITZk81Vn8zOzF6LCuEjxLZvNJJUzXrXDen/f
8Nt4ZBFEgwVP5Eh3c9UfUJ+qxdjfq7vKmNr0zIrINmDDi/SpDJknh9uQJN4Vd0qKyYyeUiPktHB3
lEaTx/sCg4iGMNgF/ww2TjZQm8JgcQnNMnnhIOXTB81rqt/N6i22RfOTAXEbTffh+7iIcVdgi/Vv
CTHXZBLoDLpFOt//G9fLbzbBmZUOOAC5P/v8KqC2oiioXJq1FTq7AwuKna1bOUwU7hHbShRITGZW
KncGXuu1tTsYp9HweUx6DJrBl3skWWz2x8BaUDDrNuYIAoDykLkaAyNK4bjvqj1f5+/mNI/Z2Ool
qgAh7rgS0ixu1xTgUnAq3UAR/uM8uZr5OSL95MIvgRrYkKlEpQbbYm9wcXCuSuc2izEF0ImC6qqH
xZcN/Uijrsiw3CiirEGjK5rytN+FtVYS14oJAMfHKmgiMtxpCW525j2kuWtZQhO8QqQXhI1ni4u6
lZ758GjI8el9bM0sfFF3B/oeWdduqM3a1wq4lT52f7maLeHZM37ZO2cr6tOSKBUqnbXU0dSE4CL8
4JTZ1vPbPyg+/4X5Da8inOxsYzTe2pjiecSmYdIrbzC5Ude6N6ODq6bvFgdp1JFc6cra/MHwA9M1
MLwI4OHJEBzj9hg8SLIGUG59dWbBVnlvs9c53v4Ld05ZPKlEJh5Mr3cBRkF7yG1buCzY1jG/MHs7
KmOdY2vUJ5GugOHRBHn7ujhA7I5e4fNyTsqHZ3fEKue6wiCQoKfgxr6qcpuRVibtya1DzW3Nzy0D
TV5jSu1l+jHiNzGyPwEu8l04fDZuXWi0R1QFUwjc9UrVZiDT86tOZ5jA+IX2qONDoLOKFGd6/bvv
ToCHy3Sd+wYUdG5H61BJej0rp7RnDBsEfVxC7WaAxtq7NRcIlolz6KfBlx5SQUuem3fhNvrFmljG
++ZCjQWYVFTktkOZqcKRIqkS3A1mjdsBf/Qe4aVaqabBDupYMo/x4XFIrwlCmHfKj23bKLaBFtFp
p5RE3259ahVSrseTH43bGLkbQyoTpqPhngyBUjZ2TlFbrCnaQsyW2CDWvVZcLwN+zgn78WlQDmiu
USZYUx0sPGTpXtJA1+PSM80dpE/ytDVdPyysmrAaXXfQ8bQH1TJXzC53mJeF1ARppb5lBxDZQgM3
yCzjp81T0qoHJRoNmQ6vOczseujmW8/lJUjggw4n2Nvflvw12lJeMVjYwtY9/C57YJSzUzWskCpU
yy0Y2veBqSDgwsnOrHQ0R16SnN3gpKOpYWgyJnFprYpp0+GqaoDyT4GLvPHIP7r4QWotPhetx/x4
qeol6tQ/xODo3Owj5UBLJMDWisyCTL3sPVRSeNEBR10ALSn8nLoH2H0DiCGBt7efEz2uugLc10kn
Le4szhz13rzp1dJkf/WfjFjAG5aPdOVccMlQEFFoGhz3dLaCKLw0+E7YnQpazZfDbDFWIn7Uu+8v
1K4o3VR3MB6qOb0xOAnrEYSLRUq4qG2q4L83zIhFALgy/QWbFMHLNBElfXYrJZwaUmYPo24m1Mtn
1X1kejVBcDNSrUodoRHwbhWaBgjrwQT1yHZM0oieSd350VPobCOCTAiT0vTXiHl+T+bq1p9JTD01
9vxzXZWX/tTuvyiTo23wgF6+cBWqVUuSENVzg7lRq7/kUIUJXW9lXp94EMEBVstcdR8wfKreVKd2
ad/vPqt/1msSaUukJzmFi2C9sLSweZjD2wjarJhJxu+gQHRDN8JSqMmrOhrfgwaUqCl8/kzczNcK
5Ddkfl6GM5vLC/WnjyjCbAduMJfWpZnq5weLLgUhZ+zmvwXRcp83jsoQSfr8kWFAI5EPwv5I1esO
bx/MZXHpL17qYseiwY9jkX5tK3YvDqelG2KxZ65LMLfaosMksPWqxzYQbuOgz6Ieod7QKeqcSzob
u40Ga01Nvsoo8paolTV7hL5q9q2EzJAp9gPweQtPmXMdWaQ4X0RYmGPZwcDXT7NYwW+A4M5MI8wy
9as8AiuNc/JWAYHg81qqH7cX9fzpy2gcSVvOVJYnD0LFIswrQlRmQ34Z/qRKnVyH3RAagLcawK4H
Ny+bVRvaC0KXxhUHeVJVyyTe9muNf1vrbOqBAiy5SirEDvmGlrY4z2JmWRZVTFv9UkqlDTAYd/UB
yrZ1iZK4IHM5XqucOOwV0Z0cqGH/4H9NJdYKKSLvTENVkJ8dxlY2vzvjPArtMDBCt5C9jkdVrxln
c3bj1pCCAlElOC/KRw8Nf9GCGpDyNMgmfDYQVu31VhMVelaWyCH5XlH5KeuhfESYntA0p7SZdGMc
+1sp9x9rcF9RmAa6FVhkCjC9BGruTaLVIbtg2OX7RMPTKslZOaiVYlPi0PRPvF76s6zZL+xilSGq
AZo52XHrSKHuGJYcx3el50IhG5QRVDL48zfOEaCrcAiUZPQpUVfwJoNvZgFzZG9wu83GiS5SrXj6
K0S4Y7ufZfEYqXG9dRZzkM4CMaDqZH3e3BCWVJdd5I7GLOneIoNxoX0mD2UGnBN5dKh59J2f1s3G
cIZRgmyVA+EZxItSC7p1HRJ7aOwX8l/f65XfgtH/hoEeyCZCVQSfG+B6x2hfO1FgVHkxRowARG5v
OB6p9gHbyIAH2fbMbB1idmkC/6+YRoszvfNAjYqAnu/V/uETtaLsu42cCYI+pM0xHz5L+PMljD0E
9vw9hsbDfHeL10ma5v2OVFL50s6YwCCbmu19IQSREIcD/p4iqr/QSBTWERWu+eVrBa4FrFeBARAy
BKyUTRLuG/5p61BRw8ZRiun4JWp/OZUBDMTRGF8S/HTs4yHk0WAK7HT8pzXBATDtbHQTqK8h0E11
N9M8pRV4PlWExhqAR2VX2sMi1j+raEYky56lZNKyC8houcErK/+fOzq2PqYBBS1YtpcHunprsadv
0j8vreuJMRlsh3zQhzYIlPMosH60bR8engHAExaHyKxz1HDBZjVZavHum0Zh3pl/n/RUEiKJdnlh
iz0QJ/2PP+WVpQ566trkZSXCWpLVzCW4K5FOBUJc0KztLwZMsX+Qh91UsY0xrseygCauYwzQK08I
tFoIQZ9AMQpt9zpSgGrosd9WvrmasRid2iuhJHIHWL4LbmcGvqpifhB0GCxUhGfR072XhK74tjfb
hji131Ht1mkFoDjcY+BADt7qkjp5BVXoTVLVvPuZudP7YPSppzHU5DtoDEz9OfCxhIXz9bfY/DBK
ZMP/vijzYsPvlTWt+goDIVQbvVBOjRInwV/lRv3tEs9q0I730sTAaGm6giLZd8c2YeHCjTtYBzxr
o7mRk9Ml/hJ0CPUnTdOp7NoFXxYeiPOmEEgpxGV6mj+/7yCIWTP6BhAtP9OdRgmtzW740KHWeeEt
FPsB+eczsfBnEdA7wwSegLfUuIskeBz06Fl7jiHfpws2dOiBwGi3dFYWCL9CmXJk0inHdeBrcDnE
70OPknXv109AAR1ebaMmgZ6juLtSUhADSfTGH5Ghzz8BJ+VBa0l70YfsnKqgQvwjD/DxNeHPEQnB
U28omF1AYHw4Wek8haYrI1bnYW4loD6EXdRyRFMP/Gf2woxk90Lljbuhb2zoTgwHQjwlaLtTxqt5
mttekAGpvv+EO9WEYeWYaS2byZa0YxnUXpDXfKuPBM+6TJT6cVWcG7npzg3c87kO5HpXuBA2N7/f
jERlf0FzSngpbtEVfysYIyk0YlqlPtCNZZlI09ANzp5AiOZdFcIyLouvTWxXevVeUg11eSPzhuRq
ifR2VhUti9wAe14AUUdlxuQw2SiCv7Rp2EobxN4CaUylhxmt7d5A8eCThVahrFvpqJi+N4S2s14e
NijHeqg2NWQu9Ot9A7tXPRsKibcU+Bx6/LYxMPua4vrK8/EeAggrqoiA0GpvWElqGQ/1LPN8r0R9
Y2mlmPbi3Eed4CY3eG4OYm8RKQ2DBjNcCBDbYQ7Ct6phqu5cTxXsj4rwOvLvktwOfsznAM0ozpHR
HK73UQ0d6g2/VAQKiGpolwHZBVsvq7A/d7VUz1QjiPNPpesvT3YmH7k65IzibSEb5T6YNZ1iOu3G
N+2CgPNRFavSsSrqhBdhzRSn/zxfwYhToCWtWfq2yNmCIDvIKZhg5FOg6rTfzuEB0FuTRGbgDnyg
9oImSuQgNdVH/QEsEDunWMYipw8uIcWKMSeeLgG8V7SO5qtBgKONHBI+0oyy7MnCkcDF2aK7nRuH
TUAmL3reWjW6BPnZeRXsLeDW3GRswq7PIhSDJ0NgYBH4riyT7BIN6HgIv+O9ynqe1J0uUClLv/QJ
to1tb4kQZgWldteVtw+JTfOY6WGrghZb432SyCyTK+X6dQuzKK86TxVulUUHonMU3hnRSDL+hFZT
0qjao5se8A8CXoBWlOc7pMoWHn7s/aCgCXMLR/rF0XLH+j+bwCtUEbc9B6eG9RxtpVzzTq8ilFYe
ue5mTP2bricAy/5oBcHn6It+4h5HbkgNU34rYtUeAjnrBYe/bDYjdti/Iaw5DAXNxHB93ylKytim
UddA13cujP9Km/yBqQlt7oJSAgC0TwpfRo2hlqFITESVNijasbPs81sJgIB+FAhxMYbDZyLthre9
hdAabnX8RQWGJKVZvaZVa02epM24aiTE02ZaaG/HldY7kefnl86lvg1aEWagd/QHWLbjGgZY5fXF
DkeSRt5f67bGm9eZnmiqcYXypOrZ65Dxg3C5gfrUQMdcSJVZsFPHdBCTaHNSgVnMJs880Xufhemu
h79+W53i9paPFDS6aXikRoz5vkga3dXc1q2RWKgKl3ITccUar76zF5++mXyF3zq42Kd4Hm/Fc3PZ
p/KaM5p6h+0KTQPIaHTTwFxWbyMOhVN8XhjET7ynC+fOptvmNK75D2NlnYcn7ojoCTzWgkMfSqgk
guQ92a1hXjTK5MS6nsnzN+aD+pxsC2edAO7omQ386fcDlDebcNuUf0MbVyHYv/OLIYZu3ShRqrOg
hI9JmFcB7GKv3kJI93B0VRzdRYv31ZuDtUC4rY/+ruAYoY9JX6UL63aAFFtoNbrOkxDM5OXL/H2L
V3hz7C9Xp1VpBnkx1RAQnuWjcm0DMGkHfCy7LzoOhBk5Rc7DnPchUDeBS3Csu2+TASYktVddiqKq
Kbo7TlDukdstdoC0ACJ0nc+h0d2YR4UhO8s0vz//T0zxjAJh7b5q0v88F3txZVNwgUnIMTbbGejj
v8uUqkavuGrhQbMzNScC0Eos5kUqTAZKw1VUTyYWa6YRsTDVheL4ArsnFufScQWCXgvb2cn7kxCg
z+lLeuZwbRba7sS1h4T8/xkYZMgSfS5KLm+/9YdCYarhJ7h614tBqR2YWwwqlE+q5R2qyjVQSF4Q
gYXc/BiuLk6VNdKN8qWhlGXKAM6q0Rllpqd2OvixQWopyBm59TUrbAQQmAgLjqruuVBQuyrqwCId
dGY03WbMz9LnLym6orbYfNFTcAtI61L3Bnp3rRPkHXlaZNsSbtvKqI0KvnTGikC1ykXeVDI4+E6q
dLxdvvUMZk7fF64cblSk6x+SI7VfIb6Qi7R/Pc035MYwy5RoizyOrp7O0LUE1QWpwnt1wyZELCmf
xi/j0wg8SR0KJb6Jj8a4Nd9fUBWjJU+2PEifqEyVyd5qIZMeI2qnzWMFCS0PT+4AI2ujFM3t3x0Y
wkGQj0Eg76I3ma55bFLUVM5gj14AyZSy85gV9tIECxjh3z6AZMT29hqPTQe1vi6+nW3XMPeuivIW
RtHpRhn16Vj9V+HqUmYDt+KtAHDkJJ5RbgviGXHVOXuQNSqk77x92a7hclsmfC1/Gaxep7rzF60H
Ri6K4Xe1bXUePrzvii9+J1yEaZ3F2t+gVaj9idirXJkxhDRbgluHZXDlyw1KN2FMMG/igQ3urjpA
n4yGl2oxumhNZKhB+JPaKlZ8m9nH/52iiZuPzh9qC8P8knHlQs5vPSRazo3l7RDs+Oq7BWHqqV1p
g16l68tIy6/av9VGGkxi/dP+Y+dG4LblX5GzfvorZX9ZQyMXl+PEeIf14O03ZG5YbrpBSACbXUym
DZ3FDnhOVi4YB8XjoyMYQkD3hkfZu3euGmyDOgUrVXW/ZSKgloc0vLtqQvfoI+px4ADREQVt8CCY
3DHk+FMK6SsriQZV5D68BGxALhKgFRlxICljZkirEQvz3H9SUdm+P6RBwVgwd3LuTd2Sk7AwkULo
rxSzA3ltJ7NPqS7tqYlxUd9OjwQhpLNjiOrbkz2C3V/c8CA0ZND/QuoztEYnWd3cSx4XB9KNSd0x
iY314SSt7r29pqrNESWJvqETndhZeu0n5cceS+ZIR/Wn1jrU2vusKYDP1o1/+6Fck0BU8nUSxjyw
KWuLpd3ZNNo4DKfBG044Fd9SSBjsWWceV364lD/rzUG33uMrJct62GLNlcU4CSGg9P/XAdupjI9z
/hQo+rvQyYIUqfwbzsrFSnFYpzyoMxKmipJ6+nIqQEC7FZc4b0mI8fqeIqKFf2MZkPIVZgWuE8DK
6hcZttpD5QCVxr1Qti5AdOsS7ja/Lbl/YqtfTyFTpJ/0HqnfjObyGTlv5Qsy7LQ1rdY/xLvN9MXW
kCPBfuVdVmQXJfk2ks5DnbUEukyQCkUYFY1+gKHZyKxXC3794xhDSovHH68cxANR1wYU51foI5gP
JJ85sueycVIY9c9iigd4sZyWD7+9mvuLvHzfYeh/n/f+xRyxKOv7VanzATPnLEt7MXq9SWp2+Bst
3POzspZJggs2Iswe414cBQTS2ro9EICFQVE2XJM89d+twYeGaMcsM7Q2kVQkT79l5li8evci1Do0
iudmh8eL4SdGAd1SUOM/FmRZw3tzQuy1nbW20fnj93CohmyLxH8uRwFn6fr4RD8bfU1RNFhyZG3J
6sZLqDSXGfurDCIF3QZju4AoFIIybCaT4EEGuBQy6fzVCDRFF2K2bzBXcgL9A3fUxvYJk9z758P3
hDypBZ3WD51+/yM5aLSlgx2dgMwfMfLd7w8XN75DHOx4DECmISZ5G3+t73F2Ev/9voLNPw8JCb1G
OSrxjSMqWDJvcHqoZkbi3dPmbuNDxCoWT42yppf9BegWyN0CQ90is/2jUBmsBt6+vxkUq28R9Jpc
ELlnRtz+/8PKhyDhZ6mlclh/bsUVu3esAh1lfzKXMOGEyxx28FgO8EvnZIbPy3btBSuDcK6ZGVq3
IM0znSATspeKdfBBh70NnLKCuKcTUDvuHMZAI1PzOCnUxqcmMdKODQaJUlbpVgLCQZCNc1Tj1ux5
V0ue9kwnPzeE9mzSMCF5PAuLIxQaKthCjec1klpCJuJ9UemZTXj1Vvy6hJl3AhYuWH1c7RdB5G8V
JU17SwP9BCPXeN1hOO1JDHzT6AShZGSC+vKu7+M0qJLAdQzRheMqputX+bkjeaYsecxuW3YFxDwu
DpTVVwg/VVkBfjqEuUtmm+ckqnqz1qko+7nVlPf27yy3vCvSx2q/8cYSkU6haw9hSK8BEMHio5oV
qrAdWKveMH7SSan3KfTn1YlQOipLNQ40uNy/3vMHvZUWmvqo0bfTtBQGatKik1S3sFhDHB3JXrN3
Q/B7H6KgiMkwUH5++5hZRHHxgA/5Qp+YZUNI68mmGWNi2ODfbCuOmntljzyLTk4D3eL/VFgfKg6g
LIW65asvIsloa3gpvJOO2VeS5wu7tPvNDRWp9/SMoyTTBcI3vAhfLNq8sUcohsCcgBpoaw+NGPQs
sefcGPvfb4uh1i7b2JXEfd9plzTWXyaAVEMSp28tcNrmFg0AOIyza51qrYOekx4GSHWspGqakGY2
QEdqy1Oa3Kbsrc9vKl5/mU+2zym2uqxS4a62/4edOFer+c3SE3BQVUJAJ/gW9CXika7BbjIz8mgp
R3ANCEo+mdk49HRvbBqDw3Ivlx80DK61sqezPmohnU1PQPHHhAs0wtSUHUlUIEAea/KrnLFBu0F9
yV1vbGpFlKRIq/cdmw0VBA8NhIsVZ4Ob6dqD5Ca99pegYBUKXEKLDNfQ5LMArMOHhkdOrSU6TUj4
7rINJcs1iYoqgLAcUqQFXx4yKC5QO0PdVF5u7mBvdPc1MmJAR4t62h5H9GC1qSwopm4zBcNkn0sT
D8cZY02MsRwwK79+0ki99uZFp5DvBEJFfE+CWNpqvFqraAojjB5f8hz5cDaw+sUZJ/dqE51r06I9
jNJsvJrBaYB9oNNsLRFxMbbB0tHgk3gJFsCgp7h8gUbgB3OvHfrrgFSPk3wj2Wq59uFnCEzYym96
HcDusUMnBYeTWQC3+OXfTFp+t3wcSTy84HrZoZBImKqxwR+dmx01i4OwqTmC10vLwxtOZ2sM50B7
aB03tYh8QfxnOQOnHDjMacEVNnt6UCbNPGI7VI63mIs2gUvMxEhlLIvtzsj17koxSfohbHLUcevV
bsI79gSQVuP+0qAPQETqKXq0EyHRAq0irLmNS6KD71TY0N0tX6vweqi4ux4UZkbD31CWRqhZ/Zdx
svXpIpT9XDMCqsTYkf+w3HLD2KUtcR9UEJ+A0Wpx1p1TGU3je2APv3JiOd2B29j26ttdR1JtEDlN
SYkt4KU83C3ltUxu6WYUfc5qLS7bPNSCoBncucID931tdXyOg5bmgSqQzbP00X5vIKcDFYS+tQtC
dOuSjB3EqavyUB6UxW8arNbB4EIcsWSkSjJfqy/d3NGewSg2VrPcr5kBrKPgReIxQkzXs+0bPgkA
is7brkHg9N7HYHQlUwheYoY14Ts5rp9JpAfcX9Y1TeOKshCM2U6kcIzzXKxLyZwqSdvywwLszUn+
Od3YSBgFIo4lh5fy1P2hWXhxz0coweJ5HJ8qbiIje17vtt78D09g0kkF5CzJSLfYoUaCayjAkGr+
sj9tmMSTamX3KipxjuTkS3SFh4qdhk68G4s3zeIooXtT8bfmoV0oqXyj1lI1FBqBv1WSA5LiIWub
7Ur59VLWxxxVcEtrCmNLWQt1bO+zbcBNR3pnbLgeD95Md4BvF2c7AWdA70Up0BOy7K0uPfymmg73
PXUnJMFKdfcLeb1UwH2uVDEK2lb7MEhAk/9aZNHQuHVmOQHcQHxTlZJ+Iv+n+4bVE5aSL2hWUGbR
/uSZYMNdH7+sdJ5jq0tPiNDnw965rgJWFWac1j1enKm9J44nuSOvjaFPgwSzQcXBBUOUIf+qi2d0
7nmw07AgizFoffkBVOR0CLHwjunAg62DhJiqEGU8sgLxEWUY3ElUm244DVxPRSJVMtBge/w1heH3
wbDGmgImJPW73MUzLVk7frw03InJAonlAJLQC2YVRhtNrNvvsqiMnvsfloogzxAijGnuy25HVx92
SVAul1kVaYqbsQLJElL+uON5yyBfCGbtgQ7zCH0yysB7o5XiXgl//UcAb4OMPZ1SfFkzSAgeQ2I9
uAgvNmzMmFTqiuRCVrQ0WHmnWydGf2VtjJYO8FQN2h/PqTsmpsUvOeztIEVEStxOlQ+Ii8XCKFfS
2ebT+4XL8EdwR6W9LSawRk1F62uudd5zElxXKkjtRVMyi0WjKk6wRjPljyGMXoaihlSL/x1uwS2B
7x/e7+QBaDH7VnP35/JYHrjw8YaJAuFSR4TkiNUG1gt5v34nPgPt0+aNtRDZUYJ2e+Q4RkfFiHpL
fIqW3g4/g5SrT48ihndBB60KBHqyoQJXJ0Dx+hsa6+Wi/g6K7cLqmuCfbvbiPyi7pvj0/4Udotu7
1U0Vlrb8iVm8JD7jNxUOD9N3fZrj8W+HgJt7vNxely3zzAjVQKFjHX7iSZM7seL5ynR7v0fa/RzQ
rnsyyCV9FjNMFSXKPtss71CMld2zTmckAzZ0HpE9U7bUfEvPLM9VzljcAmtOx7/nrPQCKi11Sbrp
sjmflEi2IT3bjkXEUsdecYBQUZeKcxMKgDKryX5N4V5UyxkWm2CN9RXZtXWdXGN+jsUhb0ctkoi0
6/lo/2/1G0w4pyjDtSPl2r2Yz96CoqjGdMUB6HVWg8vgnNxUh7PlO/MNl9b/Y5XjellI0lc9wags
wUB9vTz6wpU0sZYpc2KRW0dF+24ZTX3pSBp9322AwrlBvqC5mm3yxUDbtlf3SZa4x4oyOJqrLNqW
tvMAXQcqCI4o0dS10l8dPfL2Nd5MUlx2OwTYwWdnoY+9iWo0dVISwEBsAVmM2QuDoWWZTaoQEq4s
1DvjtNms+NOFi5ScBTZlowZ/AuSA9ZxJdsjMP4oMpDf8i25AILKKfaKIQJYZFUfQ/eE2amCy6Ln6
U6avAk5e0XI2WBBwDOI1IxShf+OdP/uB9ugwct4VI+ykZNmYeYWl2j6mjucsLkBI5EiOHEhXnfXC
a8lhYevhgoD7Bz+Bz42fQqvLpZCknZyaOy+TSZFz952Fj8N9NBb3Cqv3d/7X+YlhoYtw6OWkFLCL
OjGL75V4BLMB9+RzkG2zHiZp9BmkwqtTZ4JNpySMAtcr+lt+a2BiW4Ze7FcbFme5+Xh4XXmos2EX
0H45KSvVUL0h28BPdaw3jA/bAeWWeLo2gW2/bwweJL9AW6GLMK9hmjWA07cd9cZAEWDEULTbUA93
vKRB3uD3MvEPsYcBgP6RJXKv8tI8wHEyDl8mR2XRAtaq6kUK6y05UpFKAyJEVGjtuPJaXB/G9W+K
rWbf8LBt3X8t+9B/JthS1rWk0no6jrTYQPQu0Z7YdxN9cjcJBEJ8aS9CFAORh213NTv3uPDsAiOl
HJtdAB/XlJyvyhUN53szjFkrEBhGtthD9+rH6zbfKz0m9Mn+vi3krC7ZkUnnxhJpy63Ea0TDqf2m
76DtT2Hi+S4ws7bi9UGSwxV/xZpWmxVooSQh6xyuxAO41a1tqy0ztvW0jUDwF8P/NCzrDeexE6Wo
T3tqr+bicgM/JcbVL1cm0j0qGGgAAb+n/kSIFRCKusELkE/UoYLgki+lh1f4fxkXtsevA0AVusUn
vsAxWXiYQPw+mkp0FgduLT4ty0dnmTMOypGZp+rHcl8HFFeYScduOAHFWlhzLromJ/2WAWoWQ2Mk
kROabxewhMzSHeI0JlfI9mqYb+8VFB0N29kVMIndMHcZ/5bOeNWUs8/Bnd3Kmzz8toVA4QkDcxB4
PeBPov5dMW0OFHoBfTK2w1w6gP1DlH9kli/7Tb2LmE57eeQaKDzXxcfPn09pb5/mBVcyor5+Sgt5
qeS3Po1FDhPQvFpaLOygRfoV5dJAbP1+Bgs9Eso/VD8S3jAsOjtPM2LK7MndJkvqRQzxmGxweV7M
4wyIH943/acQ6TTDxzNzmRjrqnWpH3K1iaj3UANlMmmGvDO/jveCPynvKS8NuneIfHFvR2vZ9/Qb
lFhTFgys+GViFMx0RNRD5BCJOPbmQ6w5iA0LlOrU31ei3Ya6IP8KZ80dfy+mM47w0iEGQMjuROZ1
uom2HS6XB7CDUQXzlKeBCoN1talkttJ/im7fMppPJBNc6+n27Cm91HQF9Rpxp1a3r+HifPyhK5C2
pf4POSyDrpU3y46FTUZahMgaA9wRLsjswTykmBrhfPZnakNA1asjPJbkFYrZRDyibJYOgz/Vwc/Y
ENfdz5ErLkvZ9YoYvlOeogfA0RbLD/HNBuVGz9YrU26/4WCMc10SJhqjxkw9R8bWkhG8fnneng66
cNcj+1LvaUE7HctdYJ5IZ119tC0KGjA+s82yk+hjkIp9fs76fv1jWFtVi87HHZ20pv1tsZa2c41f
tNiiIoE/i1Bcsw7h2Rc+f+IQHA+u4Rg2pkDMLNsBEZh7Uyeo9p6sv8dt/ddvLM/pa1qMktKhM3xT
WTyhIefd5U0iYsylltKypI/SIjj4NhN1uIOMqrPE3Sk7QJl/eMS8HM1TM2fS4DfhZGN/T1cNdJX7
nC2bnrubZ211IZKbL149otod37fyPbVz2v8D5TQavyYIug4AlVaEB3+dHjZ8yhAWPEgsILfawz6w
7wxKTI7TVY1EAZIkwO1KS4kWQvQE4bsfjEi9HLGiTOg7X80UQR9hCzSLY3Hck8pNEgsBxF30dfiQ
4hJNvjWlXM4Zu7CqiUmsOxd3FJ7MEgJr/fdwDUtySGYfyQdeiUHCXEC1IvPzr1Zh+H0MpPPfR7lQ
NM8nyyj9V1KpgAiZy1q+8WSIwkSqtl6i3psfuwwZ1K49EYUtxWJqTPJDoA2+rj8cC5khUIRx3bya
dWnisRHAgAXUlH30jIuBsPbA5esHGVJc9WgziX7O5hZE/ixwkWcSJeHQcap2HwSxPx9yoBTa/GhF
bbd8CpiOq+G0ic5R0Nk5Xv3WNzjQ2rp/SwjAEHi0KesSzuBUeVq1mfGZ57rflNAhCHXzTPARnR83
Kd7c/PlPeofG3uJYxq3QAsPtf5LqSqa5MRVDehvVze7NK9zH0D79X5nqdIRim6nv75HbC+xfGv7O
sHvoTNHPFyivChJSELdtxa/QulrhrM5rILh67wdZjwVB1+ncfjigbszbwwYoS2DHDHzJ9v4zZeCQ
gEOkKzRU8oqh1JpwGblWxna5Fug4oCPFfWn7GlNXhRikonpizn0DR/B/Iwy7uJcph40f5S0i5H0u
0dTa3bpihwUcHgoS9iEzqs4NkusuTnOpWwbNpgUq3FBmb+cDEcUwwv/TNTllUByHbo7/qe2GMVmB
zsOh+urhlAIe1vYhlE/3I8ypEhffHFdiT+lucQm1fmD1wdaKvEL87ECXsiT4EWbaL9Of8cLMtz/Z
RH2etMwWY/Ztk8e2mk6Cj8545uEg+hrlutrrGA4fq8+mTHnyc7qrff8DTzTOcDIWrg1tSjdExo3s
TX/6FtJH1XF7tK5FDD5owpteDL4NG2H+vu0Cgr+j7ITcmodFHRNCUaxqzaGoHmCJU+WviAsj/xRS
Tb1rX02L6Ix/LbVNMQsRFJdRMkUXGe7m/bJ9RLq8tu4M+Qp4RCjQbmvd4gRsh0vTLxt8YtxmAno7
ndZ38+niPeeUVgPgJGET1yBSIfXSsBExvPurt+3q9AbB8Dm3KOmejtWLWRWnvwxf88bNvyFpISk1
Y9yCscekuOJUoQiPtlahFIvBAx5cA+hhSbeHpVEcSpHaPoATf1ByNtCozUWPbCSqEZ29qyn/dAVL
25XT3wsZXEbOzMOGkbyrl7cBePbpwj9XLFDJR1jfofU0/YKVlHQUfi7z33FiUJNrXWOk6zuHP9k+
ig1Y+DOu6i8c3tFYimL2sQXli/VGpdzsOFV3QtgtXPABuwHgE6mrOKLQYi1JfHffBcQz4ITFdpKd
viO77y941GUc5VfL02TusjJOr7aCMKmbYDlON+ds5VPyhG9uqtyYO8VbpoOO4fcimgooM7I2ZcI7
CvkmedzdHMyMuw1+BQU3/Q+M44KBNjxVj5XObW3CyfLStMVxfqG8Rs0dH14Ug7MFzIqj81rmpfsb
/DbOvIiViob3g6XOlUPNwem9f/kshSt+1lCkK0Kun91W1H88DuCp79WuzXqReZHOQpcIhHgQQQO0
7p0cpe9nxBvwoCZz2fa2ybRAGrD0xNHwWALjRpxi2sTjhRPDZH5ktEUYZ/bYsZsOOkZHebPhBy5V
9AwOBCRCo8yzHu7nNaOCT3horzFsqX23TYzfVPKpPz7RqJZH7do9m0XXcQCbwnmAXIcy4PXDgRIB
ylzWvXSXyVAHsHWpq1F5sePqqzXUXVhB9o3+MX09jruZFfYzunmiteEcX7q/soGgbG8vjyRacSEz
Z6deRa0x2aH/8ISKDjH2WSLH+W7me48E4zcG8guW+h81UWG/8P4azvn0TQRgTfriiR+fRZ2c0/iY
7JpIF2r4Q4TeeNWCLNM+bV27DTE0+dgpJXpJNUR2SfvRWB7/ekYM8Smj55r+oPSGnZiJZyriKsLn
pzGnAf58nPi3qR9w1xvKWdLTXTsRs2vs1LkJkdj1FID8A7HZt769Z7hZCuUyCNPnJnpXshMowSWd
ZWaQlirJo7UR5avFlXh/XO8tH5GdvB/wH2JMm3tlv6fb9CoQkBnko6uOD689B392Pi1skXulJ2rS
WwSkNwvQNBrG5DqTRIVvCqijDu5PnS6yiMrsI7TK7+47+qDlgP6G//MNiuu8Uu7pHCl8RuMYeKs3
x3K4QP+X662UEecsWC+YjSjlSeSCCXo9xBzhPHlKMFq6FyfrQAmM1QgbXSkYc2qlBjttTceDjZjr
A+j3OF15U0xsVHiO2dYMQFrunX6o0i1iqD442NLJVwBexzUMkWwPEZKGREXL0KLnZ5hi+rBW2AXF
kLrR2zZpvRd998yMz35kqxtpzze4/AIEyiFj8Iju5QIFX10r04tp3jidNPPDUgxkM8yTJL2ZeULO
HrS3vc0c55R5lKx85nevySjKEQoD0OhN4f2kWBNiuXWyEpAHnNjSDdwE+t+7Dkrhwoq3VS3NKv7E
z3E3DNHpdIM6QhgLljzFLhGIx/lp61Vk39hQGlDxwo4GLErlXfYtdt469HbVesrF9wRyoKosxIIc
YFIR1qw1sTJpqNhBzQgMGPkSzHsYpc+nmH5S8AL1O535jMrwaOvVM2uYl6FnprymVyyOUUB/A5Te
ulY8WSHdZUaKHVB2I/bVoKPQ+ZD1L4HCVbg0aAECiWTQuYOWiE2vxZbkR3unM5Tv7+6fsREqyyUU
AVxXMhn2XcUB7x0R23Pdq+grkdQU5+MQyvU4LhGxlZjF7ocZfj9yMoG4L/+O/vyeYWPXskyrb45m
4sqa8PcP6uI8j4dWOURNh0SO+QNE+F1vCEnw7hnbsgWg7ScIN3oipp3XFQ19xnWGOfCwctrqYldf
341kJmtnnQlohAL7KHmHoWZaFCLVVv/bRVBRCMOdDRST2ubzX6HTLQyHFkgmfIODDz3TlZ8iIw2G
WfCttAQ7qvchqW4pOLVt9lxxOfXwR3C77+T22G2qwtBsWsoQPPwJ/ixnR3IeKbsd4dch99bMxQuM
MtEOFsMEimItw/GaGe7WsbWiD4BoUb5D4QgfPP/Dux/0QNiihoJT4qDjT1w6UawJTKAOHjevECjY
t9KPxywcnojBrNSQhexvyd/EnHdOCZOrv0uj2pSxpMvZCT5k/Sy2/ogXPZZPx4GhX5CHuiFwlaNb
solZkUmh9baLhOAdTkNvTZ2jQsOYxZbeawhVP59Fc2K5TDd0qqQ/wazWSD1dxVVUWlBcHv8WZfac
SxH+f6bHpyRij24KdW04mUmlU1V0SFG1cbcQoApfmdMQdSAcz7Fa5WHWfHlx+leMAoEWEppsk6mC
qNIsFS8M9PjDgqdUD8B+3beJECuDxpjwDIPHTePkUn4SFgYeqcqMChyV3Dq51du05h2YPI5692hQ
NvmNmsJrbJYMsg1y4xuSliYXE/GHugD9hWKP4/46KkIyG5sQTunrlJC9Ih3UnSMR4Yt5NURWeXEO
EWA+aNp5CuEI6snYH9HMuopUPtemuCwW3V7SepDkePXAF1aCHCjiaevFfPa50/H8+wjPjA4Aette
5CWkm0lNjVDcXXmnxtQRBBYeO4D+l5O5PRUmXHJkXif8b2j/dokWagnAnMCHla1x4azA5CNrFy9w
+ke20awpzyXVH5bvr/BsuAovCWCIJDbbrPv88bhtZZp7e7jBBg3SutBMu6XUxyqrQheQNsmhSDtr
kPuwqXjFqEbYqbjrDNOhbwsgkhGf0wBfXoQkIqeuMuUFfpfCi6tFF88dyJ0A2A9ttILUT9JsFVsY
DaseHTUaX8V/zgdBHqfynIUYz8QybsY8SLMs00zJNJT6wU3yrRGf9PnAoxP5BDy7AY+WkRYR2GAm
qUSE9khjgmaR4Mou/LenWpnsMARdasXsbQNgolQnYeIhL/RDPyoGMflO4dBlLCtF3jNi4KHfB3b8
5yGFzgzQA8o5o72+eNVqbI5tPPPt5seVM7+4GGr9sRAFPLjRcXFOg+5noWVwiUrvxbpR/lo+lEEE
wPmI0CiQSL/e4iUTHHqRpCv4r26YwoXKmqtkoqi63gthr4lEDUo6etB79M27SQrtwjrKlxKs1MLj
4hwtwRs5L5JzZRbH/MiGTRz/HllUtXba3j2vuVUSysGLI0B2DctxXXp9SlYKsmYXaf8pv3e/YOwD
VEZWofsDYUoaFfq2oxizGCfc5EumJx0uMZ381a9RahVpM480/Eu2DYB/1QXtQuRnQPUeOKzksouo
BImeTCPzG6ccnHryQIC6fm0A49nxY+PNoDzc3cK53h58nDE9wQ8WWKjyaILw9/BrH53IGaAaD0PT
8MG9n2xdUJQwN2yTlkiZXpCAtC/wwPVX53OiIRK4rEWpiihou9lkl7Fi2SnE8J2p1/6SitpF+Fk1
b//Xz1SvmhrPTMQ5OJINSP1ZTFW0unuUb8qDM6z1L6HZnpbWykYCop0+hbh/CFFMzWUnDgOuT7Ez
v4rkYHoeUnnUVhXbOEvRiuXayJ7MJZSZGL/8/JbnZAppgInyJgkSKjbQsVFOmOsJBsX9cCT5vQYg
Nu0gXXmW+pmKsCsgioamEN8Mkma0+LpeoEpaJcFnxjyRuyI0zYEgM2fGUORIiVnLrbnLpcL3QYTD
5dEVEar+iTe6tDNLypGfA59pCFH+n0dkboe++cZqpy5u/iYXgL5eAWyQ7S7smyvUxF7CqXMJUVW/
5jM/u6nl2rNI7OdFaFwe0l2l+JD3TXqjdnXWTRZ6xeXd/3/BjbwMdVVF2yvYRuszPMgIdHZNW2sd
2BXB0BYJIaSZTSAfM3EwX01fJPswF4dTffCTRWYAhGzsZUpewHsoruEiUeZt7qY5ZI0KpKxOWTQu
WLP2XweFG0568vo8Z7rlEn1loURxNhU0CQxbCURncmr+DYvqw90Cfr0pCetjzyYUN6rOPAiEqaIz
spnpFKJ+J9T4EWRQ2SpjYHHMMnmcuxsC4/x0FFpCpOn4RBcXPyhoEa2KbTiQy3AaSvALXr/rDrzV
5ZEps2Jl+QioMaFrrfCMO5ZzIfpbkEicxHVwiD0yZH/5ErkNLKuPF3x9a05m2Y5vwT+adCpJ0EeD
AjayPwxTO/kvlnvagenMYydEol1PDsL5lbg0/8BZb4VWO7j7dIiGR17dVn3fHJbKZImSCLnj/74L
ODMzbMH5uzFRdegr4EdE9p6mECZjndgMjUWNe8/5FsXWungSa3GQcxRTYNSzZnu6zzRz7vSkcudy
ygOlwnENQT/8ruHc1cWoKBNh27uJ4BM2aRxkB66xs3MCQkmORkyPsZKRy9/Cjyf5rWlxQxJ2jUMV
axjnVH3D3T0ucE6q7L4AjcF9TG+XF6y3MoSJSmxSpxIWTUijI6B3gultbEHsYL0T8yDcXme1HByQ
F4MfppNkyegTmEHdEIpSf5fExlGw+BSmP2tbCGi8f5ifRKXqC9nWPWyz4s0t5UnECf6f4a/guYa4
YteHXVdC7fIyJKNQytyhFUES9rsJMgrjJwMlsC5/9ElAMNBRjIbWfYtFAsWfjSAOdR4ZfRTmIzDl
cuT3I11ebs4kcUKKhjcAwk5Fg3HnKQJ7VwXY74dIwOtnqagowEUvxzoKhGP0HrGL2QKesCuZfPqe
hY8l7zGhHbAuV4OhmgctFJMMv3v5g6+EktlCbdOVTE3SqSn1K53o9TciBW6cROtXzg/F5pXcSyfn
A1gkQqKa8jwmO7bknNGC8+5JW0wUoIT+sSwlQjyFHiD6+OPCw06XDLYXYVd+H1deKD2QDwwKSPvD
ONWwiGzIDZHDl2mQJB9R0HgHZvibyaA2RUZ1Z/atmgzBTKy3IJg+AtNm3mknAK5mXIQWmVJecbAS
z924DmfXOJnHMWkfuZr5vf4MbPR3sIWSj+WtFYB5ybh1+i43UeyLhFM/TcnegJl/dt3ebtJpX/RL
hQ/1QuMhlSqstTa/nSRlmSbFsWF6Nh3P01lt00wuyOdnuvlzQScdtfMMc8xqK7enazpr+LS8H8vp
mltOGnlX3/EJO15NCMok2CA34hCFfcQrQSru5y64ITdId/gY5XrSuvE6o6AaAadmN4zbcZ0es7yx
MCSWSfnvLeAh7i3ZVZLibySOEFeDo5M787TunS71POnF28+mLU2cZSiz6dHSYf3Af6obWzNpff6i
HbLnevV9brencn89ao9pqqBsEGuR2gdfeyVRcRbcz7gvXkXocpV0X6UUI5PhleHSJ+Qu8Jq8tkMJ
aGhSZzmhsBenUeQxaSySVrBi6PKEbUOkzRlfGYfqmchnkwfGusYgRtHY8rdoyqAIxt/0O5f+Oegu
ClHX0YFErMYK8zaS2V6mk5TEdl5+u5ZJBipoB7oWQPVuHtiyFGkwGKsmLMuQhcsm89XdoCoSbv8Z
812VFabWre+krrsU94QNYUasmMVi3KdGavLXh8dAxmx1mBUo358EL1Te9+orEneKhH8G2R/1LepQ
Xfb3v8r7BoYTh0MMMKLwbIwTJDFvzfb9Fp0SF+GzpNMHiwExzZV0InhyKtlawyNvxjN8wcnpl8ad
2aOX4UaeBvmgN4u7Rp8trzFFLF10s95ZJy0mpfGQ2T5qTtOOyDDMBE/pccGksxTBLAyOEdtk2E9Z
VYvHZcRy3B5s7Qm5t2UmwpPy44udgZu9xrd6OmweUq8TuOOTOncmLJ2+v/KwbryuNnbChwjioi0C
+6g9Sp7AnJgA3y4q500pX1q23mCYQpqLmMZQMudwBd0I70zgxW+siuTzD3bQT28CBZw8jbMsAifu
S0nrOmbSg+IrdJELut+OhcvxTydoF8e/4wiA1aXeKkE6nGlbivxEizO05gQQdWqXdbJcm57aLyn0
K5XQ5KCwJrPmIKGqI/lY/JmISfvNVpAjpxr2H3GO8NX7vYqjES58e8IEFxR9ZOTXu6CyPJeBUSBP
w8T1nRlwxXCf8aCr/p93jr62B1MbpiQ506fCJEUwroHxqupPHEtFYP/DLDmPxaxaUdG8/a6/6Ria
65pAtbrn6BGSeNjLCNIsvSbp7X2F+YVU/x0jVplG1xVrRBFra84RFcZkOGLCW77NcjoOy6CANaft
DD6kYcVGD+XnPzhwGIRT5gYJeGqqFQqrTHHNnwtfXBh0Bhe6d9zqe9KHK1YG/M0tbZSBwfenePWd
s7vcpbqxUQDASbo5N1Ob12UxNJ4ln1xBf6Ad22cg8jops8VMN8Eng3tL7pDMlTpBbXqMjCqrusio
7lCvnfFvxWa+TYMw67WAfXpChhuFotHzVMBuAX48Ut15W7Xa39CoKOSiUgIEM8KLZVxQKzW1lsZl
7ftcgh7BPGTaNRCK7Wqhy0D+HBtel+Qymmn0lL+dPb8NvGXmSgks+a/pVvTgE9wN0Rdyu7eLmn5K
Obr1BrL1tEdZseESOnp+tjl0/AZAC/BjaZTeNQ9TjGikOPLZz9QNuYDaMH3VFx6HAvPhjlx79dLJ
0/8v5HPUyTfsQCRazaGJK7nHsyV56ciaGPw/FLWw0v0jUKflG2Q7g/EAAfzzglqyMKJNbOyYSq5N
ILQIwycdCTZuvdZLXwcLOkhiqVcedhwcaWhVYN7NeEpMEnTY9v+LlYy9d5BZno9xi+9DBnyADQ9g
LgwGyHUxlqradDS1paXJ0j88VqzgbLYLnLesUGfpWooJlO/HmdxowZ5PEYXoGiT0Thhq5UbKnKx3
6z0kDCMAGetoDNTxC9yL2Kp8BOkQym1Jy9NMZKB/fV7H+9hbYrjXNl52Ia3BwlJgug4O+f4EWxPp
JQdCQqdCk5zcLFVyM18XI+IFK1y/ICkCesDD4AYE2F4wGjTjrsCgqDi2ipWWKD/iRCtZfN/KQYhE
gzi8ytfGWIUffJTQ7xvncNjYqtDmRLlZ5YHpauxGs4dLm9UjnTQMzLgYY2d2jUJe3QSaXdgmTSpE
xdBiPttfi5nx2XdtiR8ywPjSOejVKyD7IhdXG/5fbNOv7Wulabri87nzBgBK4+cdyJfJOI7KCQOO
O6bKiYVpLeMcNKjG1qz2UXYM+JRRndHYc8aR/rK4SKUX+zLFTvVeAQTYwB5FlAQiUG19KGd6w8Jg
aWFw4NqA0RPBrx1U1FAQ9oSDc/D0yI9clp7oCU6V+3CJF61BP9y6U/O2YgcGOXLbuiLyEuPaAXIl
MBCdHZr4HiRFqazxWcPt1oeyFmCDx/i/PHROCZuNHrxFIFLJIt8Co+9MRujtynTuY1enS52mX2YN
kxcairm/HPre/afp6deHXj5jvAlT537q82/8n8ClcKpLqQ/lV0SVvLkSBVYjcDIKon3GqtimS6PF
rYCnU1AspLPjVtA9wcFqmz+C9+zcW7z5F3ojn5EeZ3Q/fvMH1TJrfqV/QC5yr9gmxAbziFR54v23
hozoSO/Z7REdUukkZoCGWm/R/H9xMFALPMEZpZRhlgr2tdYtCuqMUcSc9P5KYwp+TFp4Yu6AbiXy
6FheNoKVGOgC4WY11m7tEdQDkxFwyPNcR2GUwfEXtH2rxmCfEpmTqzWfFwkNYhB0rAYb7C/KI/BJ
13FdnLDLGPNnrp3s6o4tEiVBPhi6YyqnnmJtVTP3cAIrOWJpz44OVhpVv0ffbtgHYSA10Sdyi4g8
PnWzjGvWf5h/RXWh0pFOfHmrPe5ELgHDMmBkopqCem9aY2P7ZEMwxUdq8ptiGe6xp2e4DTvnkD2b
38bqJsFiwOtyUEn9lDTjuGITW+itDvTCsYmp7gZvvp1qX14uQudKtjvkFM4yV/AecBEX/nw+n/xz
HJjYIDyhSz8vert8xkEQ5X2AiTY+ZjhGvoXD14iF4krRUNFOVspl07mjmr3HXsvjA2sEQj5KroMh
N5+EtuQogjXTLWKhbCvOPNv4osW12Z5U6F8vDT3u/lXLgeR9SqH8qh05Ylb8xx28zgRVWOfVg2CZ
ZyCjCxHQmikCrKXTKz/qNDX1CXVOEexfklLv9glxn4wg1bvChD++C+hu0CpMSxKrTFGgPp6dBl5p
ahiA8fg6Jf2Hi3Zt/KgImv0wOMC4a18Gmc5g2mM7QqwOcqM+xmcBUGIaqXUtr5Je2HpQuTNxAMPk
Zu8cBD81IbpAIIlE1599LZWHh82mGBnN/0cB8WP0wbEiugG6b+PVBEmDpxB6NOmBWob1Jy8/LCF7
RQTPgebd5ZkR7+0wubfm2bzJf+dFvljH+EeHFyhyikgx1y5Tk/rF59pohUn3KiZXLKstW3tCk4Po
c5k+g56qqdYZVHCpm0gwbkc8J11vZ9Mtf2Vfjgv64Q42bWSsovNBQSujawrD7AnR+feU4WOWG1+c
awskHaxglDT7H9h9vQKizg4n9g0CGXbZ19kCEszzHGAQ1j6UqvvKPcywQXcIKID+lRmC8WPy4Bf8
x5n0Un+s+bEg7oBiKjy5m3gowwdOVXaCUEUAqAtmIjzFTwpSPcTX7TbXLFYbHTYd2DZkDGkcZz/X
GVguoTSpVY0F0VkA1demEc4n+cLz3KgvCAhpk0q3uU9fLrh3nNgvRTjPPCzaWhPQFr0sFluHkSEn
wQn6dr1M0hORPBWOioEcTEGNlwWVSbpfzR73131LGDQt2HO64a6iulAWVOu0/1GqO/66ed1a+1/c
FGAT1p9sKMYv9WEHbmJoOeAGe11iSLGlP+wddVhC6vCthXv3YBTl83vHVbEt+6/Jn5phc2msQKAE
73PAez6L7ioMnMw+PJxgx6rnf+hzMhgaqtRiRsyPxcMgoKQWyomtcA7Uu7ShZOBNFXryPcqiExre
FROOCLCzwEl9OsU7k3TcSYg/V/P7YRM4UuAnYTLxoRN7TPfowGZMuczPGYFOLFuYoTHQa2f8Qu4r
f8Jgd2g4KsSzuJ1WNiG0IO9f7jf7XarTLV9AffZF2AGZTFUdJiXPrTQAKLc6QvBjSdvTw8tdPGja
1KyHHg8ppgdsJ9RaHhq/TtthYBO0XC575ppNuf/uO2A2mIS6CdYuN6q+INmECEZMkRBjX4R0+OYc
mehVe2IDfVkF9DevM6X7qaFLCl+aqJfvUiFkmm4pH9aj/3ZqGH2TYAC31i1jblwm4Ln1WHTVyw6c
k1JVDcU+KhmO8C/T4Qb7RYdWv/ZqSeR9RnwIfq/vBZzF4rKweLmGLy2+c1Hf5izon2vhzdowETbs
h+l3nN9WyakDDqhryxiFoWnv7m04AXOeFsRk72suLIp3trkvNcM9+fF4+sdXTzJW7+9o/WIqDuuS
mXSaRHPYoHV1ShTH0AvwOAtwUuE30EIHL2BSuesfOyzTeQDZjlTyMmY0w3SoS2H3hSNe/gVcot+x
7eVagVO4esjsVXIbH8A+5fuSUYOiV6HfQjQVOzWCfOGeUzuVqOONFu+dXEhw7vw/IVKiSjzLfjd6
I0MxtO6d9krzWjEP/U6JczlWIFlSsu6NE1z6eU0RfmuqxBiOGP3qkF1rmT8C+JX1gPttXjnUATua
0C5ohU37fgIMyBsfqoz7mD8V5PAWzz5ly6te6kHwXrrkiI4QajYrnCzhQqrDAFvSTqHsg7fjfZv+
z6OH5SFU9kaDlwgOiLh8ZwHpZY5aaG3gD4Syu0IWQJZqJNWUT/cta0KjeZcbZ7wHkEe+EaEYI62R
/JXp8kwkt9nzObt0G52ElzD1PWhU9/XSkUlpzugXKRAjjU1/PcbAE1s3CWKhcx16LlLaEtfMsOHu
h+x77Z9viRLtaCIYioiaL+7XpUTs97TPGK1sdKQ9TPxN7GRmBcMQlNd6gLfQYxnhFiprkhOVrjhX
dBJzJQNZWHF42M4mN4vRoJdZBVs02pi60h8GeNiKkkTsLX7FpibDnQb7uO347nAFcUC1htG25INH
1d7jSyf6DHra/ynpuYteyUEW7k1wUYKRQTpEFThI/RY4OLcDv+s2xVgX6HyUQyxCTmQbdbMT6cEM
e4ezwuT63L+DuNXTdp+eRYDYub0JK291uXTu4LWvUDs8ebRhlI8SG7Kdlb0Q9QCntpmDGrwaIg5q
lfcpmBuh/CFxNNdcXTB2tf2gUyivfPTmxdNsT3z0chMLT3o1oRXpK/iT9juQ0y9SMCWQcmFhGZkR
f75LPn5z9ZjZrmrVS2gWagE8fLSrXmvH+U+CdXhoZrIPaxFxnWDLgNhux4bCimdzaLXivYEQ7Wet
Fv5INW+u+hsbLaZr7WkSjzuiykG6/1Ui/C6GS5FQGpC63GZXGNvzSkzHYH6nVqLfVeBKWWRw2Jbl
L1Pwr7LpTrXpFL/iO3AEHm0mOLMA7MCNhg7GtxpzKMouURGrILR1k7BaY0QyecZB37b7Uzn9yk73
piNi9HL8WlrbKSV7sKqunJ4urTN3yqr927w+tooFzMdNt+JbAW8LKeObJXkuPkfRniIMEhEqTVAP
3cVkEn4/hAYzbFTFXfhi5mTncnTF/kgjU30/W6NUjG7k7ce5DZpbJMiP1t5CiioG5BmO8jCaYsF9
cZMufiwQ4iIEDiyS5KPxW7mPa/E5JyGy2W4EDU5SS0apQ3R3feQgzq1cr5lei6KK8fgZKSJmUyHs
/AjK54JP1YBPEE7yzIIemJES+TSzJEcDbQRvvjw0A4EHPv+rMwCZ8M21iCICjkvX7YW1Gx4ieo2N
8Lgeo/XIC4wK3xuYqaR84rhc5wB1Ec1PJz/I/IxXNWEvjL22XJKtagUEeDQe6rNU+IbAFlGZ1lAv
E4AYdJGkP81YO6hzFIEoR4wD92aPCclo+r/W4fv82i/6laubW2rJv9n5odtm3PRKgdfr4VzcdMSV
0oG7GayVgftUWZGSPOVEDuZD07wL24ZfQ/EUlItSy4YxeFNx51bJLgQRkLNNOE6hNotQ+PyP61v6
e66L7nIQzZeA0T9mvxx4zkcgX2f8LzDoocQTJkZkasE5O1HGcPK3Y7ui8Nm4zFnNRNEfAWfs736y
pU1G1nSNZ97wAAinAGfBhrPrXE/dL20tnfGYiS4uhS0B/+Zf3pFieaBwsfBFATt9TmQZ6XB8wuAy
3YYhnM9YXXvsj23G9V/3alFzL9Ffk+YzpX6Oosn2Y/eA6WtxZi0PdpOPqwNt0Z07NH2FbApyMqLa
j8xDA6wtlVSXIDJtor4zEFU7VyHx36dGUEvY8sM136u3rt9i+RTHVKelSIUFfsuFiCdHGZB01rWO
dC9xioxqF59yU1eXLjCozsx9/MdSQBKDedY5n3nac2cH41gjcSJDSwjCO4Jv8Lm21A3tykSy6jkB
Y3JDIE/tLT/dqcxUZlfuZ/2Fnn3wJMewY0WD4F8wRrbM3j8m5YFSJEyharVSl3Q9CcF/V0y8PCrU
YEh9QrNNUUBZQfe5gSOR3ohhRt4WVzo+kZhJH3aX/nNjMOZI1rE2r/rE14ImyLBNfdRVcktwSYSB
mq5Agtn91UnVS3s+xebw5HxzbOp4POHpFK0n7KMeg0V/L29nom+NY5WO3xoGyAzl2DiEpmxsHjvA
m6XcwtMaOh6FK+fQDgxSU8tU+IfO5+iDSFPycxEJnXbQLVffzfVyfmTYy5tvYbjcD3HNWo8zf85p
VSXXEQKWpDRm4V7zLqL4bKhJsaDCTME8UUneZ/Fn0fcxD3EnC7Im6/xp3aG4/W04GR9g7+K5a2Jo
k/eVQZv+fvjjF4Sy82PCl4iYuAAIoIjoNROnBKHrte6h3LJeN4pLpo66/FQBf9otNyzeah5Jnl5W
pZADdCvK7LAuBUIF2rlqLXmNfBtIiqEbKNH/sWnToOzPYmlnL/hoFFZjuXu8vHoirLkMYEjqHcxz
kGBtDu5nqMo+Mv3XwDfTg1AaN0laMlbh1Feu+Y4wWdFgoSrUySsUZozGL1cYSBCInGOZ8ylNsz8J
PhC2QmCJxH1G/Z9+NvmXDiJQeGrKda0eYTlwTqyCAHkg1+6zr+YMdvAcxWJrmS1g7ly73z8+RuJT
+6Pu+p134ZmSNWM1rfMi1mG2zbVpOoONkkKbH/HibdyQTo2w9bRls77tLFLz8n8UR1TbCy0dH2fV
ADI5rgqhSSJeYlNwKvPoKlF/QcQqy4uNz3yo8Ug1XDC8I1iZWV7Mutby6TbgWWkwJf87S4tfNXrG
AW93vzPYRTwGtnIFwRi87hXWA9Uvc/z7Vc2Dcgl9bXEkWzaUxS86JMbYNvY2rUNa9Jm4gudLcHcV
2TqDTQwrk5Fw5Pw6lpFLRpumeEdil6MPwYv+/7GAMjxeqrm2T5PhgGJqUvZm+SwL7EuypY0qaJjt
e7QiwXzurTdWlWutwMNPpl/kjZzzxt28QRZjfjLDhBHFeG84Wjv1+8jb1f5Ck/5dHFmDrjYcekha
iorzPlqr67kXJH/ZyeW1HUxjE/q0X47FlXLe+HmDvoEpAP0eWK/DS6bJNljN2V4JbyKoQ/D6msd0
qK5Kc478dKy5G9HXy3+avTbNKlwwACKkgpYJlTnw+C+9odZ4CNqSe4NiZqJFzr/J0Z1bbb74J9dl
6DWDyfOOM7GcTn79A7N3Fx8zvH4o1HYpKz4Fc5CmV88jQkayGfExTrXSpASAtI62tjXufTwB7ND9
nKyrhH/jByL3EZ2fxEEiewq9aveacdWd3Ubvj2M3PeoYKwXkKckaxGSP9Vv8R8BEwVYbUeLzlZYo
Y9MO+L26GaGnpvwsilOuEVkSzeP1CRlgW7/FZM0oB4zHRdcD4HWP/4mrstv5O3D66kF1W+dqHhNp
tmAO6L2jfKuYViKO+6M97268B1lK7CUqvCxWKw3JZgOxc94nZfTMZS0lFxBySqY3gxOn9s12reKv
tW1Mgq8WrjG/vm7M8TcJ6Tpl81xVHKoaU6727osMvLoH+Ruq2rOUnXppj05MjyGLKD1pAZdy7Ybz
JCjCBsqcQA4Qf8ZTPJbBzUVqn+XBB2DtutpM6LI6sFLG5fCaAuPq0kg8rjgCW6iRCmfZkG9iAhkV
sljZmjPA9gqTmtAG0QsayTsUtn2KFv3H4+dhKwXrXGkmiUKodJovFbNSica6J1wKt2EwVx/zUUao
itjmQjt4unBR1HMwZcEIL0ndjxSvJ4ZgFVP8XdpwmYNKIX/kmK9IV9HnRA2MNGprMMe9mYP88UCF
RV45WLUHsK1V6mhTbfRKX/kmEufkqpOi6v4DHhjah4YPa8gIgedXTeNPrw4dldihlsaElkUqqgUh
LSTBzgNMLPcL80eB+6JGAvyg58VefUpD6xs9dTIYYKkpEM9He2pdTqmbau218nVzN9bvLgb2/or1
rBQp3hmg5DYEdmscP++I0VJQPiN91M9rm01gQGv1aX2H6SGawdtoA/lzYRLzjRhOeZkoZQkPR+nr
4wFDdnm3uVQvc45X8KTu7FuYog1C5rB1gGtSbFUKcF1r/x9D186toqgMnV5clXvQ3VMmGY6Bxj1X
qbHzts3boXpD93dJ7Ytx5fgnlXAeI5LIsxduYcCHbhhWzNwQvRmVc03cr5+KnGr/MwkXsInv0k01
Y9MivRqiHey37h70TtimHkiNntzYMlIL6cmqbC9HpieE9U2y1N0qxyWBHzp+D/vygHIQf1y2HVqE
YpXCQmQfYEgDbBx0x99MQdmwDEddw6JTAvHl9yAGPrRh7HHiSgollItj/bWeUqiKM8zVWMg/1h+/
+M97295uShOVTGuEjyGJ7mSk8andkX1ZXX0SCCwMXVoVoteeTXuL1XKRMgD0oL869xNmEzL9+y9X
eLlmA/TkFm/pm4m2lbTbHd5GtdvUj7cRAWA+sxc8lKW6z+G73qi+oPMoy06kTzuBUCkuYi02Wv79
C0CrXC6tO+NupFQfdZYm3edLN3aCBT54UrIfv1fwWjN9wWl4SjE8wTUmZDwpJc+MpjuDbhJws/gI
m0nnzQ3Aa4vCXYGHnMnLXTGXfehNEStydYNTvLmnbZVTlQR+KwW3sJCfFSH4+ypW9JUnvNpl/rZW
zjWa+omp0elPqSMQrgz6wAC/yki9v5tUGNMoieweUV1t3Kx22QBXjeCP4tT+iOc3DbW5EODI6zK+
qpgQaB67vPeIOSf65Vz3E/r9FunrFb0PTiY7FrHtw/ky+yIibGeG9uyoRtaQlC7TClnNcc7g6DR6
a8hCkNR/BvyjyGl/3GgaYbLDyCeCL4WgyDwQe7Lc+DbmnPZ9pFaptGcFcFnE/NhBHgzW2/sHW/AU
IZmtjGBqiD3iMd5ztRklqp+/UMUj47E9M9slGNz24yp6LKgTQEVQxlX39HQpMaReIFmU+VzN7edz
W8aVdN7QClJ5/CtIwrw0EuGSNXjKe63Q78vuTO2I5CDEg7Mskio2ozP6PHH91e0fKScnXa3Cx0cM
Fnw2E/SvHzevOVHmtY91d14KijgtkKT7p6bDkDTE0daBgrmLLYhRpelWN9pCM2+qkhZyRPDLqYYw
sfEKbVYRLGvPNPj3vr/w7wTcHf+g87dWX0FDdtuPyeJ71QSG8JuB+zr8Z+oA2yQX+TWxxIv2KP0L
KZwUXhT6Z72D6lRWwVhC4a82mA8Q9fuvl+jD7cNJIYc+Tgi8MEBFbPBrqQyFw+lx3rReE9co58gj
xiC5GT6xNIITBGOZGMBTFvA7nCA9ymKc2I924exleu3PJF7sK4jQv0QYd9Yfiq6e4FZmtpuD7vUo
Zlj3t7ZxGjnewPCom3/yBqMG9Z9w2y9xqXXvGFtw3SgYKXDOpm59N4LNICmhfsSRy3ugJ7oNi0fg
4l1yL9A9QnLlby6n/lhYQ2u0eUOUlKpccbXCyaWdNlPGQy5ZiSlQqs4e93HvRcDPKS1GVYK3SupA
ih6VXZNn3UoS+siaSxmbyaEaYifdyE73WHV1n4IgP68UI5Fb4yfL9t7jEIxdBCzcTwHXvceLex1f
2UD8+PiYx4fqT4bd4T1XsW5w5HtIH+AKWWZGbJjDJ1QkhSBqkHtg6G18pYU3FzmRtRsmgE9JsZEo
nY+Bv17cY7pDE35tbZEw6y3QBQzMefaopQYn/sknRChSm5UU6jCOgRBYkx/EkzwQ+/cvXQl+l3Ng
G+YDAjRaOlmpirryTqQ6xyiU632Qo0nF4pSkKoK6cpCVKqKx0PTiiD+4MCAOJV5/rASvt6QaXgfs
XCif1ckN6piELzVeDj2Cc5Pz8j1+h1J1AR/RLHqecRfXEdqchwy/3UmvSudEaaRbvcuRxIH18Uwm
PBbcGeyPGPTApczjLcCl3GGrXl7z/X4KoyUIFAW17HN4ZfUUYtZTJBGrxO2oGc+Wo1CrTL+9UIwq
K22xw1QGxVwldHiyjmY8sYAX3BlkgDe//DQdao5ATVSigsvLgMVaaiwABbEXdurEULeKg8QDjiiG
cCLf59iLFqctH9LEiHWuLfRxAzvqC/kGRZ3JMtUOWjO1FnfSio2PcREjNsKnO0wUNiMLHlBjd2KB
dklFx4kR7tddS0mJLQPy6WxwVZAzq5GlHjCl1a+FPwb71/4XPWLSGn7iO2v+Hqj+zOEQ+wT1W0vx
i6e0rGdA9m1+qnMd4HXmHblmkeiH1xvzH+4tMs4GRuwQw2++IrhAdbznWSy8E993kZzoHiMaJuml
0OkBSqRgJsEAnMpU9lDa2/gGy6VzI/Jnp5f+QztAMeIXZR5zmaJr4crxIoOtcgqMctkcI1jN0CK2
fx/0A3eHZPwbSbRq7a5rDjAMdpUwRq4te+/Y5hL2NLMxdDmC8Qqv9meDiHVb51+fY+GuUqrtZLuk
W4KDlmzv5lKo5vASWk2S3U6m1qu20dagqCXEWx5isXIGN8C6vU0EoYcqBMuRTkhYURYGicGJ2CWj
Hv5aV9S3MMm/1GDh5kKIJVozgNaDlluMk/DX28YVe6g/ZzNm+wXj8D5t0rYn6cKLbFr+THcOWj53
gdBDCB+dFZ9YqIAUH7SP3z7LCuVStoxhWZvIG6Yoi/HtV368c1aPsIFvrG/4nlUS4OpX4nfUxAr7
H99VPxwzoPYhq/GFTNHMBXi8gIRZ51d6l37LmCK6xA5tJBsaG/xaDkREs1ta8TLm5J1DgLHur1h2
mhuqLxZnIH+NossxxdMG3t1C5YH7JJwuLAe9+MKyZln2hB/CYj6WG0wNASX8Dm48NhOmzNdVWZCx
EtQ0oixgX4mszjxt32rCkV8v0hcYefBShHkHbw3lOtuqnpBvlH4G59ZN1cMmCHDLTE/s2MYrJUjd
Q4VsBQRyjYREOUQT93oEbL0DfwpifJn4EUBAb9w43+R3+t32gCtN51Q52MzBiRkDMKU1vaz7oeV8
iBfaM6CP59AJiUGSpp1FkwAzcf1D/GdrXrUqD0GqnTSJeubjLUzkFhVm0GKKCBu65NKlWVpVjNce
/N4z1Pl2cbDCS7mnIx7XClP4GNis/4Ya/Exk8PUCdERpX1PmJX/22jMYb2AeQ/JvU2raEC3Bevdi
JnZzRtkOj3X7qVACJXFNzN8iqh4Oln0qSLBgX7JFsmFUnSqYIOR7iZ0TKqERUxFSy9Npz83qUXm/
uCDVrserpVnF0sfAUvk9X3t5/eCiwvLL9KWr7zS37JquE8W60/bqpGkPC6hO5dg8QkHnT6IZZOwt
6gsuXFc9wdMCm/6WxU+i0Ji9saJDIDfCsnOOfixV6xlVHPzu+GymBcjnrvbR6ltZHlWtg/eqpXiA
IfMGwG5gosVtodV5HHIZPWX99Xrqfh8tWY9kSI875AAl1n085wIt3h5C7tSI0bcLDovvX5oNe0BI
oBUc0Eq/1z/5uXRAZv6jmd7O0gn+7DPcEZwD4+WlZMF/8IjDFbRpHKz0LVURcO4JVI9NYCKSoznX
0K/ppqx98mRnl774QYWEadoWfPPmdvb9U4VcUNZs1PygRqyFRziPnVeZqtgfzFffsM3vv1wW5bGr
WOfYMTOJMJset0r1S71W96ls8To5Xn8fvzwFfeLIDL8LTfM5GpRUvOswuJ67ccj6EVyT2nwzavH0
vUNIrKypHQCbkKKJ4jLtO+v16iOJqxBZMCwSjx/REcL81RdH1VtIG9MxmRejI4weEqzvBYN3lSi/
nPcRXgj2vaDx4eHAEJaCVDSidj74WjbylgjQYi4f9AVzicmjeeX5Th1W+TDx+6MHabM6ISrN0pWN
PCkE050rFX9ySYSSz+5bkwnSO0/G6upYVtVDZG1t8UWBp5iuaW/En9f//H5miPx1kXW7hP6H2SMt
PbLabZ9K/vicYQT2ARMH3no06sjmrhuZV8wrpuEdu/tdUJHt+5PF6kQU5En8T8L/2/eHp/uTDhkz
b7PnHBERyNS3gseaWUKTRFK4v27tofVUElHgQCKB7oqmDjlajyKG5L3dqKCu2v7AKOLZYL/WD8ni
mYC1Mkf3IuJSrIhM69vzfT2OcoVgHRoI5HfEOL7K9EEzN52cTfVf8SSUQMribCH81/vvX34BwCho
NOFMbYHUvJOwnr6QaYVRSACXXXmjgrCHle+xR20BuUOJi70s8/0EvFV2ixTBELPXh7wPMquzm4+V
+H4B9uAukbaMnIM29WY++XSGd+m5M3aCKHas4y/95n08Cs+qdYl+i1e7qBOWJ33eGGXUIZYEbslh
Jq7mOps2v5IDaqvoHXC2xyN8LppwzgGNeIqpWN8fBbW45Ar/5KPpYXexNt9LsEsANqsDwD3hzx0A
2N78YLOdKq1ROes5geqDSA5jZ1QNyBOO8Y4VC010flAsQHz87R0DJrYLu8MkoMwbQibYIvpBVfHc
v8K5VDp2o1X3ZnUbirVNdwyAxvPq4vJq5Yy7boYxRkEdULTOo1UH8uLzCISPuGVp8IFkmP8Yvkcl
pq3gnvs96LR16q42LdZ9BL5UiaIxjWHP2TBPlPSUP6mnkbRl6s5qa/eHL8t/ssD61sj9f8H10CEz
yGM4HrUumrdqyN/GQZQB31VHcvETctOOVIHrNcPVMpC1Pm1QA8+8MzLKpbSc6Ftap5MR0O8Pc/+G
vzWGWK7vVE8PN1kNM8+ZeX0FeDxnuWMpOogVftQkQLaYbK/mB1CBCA2J/b6wgzDTPhX+h0L7at9N
ofJz/Fc3Kse44TU3svwxgET2IB2I3XqbrEqs0+YTV0MBpPIrMzUhJXZbMnsBRL6kHkjwObV/cteJ
Qb+/q47W1v2s/qyhua2cueQZHd97ap7yaPpx+afmgK824nbR3/SFDzblxJkZ04OUhdYrBBpDlf9L
iP4lpnv+oauTC4v3547TEZ6sJBx2DEj4fb2Y46OdELJzLwq/y55ku0GGZcqKrbOFfthLLbZPEHvK
EAVS8Uhkpayl38XZCPT1dDNQfq+thVuLkY18bWriWcfea1bIrRFcaq+oyvceVSkGlSBBNBpjhez+
+9TOb0N406vSGuK4XS8a6iNP/dHcFKaUl3JT+3j+6fYr9OeJpoBkAT7GEPK9zLXs2j4Fybc0QH/b
9jyxqMYQqDCDYevaOJ8xSYO9PwJ4y2ybTkUQ/d+9HgoBCeYDR36mBMe541CUm/0wfCsmO+tiZxrc
0kTztR+uuW5FfZHN7ZpJBNP6Mt1rIQUziOzudzc+dibDZngk5JK+1Joog6dFN+E4ZrBaspzrt5Vh
mHwnS+q5SsGzXadDKevY69ZBtCtGJO/INNPncrxMZyWojhBqHTr7YpI6Pj242fj9lRXuFoqIhxbt
q3rfiUXbyMPKUHrLkwXBVdeCFUym7P5IjmNP58BbM+p/b3gXHG5UM3r3W4UlsC1NNb0gYp9h1AhN
mG7OrVEPLQwsqAbtkp1/oDPIHWC2uIHUk3ul20f7eBmcHTUEmW1mKbhKIxb4uwc/C4t7iycXH6tW
jcYtICniGqpwteyyYw/O1KZo3yuqntVIWox6783RkvOyFZVWg2OxF9AgjFytWVpBJd38Ki/uHwPL
wvW6HKo0NcbJGTZv0dIoVjF6oo0nyG2LHEoZ/WHxI+2hRhSbpsrKRfw3cTKl9cQhfIDwnxHJElT4
6aYTZY61PO/kZmRmgzE2N5ufjtbQJhmIZAiAZbWPCHM1jEReuyGENFvqxbqoQz1G9VPCxKuG+/3n
+cUgY0nGR69ObrsgaBDOV9z2PcoQJGcIN9yoBuoXHi1y+Q9Wu/KXKyn7nwqwFToUytqndQU7LT7D
ytmgFxAWxYXOOBl4VDJ9+MTVz4AeTtVplJZNpWRoTT7kzz1oVDt3TX8wsOaZ0CVErx1Swam3LfUY
mGD6IXmC6aJN+yPLmywhOtXl1qfyGBwnWNQFQbUSgnKU9N35WC2Q2kCWHLPs4FNmMT78vBjUkTNI
otZ1IdjEMxE7AFCFo+IIZKfQaAabQ1LDquFxoupv6YCQs2Q4ms46C6ryrZuPb8GEsLtqLO+A5rfX
ca2etO2KjnwTOEXVKUgsHaYcbF1+NJF2REUupoQzZwA0BBZ9O5Ia//oLwCA7coJoW/Xa/9WA6FGm
tSnMUaeOnoHfPZxG5naueOcL0Yh7TvG8WC5v7yQURRhUJKdyJ+d9q1qNDWDIR/DMTMjEiKWMiUAv
9QOnGmeXE/bNBEoZAnmMPXTuhk9GA/OFFmy94RDMTzrdGdnxICGFc8eCyUqwGc84kZc00rk6Pr5U
u1KwbucayG3sdhmZyUfWmfVJuPkU7WWxtGXqZwrncHQGif2u9JUGyWnzEJKrHJgL8L4rpXnjsbvp
mn0gxjNdDbZE2CDGgHnshiPrQ/gOYqOrzxzcf1dz//OJm//e0ZsqcVfk2y12FFAt6RnEJjpnht90
VFszE4ESYxoa1f5ayYeKRnTbFlFf3sWfAkpRfjZfieBXQNY/VJWWimHoaJjxE4Gu1DfYb6H7Wzh6
Wx+e1aVPfDcIFnNRm41iWqlD1F/nWOX2U2rDMOoOJUB0TLruZHU8Dt0z/sPFur9TOWjDAS6pZe7i
xKftpKhcf/iQOkgU+nVwV2LeC8ASUnPI9pIfUxA5ZHdIDhmGWEhQbkt8eliZj/3pXkhTCtFT4lY/
jVSFAGLFM8GyQ+rdT8IzkI0xZ+rxudU0E9mI39KDnZrTwwK25cqRcWkvitkCn5dc7RmbIs4I/cPn
qXJ5tkVXNB3gUWsOAR+1Ovj+ypPDYh/4+kaL7muYPHPfekiDT1nYj+tHAEHCtHRhcZ5S0VOK+26X
d1p10bDNtJt3uslmp2FeO6sLO5PRXsswX+tTGEBDnC+HF5QAy5wEMeg1q7p9Lcl4CzSzVfpIDM1H
6/B83yuR7IfVc7z8zjWxMC0P8ZQfiw1KXJRTzJVYC0sU8XQe0t9ytBcQIzW4hdUfaWLGSQbTcyJA
Tg8etTAy/kcNjvoXp2Oa0dzGrdePho4jQ5bzwMKxjzL4lA3S/u0bFwCJu/7BzumzfYg8lQsrrkxq
foEjt5Y67wq8Nb5pxVfM0QTezUPsnwYn7BFPFxO536jrsbJ1iZJIpODDe4NLF1Vviw9P9PPsOqcY
2nqAgGPj6kZIvU05yFvc0Vb9bDwcno/rZxbHmRqyi1WvTy7T64x5XKFiLFF5wu6u2gwxfZq5twbU
KItFjX3lVj2OaghFA0LR4DE/tHZya0nmloGVW9XtoR7rS81xwX1M0lDagUfcvSAuBQiarogsb24G
kBXFXjfACVBYaSO2SXo4EnPUTcPjwopyCFT6qk0bM+OItVHdz/vN+jVpFfG0+VOGsxD4AKF2fgpU
m1fcMGtcg2IEx/LkaFGFLKIDfQrXqsE2wtmlsW6UliIdL+6zJRLzqcSP1rqpTfFaqOnXFzEtIbGw
bmgjafuUueUK3663Q5XZWGx4PIBcjUpk+5ZhbYhwgR8w4c4wtdsrILR/2zbFpMtNKT2vkH4xAom4
zjxPc0MeP1v4QGC88mhlrcjMQKR/NNWH887sA3Yysc6hbaNgKfSN5F2TUuVO+DGprI6AbFjiH0WF
SkbwfZCZ1TgTD5J2a63vGbMNppPwhbUU8MH7DxUcfTRIHSmKwRKxk5sjN4SJBRzF5HeNQl/90dNz
iuT5l+u1DyhOpha6YC4H725qMwA0u3TSNHdwn+2nf7XGXvVWc29thRzefN9P8cQOY6J+wzc60xJ4
SXWUWtmPh6yBviiPmw/hMUxCChsFeJiaAaE1rKaueeaa2n4duZDmwsyVOWi26zv8yOaHBUd30LAK
pBGK2ffAhBHeswEgsQF+rLblPIWN9nzeI+ckAVPjzJmA8fMG1v6blWaoIsIKOiEcBMJN7VEfaRaE
Li4hzoVP7A2ryBfGA7SajgRLARPlE4TJ8RuVSUJEFOEnHfaHZY0Mc/lLPUJNheBqoZwMkXydq/mq
oOoEMecHIL/8zK2FrQDZaDOrMgevyEkkw4oFOVkbELcrrk5M1BiBLvU4E21tlfBW+JqjeFpySL5S
RDrIErD5qNuIcrbkkbPrZkrMIST6QSCvDd1/hbMsX3MW29BsUUPUViWjHmMyUi5Xdjc7bj26C7Vf
YNqHwruyEuqbCy1CGixMWnETUd6KFGX6uBIlqIo7M6D35Ke8cqg6YtJvWs7ANXCM+W33a8k4jTYX
rCMvTMWLaSzE30jwh0OKq9z0VjQ+MHgK6kLuyuDinyPcLmAsoV+R00oVhISIwBQbUAM1tRb/1h++
6MW/Q/TJlyVFDHI/uQ/9fH6WkOhxRO8Xbu5VcyF0zrgDwr9why08TFO0BaoD7y4kYq4G+GnnW5kk
NzuFDSLDB3bM3T+qVd7OzlO97q8qLEZhOVPc9OaOBfRcrjXgzxVKX56e47snP72Ega//2yPVpPfr
Ad+2P3AFBBUyyDyWQOkQfTnaWy8NVkjC5lcLhdjKon1XpXcCVmNTNE1IQt221dWba0ywjLeemfvS
h5Or0/i851lOx/GWbBpPAmPWeKCkPpJXTFHRjsmDn6A0FLoqJpku8xNkOflVQbmwRYIdqLGLoAWw
FXIMWpx+4iktPPfOdkwJnT7D60E6U/D2DHFgX+gncbDocc12Lke9VvR4BpIDDDFy/gCTncjRK/57
Je9kTsIECMKZVCbc4s4eLXEFSWPtwjI1MQ9nFSQbEO97MRwZTMuZUgA4pwNeEwR2jbLOlwH/RO2O
hFHvggHxW3UZfXheDNxtwzhNwZDrtvvXMpJjq4B6m5hiuNAEl1CX/v2EEbT+XMio3d/VI4JupAE2
whZtBdUEQvLewPNmsWQGyvoRs0T43rbvln/K6x4pHZrBx3itstDw7nX+bhqvk97YDny6z05Rx6fi
ksc3qjFezf2ZJDcifmy9+N77h/xgWTLLgtm9kJIWW979vAjFp/rb/YZWxHlzOn0VDfFbgtPy8rL1
2ixrid/u6gCag3UA8xsoKdRVAprCMQC4JVWxCy4Yof5RebqaMo60xmyigsIqxBCFtqlVj2t/uYNk
Q6atY9Ncxpy5G+q6Yv+wie7EUvaYYXqXKUPZ1ZQWwFWahPjs6vYi+3e4PhVswQNEArKFFdw21ca+
kaYBS+8i1mRmnBTIvbC4QVBYKos2/P+dn58ooy3yZkZPakwWgS20aNQvQvC6jT7UoOnOMnyRHoLM
NdSc3XL1isc/q0/Am5uj/R1dazShrPn+4hy+CZrtVIh19gJ6kjQrofZoFpJ3H7ANltq0QgB0ewZG
GAAI7ry5D984MLfu4qEueuxOQDKiVFcOYvxBT+NX+Su1/9EILUgZMu9UpvCk11Fzs5epJwx/WKib
m6uLgQZvSEsotUgAG7GZ309xL0yqhHTAe2Fp4aboaYu0IfTHPmcAmqpGjXLXLzPqzMwZTQTxdw7p
5C7gbITDPTWAjwVTCcqQQti0NgWcQLSywFQDtDA2HElAY4EuOplURmexXlSBYmbYaSwdHrlCJnkV
kzNe2T0GpnxDfqZEUFIQ779tqKKL4BZ105CbsQhTwgK+rX91I3hN0n+I5TUs/4Oy5+t6APvdQEGo
n76BBqOdILqlFWSgfeglw2AqG057/LQ0WKLPJR9KKeWm6ptMfysGEgOPg7rVXL3JAByI4qyAAxPT
dG3j+OPEAAACoIdDCUlAXUQjqFUHDpFudiBg0/B/vWuSXxI87slBwyPJAREb0uB8oWcdCeb/HGgA
IVwO0PeQJXpp2BYei9aYoZhNlv9Gs74amQo2xgRxg6Q1XvCgOqNef0xQrD9cANUQIh0kK+SFw5q2
H2jRAHJEIM9ifrGOtFmLNMeFHyOQab9zZP1oAs2qIANyt1n8BkcStFqFedJgcEBb8HEIwL0+uNiD
/dTMf7lPrurFB7ZuTABG6ABYO16AAAqLAJv9ha6g8caUdTAyAdfDa2PZ8aYyyGTyW9FJ/Y+DGtY+
RQC8ZJ5ULZOpxWAA0o/A1FiI4ImUtUMBeObPNvxjWIoxBJ//pTkUKDxPQqWIynMFCPWgzfQa8vsb
HacCcS3X6okOcW6IYiG/GnRAqNwN89PateTQbiK412SPa7fkPIiUgAEBHCnGZiP1V8og9G4fEyGh
xrxpg4gALpSSwNLlc0EJopCfD/adHiAACggAHNbARnLbOvyvwwZUu8sofzGtXRK7vjnss2AAd+Gq
IJBtqZd1DEH7kkCsWhbXADdX+8+nkGC85jfWCGIV5yLP5MEeRqPDqouJUaABftyC0rgADmVFUcPS
ZBH2LumQGKJHiF2fYmwp0K7QljoVNknA76/T2lhSmSp7gXvaRX4XAf4D/lhMQANYaCcFSLeM2RQ4
zIADmiHOQQBjaCGWoqAGCl/svZ1mfzMhFYZax5X5yvpIACujnfxfafLvCOhrH7TMYOYLiOO1eja9
2y7EwxyjS5fN8PI7x72vU1PJXgoFqjk4ny2aG8X8sXX/mhNM2SGaw4g9mkVqzy04Bx1n5bioICVf
GR3gy6Md31KYbOLGGg6gEJzHzulxVEaYF7M5DFbOU9u2VwDUFwrd2o6rxSoLkpzoDwzV2p9hqxGY
EjnqN2dmZFNXOfuRovKJ6EMfFTkUADT5AAUV9SLnYMEBfKITsi33rzKXXoAVsS9VVFQoWyVhj/6L
eqAA8H9Y12coofAYFUK56ZA8/dWIPU/mrS+GJ7J8E51nYJ0N8C2PbjvOJClfhHK2C/fxQQlEKZns
QKxTsWTMLjj0zmjCb5P8YOUR8OuZNPW5QFBZQIcn4jj3R8mgS+X0xSH0DjU0Cu+Y1Am7zdOnCKYx
Id9DMYNJ66gIgWNfyEY3mwQikK9n1ma0GN8o9AA/AWV/Slam3RpXKWgMcBYQgvAIrWx8WIHpAE0I
AcO3BRqMABzrSW5px8ABBaAiV9hITunECdsrKVmBIAT5gyEC2AaAHAbJYRXMjyJqhv90jtjQLagl
QPU1XqQ9etnftBqARrT0U5Qrf3TBBhtu+hUkIzsNlF4GWkMMhUXwKEYfPw16j9yUVR0/f+yIYhQG
9s7gwL8+HApF7jG6InOwhdRmhOZpJOcKwMyK3ZhVdmDMnlZIZ4d38LQx5AAW9nrCTE3ECNLjcitH
VcJ7x5/URZNEKHBOsUh+qZNSzIuakA0JFLdYN09xPRPeDMjI4jfa1qgInZs8MiDkri8FwJgv1nbf
Sfi3dqdxGJAElkQBPSg8UCZsrTmX/aWyKoTh39X89qH14bF/VlhSqKlAbwJCfsdQfGaa9wg6eN0t
0fXO/OxHeAlvTBAkLXdYN1Uzawm2L1dtTLNG4YlATjCkGr+zFFU4igKJUSg80Vd89UEbxWf2nPlf
SaH74g3ttlYDes4oofHzTER4orrKAp2wTufvCooxR5fgWVrRq6gup3t7FNXMRKFnwzb0cF0gzrZk
nmQq9rIFa3WODrBrRjPtEkDzrgpVHxQHm8fQRehlr+fkvnhzXxyQAdX8gBQ34Wszg4OGGzdbNwGD
I5oLlKMyPmMU5wtqaQdMMRVWSrJ6UVUZBzHPsVM6vO62XlSKClwED+x/9aWWmh3jYyo4ANzgHOaZ
bLdJv5QIA1nXYRVvAsQ2xAAA
~~~~~

## client/src/api/client.js

~~~~~javascript
import axios from "axios";

const configured = (import.meta.env.VITE_API_URL || "/api").trim().replace(/\/+$/, "");
export const apiBase = /\/api$/.test(configured) ? configured : configured + "/api";
export const tokenKey = "docchat.jwt";
export const sessionEvent = "docchat:session";
export const readToken = () => localStorage.getItem(tokenKey);

export function forgetToken(expected, expired = false) {
  // A late response belonging to a previous session cannot log out a new one.
  if (expected && readToken() === expected) {
    localStorage.removeItem(tokenKey);
    window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { expired } }));
  }
}

export const api = axios.create({ baseURL: apiBase, timeout: 30000 });
api.interceptors.request.use((config) => {
  const token = !config.publicRequest && readToken();
  if (token) {
    config.sessionToken = token;
    config.headers.set("Authorization", "Bearer " + token);
  }
  return config;
});
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) forgetToken(error.config?.sessionToken, true);
  return Promise.reject(error);
});

export function errorText(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.error?.message === "string") return data.error.message;
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "The request timed out. Please try again.";
  if (error?.code === "ERR_NETWORK" || error instanceof TypeError) return "Couldn’t reach DocChat. Check your connection and try again.";
  return error instanceof Error && !axios.isAxiosError(error) ? error.message : fallback;
}

export async function openAnswer(chatId, content, signal) {
  const token = readToken();
  const response = await fetch(apiBase + "/conversations/" + encodeURIComponent(chatId) + "/messages", {
    method: "POST", signal, headers: {
      "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + token
    }, body: JSON.stringify({ content })
  });
  if (!response.ok) {
    if (response.status === 401) forgetToken(token, true);
    const data = await response.json().catch(() => null);
    throw new Error(errorText({ response: { data } }, "Couldn’t send your question. Please try again."));
  }
  if (response.headers.get("content-type")?.split(";")[0].trim() !== "text/event-stream" || !response.body) {
    await response.body?.cancel();
    throw new Error("The server returned an unreadable answer. Please try again.");
  }
  return response.body;
}

~~~~~

## client/src/api/stream.js

~~~~~javascript
import { createParser } from "eventsource-parser";

function metadata(data) {
  try { return JSON.parse(data); } catch { throw new Error("The answer contained unreadable source information."); }
}

export async function readChatStream(body, onToken, onSources, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let complete = false;
  let sawSources = false;
  const parser = createParser({
    maxBufferSize: 16 * 1024 * 1024,
    onError(error) {
      if (error.type === "max-buffer-size-exceeded") throw new Error("The answer was too large to display.");
    },
    onEvent({ event, data }) {
      if (complete) return;
      if (event === "token") {
        if (sawSources) throw new Error("The server sent answer text after its sources.");
        onToken(data);
      }
      if (event === "sources") {
        const sources = metadata(data);
        if (sawSources || !Array.isArray(sources) || sources.some((s) => !s || typeof s.filename !== "string" ||
            !Number.isInteger(s.page) || s.page < 1 || typeof s.text !== "string" || !Number.isFinite(s.score))) {
          throw new Error("The server returned invalid sources.");
        }
        sawSources = true;
        onSources(sources);
      }
      if (event === "done") {
        const status = data ? metadata(data) : {};
        if (!status || typeof status !== "object" || Array.isArray(status) ||
            (status.ok !== undefined && typeof status.ok !== "boolean")) throw new Error("The server sent an invalid completion event.");
        if (status.ok === false) throw new Error(typeof status.error === "string" ? status.error : "Answer generation was interrupted.");
        if (!sawSources) throw new Error("The answer ended before its sources arrived.");
        complete = true;
      }
    }
  });
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (!complete) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        parser.feed(decoder.decode());
        if (!complete) throw new Error("The connection closed before the answer was complete.");
        break;
      }
      // A transport chunk can end in the middle of a UTF-8 character or SSE field.
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

~~~~~

## client/src/components/ChatPane.jsx

~~~~~jsx
import { useLayoutEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlignLeft, ArrowUp, ArrowUpRight, BookOpenText, Copy, FileText, Files, List, Plus, Square } from "lucide-react";
import { useInterface } from "../context/Interface";
import { IconButton, Skeleton } from "./Primitives";

const starters = [
  { Icon: AlignLeft, label: "Summarize key points", question: "Summarize the key points in these documents." },
  { Icon: List, label: "Find supporting evidence", question: "What evidence do these documents give for their main claims?" }
];
const markdownComponents = {
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => alt || null,
  table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>
};

function Welcome({ hasDocuments, readyCount, existing, onLibrary, onNew, onStarter }) {
  const description = readyCount ? "Ask a question and follow each citation back to the page." :
    existing ? "This chat needs a ready PDF. Start a new chat to choose different documents." :
    hasDocuments ? "Select at least one ready document to start asking questions." : "Upload your first PDF to start a conversation with it.";
  return <div className="welcome">
    <div className="desk-banner">
      <img src="/reading-room.webp" alt="" className="desk-art" />
      <div className="desk-copy"><h1>Ask your<br /><em>documents.</em></h1><p>{description}</p>
        {!readyCount && <button className="banner-button" onClick={existing ? onNew : onLibrary}>
          <Plus size={15} />{existing ? "New chat" : hasDocuments ? "Choose documents" : "Upload a PDF"}</button>}
      </div>
    </div>
    {readyCount > 0 && <div className="starter-grid">{starters.map(({ Icon, label, question }) =>
      <button key={label} type="button" onClick={() => onStarter(question)}><Icon size={18} /><span>{label}</span><ArrowUpRight size={15} /></button>
    )}</div>}
  </div>;
}

function Answer({ message, pending, onSource }) {
  const { notify } = useInterface();
  async function copy() {
    try { await navigator.clipboard.writeText(message.content); notify("Answer copied."); }
    catch { notify("Couldn’t copy the answer. Select its text to copy it.", true); }
  }
  return <article className="answer" aria-label="Assistant answer" aria-busy={pending}>
    <header className="answer-heading"><span className="answer-symbol"><BookOpenText size={16} /></span>DocChat</header>
    {message.content ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown></div> :
      pending && <div className="thinking" role="status" aria-label="Generating an answer"><i /><i /><i /></div>}
    {message.sources?.length > 0 && <div className="citations" aria-label="Sources">{message.sources.map((source, i) =>
      <button key={source.chunk_id ?? i} className="citation" onClick={() => onSource(source)}>
        <FileText size={13} /><span>{"[" + source.filename + ", p." + source.page + "]"}</span>
      </button>
    )}</div>}
    {!pending && message.content && <IconButton className="copy-answer" label="Copy answer" onClick={copy}><Copy size={15} /></IconButton>}
  </article>;
}

export default function ChatPane({ chatId, stream, draft, setDraft, readyCount, documents, creating, onSend, onSource, onLibrary, onNew }) {
  const scroller = useRef(null);
  const pinned = useRef(true);
  const input = useRef(null);
  const busy = stream.streaming || creating;
  const blocked = stream.loading || stream.phase === "error" || documents.loading || !readyCount;
  useLayoutEffect(() => { pinned.current = true; }, [chatId]);
  useLayoutEffect(() => {
    if (pinned.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [chatId, stream.messages, stream.loading]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = Math.min(input.current.scrollHeight, 140) + "px";
  }, [draft]);
  function submit(e) {
    e.preventDefault();
    if (busy || blocked || !draft.trim()) return;
    pinned.current = true;
    void onSend(draft.trim());
  }
  const status = readyCount ? readyCount + (readyCount === 1 ? " document" : " documents") :
    chatId ? "No ready documents in this chat" : "No ready documents selected";
  return <>
    <section className="chat-scroll" aria-label="Chat messages" ref={scroller} onScroll={() => {
      const el = scroller.current;
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 85;
    }}>
      <div className="reading-column">
        {stream.loading || (!chatId && documents.loading) ? <Skeleton count={4} label="Loading chat" /> :
          stream.phase === "error" ? <div className="load-failed"><h1>Couldn’t open this chat</h1><p>{stream.error}</p>
            <button className="secondary" onClick={stream.reload}>Try again</button></div> :
          stream.messages.length ? <div className="thread" role="log" aria-label="Conversation messages" aria-live="polite"
            aria-busy={stream.streaming}>{stream.messages.map((message, index) =>
            message.role === "user" ? <article key={message._id ?? index} className="question" aria-label="Your question">
              <span>You</span><p>{message.content}</p></article> :
              <Answer key={message._id ?? index} message={message} onSource={onSource} pending={stream.streaming && index === stream.messages.length - 1} />
          )}</div> :
          <Welcome hasDocuments={!!documents.items.length} readyCount={readyCount} existing={!!chatId} onLibrary={onLibrary} onNew={onNew}
            onStarter={(value) => { setDraft(value); input.current?.focus(); }} />}
      </div>
    </section>
    <footer className="composer-region"><div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        <label htmlFor="question" className="sr-only">Your question</label>
        <textarea id="question" ref={input} rows={1} maxLength={16000} value={draft} disabled={busy}
          placeholder="Ask a question about your documents…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault(); e.currentTarget.form.requestSubmit();
            }
          }} />
        <div className="composer-tools"><button type="button" className="document-context" onClick={onLibrary} aria-label={"Open document library. " + status}>
          <Files size={15} /><span>{status}</span></button>
          {stream.streaming ? <button type="button" className="stop-button" onClick={stream.stop}><Square size={12} fill="currentColor" />Stop generating</button> :
            <button className="send-button" disabled={busy || blocked || !draft.trim()} aria-label="Send question" title="Send question"><ArrowUp size={19} /></button>}
        </div>
      </form>
      <p className="composer-note">{stream.streaming ? "Generating an answer…" : "Answers include citations you can open to read the source."}</p>
    </div></footer>
  </>;
}

~~~~~

## client/src/components/Library.jsx

~~~~~jsx
import { useRef, useState } from "react";
import { BookMarked, Check, FileText, FileUp, LoaderCircle, Trash2, X } from "lucide-react";
import { fileSize } from "../hooks/useDocuments";
import { Dialog, IconButton, Skeleton } from "./Primitives";

const statusIcons = { ready: Check, processing: LoaderCircle, failed: X };

export function Library({ documents, selected, onToggle, onDelete, onDismiss }) {
  const picker = useRef(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const { items, progress, uploadFiles, loading, error, refresh } = documents;
  const count = items.filter((doc) => doc.status === "ready" && selected.has(doc._id)).length;
  return <Dialog title="Document library" variant="sheet" onDismiss={onDismiss}>
    <div className="sheet-body">
      <p className="panel-intro">Upload PDFs and select which ones to use in your next chat.</p>
      <input ref={picker} className="sr-only" type="file" tabIndex={-1} multiple accept="application/pdf,.pdf" aria-label="PDF files"
        onChange={(e) => { const files = Array.from(e.target.files); e.target.value = ""; void uploadFiles(files); }} />
      <button type="button" className={"drop-zone" + (dragging ? " dragging" : "")} aria-disabled={!!progress}
        onClick={() => { if (!progress) picker.current.click(); }}
        onDragEnter={(e) => { e.preventDefault(); depth.current++; setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = progress ? "none" : "copy"; }}
        onDragLeave={(e) => { e.preventDefault(); if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
        onDrop={(e) => { e.preventDefault(); depth.current = 0; setDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)); }}>
        <span className="upload-icon"><FileUp size={24} /></span><strong>{dragging ? "Drop to upload" : "Drop PDFs here or browse"}</strong>
        <small>Up to 50 MB per PDF · 500 pages</small>
      </button>
      {progress && <div className="upload-progress" role="status">
        <div><span>Uploading {progress.name}</span><strong>{progress.percent}%</strong></div>
        <progress aria-label="Upload progress" value={progress.percent} max={100} />
        {progress.total > 1 && <small>File {progress.index} of {progress.total}</small>}
      </div>}
      <div className="section-label"><h3>Your documents</h3><span>{items.length} of 10</span></div>
      {loading && <Skeleton label="Loading documents" />}
      {error && <div className="inline-error"><span>{error}</span><button className="text-button" onClick={refresh}>Retry</button></div>}
      {!loading && !error && !items.length && <div className="library-empty"><BookMarked size={28} /><h4>No documents yet</h4>
        <p>Upload your first PDF to start a chat with it.</p></div>}
      <ul className="doc-list">{items.map((doc) => {
        const Status = statusIcons[doc.status] ?? FileText;
        return <li key={doc._id}>
          <div className="doc-row"><input type="checkbox" checked={doc.status === "ready" && selected.has(doc._id)} disabled={doc.status !== "ready"}
            aria-label={"Use " + doc.filename + " in new chats"} onChange={() => onToggle(doc._id)} />
            <div className="doc-info"><strong>{doc.filename}</strong><small>
              {fileSize(doc.sizeBytes)}{doc.pages > 0 && " · " + doc.pages + (doc.pages === 1 ? " page" : " pages")}</small>
              <span className={"status status-" + doc.status}><Status size={12} className={doc.status === "processing" ? "spin" : ""} />{doc.status}</span>
            </div>
            <IconButton label={"Delete " + doc.filename} onClick={() => onDelete(doc)}><Trash2 size={16} /></IconButton>
          </div>
          {doc.status === "failed" && <p className="doc-error">{doc.error || "Processing failed. Try uploading the PDF again."}</p>}
        </li>;
      })}</ul>
    </div>
    <footer className="sheet-footer"><span>{count} selected for new chats</span><button className="primary" onClick={onDismiss}>Done</button></footer>
  </Dialog>;
}

export function SourcePanel({ source, onDismiss }) {
  return <Dialog title="Source details" variant="sheet" onDismiss={onDismiss}>
    <div className="sheet-body source-body">
      <span className="file-stamp"><FileText size={25} /></span><h3>{source.filename}</h3>
      <dl className="source-metrics"><div><dt>Page</dt><dd>{source.page}</dd></div>
        <div><dt>Relevance score</dt><dd>{Number.isFinite(source.score) ? source.score.toFixed(3) : "Unavailable"}</dd></div></dl>
      <h4>Document excerpt</h4><blockquote>{source.text}</blockquote>
    </div>
  </Dialog>;
}

~~~~~

## client/src/components/Primitives.jsx

~~~~~jsx
import { useId, useLayoutEffect, useRef } from "react";
import { BookOpenText, Moon, Sun, X } from "lucide-react";
import { useInterface } from "../context/Interface";

export function Brand({ light = false }) {
  return <span className={"brand" + (light ? " brand-light" : "")}>
    <span className="brand-symbol"><BookOpenText aria-hidden="true" size={23} strokeWidth={1.8} /></span>
    DocChat
  </span>;
}

export function IconButton({ label, children, className = "", ...props }) {
  return <button type="button" className={"icon-button " + className} title={label} aria-label={label} {...props}>{children}</button>;
}

export function ThemeButton() {
  const { theme, toggleTheme } = useInterface();
  const Icon = theme === "light" ? Moon : Sun;
  return <IconButton label={"Use " + (theme === "light" ? "dark" : "light") + " theme"} onClick={toggleTheme}><Icon size={18} /></IconButton>;
}

export function Dialog({ title, onDismiss, children, variant = "center", hideHeader = false }) {
  const ref = useRef(null);
  const heading = useId();
  const { registerLayer } = useInterface();
  useLayoutEffect(() => {
    const node = ref.current;
    node.showModal();
    const unregister = registerLayer(node);
    return () => { unregister(); node.close(); };
  }, [registerLayer]);
  return <dialog ref={ref} className={"dialog dialog-" + variant} aria-labelledby={heading}
    onCancel={(e) => { e.preventDefault(); onDismiss(); }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onDismiss();
    }}>
    {hideHeader ? <h2 id={heading} className="sr-only">{title}</h2> : <header className="dialog-header">
      <h2 id={heading}>{title}</h2><IconButton label={"Close " + title.toLowerCase()} onClick={onDismiss}><X size={19} /></IconButton>
    </header>}
    {children}
  </dialog>;
}

export function Skeleton({ count = 3, label = "Loading" }) {
  return <div className="skeleton-group" role="status" aria-label={label}>
    {Array.from({ length: count }, (_, i) => <span key={i} className="skeleton-line" />)}
  </div>;
}

~~~~~

## client/src/components/Sidebar.jsx

~~~~~jsx
import { Ellipsis, Files, HardDrive, LogOut, MessageSquare, Plus, X } from "lucide-react";
import { Link } from "react-router";
import { fileSize } from "../hooks/useDocuments";
import { Brand, IconButton, Skeleton } from "./Primitives";

export default function Sidebar({ chats, documents, user, activeId, onNew, onLibrary, onManage, onSignOut, onClose }) {
  const used = documents.items.reduce((total, doc) => total + doc.sizeBytes, 0);
  const total = 200 * 1024 * 1024;
  return <aside className="sidebar" aria-label="Workspace navigation">
    <div className="side-brand"><Brand />{onClose && <IconButton label="Close navigation" onClick={onClose}><X size={19} /></IconButton>}</div>
    <div className="side-actions">
      <button type="button" className="primary new-chat" onClick={onNew}><Plus size={18} />New chat</button>
      <button type="button" className="library-nav" onClick={onLibrary}><Files size={18} /><span>Document library</span>
        <span className="count">{documents.items.length}</span></button>
    </div>
    <nav className="chat-nav" aria-label="Conversations">
      <h2>Conversations</h2>
      {chats.loading ? <Skeleton label="Loading conversations" /> : chats.error ?
        <button className="text-button" onClick={chats.refresh}>Retry conversations</button> :
        !chats.items.length && <p className="side-empty">Your chats will appear here.</p>}
      {chats.items.map((chat) => <div key={chat._id} className={"nav-row" + (activeId === chat._id ? " active" : "")}>
        <Link to={"/workspace/" + chat._id} onClick={onClose} title={chat.title} aria-current={activeId === chat._id ? "page" : undefined}>
          <MessageSquare size={16} /><span>{chat.title}</span>
        </Link>
        <IconButton label={"Manage " + chat.title} onClick={() => onManage(chat)}><Ellipsis size={17} /></IconButton>
      </div>)}
    </nav>
    <div className="storage">
      <div className="storage-title"><HardDrive size={15} />Storage</div>
      <progress value={Math.min(used, total)} max={total} aria-label="Document storage used" />
      <small>{fileSize(used)} of 200 MB used</small>
    </div>
    <div className="account"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span>
      <div className="account-text"><strong>My account</strong><span title={user.email}>{user.email}</span></div>
      <IconButton label="Sign out" onClick={onSignOut}><LogOut size={17} /></IconButton>
    </div>
  </aside>;
}

~~~~~

## client/src/context/Auth.jsx

~~~~~jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, forgetToken, readToken, sessionEvent, tokenKey } from "../api/client";
import { useInterface } from "./Interface";

const Auth = createContext(null);
const guest = { status: "guest", user: null };

export function AuthProvider({ children }) {
  const { notify } = useInterface();
  const [state, setState] = useState(() => readToken() ? { status: "checking" } : guest);
  const lookup = useRef(null);
  const sync = useCallback(async () => {
    lookup.current?.abort();
    const token = readToken();
    if (!token) { setState(guest); return; }
    const controller = new AbortController();
    lookup.current = controller;
    setState({ status: "checking" });
    try {
      const { data } = await api.get("/auth/me", { signal: controller.signal });
      if (!controller.signal.aborted && readToken() === token) setState({ status: "signed", user: data.user ?? data });
    } catch {
      if (!controller.signal.aborted && readToken() === token) setState({ status: "offline" });
    }
  }, []);
  useEffect(() => {
    void sync();
    const storage = (e) => { if (e.key === tokenKey || e.key === null) void sync(); };
    window.addEventListener("storage", storage);
    const sessionChanged = (event) => {
      if (event.detail?.expired) notify("Your session expired. Sign in to continue.", true);
      void sync();
    };
    window.addEventListener(sessionEvent, sessionChanged);
    return () => {
      lookup.current?.abort();
      window.removeEventListener("storage", storage);
      window.removeEventListener(sessionEvent, sessionChanged);
    };
  }, [sync, notify]);
  async function signIn(mode, email, password, signal) {
    const { data } = await api.post("/auth/" + mode, { email, password }, { publicRequest: true, signal });
    if (signal.aborted) return;
    lookup.current?.abort();
    localStorage.setItem(tokenKey, data.token);
    setState({ status: "signed", user: data.user });
  }
  return <Auth.Provider value={{ ...state, signIn, retry: sync, signOut: () => forgetToken(readToken()) }}>{children}</Auth.Provider>;
}

export const useAuth = () => useContext(Auth);

~~~~~

## client/src/context/Interface.jsx

~~~~~jsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createPortal } from "react-dom";

const Interface = createContext(null);
function Toast({ item, dismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.error ? 7500 : 4500);
    return () => clearTimeout(timer);
  }, [item, dismiss]);
  const Icon = item.error ? CircleAlert : CircleCheck;
  return <div className="toast" role={item.error ? "alert" : "status"}>
    <Icon size={19} className={item.error ? "danger-text" : "accent-text"} />
    <span>{item.text}</span><button className="icon-button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={16} /></button>
  </div>;
}

export function InterfaceProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("docchat.theme") === "dark" ? "dark" : "light");
  const [toasts, setToasts] = useState([]);
  const [layers, setLayers] = useState([]);
  const registerLayer = useCallback((node) => {
    setLayers((items) => [...items, node]);
    return () => setLayers((items) => items.filter((item) => item !== node));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("docchat.theme", theme);
  }, [theme]);
  const notify = useCallback((text, error = false) => {
    setToasts((items) => [...items.slice(-2), { id: crypto.randomUUID(), text, error }]);
  }, []);
  const dismiss = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  return <Interface.Provider value={{ notify, theme, registerLayer, toggleTheme: () => setTheme((t) => t === "light" ? "dark" : "light") }}>
    {children}
    {createPortal(<div className="toast-stack">{toasts.map((item) => <Toast key={item.id} item={item} dismiss={dismiss} />)}</div>, layers.at(-1) ?? document.body)}
  </Interface.Provider>;
}
export const useInterface = () => useContext(Interface);

~~~~~

## client/src/hooks/useChatStream.js

~~~~~javascript
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText, openAnswer } from "../api/client";
import { readChatStream } from "../api/stream";
import { useInterface } from "../context/Interface";

const empty = (id) => ({ id, messages: [], phase: "ready", error: "" });

export function useChatStream(chatId) {
  const { notify } = useInterface();
  const [view, setView] = useState(() => empty(null));
  const current = useRef({ id: undefined });

  const select = useCallback((id) => {
    const previous = current.current;
    current.current = { id };
    previous.reader?.abort();
    previous.writer?.abort();
    return current.current;
  }, []);

  const load = useCallback(async (id) => {
    const slot = select(id);
    if (!id) { setView(empty(null)); return; }
    const reader = new AbortController();
    slot.reader = reader;
    setView({ ...empty(id), phase: "loading" });
    try {
      const { data } = await api.get("/conversations/" + id + "/messages", { signal: reader.signal });
      if (current.current === slot) setView({ ...empty(id), messages: data });
    } catch (e) {
      if (current.current !== slot) return;
      const message = errorText(e, "Couldn’t load this conversation.");
      setView({ ...empty(id), phase: "error", error: message });
      notify(message, true);
    } finally { slot.reader = null; }
  }, [select, notify]);

  useEffect(() => {
    if (current.current.id !== chatId) void load(chatId);
  }, [chatId, load]);
  useEffect(() => () => { select(undefined); }, [select]);

  async function send(id, question, fresh = false) {
    // A draft gets its server ID just before routing. Keep that new stream alive on navigation.
    const slot = fresh ? select(id) : current.current;
    if (slot.id !== id || slot.writer || slot.reader) return;
    const writer = new AbortController();
    slot.writer = writer;
    const user = { _id: crypto.randomUUID(), role: "user", content: question };
    const answer = { _id: crypto.randomUUID(), role: "assistant", content: "", sources: [] };
    setView((old) => ({ ...empty(id), phase: "streaming", messages: [...(fresh ? [] : old.messages), user, answer] }));
    function amend(fn) {
      if (current.current !== slot) return;
      setView((old) => old.id !== id ? old : {
        ...old, messages: old.messages.map((m) => m._id === answer._id ? fn(m) : m)
      });
    }
    try {
      const body = await openAnswer(id, question, writer.signal);
      await readChatStream(body,
        (piece) => amend((m) => ({ ...m, content: m.content + piece })),
        (sources) => amend((m) => ({ ...m, sources })), writer.signal);
      if (current.current === slot) setView((old) => ({ ...old, phase: "ready" }));
    } catch (e) {
      if (current.current !== slot) return;
      if (writer.signal.aborted) notify("Generation stopped.");
      else notify(errorText(e, "The answer was interrupted."), true);
      // Express retains accepted questions and commits only completed answers.
      await load(id);
    } finally { slot.writer = null; }
  }
  return {
    ...view, send, reload: () => load(chatId), stop: () => current.current.writer?.abort(),
    loading: view.id !== chatId || view.phase === "loading", streaming: view.phase === "streaming" && view.id === chatId
  };
}

~~~~~

## client/src/hooks/useCollection.js

~~~~~javascript
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../api/client";
import { useInterface } from "../context/Interface";

export function useCollection(path, label) {
  const { notify } = useInterface();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(null);
  const failed = useRef(false);
  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const { data } = await api.get(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems(data);
      setError("");
      failed.current = false;
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = errorText(e, "Couldn’t load " + label + ".");
      setError(message);
      if (!failed.current) notify(message, true);
      failed.current = true;
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [path, label, notify]);
  const update = useCallback((change) => {
    request.current?.abort();
    request.current = null;
    setItems(change);
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    return () => { request.current?.abort(); request.current = null; };
  }, [refresh]);
  return { items, loading, error, refresh, update };
}

~~~~~

## client/src/hooks/useDocuments.js

~~~~~javascript
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../api/client";
import { useInterface } from "../context/Interface";
import { useCollection } from "./useCollection";

export const fileLimit = 50 * 1024 * 1024;
export function fileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " MB";
  return bytes ? Math.max(1, Math.round(bytes / 1024)) + " KB" : "0 KB";
}

export function useDocuments() {
  const list = useCollection("/documents", "documents");
  const { refresh, update } = list;
  const { notify } = useInterface();
  const [progress, setProgress] = useState(null);
  const upload = useRef(null);
  const processing = list.items.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [processing, refresh]);
  useEffect(() => () => upload.current?.abort(), []);

  const uploadFiles = useCallback(async (files) => {
    if (upload.current || !files.length) return;
    const controller = new AbortController();
    upload.current = controller;
    try {
      for (const [index, file] of Array.from(files).entries()) {
        if (controller.signal.aborted) break;
        try {
          if (file.size > fileLimit) throw new Error(file.name + " is too large. Choose a PDF of 50 MB or less.");
          if (await file.slice(0, 5).text() !== "%PDF-") throw new Error(file.name + " isn’t a PDF. Choose a PDF file to upload.");
          if (controller.signal.aborted) break;
          setProgress({ name: file.name, percent: 0, index: index + 1, total: files.length });
          const form = new FormData();
          form.set("file", file);
          const { data } = await api.post("/documents", form, {
            signal: controller.signal, timeout: 0,
            onUploadProgress: ({ loaded, total }) => {
              if (!controller.signal.aborted) setProgress((p) => p && { ...p, percent: Math.min(100, Math.round(loaded / (total || file.size) * 100)) });
            }
          });
          if (controller.signal.aborted) break;
          const doc = data.document ?? data;
          update((docs) => [doc, ...docs.filter((d) => d._id !== doc._id)]);
        } catch (e) {
          if (!controller.signal.aborted) notify(errorText(e, "The upload failed. Please try again."), true);
        }
      }
    } finally {
      upload.current = null;
      if (!controller.signal.aborted) { setProgress(null); void refresh(); }
    }
  }, [update, refresh, notify]);
  return { ...list, progress, uploadFiles };
}

~~~~~

## client/src/pages/AuthPage.jsx

~~~~~jsx
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/Auth";
import { errorText } from "../api/client";
import { Brand, IconButton, ThemeButton } from "../components/Primitives";

export default function AuthPage({ register = false }) {
  const { signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  useEffect(() => {
    document.title = (register ? "Create an account" : "Sign in") + " · DocChat";
    return () => pending.current?.abort();
  }, [register]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (new TextEncoder().encode(password).length > 72) { setError("Use a password of 72 UTF-8 bytes or fewer."); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try { await signIn(register ? "register" : "login", email.trim(), password, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e, "Couldn’t sign in. Please try again.")); }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="auth-story" aria-label="About DocChat">
      <img className="auth-art" src="/reading-room.webp" alt="" fetchPriority="high" />
      <Brand light />
      <div className="story-copy">
        <h2>Your documents,<br /><em>in conversation.</em></h2>
        <p>Ask a question. Follow the answer back to the page it came from.</p>
      </div>
    </section>
    <section className="auth-side">
      <div className="auth-tools"><ThemeButton /></div>
      <div className="auth-form-wrap">
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p className="auth-intro">{register ? "Set up your personal document workspace." : "Sign in to your document workspace."}</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <div className="field"><Mail size={18} /><input required id="email" name="email" type="email" autoComplete="email"
            maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <label htmlFor="password">Password</label>
          <div className="field"><LockKeyhole size={18} /><input required id="password" name="password" type={visible ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : 1}
            aria-describedby={register ? "password-help" : undefined}
            placeholder={register ? "Choose a password" : "Enter your password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <IconButton label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}</IconButton>
          </div>
          {register && <p id="password-help" className="field-help">Use at least 8 characters.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary auth-submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}
            {register ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{register ? "Already have an account? " : "New to DocChat? "}
          <Link to={register ? "/login" : "/register"} state={location.state}>{register ? "Sign in" : "Create an account"}</Link>
        </p>
      </div>
    </section>
  </main>;
}

~~~~~

## client/src/pages/Workspace.jsx

~~~~~jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight, Files, Menu, Pencil, Trash2 } from "lucide-react";
import { api, errorText } from "../api/client";
import { useAuth } from "../context/Auth";
import { useInterface } from "../context/Interface";
import { useChatStream } from "../hooks/useChatStream";
import { useCollection } from "../hooks/useCollection";
import { useDocuments } from "../hooks/useDocuments";
import ChatPane from "../components/ChatPane";
import Sidebar from "../components/Sidebar";
import { Library, SourcePanel } from "../components/Library";
import { Dialog, IconButton, ThemeButton } from "../components/Primitives";

function EditDialog({ action, onDismiss, onDelete, onCommit }) {
  const editing = action.kind === "rename";
  const doc = action.kind === "deleteDoc";
  const title = editing ? "Manage conversation" : doc ? "Delete document?" : "Delete conversation?";
  const [value, setValue] = useState(action.item.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(e) {
    e.preventDefault();
    if (pending.current || (editing && !value.trim())) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError("");
    try { await onCommit(action, value.trim(), controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(errorText(e, "Couldn’t save that change. Please try again.")); }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <Dialog title={title} onDismiss={() => { if (!busy) onDismiss(); }}>
    <form className="edit-form" onSubmit={submit}>
      {editing ? <><label htmlFor="chat-title">Conversation title</label>
        <div className="field"><Pencil size={16} /><input id="chat-title" autoFocus required maxLength={200} value={value}
          onChange={(e) => setValue(e.target.value)} /></div></> :
        <p>{doc ? <>Deleting <strong>{action.item.filename}</strong> removes it from your library and chats that use it.</> :
          <>Deleting <strong>{action.item.title}</strong> also deletes its messages.</>}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {editing && <IconButton label="Delete this conversation" className="danger-text" disabled={busy} onClick={onDelete}><Trash2 size={17} /></IconButton>}
        <button type="button" className="secondary" disabled={busy} onClick={onDismiss}>Cancel</button>
        <button className={editing ? "primary" : "danger-button"} disabled={busy || (editing && !value.trim())}>
          {editing ? "Save changes" : "Delete"}</button>
      </div>
    </form>
  </Dialog>;
}

export default function Workspace() {
  const { chatId = null } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { notify } = useInterface();
  const chats = useCollection("/conversations", "conversations");
  const documents = useDocuments();
  const stream = useChatStream(chatId);
  const [selected, setSelected] = useState(() => new Set());
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState(null);
  const [source, setSource] = useState(null);
  const [action, setAction] = useState(null);
  const [creating, setCreating] = useState(false);
  const pending = useRef(null);
  const mounted = useRef(false);
  const active = chats.items.find((item) => item._id === chatId);
  const available = chatId ? new Set(active?.docIds ?? []) : selected;
  const readyIds = documents.items.filter((doc) => doc.status === "ready" && available.has(doc._id)).map((doc) => doc._id);
  const title = active?.title || (chatId ? "Conversation" : "New chat");
  useEffect(() => { document.title = title + " · DocChat"; }, [title]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);
  useEffect(() => {
    setDraft(""); setPanel(null); setSource(null); setAction(null); setCreating(false);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [chatId]);

  function newChat() {
    pending.current?.abort(); pending.current = null;
    setCreating(false); setDraft(""); setPanel(null);
    navigate("/workspace");
  }
  function toggle(id) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function send(question) {
    if (pending.current || stream.streaming || stream.loading || !readyIds.length) return;
    let id = chatId;
    if (!id) {
      const controller = new AbortController();
      pending.current = controller;
      setCreating(true);
      try {
        const { data } = await api.post("/conversations", {
          title: Array.from(question.replace(/\s+/g, " ")).slice(0, 80).join(""), docIds: readyIds
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const chat = data.conversation ?? data;
        id = chat._id;
        chats.update((all) => [chat, ...all.filter((item) => item._id !== id)]);
      } catch (e) {
        if (!controller.signal.aborted) notify(errorText(e, "Couldn’t create the conversation."), true);
        return;
      } finally {
        if (pending.current === controller) pending.current = null;
        if (!controller.signal.aborted) setCreating(false);
      }
      navigate("/workspace/" + id, { replace: true });
    }
    setDraft("");
    await stream.send(id, question, !chatId);
    if (mounted.current) void chats.refresh();
  }
  async function commit({ kind, item }, value, signal) {
    if (kind === "rename") {
      const { data } = await api.patch("/conversations/" + item._id, { title: value }, { signal });
      if (signal.aborted) return;
      chats.update((all) => [data.conversation ?? data, ...all.filter((chat) => chat._id !== item._id)]);
    } else if (kind === "deleteChat") {
      await api.delete("/conversations/" + item._id, { signal });
      if (signal.aborted) return;
      chats.update((all) => all.filter((chat) => chat._id !== item._id));
      if (item._id === chatId) navigate("/workspace", { replace: true });
    } else {
      await api.delete("/documents/" + item._id, { signal });
      if (signal.aborted) return;
      documents.update((all) => all.filter((doc) => doc._id !== item._id));
      setSelected((old) => { const next = new Set(old); next.delete(item._id); return next; });
      chats.update((all) => all.map((chat) => ({ ...chat, docIds: chat.docIds.filter((id) => id !== item._id) })));
    }
    notify(kind === "rename" ? "Conversation renamed." : kind === "deleteChat" ? "Conversation deleted." : "Document deleted.");
    setAction(null);
  }
  const sidebarProps = { chats, documents, user, activeId: chatId, onNew: newChat, onLibrary: () => setPanel("library"),
    onManage: (item) => { setPanel(null); setAction({ kind: "rename", item }); }, onSignOut: signOut };
  return <div className="workspace">
    <a className="skip-link" href="#chat-main">Skip to chat</a>
    <div className="desktop-sidebar"><Sidebar {...sidebarProps} /></div>
    <main id="chat-main" tabIndex={-1} className="chat-main">
      <header className="workspace-header">
        <IconButton label="Open navigation" className="nav-toggle" onClick={() => setPanel("nav")}><Menu size={20} /></IconButton>
        <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong title={title}>{title}</strong></div>
        <div className="header-actions"><button className="header-library" onClick={() => setPanel("library")} aria-label="Open library">
          <Files size={16} /><span>Library</span></button><ThemeButton /></div>
      </header>
      <ChatPane chatId={chatId} stream={stream} draft={draft} setDraft={setDraft} readyCount={readyIds.length}
        documents={documents} creating={creating} onSend={send} onNew={newChat} onSource={setSource} onLibrary={() => setPanel("library")} />
    </main>
    {panel === "nav" && <Dialog variant="nav" title="Navigation" hideHeader onDismiss={() => setPanel(null)}>
      <Sidebar {...sidebarProps} onClose={() => setPanel(null)} /></Dialog>}
    {panel === "library" && <Library documents={documents} selected={selected} onToggle={toggle}
      onDelete={(item) => setAction({ kind: "deleteDoc", item })} onDismiss={() => setPanel(null)} />}
    {source && <SourcePanel source={source} onDismiss={() => setSource(null)} />}
    {action && <EditDialog key={action.kind + action.item._id} action={action} onDismiss={() => setAction(null)}
      onDelete={() => setAction({ kind: "deleteChat", item: action.item })} onCommit={commit} />}
  </div>;
}

~~~~~

## client/src/styles.css

~~~~~css
@import "tailwindcss" source(none);
@source "./";

@theme {
  --font-sans: "DM Sans Variable", system-ui, sans-serif;
  --font-display: "Instrument Serif", Georgia, serif;
}

:root {
  --paper: #fdfcf9; --panel: #ffffff; --side: #f4f3f0; --wash: #f5f3fa;
  --ink: #292638; --muted: #62606e; --subtle: #74717c; --line: #e1dfe5;
  --accent: #5241ad; --accent-hover: #42318e; --tint: #eeebfa; --tint-ink: #46368f;
  --danger: #aa354e; --danger-wash: #fae8ed; --good: #23634d; --good-wash: #e6f3eb;
  --shadow: 0 10px 40px #30283c10; --ring: #8164df; color-scheme: light;
}
:root[data-theme="dark"] {
  --paper: #1b1922; --panel: #23212c; --side: #201e27; --wash: #2b2834;
  --ink: #f1edf6; --muted: #c2bdca; --subtle: #aaa4b5; --line: #3d3948;
  --accent: #bdacff; --accent-hover: #cfc3ff; --tint: #39314f; --tint-ink: #d4c9ff;
  --danger: #ffb2be; --danger-wash: #4a2d37; --good: #9bdaba; --good-wash: #273d34;
  --shadow: 0 10px 36px #0003; --ring: #c1a9ff; color-scheme: dark;
}
* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled, button[aria-disabled="true"] { cursor: default; }
button:disabled { opacity: .55; }
button, a, input, textarea { -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
button, a { touch-action: manipulation; }
svg { flex-shrink: 0; }
::selection { background: #d9cdfd; color: #28203b; }
progress { display: block; height: 5px; width: 100%; overflow: hidden; appearance: none; background: var(--line); border: 0; border-radius: 20px; color: var(--accent); }
progress::-webkit-progress-bar { background: var(--line); border-radius: 20px; }
progress::-moz-progress-bar { background: var(--accent); border-radius: 20px; }
progress::-webkit-progress-value { background: var(--accent); border-radius: 20px; }
.brand { @apply inline-flex items-center; gap: 10px; font-size: 27px; font-weight: 700; letter-spacing: -1.6px; line-height: 1; }
.brand-symbol { @apply grid place-items-center; width: 36px; height: 36px; border-radius: 11px; color: #fff; background: #5743b1; }
.brand-light { color: white; }
.brand-light .brand-symbol { background: #ffffff15; border: 1px solid #ffffff6b; }
.icon-button { @apply inline-flex items-center justify-center; width: 36px; height: 36px; flex: 0 0 auto; border-radius: 9px; color: var(--muted); background: transparent; }
.icon-button:hover, .header-library:hover { color: var(--ink); background: var(--wash); }
.primary, .secondary, .danger-button, .banner-button, .stop-button {
  @apply inline-flex items-center justify-center; min-height: 40px; gap: 8px; padding: 9px 16px; border-radius: 10px; font-size: 14px; font-weight: 650;
}
.primary { background: var(--accent); color: var(--panel); }
.primary:hover:enabled { background: var(--accent-hover); }
.secondary { background: var(--panel); color: var(--ink); border: 1px solid var(--line); }
.secondary:hover { background: var(--wash); }
.danger-button { background: var(--danger); color: var(--panel); }
.text-button { color: var(--accent); font-size: 13px; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
.accent-text { color: var(--accent); } .danger-text, .form-error, .doc-error { color: var(--danger); }
.form-error, .doc-error { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.session-state { @apply flex flex-col items-center justify-center; min-height: 100dvh; gap: 20px; }
.session-state .skeleton-group { width: min(250px, 75vw); }
.skeleton-group { @apply grid; gap: 13px; padding: 14px 0; }
.skeleton-line { height: 12px; width: 88%; border-radius: 20px; background: linear-gradient(100deg,var(--line) 20%,var(--wash) 40%,var(--line) 60%); background-size: 250% 100%; animation: shimmer 1.5s linear infinite; }
.skeleton-line:nth-child(2n) { width: 65%; }
@keyframes shimmer { to { background-position: -170% 0; } }
.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }

/* The cover and form keep independent reading widths on wide displays. */
.auth-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 100dvh; padding: 18px; }
.auth-story { position: relative; isolation: isolate; overflow: hidden; min-height: 600px; border-radius: 22px; background: #21174a; color: white; }
.auth-art, .auth-story::after { position: absolute; inset: 0; width: 100%; height: 100%; }
.auth-art { z-index: -2; object-fit: cover; object-position: 50% 43%; }
.auth-story::after { content: ""; z-index: -1; background: linear-gradient(180deg,#160d3324,transparent 23%,transparent 51%,#171034a8 81%,#171033e8); }
.auth-story > .brand { position: absolute; left: clamp(25px,3.3vw,60px); top: clamp(25px,3.3vw,60px); }
.story-copy { position: absolute; left: clamp(25px,3.3vw,60px); right: 26px; bottom: clamp(32px,4.5vw,84px); }
.story-copy h2, .desk-copy h1 { font-family: var(--font-display); font-weight: 400; line-height: .96; letter-spacing: -.035em; }
.story-copy h2 { font-size: clamp(56px,6.1vw,104px); }
.story-copy em, .desk-copy em { color: #d9caff; }
.story-copy p { max-width: 31ch; margin: 21px 0 0; font-size: clamp(14px,1.2vw,19px); line-height: 1.55; color: #eeeaf5; }
.auth-side { position: relative; display: grid; place-items: center; padding: 80px 40px; }
.auth-tools { position: absolute; right: 15px; top: 7px; }
.auth-tools .icon-button { border: 1px solid var(--line); border-radius: 50%; }
.auth-form-wrap { width: min(100%, 390px); }
.auth-form-wrap h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(44px,4.45vw,70px); letter-spacing: -.04em; line-height: 1.08; }
.auth-intro { color: var(--muted); margin: 11px 0 32px; font-size: 15px; }
.auth-form { display: flex; flex-direction: column; }
.auth-form label, .edit-form label { font-size: 13px; font-weight: 650; }
.auth-form .field + label { margin-top: 19px; }
.field { @apply flex items-center; gap: 10px; min-height: 48px; margin-top: 7px; padding: 0 13px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; color: var(--subtle); }
.field:focus-within, .composer:focus-within { outline: 2px solid var(--ring); outline-offset: 2px; }
.field input { outline: 0; width: 100%; min-width: 0; height: 46px; font-size: 15px; background: transparent; color: var(--ink); }
.field input::placeholder, textarea::placeholder { color: var(--subtle); opacity: 1; }
.field .icon-button { width: 30px; }
.field-help { color: var(--muted); font-size: 12px; margin-top: 7px; }
.auth-form .form-error { margin-top: 14px; }
.auth-submit { width: 100%; margin-top: 26px; min-height: 47px; }
.auth-switch { margin-top: 23px; text-align: center; font-size: 14px; color: var(--muted); }
.auth-switch a { color: var(--accent); text-underline-offset: 3px; font-weight: 650; }
.auth-switch a:hover { text-decoration: underline; }

/* Keep navigation, conversation history and the composer independently usable. */
.workspace { display: grid; grid-template-columns: clamp(242px, 20vw, 286px) minmax(0, 1fr); height: 100vh; height: 100dvh; overflow: hidden; }
.skip-link { position: fixed; z-index: 5; left: 12px; top: -100px; background: var(--panel); padding: 8px 13px; border-radius: 8px; }
.skip-link:focus { top: 10px; }
.desktop-sidebar { min-height: 0; border-right: 1px solid var(--line); }
.sidebar { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--side); }
.side-brand { @apply flex items-center justify-between; min-height: 86px; padding: 20px 23px 16px; }
.side-actions { padding: 16px 16px 8px; }
.new-chat { width: 100%; justify-content: flex-start; padding-left: 15px; min-height: 43px; }
.library-nav { @apply flex items-center; gap: 10px; width: 100%; margin-top: 8px; min-height: 42px; padding: 0 12px; font-size: 14px; font-weight: 550; border-radius: 9px; }
.library-nav:hover, .nav-row:hover { background: var(--panel); }
.count { margin-left: auto; padding: 0 7px; border-radius: 5px; background: var(--panel); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.chat-nav { flex: 1; min-height: 0; overflow-y: auto; padding: 25px 12px 16px; }
.chat-nav h2, .section-label h3 { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.chat-nav h2 { padding: 0 12px 11px; }
.side-empty, .chat-nav > .text-button, .chat-nav .skeleton-group { margin: 3px 12px; color: var(--muted); font-size: 13px; }
.chat-nav .text-button { color: var(--accent); }
.nav-row { @apply flex items-center; gap: 2px; border-radius: 9px; min-width: 0; margin-bottom: 3px; padding-right: 3px; }
.nav-row a { @apply flex items-center; gap: 10px; min-width: 0; flex: 1; padding: 10px 0 10px 12px; font-size: 13px; }
.nav-row a span, .account-text span, .breadcrumb strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-row .icon-button { width: 30px; height: 32px; }
.nav-row.active { color: var(--tint-ink); background: var(--tint); }
.storage { padding: 19px 24px 21px; color: var(--muted); }
.storage-title { @apply flex items-center; gap: 7px; font-size: 12px; font-weight: 650; }
.storage progress { margin: 9px 0 3px; }
.storage small { font-size: 11px; }
.account { @apply flex items-center; gap: 10px; min-height: 74px; padding: 10px 15px 10px 20px; border-top: 1px solid var(--line); }
.avatar { @apply grid place-items-center; width: 35px; height: 35px; flex: 0 0 auto; border: 1px solid var(--line); border-radius: 50%; background: var(--tint); color: var(--tint-ink); font-family: var(--font-display); font-size: 23px; }
.account-text { min-width: 0; flex: 1; }
.account-text strong, .account-text span { display: block; }
.account-text strong { font-size: 13px; } .account-text span { color: var(--muted); font-size: 11px; }
.chat-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; outline: none; }
.workspace-header { @apply flex items-center; flex: 0 0 auto; min-height: 68px; padding: 10px clamp(16px,3.5vw,60px); gap: 10px; border-bottom: 1px solid var(--line); }
.breadcrumb, .header-actions, .header-library { @apply flex items-center; }
.breadcrumb { gap: 9px; min-width: 0; color: var(--subtle); font-size: 13px; }
.breadcrumb strong { color: var(--ink); font-weight: 600; }
.header-actions { margin-left: auto; gap: 9px; }
.header-library { gap: 7px; padding: 7px 11px; font-size: 13px; font-weight: 550; border: 1px solid var(--line); border-radius: 9px; }
.nav-toggle { display: none; }
.chat-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; }
.reading-column, .composer-wrap { width: min(100% - 64px, 770px); margin-inline: auto; }
.reading-column { padding-block: clamp(30px,6vh,76px) 24px; }
.desk-banner { isolation: isolate; overflow: hidden; position: relative; display: flex; align-items: center; min-height: 265px; border-radius: 18px; color: #fff; background: linear-gradient(125deg,#291f4f 5%,#382965 62%,#33245e); }
.desk-art { position: absolute; z-index: -1; right: 0; top: 0; width: 53%; height: 100%; object-fit: cover; object-position: center 41%; mask-image: linear-gradient(to right,transparent,black 30%); }
.desk-copy { max-width: 61%; padding: clamp(24px,3.2vw,49px); }
.desk-copy h1 { font-size: clamp(46px,4.7vw,76px); }
.desk-copy p { max-width: 35ch; color: #e8e2f4; font-size: 14px; line-height: 1.55; margin-top: 13px; }
.banner-button { background: #f5f0ff; color: #352758; margin-top: 18px; min-height: 36px; padding: 7px 12px; font-size: 13px; }
.banner-button:hover { background: white; }
.starter-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 16px; }
.starter-grid button { @apply flex items-center; gap: 12px; min-height: 58px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); font-size: 13px; text-align: left; }
.starter-grid button:hover { border-color: var(--accent); }
.starter-grid svg { color: var(--accent); }
.starter-grid svg:last-child { margin-left: auto; color: var(--subtle); }
.load-failed h1 { font-family: var(--font-display); font-size: 37px; }
.load-failed p { margin: 5px 0 15px; color: var(--muted); }
.thread { display: flex; flex-direction: column; gap: 28px; }
.question { align-self: flex-end; max-width: 88%; }
.question > span { display: block; font-weight: 600; text-align: right; font-size: 12px; color: var(--muted); margin: 0 4px 5px; }
.question p { background: var(--tint); border-radius: 15px 15px 5px 15px; padding: 12px 17px; font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.answer { min-width: 0; }
.answer-heading { @apply flex items-center; gap: 8px; margin-bottom: 12px; font-size: 14px; font-weight: 700; }
.answer-symbol { @apply grid place-items-center; width: 28px; height: 28px; border-radius: 8px; background: var(--tint); color: var(--accent); }
.markdown { font-size: 15px; line-height: 1.72; overflow-wrap: anywhere; }
.markdown > * + * { margin-top: .8em; }
.markdown h1, .markdown h2, .markdown h3, .markdown h4 { font-weight: 680; line-height: 1.3; margin-block: .9em .35em; }
.markdown h1 { font-size: 1.55em; } .markdown h2 { font-size: 1.33em; } .markdown h3 { font-size: 1.16em; }
.markdown ul, .markdown ol { padding-inline-start: 1.6em; list-style: disc; } .markdown ol { list-style: decimal; }
.markdown li + li { margin-top: .25em; } .markdown li > p + p { margin-block: .55em; }
.markdown a { text-decoration: underline; color: var(--accent); }
.markdown code { padding: .15em .28em; border-radius: 4px; background: var(--wash); font-size: .88em; }
.markdown pre, .table-scroll { overflow: auto; }
.markdown pre { background: var(--wash); padding: 13px; border-radius: 9px; }
.markdown pre code { padding: 0; }
.markdown blockquote { padding-inline-start: 14px; border-inline-start: 3px solid var(--accent); color: var(--muted); }
.markdown th, .markdown td { padding: 5px 10px; border: 1px solid var(--line); text-align: left; }
.citations { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.citation { @apply inline-flex items-center; max-width: 100%; gap: 5px; padding: 5px 9px; background: var(--tint); color: var(--tint-ink); border: 1px solid var(--line); border-radius: 7px; text-align: left; font-size: 12px; font-weight: 550; }
.citation span { overflow-wrap: anywhere; }
.citation:hover { border-color: var(--accent); }
.copy-answer { margin: 5px 0 0 -7px; }
.thinking { @apply flex items-center; gap: 4px; height: 22px; }
.thinking i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse .9s alternate ease-in-out infinite; }
.thinking i:nth-child(2) { animation-delay: .15s; } .thinking i:nth-child(3) { animation-delay: .3s; }
@keyframes pulse { to { opacity: .3; transform: translateY(-2px); } }
.composer-region { flex: 0 0 auto; padding: 8px 0 max(14px,env(safe-area-inset-bottom)); }
.composer { padding: 15px 13px 10px 17px; border-radius: 16px; border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); }
.composer textarea { display: block; min-height: 26px; max-height: 140px; width: 100%; outline: 0; resize: none; background: transparent; color: var(--ink); font-size: 15px; line-height: 24px; }
.composer-tools { @apply flex items-end justify-between; gap: 8px; margin-top: 12px; }
.document-context { @apply inline-flex items-center; min-width: 0; gap: 6px; min-height: 32px; color: var(--muted); font-size: 12px; text-align: left; }
.document-context:hover { color: var(--accent); }
.send-button { @apply grid place-items-center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 10px; background: var(--accent); color: var(--panel); }
.send-button:disabled { background: var(--line); color: var(--muted); opacity: .9; }
.stop-button { flex-shrink: 0; min-height: 32px; padding: 5px 9px; font-size: 12px; background: var(--tint); color: var(--tint-ink); }
.composer-note { margin-top: 9px; text-align: center; font-size: 11px; color: var(--subtle); }

.dialog { box-sizing: border-box; padding: 0; background: var(--panel); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow); }
.dialog::backdrop { background: #1b152b55; }
.dialog[open] { display: flex; flex-direction: column; }
.dialog-center { margin: auto; width: min(410px, calc(100vw - 32px)); max-height: calc(100dvh - 36px); border-radius: 16px; }
.dialog-sheet, .dialog-nav { max-width: 100%; max-height: 100%; height: 100dvh; }
.dialog-sheet { margin: 0 0 0 auto; width: min(430px,100vw); }
.dialog-nav { margin: 0 auto 0 0; width: min(300px, calc(100vw - 34px)); }
.dialog-nav .sidebar { flex: 1; }
.dialog-header { @apply flex items-center justify-between; gap: 10px; flex-shrink: 0; border-bottom: 1px solid var(--line); padding: 17px 18px 17px 24px; }
.dialog-header h2 { font-family: var(--font-display); font-size: 31px; line-height: 1.1; letter-spacing: -.025em; }
.sheet-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
.panel-intro, .edit-form > p { color: var(--muted); font-size: 14px; line-height: 1.6; }
.drop-zone { @apply flex flex-col items-center justify-center; width: 100%; min-height: 156px; margin: 20px 0; padding: 15px; border: 1px dashed var(--accent); border-radius: 13px; background: var(--wash); color: var(--tint-ink); }
.drop-zone:hover, .drop-zone.dragging { background: var(--tint); }
.upload-icon, .file-stamp { @apply grid place-items-center; width: 43px; height: 43px; background: var(--tint); color: var(--accent); border-radius: 12px; }
.drop-zone strong { margin: 9px 0 3px; font-size: 14px; }
.drop-zone small, .upload-progress small { font-size: 12px; color: var(--muted); }
.upload-progress { margin-bottom: 20px; }
.upload-progress > div, .section-label, .sheet-footer, .doc-row, .dialog-actions, .inline-error { display: flex; align-items: center; gap: 10px; }
.upload-progress > div, .section-label, .sheet-footer, .inline-error { justify-content: space-between; }
.upload-progress > div { font-size: 13px; overflow-wrap: anywhere; margin-bottom: 7px; }
.section-label { margin: 23px 0 10px; }
.section-label > span, .sheet-footer > span { font-size: 12px; color: var(--muted); }
.library-empty { padding: 27px 15px; text-align: center; border-radius: 12px; background: var(--paper); }
.library-empty svg { margin: 0 auto 10px; color: var(--accent); }
.library-empty h4 { font-weight: 600; font-size: 15px; }
.library-empty p { color: var(--muted); font-size: 13px; padding-top: 4px; }
.doc-list { list-style: none; }
.doc-list > li { padding-block: 14px; border-top: 1px solid var(--line); }
.doc-row { align-items: flex-start; }
.doc-row > input { width: 16px; height: 16px; margin-top: 4px; flex-shrink: 0; cursor: pointer; accent-color: var(--accent); }
.doc-row > input:disabled { cursor: default; }
.doc-info { min-width: 0; flex: 1; }
.doc-info strong, .doc-info small { display: block; }
.doc-info strong { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.doc-info small { margin-top: 2px; color: var(--muted); font-size: 12px; }
.doc-row > .icon-button { margin-top: -5px; }
.status { @apply inline-flex items-center; gap: 4px; margin-top: 6px; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.status-ready { color: var(--good); background: var(--good-wash); }
.status-processing { color: var(--tint-ink); background: var(--tint); }
.status-failed { color: var(--danger); background: var(--danger-wash); }
.doc-error { margin: 6px 0 0 26px; }
.sheet-footer { padding: 14px 24px max(14px,env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
.inline-error { color: var(--danger); padding-block: 6px; font-size: 13px; }
.source-body h3 { overflow-wrap: anywhere; margin: 17px 0; font-weight: 600; font-size: 19px; }
.source-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-bottom: 26px; }
.source-metrics > div { border: 1px solid var(--line); border-radius: 9px; padding: 10px 13px; }
.source-metrics dt { color: var(--muted); font-size: 12px; }
.source-metrics dd { font-size: 18px; font-weight: 550; }
.source-body h4 { font-size: 13px; font-weight: 650; }
.source-body blockquote { margin-top: 11px; padding: 16px 17px; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; background: var(--wash); font-size: 15px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.edit-form { padding: 20px 24px 24px; overflow-y: auto; }
.edit-form > p { overflow-wrap: anywhere; }
.edit-form .form-error { color: var(--danger); margin-top: 12px; }
.dialog-actions { margin-top: 22px; justify-content: flex-end; }
.dialog-actions > .icon-button { margin-right: auto; }
.toast-stack { position: fixed; z-index: 20; display: grid; gap: 7px; left: 50%; bottom: max(18px,env(safe-area-inset-bottom)); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px); pointer-events: none; }
.toast { @apply flex items-center; gap: 9px; min-width: 0; padding: 7px 8px 7px 13px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 5px 30px #1e172d26; font-size: 13px; pointer-events: auto; }
.toast span { flex: 1; overflow-wrap: anywhere; }
.dialog-sheet .toast-stack { bottom: 73px; }

@media (max-width: 1000px) {
  .auth-layout { grid-template-columns: minmax(0,.9fr) minmax(0,1fr); padding: 12px; }
  .auth-side { padding-inline: 30px; }
  .reading-column, .composer-wrap { width: calc(100% - 40px); }
}
@media (max-width: 760px) {
  .auth-layout { display: flex; flex-direction: column; padding: 10px; }
  .auth-story { min-height: 0; height: clamp(155px,26vh,220px); flex-shrink: 0; border-radius: 15px; }
  .auth-story > .brand { top: 16px; left: 19px; font-size: 20px; gap: 7px; }
  .auth-story .brand-symbol { width: 29px; height: 29px; border-radius: 8px; }
  .auth-story .brand-symbol svg { width: 18px; height: 18px; }
  .auth-art { inset: 0 0 auto auto; width: 53%; object-position: 50% 41%; mask-image: linear-gradient(to right,transparent,black 23%); }
  .auth-story::after { background: linear-gradient(to right,#261d4d,transparent 76%); }
  .story-copy { left: 20px; bottom: 17px; right: 36%; }
  .story-copy h2 { font-size: clamp(34px,7vw,47px); }
  .story-copy p { display: none; }
  .auth-side { position: relative; flex: 1; padding: 37px 15px 35px; }
  .auth-tools { right: 8px; top: 10px; }
  .auth-tools .icon-button { width: 30px; height: 30px; }
  .auth-form-wrap h1 { font-size: 44px; }
  .auth-intro { margin: 9px 0 24px; }
  .field input, .composer textarea { font-size: 16px; }
  .workspace { grid-template-columns: minmax(0,1fr); }
  .desktop-sidebar { display: none; }
  .nav-toggle { display: inline-flex; margin-left: -5px; }
  .workspace-header { min-height: 57px; padding: 7px 15px; gap: 7px; }
  .header-actions { gap: 3px; }
  .chat-scroll { scrollbar-gutter: auto; }
  .reading-column, .composer-wrap { width: min(100% - 32px, 620px); }
  .reading-column { padding-top: 21px; }
  .desk-banner { min-height: 215px; border-radius: 14px; }
  .desk-copy { padding: 22px; max-width: 65%; }
  .desk-copy p { font-size: 13px; }
  .starter-grid { gap: 8px; }
  .starter-grid button { padding: 10px; gap: 7px; font-size: 12px; }
  .dialog-nav .side-brand { min-height: 73px; }
  .composer-region { padding-bottom: max(9px,env(safe-area-inset-bottom)); }
  .composer { padding: 12px 10px 8px 13px; }
}
@media (max-width: 440px) {
  .auth-art { width: 44%; }
  .breadcrumb > span, .breadcrumb > svg, .header-library span { display: none; }
  .header-library { height: 36px; width: 36px; justify-content: center; padding: 0; }
  .desk-copy { padding: 20px; }
  .desk-art { width: 44%; }
  .desk-copy h1 { font-size: 46px; }
  .desk-copy p { font-size: 12px; }
  .starter-grid { grid-template-columns: 1fr; }
  .starter-grid button { min-height: 43px; }
  .sheet-body { padding: 20px; }
  .composer-note { font-size: 10px; }
}
@media (max-height: 580px) and (min-width: 761px) {
  .auth-story { min-height: 480px; } .auth-side { padding-block: 40px; }
  .chat-nav { padding-top: 12px; } .storage { padding-block: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
}

~~~~~

## client/tests/site.js

~~~~~javascript
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { rmdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { test as base } from "@playwright/test";
import { createServer as createVite } from "vite";

// Exercise the project's actual auth, uploads, history and SSE relay in an isolated database.
const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const mongoose = serverRequire("mongoose");
const { MongoMemoryReplSet } = serverRequire("mongodb-memory-server-core");
const address = (server) => "http://127.0.0.1:" + server.address().port;
const listen = async (server) => { server.listen(0, "127.0.0.1"); await once(server, "listening"); };
async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

export const test = base.extend({
  site: [async ({}, use) => {
    const key = randomBytes(32).toString("hex");
    const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    let vite, models, uploadDir;
    const cancellations = [];
    async function ai(req, res) {
      if (req.headers["x-internal-key"] !== key) return res.writeHead(403).end();
      if (req.url === "/ingest") {
        const form = await new Response(req, { headers: req.headers }).formData();
        const filter = { _id: form.get("doc_id"), userId: form.get("user_id") };
        const scanned = form.get("file").name === "scan.pdf";
        // Keep the upload and processing states observable across separate HTTP requests.
        await delay(350);
        res.writeHead(202).end();
        await delay(700);
        await models.Document.updateOne(filter, { $set: scanned ?
          { status: "failed", error: "scanned PDF, OCR not supported" } : { status: "ready", pages: 4 } });
      } else if (req.url === "/ask") {
        const ask = await new Response(req).json();
        const doc = await models.Document.findOne({ _id: ask.doc_ids[0], userId: ask.user_id });
        const ref = { doc_id: doc.id, chunk_id: String(new mongoose.Types.ObjectId()), filename: doc.filename,
          page: 4, text: "The study counted twelve workshops.", score: 0.923 };
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("event: token\ndata: The study counted **twelve**\n\n");
        if (ask.question === "Keep reading") {
          res.once("close", () => cancellations.push(ask.question));
          return;
        }
        await delay(500);
        res.end("event: token\ndata:  workshops. [" + doc.filename + ", p.4]\n\n" +
          "event: sources\ndata: " + JSON.stringify([ref]) + "\n\n" + 'event: done\ndata: {"ok":true}\n\n');
      } else if (req.method === "DELETE") {
        const url = new URL(req.url, "http://localhost");
        const result = await models.Document.deleteOne({ _id: url.pathname.split("/").at(-1), userId: url.searchParams.get("user_id") });
        res.writeHead(result.deletedCount ? 204 : 404).end();
      } else res.writeHead(404).end();
    }
    const upstream = createServer((req, res) => ai(req, res).catch(() => res.destroy()));
    const backend = createServer();
    try {
      await listen(upstream);
      await listen(backend);
      process.env.VITE_API_URL = address(backend) + "/api";
      vite = await createVite({ mode: "test", logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
      await vite.listen();
      const origin = address(vite.httpServer);
      Object.assign(process.env, { MONGODB_URI: mongo.getUri(), MONGODB_DB: "docchat_browser_test",
        JWT_SECRET: randomBytes(32).toString("hex"), INTERNAL_KEY: key, AI_URL: address(upstream),
        CLIENT_URL: origin, AI_TIMEOUT_MS: "30000", TRUST_PROXY_HOPS: "0", PORT: String(backend.address().port) });
      const { app } = await import("../../server/src/app.js");
      models = await import("../../server/src/models/index.js");
      ({ uploadDir } = await import("../../server/src/middleware/upload.js"));
      await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
      await Promise.all(Object.values(models).map((model) => model.init()));
      backend.on("request", app);
      await use({ origin, cancellations });
    } finally {
      await vite?.close();
      await close(backend);
      await close(upstream);
      await mongoose.disconnect();
      await mongo.stop();
      if (uploadDir) await rmdir(uploadDir);
    }
  }, { scope: "worker", timeout: 120000 }],
  baseURL: async ({ site }, use) => { await use(site.origin); }
});

~~~~~

## client/tests/stream.test.js

~~~~~javascript
import assert from "node:assert/strict";
import { test } from "node:test";
import { readChatStream } from "../src/api/stream.js";

const source = { chunk_id: "c", doc_id: "d", filename: "notes.pdf", page: 4, text: "Café", score: 0.94 };
const sources = "event: sources\ndata: " + JSON.stringify([source]) + "\n\n";
const end = 'event: done\ndata: {"ok":true}\n\n';

function body(text, stride = 10) {
  const bytes = new TextEncoder().encode(text);
  let position = 0;
  return new ReadableStream({
    pull(controller) {
      if (position >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(position, position + stride));
      position += stride;
    }
  });
}

test("decodes fragmented UTF-8, comments, CRLF, spaces and multiline tokens", async () => {
  const frames = "\ufeff: ping\n\nevent: token\ndata: Café 📖\ndata: \n\nevent: token\ndata:  two\n\n" + sources + end;
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const stride of [1, 2, 9, 1024]) {
      const tokens = [], refs = [];
      await readChatStream(body(frames.replaceAll("\n", newline), stride), (t) => tokens.push(t), (s) => refs.push(s));
      assert.deepEqual(tokens, ["Café 📖\n", " two"]);
      assert.deepEqual(refs, [[source]]);
    }
  }
});

test("accepts an empty sources list and a done event with an empty data field", async () => {
  const refs = [];
  await readChatStream(body("event: sources\ndata: []\n\nevent: done\ndata:\n\n"), () => {}, (s) => refs.push(s));
  assert.deepEqual(refs, [[]]);
});

test("reports truncated streams, provider failures and malformed metadata", async () => {
  const cases = [
    [sources, /connection closed/i], [end, /before its sources/i],
    [sources + 'event: done\ndata: {"ok":false,"error":"Service offline"}\n\n', /Service offline/],
    ["event: sources\ndata: [1]\n\n", /invalid sources/],
    ["event: sources\ndata: [\n\n", /unreadable source information/],
    [sources + "event: token\ndata: late\n\n", /after its sources/],
    [sources + "event: done\ndata: false\n\n", /invalid completion/]
  ];
  for (const [wire, error] of cases) await assert.rejects(readChatStream(body(wire), () => {}, () => {}), error);
});

test("aborting a pending read cancels the transport and releases its lock", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const pending = readChatStream(stream, () => {}, () => {}, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

~~~~~

## client/tests/workspace.spec.js

~~~~~javascript
import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./site.js";

function credentials() {
  return { email: randomUUID() + "@example.test", password: randomBytes(18).toString("hex") };
}
async function register(page) {
  const account = credentials();
  await page.goto("/register");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  return account;
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function dropFiles(page, files) {
  const dataTransfer = await page.evaluateHandle((specs) => {
    const data = new DataTransfer();
    for (const [name, contents] of specs) {
      const bytes = typeof contents === "number" ? new ArrayBuffer(contents) : contents;
      data.items.add(new File([bytes], name, { type: "application/pdf" }));
    }
    return data;
  }, files);
  try { await page.getByRole("button", { name: /Drop PDFs here/ }).dispatchEvent("drop", { dataTransfer }); }
  finally { await dataTransfer.dispose(); }
}

test("protected routes, sign in, persistent theme and expired sessions", async ({ page }, testInfo) => {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("sign-in.png") });
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  const account = await register(page);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".form-error")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.evaluate(() => localStorage.setItem("docchat.jwt", "expired-test-session"));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Your session expired. Sign in to continue.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("docchat.jwt"))).toBeNull();
});

test("PDF validation, polling, streaming, sources, cancellation and deletion", async ({ page, context, site }, testInfo) => {
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await register(page);
  await expect(page.getByText("No ready documents selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send question" })).toBeDisabled();
  await page.getByRole("button", { name: "Upload a PDF" }).click();
  await dropFiles(page, [["renamed.pdf", "plain text"], ["large.pdf", 50 * 1024 * 1024 + 1]]);
  await expect(page.getByText(/renamed\.pdf isn’t a PDF/)).toBeVisible();
  await expect(page.getByText(/large\.pdf is too large/)).toBeVisible();
  await dropFiles(page, [["report.pdf", "%PDF-1.7\nStudy\n%%EOF"]]);
  await expect(page.getByRole("progressbar", { name: "Upload progress" })).toBeVisible();
  const select = page.getByRole("checkbox", { name: "Use report.pdf in new chats" });
  await expect(select).toBeDisabled();
  await expect(select).toBeEnabled({ timeout: 8000 });
  await select.check();
  await page.getByLabel("PDF files").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nscan") });
  await expect(page.getByText("scanned PDF, OCR not supported")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("checkbox", { name: "Use scan.pdf in new chats" })).toBeDisabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("1 document", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace.png") });
  const question = page.getByRole("textbox", { name: "Your question" });
  await page.getByRole("button", { name: "Summarize key points" }).click();
  await expect(question).toBeFocused();
  const creation = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/conversations"));
  await question.press("Enter");
  expect((await creation).postDataJSON().docIds).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await expect(question).toBeDisabled();
  await expect(page.locator(".markdown strong").first()).toHaveText("twelve");
  const chip = page.getByRole("button", { name: "[report.pdf, p.4]", exact: true });
  await chip.click();
  const source = page.getByRole("dialog", { name: "Source details" });
  await expect(source.getByText("0.923")).toBeVisible();
  await expect(source.getByText("The study counted twelve workshops.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("citation.png") });
  await page.keyboard.press("Escape");
  await expect(chip).toBeFocused();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: site.origin });
  await page.getByRole("button", { name: "Copy answer" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("**twelve**");
  await page.reload();
  await expect(chip).toBeVisible();
  await question.fill("Keep reading");
  await question.press("Enter");
  await expect(page.locator(".markdown strong")).toHaveCount(2);
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect.poll(() => site.cancellations.length).toBeGreaterThan(0);
  await expect(question).toBeEnabled();
  await expect(page.locator(".answer")).toHaveCount(1);
  const cancelled = site.cancellations.length;
  await question.fill("Keep reading");
  await question.press("Enter");
  await expect(page.locator(".markdown strong")).toHaveCount(2);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect.poll(() => site.cancellations.length).toBeGreaterThan(cancelled);
  await expect(page.locator(".answer")).toHaveCount(0);
  await page.getByRole("link", { name: /^Summarize the key points/ }).click();
  await expect(chip).toBeVisible();
  await expect(page.locator(".answer")).toHaveCount(1);
  await page.getByRole("button", { name: /^Manage Summarize/ }).click();
  await page.getByLabel("Conversation title").fill("Workshop notes");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("link", { name: "Workshop notes" })).toBeVisible();
  await page.getByRole("button", { name: "Open library", exact: true }).click();
  await select.check();
  await page.getByRole("button", { name: "Delete report.pdf" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(select).toBeChecked();
  await page.getByRole("button", { name: "Delete report.pdf" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(select).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("No ready documents in this chat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage Workshop notes" }).click();
  await page.getByRole("button", { name: "Delete this conversation" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText("Your chats will appear here.")).toBeVisible();
  expect(crashes).toEqual([]);
});

test("375px layout, keyboard drawer and document library", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-sign-in.png") });
  await register(page);
  const open = page.getByRole("button", { name: "Open navigation" });
  await open.focus(); await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("button", { name: "New chat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-workspace.png") });
  await open.click();
  await drawer.getByRole("button", { name: /Document library/ }).click();
  await expect(page.getByRole("dialog", { name: "Document library" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const box = await page.getByRole("textbox", { name: "Your question" }).boundingBox();
  expect(box.y + box.height).toBeLessThan(667);
});

~~~~~

## client/package-lock.json

~~~~~json
{
  "name": "docchat-client",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "docchat-client",
      "version": "1.0.0",
      "dependencies": {
        "@fontsource-variable/dm-sans": "5.3.0",
        "@fontsource/instrument-serif": "5.3.0",
        "axios": "1.21.1",
        "eventsource-parser": "4.1.3",
        "lucide-react": "1.76.0",
        "react": "19.3.1",
        "react-dom": "19.3.1",
        "react-markdown": "10.1.0",
        "react-router": "7.18.6",
        "remark-gfm": "4.0.1"
      },
      "devDependencies": {
        "@playwright/test": "1.65.1",
        "@tailwindcss/vite": "4.3.5",
        "@vitejs/plugin-react": "6.3.0",
        "tailwindcss": "4.3.5",
        "vite": "8.3.8"
      },
      "engines": {
        "node": ">=22.17.0"
      }
    },
    "node_modules/@emnapi/core": {
      "version": "2.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/@emnapi/core/-/core-2.0.0-beta.2.tgz",
      "integrity": "sha512-MzCVoWtcg4Pm2B3je5mMvYMvj3MmBKw+fU7vbsJc9/iT8ip6/eYIHo/Dsm/mr+wsHB6SEyJDuxB09Yy6r/8+4A==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/wasi-threads": "2.2.0",
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@emnapi/runtime": {
      "version": "2.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/@emnapi/runtime/-/runtime-2.0.0-beta.2.tgz",
      "integrity": "sha512-JcrSPzPvZuNZvJqPTF9Fw25LbOJ8avzFVlaf2grmH4Cku0oGP47tRgqPZadcfj3YoZMHkFVnCYFbQM8I+i5QEw==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@emnapi/wasi-threads": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/@emnapi/wasi-threads/-/wasi-threads-2.2.0.tgz",
      "integrity": "sha512-JP7OYH38Q7+pyTAe14raZHLQIK7BDKbdwji+Xi3pcd/6QkJYQH3SX4wu6EplGrGJWRepoNzedfm0G3B9Z4e9Rw==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@fontsource-variable/dm-sans": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/@fontsource-variable/dm-sans/-/dm-sans-5.3.0.tgz",
      "integrity": "sha512-BpUG5bqePiDFMBM4ZtLSlPdAIOM990uB1dlXzIf4aw21yQR7BmykedLXXXMqGWsR18aMLOsbWccwJNh3ztTQaA==",
      "license": "OFL-1.1",
      "funding": {
        "url": "https://github.com/sponsors/ayuhito"
      }
    },
    "node_modules/@fontsource/instrument-serif": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/@fontsource/instrument-serif/-/instrument-serif-5.3.0.tgz",
      "integrity": "sha512-mDiaIg0u67sYV59fie92Wz4sM8UiVlbL7fLxnFPCKkX15DMASEnQTREbaP5S5/3DCcsoAOcQ0sV9E4AeY4QqYQ==",
      "license": "OFL-1.1",
      "funding": {
        "url": "https://github.com/sponsors/ayuhito"
      }
    },
    "node_modules/@jridgewell/gen-mapping": {
      "version": "0.3.13",
      "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
      "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.0",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/remapping": {
      "version": "2.3.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz",
      "integrity": "sha512-LI9u/+laYG4Ds1TDKSJW2YPrIlcVYOwi2fUC6xB43lueCjgxV4lffOCZCtYFiH6TNOX+tQKXx97T4IKHbhyHEQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.3.tgz",
      "integrity": "sha512-lhTtjtoEArWBjismtfS761S9Hlyn+nIZqOZVYoZ1Xn82PMNMVnk+jj/NhC4fAXGTs7ydONcJiR5vyQBTMDu27g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz",
      "integrity": "sha512-T7jf+5zgsZHwNJ4lvQ7/aezbyk0nNX+zJVWpmHA7VYsEx7a7qr5Rg5IbtJFqkgze5Y2sruq1RUY8Q837Od7iFw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.31",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
      "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    },
    "node_modules/@napi-rs/wasm-runtime": {
      "version": "1.2.6",
      "resolved": "https://registry.npmjs.org/@napi-rs/wasm-runtime/-/wasm-runtime-1.2.6.tgz",
      "integrity": "sha512-mRyDmEw9/fCDXCGfL1sbgIw/GUK0PVxRW4YwgPN61F3LQ+fSyoBFarJVzgGyhF6kRzEQZ0FejDqm4WLXSeqQmw==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@tybys/wasm-util": "^0.10.3"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=23.5.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/Brooooooklyn"
      },
      "peerDependencies": {
        "@emnapi/core": "^1.7.1 || 2.0.0-beta.2",
        "@emnapi/runtime": "^1.7.1 || 2.0.0-beta.2"
      }
    },
    "node_modules/@oxc-project/types": {
      "version": "0.156.0",
      "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.156.0.tgz",
      "integrity": "sha512-1Duyg48TdJNdyhEB8Xn1L36bT9Pv6GUtlKjHxOys8xkaF/rQq3XJE+bAurSK/AgIz5mGFsb77cn9Pb20+WCScw==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/oxc-project"
      }
    },
    "node_modules/@playwright/test": {
      "version": "1.65.1",
      "resolved": "https://registry.npmjs.org/@playwright/test/-/test-1.65.1.tgz",
      "integrity": "sha512-y+NCIRm2LvY4slUVWvGh1nujJ8RF/hEisIsq2mtUPgdQC4L701bq5hZGMhrpeXjACvwvO9tj5dJqhvM6TP9lbw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "playwright": "1.65.1"
      },
      "bin": {
        "playwright": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/@rolldown/binding-android-arm-eabi": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/-/binding-android-arm-eabi-1.2.19.tgz",
      "integrity": "sha512-e+Ebe0WT+9tbXmNKPIiC8YrWAHYwug3m6i4p3rZGGulfZri1jtI4HslT+OZnFf/OIHowWF71DTlHwXBP2SiA7A==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-android-arm64": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.2.19.tgz",
      "integrity": "sha512-hOombrTJ+szt2ciEzS7oCA78lMPBgF5UMQWCJIyNfnrI7GLl8HYoFqCnpL2gcPOaXMqryGCU5ExdQKyDDcC+yA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-darwin-arm64": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.2.19.tgz",
      "integrity": "sha512-XoMA2pwCKGTQzUjPgtRwkedH4WmXhdIPKT6l6oOxd1PUbNodGI6DcBekgN7EC//+x3pfBYX/qL1gNmZAqivw5g==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-darwin-x64": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.2.19.tgz",
      "integrity": "sha512-zo8EsSSwMZCY/e+fRnGaX02YGgvJD0yvhNi/9hpGPA2MJ9ZF8dPCw75UGfpI6OpQ/myR/dIYmogRvqiZD0TrXg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-freebsd-x64": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.2.19.tgz",
      "integrity": "sha512-O8ISAOfI1nj7AuBPd30FSF47z7f7lzlk5poQVGgiikvQuGEBFYvW8ki+UEnT+YJPnNGjQzn304klt4O9FUE7mA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm-gnueabihf": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.2.19.tgz",
      "integrity": "sha512-/lYCba5NO0yq4S0jGMH8QTBtkvQxoXjoQWzF5BcWp9MjB9jxVRD1GQDNofkVjcOj30DWyhLIN/4Oe60JKzaONw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm64-gnu": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.2.19.tgz",
      "integrity": "sha512-pm/apFMBnSbFb3O6nG5pHO1iqHhZrjGDFEjSm+ot9J17XXPvH9L90y5h+jgfHCE+Qdlsvy8qKEcU4VKxgjD+vA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm64-musl": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.2.19.tgz",
      "integrity": "sha512-K1SmQp3FFichn8oqrNIwvFoZ5wcvjC7goBzpaMNvLf9FZc+QB/QvLmnpJZgAAGHiD980tP8FZZnXk2K94rvlxg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-ppc64-gnu": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.2.19.tgz",
      "integrity": "sha512-I0xwD57jP/3A7+5UPZin2w8Y7XHEmEM5zqpYZOcQ45MlNW6tUJUziymV3yRr7rL4vwyfEcRsRksC4a7Kc08p5Q==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-s390x-gnu": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.2.19.tgz",
      "integrity": "sha512-BrtEHT24SNXj9HiXqy+s/kXiSiQGt6EKCPUlRirAoIioVxKGnbXBUEkbZASAei7iZJB0/Ynm+0JP00Ipx7AnSw==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-x64-gnu": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.2.19.tgz",
      "integrity": "sha512-rm75/9DkHKeU2WnA8w4X94WGYgLlDCFCfkQC+4bguVJmC/jvDRv2B+2wLOYhyE0fVuv7//Ckk39OoOufyCu76Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-x64-musl": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.2.19.tgz",
      "integrity": "sha512-irh/4+iYFM4GAzpluDErgjz89bj6NDtqqMAG/6O1LG38Ed3NpyebzCpcVNkFW8uhy+/3/BocUvnXDR33CXWe9A==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-openharmony-arm64": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.2.19.tgz",
      "integrity": "sha512-+KWTWNoPt+CfSq94CiceWu3yPE+QzkaG+phPyz9G60tmZLwfQkcA4AeksafzvJAw4pvg1mcd5a1TkUqVv0s4JA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-wasm32-wasi": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-wasm32-wasi/-/binding-wasm32-wasi-1.2.19.tgz",
      "integrity": "sha512-7EH+skOsl5qpWnK0vzamgJFhOv1cwxQpsxm8tI883K9fur5c27p8q87fzEO6BbBPabA2/+s/zR63/pLc137iOg==",
      "cpu": [
        "wasm32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/core": "2.0.0-beta.2",
        "@emnapi/runtime": "2.0.0-beta.2",
        "@napi-rs/wasm-runtime": "1.2.6"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=23.5.0"
      }
    },
    "node_modules/@rolldown/binding-win32-arm64-msvc": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.2.19.tgz",
      "integrity": "sha512-3Q1Yg1Q7tEvBWoZf5rFvG/GKZQPgwfru+p4wBajDfJFBs0SHCpL++dfTjW9gyAKd1T7ZpIYvdaUax7Pa/IhFVQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-win32-x64-msvc": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.19.tgz",
      "integrity": "sha512-y/sqRRc6d7hECzOFc5n3LSeqctmIp9mMjY1Kq4s14uLPd/LZ4z7i1zrW6fMtp2mPeuQIC4e6ULMcwQzMomqQag==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/pluginutils": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.1.1.tgz",
      "integrity": "sha512-glFIJDvLNDtJhT9qrMFWLPbvS+skxgt4L0K8Ei2YtnhPysAJnsI7nyxSJxKj4ADeKX0OLjC4ntRkwpLOoS3rwA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@tailwindcss/node": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/node/-/node-4.3.5.tgz",
      "integrity": "sha512-yT53FzV4ke0cr/BguDxhWMpm5MJu1O2muzk+tKw6lKHjODAsYArBbWwFbJiaksfzFv1tpkO9QHGzmfs1hJT66g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/remapping": "^2.3.5",
        "enhanced-resolve": "^5.24.5",
        "jiti": "^2.7.0",
        "lightningcss": "1.33.0",
        "magic-string": "^1.1.0",
        "source-map-js": "^1.2.1",
        "tailwindcss": "4.3.5"
      }
    },
    "node_modules/@tailwindcss/oxide": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide/-/oxide-4.3.5.tgz",
      "integrity": "sha512-PynqGLZsZvwM9tqD/CUxkOIfyd6K5elZ2MooauzJryP/UqXYgi3yYbtt3N0Xe+MHV/eFKPFQCEfIKAqlAS1CBg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 20"
      },
      "optionalDependencies": {
        "@tailwindcss/oxide-android-arm64": "4.3.5",
        "@tailwindcss/oxide-darwin-arm64": "4.3.5",
        "@tailwindcss/oxide-darwin-x64": "4.3.5",
        "@tailwindcss/oxide-freebsd-x64": "4.3.5",
        "@tailwindcss/oxide-linux-arm-gnueabihf": "4.3.5",
        "@tailwindcss/oxide-linux-arm64-gnu": "4.3.5",
        "@tailwindcss/oxide-linux-arm64-musl": "4.3.5",
        "@tailwindcss/oxide-linux-x64-gnu": "4.3.5",
        "@tailwindcss/oxide-linux-x64-musl": "4.3.5",
        "@tailwindcss/oxide-wasm32-wasi": "4.3.5",
        "@tailwindcss/oxide-win32-arm64-msvc": "4.3.5",
        "@tailwindcss/oxide-win32-x64-msvc": "4.3.5"
      }
    },
    "node_modules/@tailwindcss/oxide-android-arm64": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-android-arm64/-/oxide-android-arm64-4.3.5.tgz",
      "integrity": "sha512-Se0z5xMqcSQanJD1IYmO0cGpK3iv0fp3ZsIT7xRJZ1Da5PghvNoc46zz4jIQn+aan3dV9T8AermFNN9QPmsh0Q==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-darwin-arm64": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-darwin-arm64/-/oxide-darwin-arm64-4.3.5.tgz",
      "integrity": "sha512-UPrgTDuUbvmqGMZuCnmI3FKee/tYKzKdp00/kuB4oSGB213VYg8QTdF7lVhnPoBXq/mIfJ+ILoBFqNOboWcMwQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-darwin-x64": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-darwin-x64/-/oxide-darwin-x64-4.3.5.tgz",
      "integrity": "sha512-E+p7HEtjI0b8D7kbbWxH067cGui6d4c79COGko9fAPVE3rwc1E7ld2HFCbaG86AOGWS5VKQYqZOaf38ya4uxTQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-freebsd-x64": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-freebsd-x64/-/oxide-freebsd-x64-4.3.5.tgz",
      "integrity": "sha512-yWEWcWyAG7rWOcTpJTjdhQ3pcaFY2h+0bqTRfgU3G2fz87ZU3AKdvdZKhslD+kyHnjBUWKvNdRYwIYC5dI1tIg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-linux-arm-gnueabihf": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-linux-arm-gnueabihf/-/oxide-linux-arm-gnueabihf-4.3.5.tgz",
      "integrity": "sha512-WmeVjtJhZlr+smpqcdR2kQkkn6arHIJnUIBxTO2EJcTLGY1ecVXNo2hbSn8xc0IH2aEtys936iMWKGyj0GaKnA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-linux-arm64-gnu": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-linux-arm64-gnu/-/oxide-linux-arm64-gnu-4.3.5.tgz",
      "integrity": "sha512-DTCSyucc6ShMp1QMqV5R94Z7xlgNgUzkGmFF1rL5HH2Qjy4eSmEqy+YLGkqqYvWa4sILtgrBt1JjRKbneQtiFQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-linux-arm64-musl": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-linux-arm64-musl/-/oxide-linux-arm64-musl-4.3.5.tgz",
      "integrity": "sha512-H9lsvO4x9E4nE4Hi8h7NHHw0O/kcVSu+iOyFHNGdYzazGgDjFHZbE6S3hQ8kMcbNXSBlMdNi67LV5EVqtpaJtw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-linux-x64-gnu": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-linux-x64-gnu/-/oxide-linux-x64-gnu-4.3.5.tgz",
      "integrity": "sha512-4uxQvtBvPuIdl13WfUBj9xMZHH14PtHZ8OZdtLmdyDtG66sCa1t599NZT+jagkUzRtWhuul1qRZQ1nAJscXN5g==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-linux-x64-musl": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-linux-x64-musl/-/oxide-linux-x64-musl-4.3.5.tgz",
      "integrity": "sha512-0JQAzs7jwbA7O6+z/adU+Jk3AXwsu3npAhtr5escXS7TqEqWcaDV7qHuI+0Vy/KQRuVGnLQREcSJWYauyV3oqg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-wasm32-wasi/-/oxide-wasm32-wasi-4.3.5.tgz",
      "integrity": "sha512-OJhFmlEfdzMr+avACdi40RPtnkW0B6hXyxL/8r+tnEHBWZji36CYRjEXrrvgBmaYsD3oEOBqwYFRKsYvzFe7Bw==",
      "bundleDependencies": [
        "@napi-rs/wasm-runtime",
        "@emnapi/core",
        "@emnapi/runtime",
        "@tybys/wasm-util",
        "@emnapi/wasi-threads",
        "tslib"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/core": "^1.11.3",
        "@emnapi/runtime": "^1.11.3",
        "@emnapi/wasi-threads": "^1.2.3",
        "@napi-rs/wasm-runtime": "^1.2.2",
        "@tybys/wasm-util": "^0.10.3",
        "tslib": "^2.8.1"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=23.5.0"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/core": {
      "version": "1.11.3",
      "dev": true,
      "inBundle": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/wasi-threads": "1.2.3",
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/runtime": {
      "version": "1.11.3",
      "dev": true,
      "inBundle": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/wasi-threads": {
      "version": "1.2.3",
      "dev": true,
      "inBundle": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@napi-rs/wasm-runtime": {
      "version": "1.2.2",
      "dev": true,
      "inBundle": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@tybys/wasm-util": "^0.10.3"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=23.5.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/Brooooooklyn"
      },
      "peerDependencies": {
        "@emnapi/core": "^1.7.1 || ^2.0.0-alpha.3",
        "@emnapi/runtime": "^1.7.1 || ^2.0.0-alpha.3"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@tybys/wasm-util": {
      "version": "0.10.3",
      "dev": true,
      "inBundle": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib": {
      "version": "2.8.1",
      "dev": true,
      "inBundle": true,
      "license": "0BSD",
      "optional": true
    },
    "node_modules/@tailwindcss/oxide-win32-arm64-msvc": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-win32-arm64-msvc/-/oxide-win32-arm64-msvc-4.3.5.tgz",
      "integrity": "sha512-9o8jgthi+QE5eandnboiJT64VQfnIArfZzSTdgbhEK5aafdiu2jTW9Honi/mwYHxBZuH1vAC57IFyrh+0iK5Gg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/oxide-win32-x64-msvc": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/oxide-win32-x64-msvc/-/oxide-win32-x64-msvc-4.3.5.tgz",
      "integrity": "sha512-XiKFfIy1RWe7qK4WqByxNW7Oz1/nkOy8o/BWhHminyV1PmpUd8Eedj5v2A8h2kpqeVlz6xRnwk9Fr/ZXNLcZfg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 20"
      }
    },
    "node_modules/@tailwindcss/vite": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/@tailwindcss/vite/-/vite-4.3.5.tgz",
      "integrity": "sha512-BCNiY0a1ZjdOHVqw7kyb7U72BwfMF3dfUuN+tQsLWky/J5JOI/r7abibglXfygrZhVO/3u3V+E25kkKTeMkXaQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@tailwindcss/node": "4.3.5",
        "@tailwindcss/oxide": "4.3.5",
        "tailwindcss": "4.3.5"
      },
      "peerDependencies": {
        "vite": "^5.2.0 || ^6 || ^7 || ^8"
      }
    },
    "node_modules/@tybys/wasm-util": {
      "version": "0.10.5",
      "resolved": "https://registry.npmjs.org/@tybys/wasm-util/-/wasm-util-0.10.5.tgz",
      "integrity": "sha512-dOGOPxlaNV+G046mZzN+9C0dAcQZeSKcXiVaM0TYy/LM4ttTmgSBDxYfovcYI8Em3+eAbiAYpvWLOv8+ZVRJKA==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@types/debug": {
      "version": "4.1.13",
      "resolved": "https://registry.npmjs.org/@types/debug/-/debug-4.1.13.tgz",
      "integrity": "sha512-KSVgmQmzMwPlmtljOomayoR89W4FynCAi3E8PPs7vmDVPe84hT+vGPKkJfThkmXs0x0jAaa9U8uW8bbfyS2fWw==",
      "license": "MIT",
      "dependencies": {
        "@types/ms": "*"
      }
    },
    "node_modules/@types/estree": {
      "version": "1.0.10",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.10.tgz",
      "integrity": "sha512-lTyOMnOcmRBzdCv6/4zUZCrEhV0xrqQiUZBZtVcbmLHBXKLnN8q89v/wKRF/Q0HbwVsqbIG3o5HDoFl9sduM+g==",
      "license": "MIT"
    },
    "node_modules/@types/estree-jsx": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/@types/estree-jsx/-/estree-jsx-1.0.5.tgz",
      "integrity": "sha512-52CcUVNFyfb1A2ALocQw/Dd1BQFNmSdkuC3BkZ6iqhdMfQz7JWOFRuJFloOzjk+6WijU56m9oKXFAXc7o3Towg==",
      "license": "MIT",
      "dependencies": {
        "@types/estree": "*"
      }
    },
    "node_modules/@types/hast": {
      "version": "3.0.5",
      "resolved": "https://registry.npmjs.org/@types/hast/-/hast-3.0.5.tgz",
      "integrity": "sha512-rp/ezSWaD1m44dPKICGhiskI13nVr7qTloFwDa/IYkhhf5nzwP+zIQcIJh3WIFSBOy/H1PzB40jPjMDksN4F+g==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "*"
      }
    },
    "node_modules/@types/mdast": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/@types/mdast/-/mdast-4.0.4.tgz",
      "integrity": "sha512-kGaNbPh1k7AFzgpud/gMdvIm5xuECykRR+JnWKQno9TAXVa6WIVCGTPvYGekIDL4uwCZQSYbUxNBSb1aUo79oA==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "*"
      }
    },
    "node_modules/@types/ms": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/@types/ms/-/ms-2.1.0.tgz",
      "integrity": "sha512-GsCCIZDE/p3i96vtEqx+7dBUGXrc7zeSK3wwPHIaRThS+9OhWIXRqzs4d6k1SVU8g91DrNRWxWUGhp5KXQb2VA==",
      "license": "MIT"
    },
    "node_modules/@types/react": {
      "version": "19.3.0",
      "resolved": "https://registry.npmjs.org/@types/react/-/react-19.3.0.tgz",
      "integrity": "sha512-N0rFCuH9YoxG9/m61l9MfpJKfmLOVU0em7ipIz6TRgSSkvReLB9vL85GB+yr8Bs5leqpvg96JSwF4ZS1s4viQg==",
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "csstype": "^3.2.2"
      }
    },
    "node_modules/@types/unist": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/@types/unist/-/unist-3.0.3.tgz",
      "integrity": "sha512-ko/gIFJRv177XgZsZcBwnqJN5x/Gien8qNOn0D5bQU/zAzVf9Zt3BlcUiLqhV9y4ARk0GbT3tnUiPNgnTXzc/Q==",
      "license": "MIT"
    },
    "node_modules/@ungap/structured-clone": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/@ungap/structured-clone/-/structured-clone-1.4.0.tgz",
      "integrity": "sha512-1mEZtMKPM09vDmQt5y7YvmN2+DFTP7Tg0EWXdic8/C6VRnpb33e4ghisCIE3WZjsE2N8mf+QV1Zqh7ZFYLWInQ==",
      "license": "ISC"
    },
    "node_modules/@vitejs/plugin-react": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-6.3.0.tgz",
      "integrity": "sha512-H9E955aVvD2F4zNHCw4eIZbIfF6xKldlh7MNu+hSU7xwQzh65lI/N+CJWqmfhi0PEjDXIt/H7T7J/4wU63KJiw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@rolldown/pluginutils": "^1.0.1"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "peerDependencies": {
        "@rolldown/plugin-babel": "^0.1.7 || ^0.2.0 || ^0.3.0",
        "babel-plugin-react-compiler": "^1.0.0",
        "oxc-transform-react": ">=0.152.0 <0.157.0",
        "vite": "^8.0.0"
      },
      "peerDependenciesMeta": {
        "@rolldown/plugin-babel": {
          "optional": true
        },
        "babel-plugin-react-compiler": {
          "optional": true
        },
        "oxc-transform-react": {
          "optional": true
        }
      }
    },
    "node_modules/agent-base": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "4"
      },
      "engines": {
        "node": ">= 6.0.0"
      }
    },
    "node_modules/asynckit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz",
      "integrity": "sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==",
      "license": "MIT"
    },
    "node_modules/axios": {
      "version": "1.21.1",
      "resolved": "https://registry.npmjs.org/axios/-/axios-1.21.1.tgz",
      "integrity": "sha512-6eI5Q/Y4u/Um9dDlsRoq5pY2rxnUTv+L4PpLitnbk/i4jb3MxLZ5CsN5Ih3IysbeRYK4pR+P7qfMsOQl9fwwFQ==",
      "license": "MIT",
      "dependencies": {
        "follow-redirects": "^1.16.2",
        "form-data": "^4.0.6",
        "https-proxy-agent": "^5.0.1",
        "proxy-from-env": "^2.1.0"
      }
    },
    "node_modules/bail": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/bail/-/bail-2.0.2.tgz",
      "integrity": "sha512-0xO6mYd7JB2YesxDKplafRpsiOzPt9V02ddPCLbY1xYGPOX24NTyN50qnUxgCPcSoYMhKpAuBTjQoRZCAkUDRw==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/ccount": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/ccount/-/ccount-2.0.1.tgz",
      "integrity": "sha512-eyrF0jiFpY+3drT6383f1qhkbGsLSifNAjA61IUjZjmLCWjItY6LB9ft9YhoDgwfmclB2zhu51Lc7+95b8NRAg==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/character-entities": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/character-entities/-/character-entities-2.0.2.tgz",
      "integrity": "sha512-shx7oQ0Awen/BRIdkjkvz54PnEEI/EjwXDSIZp86/KKdbafHh1Df/RYGBhn4hbe2+uKC9FnT5UCEdyPz3ai9hQ==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/character-entities-html4": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/character-entities-html4/-/character-entities-html4-2.1.0.tgz",
      "integrity": "sha512-1v7fgQRj6hnSwFpq1Eu0ynr/CDEw0rXo2B61qXrLNdHZmPKgb7fqS1a2JwF0rISo9q77jDI8VMEHoApn8qDoZA==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/character-entities-legacy": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/character-entities-legacy/-/character-entities-legacy-3.0.0.tgz",
      "integrity": "sha512-RpPp0asT/6ufRm//AJVwpViZbGM/MkjQFxJccQRHmISF/22NBtsHqAWmL+/pmkPWoIUJdWyeVleTl1wydHATVQ==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/character-reference-invalid": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/character-reference-invalid/-/character-reference-invalid-2.0.1.tgz",
      "integrity": "sha512-iBZ4F4wRbyORVsu0jPV7gXkOsGYjGHPmAyv+HiHG8gi5PtC9KI2j1+v8/tlibRvjoWX027ypmG/n0HtO5t7unw==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/combined-stream": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz",
      "integrity": "sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==",
      "license": "MIT",
      "dependencies": {
        "delayed-stream": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/comma-separated-tokens": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/comma-separated-tokens/-/comma-separated-tokens-2.0.3.tgz",
      "integrity": "sha512-Fu4hJdvzeylCfQPp9SGWidpzrMs7tTrlu6Vb8XGaRGck8QSNZJJp538Wrb60Lax4fPwR64ViY468OIUTbRlGZg==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/cookie": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-1.1.1.tgz",
      "integrity": "sha512-ei8Aos7ja0weRpFzJnEA9UHJ/7XQmqglbRwnf2ATjcB9Wq874VKH9kfjjirM6UhU2/E5fFYadylyhFldcqSidQ==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/csstype": {
      "version": "3.2.4",
      "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.4.tgz",
      "integrity": "sha512-PoKaoPzQapnEoqUSnHx1u6W6ku8CVEgKsnpmmzU3m1nwkidpPBQ8V/Zq2+bWNrsOKoKLwTGdbx6xF7BXP1zLVQ==",
      "license": "MIT",
      "peer": true
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/decode-named-character-reference": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/decode-named-character-reference/-/decode-named-character-reference-1.3.0.tgz",
      "integrity": "sha512-GtpQYB283KrPp6nRw50q3U9/VfOutZOe103qlN7BPP6Ad27xYnOIWv4lPzo8HCAL+mMZofJ9KEy30fq6MfaK6Q==",
      "license": "MIT",
      "dependencies": {
        "character-entities": "^2.0.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/delayed-stream": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
      "integrity": "sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==",
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/dequal": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/dequal/-/dequal-2.0.3.tgz",
      "integrity": "sha512-0je+qPKHEMohvfRTCEo3CrPG6cAzAYgmzKyxRiYSSDkS6eGJdyVJm7WaYA5ECaAD9wLB2T4EEeymA5aFVcYXCA==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/devlop": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/devlop/-/devlop-1.1.0.tgz",
      "integrity": "sha512-RWmIqhcFf1lRYBvNmr7qTNuyCt/7/ns2jbpp1+PalgE/rDQcBT0fioSMUpJ93irlUhC5hrg4cYqe6U+0ImW0rA==",
      "license": "MIT",
      "dependencies": {
        "dequal": "^2.0.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/enhanced-resolve": {
      "version": "5.27.0",
      "resolved": "https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.27.0.tgz",
      "integrity": "sha512-Do6BB2xzlcc/odFg+XEYyneAx4T/WfywO71yw9ePS2tVfRsf7JVR4mUeELadIeHzixkzbG5DpluiEFPi2WGfYQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "graceful-fs": "^4.2.4",
        "tapable": "^2.3.3"
      },
      "engines": {
        "node": ">=10.13.0"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz",
      "integrity": "sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-set-tostringtag": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
      "integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.6",
        "has-tostringtag": "^1.0.2",
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escape-string-regexp": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-5.0.0.tgz",
      "integrity": "sha512-/veY75JbMK4j1yjvuUxuVsiS/hr/4iHs9FTT6cgTexxdE0Ly/glccBAkloH/DofkjRbZU3bnoj38mOmhkZ0lHw==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/estree-util-is-identifier-name": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/estree-util-is-identifier-name/-/estree-util-is-identifier-name-3.0.0.tgz",
      "integrity": "sha512-hFtqIDZTIUZ9BXLb8y4pYGyk6+wekIivNVTcmvk8NoOh+VeRn5y6cEHzbURrWbfp1fIqdVipilzj+lfaadNZmg==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/eventsource-parser": {
      "version": "4.1.3",
      "resolved": "https://registry.npmjs.org/eventsource-parser/-/eventsource-parser-4.1.3.tgz",
      "integrity": "sha512-jZVIVilXZfAx6H20ZKKEj5dabbpD9ETmMj3uHsjMmgBzBHB6tsHrmdWB4mAiy3amtN6MOoVkfXRQu4wf1n88Rw==",
      "license": "MIT",
      "engines": {
        "node": ">=22.12"
      }
    },
    "node_modules/extend": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/extend/-/extend-3.0.2.tgz",
      "integrity": "sha512-fjquC59cD7CyW6urNXK0FBufkZcoiGG80wTuPujX590cB5Ttln20E2UB4S/WARVqhXffZl2LNgS+gQdPIIim/g==",
      "license": "MIT"
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/follow-redirects": {
      "version": "1.16.3",
      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.3.tgz",
      "integrity": "sha512-toOSoqN6d51Wjf1aOFJYcoVv1aND9rj/CwjLU0Vz40oDuSpWDayCeKe4JpL5NL0WdFvoOOCI3BRo69HahjbR1A==",
      "funding": [
        {
          "type": "individual",
          "url": "https://github.com/sponsors/RubenVerborgh"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=4.0"
      },
      "peerDependenciesMeta": {
        "debug": {
          "optional": true
        }
      }
    },
    "node_modules/form-data": {
      "version": "4.0.6",
      "resolved": "https://registry.npmjs.org/form-data/-/form-data-4.0.6.tgz",
      "integrity": "sha512-vKatAh4SlVfgbv+YtmhiRjhEMJsYpsG1Y2rMQtR+SVSbytsSD1YGzDIcrAJmdFec88u/+VoGmxnl+80gL1tRCQ==",
      "license": "MIT",
      "dependencies": {
        "asynckit": "^0.4.0",
        "combined-stream": "^1.0.8",
        "es-set-tostringtag": "^2.1.0",
        "hasown": "^2.0.4",
        "mime-types": "^2.1.35"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.12",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.12.tgz",
      "integrity": "sha512-iuyGF2E4oafQfPsRrG2wtY2ILupMhvtdrhzrxB+0VcjsPpSPttpfYdjnGFGsTi5MaJFjI1jOKHPQ6UTbTj9TAw==",
      "dev": true,
      "license": "BlueOak-1.0.0"
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-tostringtag": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
      "integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
      "license": "MIT",
      "dependencies": {
        "has-symbols": "^1.0.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz",
      "integrity": "sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/hast-util-to-jsx-runtime": {
      "version": "2.3.7",
      "resolved": "https://registry.npmjs.org/hast-util-to-jsx-runtime/-/hast-util-to-jsx-runtime-2.3.7.tgz",
      "integrity": "sha512-F7DNV2NMcTxA4GqPVHnXzX+mpoPHAIY9rJAVH3CZ1FdBZOcBUEjUuvMkMpHVs/sicEtznh9tMGj5WUR9S4E2rg==",
      "license": "MIT",
      "dependencies": {
        "@types/estree": "^1.0.0",
        "@types/hast": "^3.0.0",
        "@types/unist": "^3.0.0",
        "comma-separated-tokens": "^2.0.0",
        "devlop": "^1.0.0",
        "estree-util-is-identifier-name": "^3.0.0",
        "hast-util-whitespace": "^3.0.0",
        "mdast-util-mdx-expression": "^2.0.0",
        "mdast-util-mdx-jsx": "^3.0.0",
        "mdast-util-mdxjs-esm": "^2.0.0",
        "property-information": "^7.0.0",
        "space-separated-tokens": "^2.0.0",
        "style-to-object": "^2.0.0",
        "unist-util-position": "^5.0.0",
        "vfile-message": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/hast-util-whitespace": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/hast-util-whitespace/-/hast-util-whitespace-3.0.0.tgz",
      "integrity": "sha512-88JUN06ipLwsnv+dVn+OIYOvAuvBMy/Qoi6O7mQHxdPXpjy+Cd6xRkWwux7DKO+4sYILtLBRIKgsdpS2gQc7qw==",
      "license": "MIT",
      "dependencies": {
        "@types/hast": "^3.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/html-url-attributes": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/html-url-attributes/-/html-url-attributes-3.0.1.tgz",
      "integrity": "sha512-ol6UPyBWqsrO6EJySPz2O7ZSr856WDrEzM5zMqp+FJJLGMW35cLYmmZnl0vztAZxRUoNZJFTCohfjuIJ8I4QBQ==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/https-proxy-agent": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-5.0.1.tgz",
      "integrity": "sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "6",
        "debug": "4"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/inline-style-parser": {
      "version": "0.2.9",
      "resolved": "https://registry.npmjs.org/inline-style-parser/-/inline-style-parser-0.2.9.tgz",
      "integrity": "sha512-IttN8BqKLxzUrnTqHI+/hwAJQItBAUjdoHERCDv+oOuX48VP6bzW8+QjOXSfoevzq3YrYAwX1uLHp8TqO9yIeg==",
      "license": "MIT"
    },
    "node_modules/is-alphabetical": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-alphabetical/-/is-alphabetical-2.0.1.tgz",
      "integrity": "sha512-FWyyY60MeTNyeSRpkM2Iry0G9hpr7/9kD40mD/cGQEuilcZYS4okz8SN2Q6rLCJ8gbCt6fN+rC+6tMGS99LaxQ==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/is-alphanumerical": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-alphanumerical/-/is-alphanumerical-2.0.1.tgz",
      "integrity": "sha512-hmbYhX/9MUMF5uh7tOXyK/n0ZvWpad5caBA17GsC6vyuCqaWliRG5K1qS9inmUhEMaOBIW7/whAnSwveW/LtZw==",
      "license": "MIT",
      "dependencies": {
        "is-alphabetical": "^2.0.0",
        "is-decimal": "^2.0.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/is-decimal": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-decimal/-/is-decimal-2.0.1.tgz",
      "integrity": "sha512-AAB9hiomQs5DXWcRB1rqsxGUstbRroFOPPVAomNk/3XHR5JyEZChOyTWe2oayKnsSsr/kcGqF+z6yuH6HHpN0A==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/is-hexadecimal": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-hexadecimal/-/is-hexadecimal-2.0.1.tgz",
      "integrity": "sha512-DgZQp241c8oO6cA1SbTEWiXeoxV42vlcJxgH+B3hi1AiqqKruZR3ZGF8In3fj4+/y/7rHvlOZLZtgJ/4ttYGZg==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/is-plain-obj": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/is-plain-obj/-/is-plain-obj-4.1.0.tgz",
      "integrity": "sha512-+Pgi+vMuUNkJyExiMBt5IlFoMyKnr5zhJ4Uspz58WOhBF5QoIZkFyNHIbBAtHwzVAgk5RtndVNsDRN61/mmDqg==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/jiti": {
      "version": "2.7.0",
      "resolved": "https://registry.npmjs.org/jiti/-/jiti-2.7.0.tgz",
      "integrity": "sha512-AC/7JofJvZGrrneWNaEnJeOLUx+JlGt7tNa0wZiRPT4MY1wmfKjt2+6O2p2uz2+skll8OZZmJMNqeke7kKbNgQ==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "jiti": "lib/jiti-cli.mjs"
      }
    },
    "node_modules/lightningcss": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz",
      "integrity": "sha512-WkUDrojuJs0xkgGf2udWxa3yGBRxPtxUkB79i6aCZLRgc7PM8fZe9TosfPDcvEpQZbuFASnHYmRLBLUbmLOIIA==",
      "dev": true,
      "license": "MPL-2.0",
      "dependencies": {
        "detect-libc": "^2.0.3"
      },
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      },
      "optionalDependencies": {
        "lightningcss-android-arm64": "1.33.0",
        "lightningcss-darwin-arm64": "1.33.0",
        "lightningcss-darwin-x64": "1.33.0",
        "lightningcss-freebsd-x64": "1.33.0",
        "lightningcss-linux-arm-gnueabihf": "1.33.0",
        "lightningcss-linux-arm64-gnu": "1.33.0",
        "lightningcss-linux-arm64-musl": "1.33.0",
        "lightningcss-linux-x64-gnu": "1.33.0",
        "lightningcss-linux-x64-musl": "1.33.0",
        "lightningcss-win32-arm64-msvc": "1.33.0",
        "lightningcss-win32-x64-msvc": "1.33.0"
      }
    },
    "node_modules/lightningcss-android-arm64": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.33.0.tgz",
      "integrity": "sha512-gEpRTalKdosp4Bb8qWtc2iOgE5SeIHlpS1up9bFq2wAyYhl1UdTObYiHe98zEM9SQvSoqQZ1IQD0JNpg3Ml5pg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-darwin-arm64": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.33.0.tgz",
      "integrity": "sha512-Sciaz8eenNTKn9b3t7+xr0ipTp9YxKQY4npwQ3mrRuL0BAVHBLyZxofhaKBAVtzmtRZ/zTyo0/to4B1uWG/Djg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-darwin-x64": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.33.0.tgz",
      "integrity": "sha512-Z5UPAxzrjlWNNyGy6i65cJzzvgJ5D3T6wMvs+gWpY9d7qRhANrxqAp6LhxIgZhWEw18RfJTGcRxjuLIBr+m8XQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-freebsd-x64": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.33.0.tgz",
      "integrity": "sha512-QQM/Ti/hQajJwCY+RiWuCZ9sdtI/XQk7nDK5vC8kkdwixezOlDgvDx7+RT+QjK6FcFT4MpsuoBnHIo/O3StRRg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm-gnueabihf": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.33.0.tgz",
      "integrity": "sha512-N7FVBe6iS24MlM6R/4RBTxGhQheZGs7tiQ9U32UtF75NzP5Q7xWPRqLBCKxlRQRk3rY1jCIPLzx7WzOhuUIRLQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm64-gnu": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.33.0.tgz",
      "integrity": "sha512-j2v/itmy4HlNxlc6voKXYgBqNi0Ng2LShg4z7GufpEgs05P+2suBVyi9I6YHq5uoVFx9ETin3eCEhLVyXGQnKg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm64-musl": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.33.0.tgz",
      "integrity": "sha512-yiO5ROMuYQgXbC60yjZU5CYSFZGKXL0HFATXt9mHJn1+zW55oCtMI9NfcVhYLMFDL7gV7oBPon/EmMMGg2OvtQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-x64-gnu": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.33.0.tgz",
      "integrity": "sha512-ar+Ju7LmcN0Jo4FpL4hpFybwNG9/3A/Br5KW2n2jyODg3MEZXaDYADdemoNS+BDNfMgKvylJLj4S5tyRActuAg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-x64-musl": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.33.0.tgz",
      "integrity": "sha512-RYiYbkokw0trfKqqzfF55lginwEPrD3OJDfTuJzFs1MK6iFnDenaz1fqLLtX4ITG3OktJQXOeTaw1awrBAlZPw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-win32-arm64-msvc": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.33.0.tgz",
      "integrity": "sha512-1K+MPfLSFVpphzpdbfkhlWk6wBrTObBzS2T6db10PNOZgR9GoVsAWzwNyuhUYYbTp23j+4RrncfujZ4uAzXvwA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-win32-x64-msvc": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.33.0.tgz",
      "integrity": "sha512-OlEICDx/Xl0FqSp4bry8zFnCvGpig3Gl4gCquvYwHuqJKEC1+n9NgDniFvqHGmMv1ZkqDJrDqKKSykTDX+ehuA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/longest-streak": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/longest-streak/-/longest-streak-3.1.0.tgz",
      "integrity": "sha512-9Ri+o0JYgehTaVBBDoMqIl8GXtbWg711O3srftcHhZ0dqnETqLaoIK0x17fUw9rFSlK/0NlsKe0Ahhyl5pXE2g==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/lucide-react": {
      "version": "1.76.0",
      "resolved": "https://registry.npmjs.org/lucide-react/-/lucide-react-1.76.0.tgz",
      "integrity": "sha512-wRVHt2Xf64GXndB4rQOY9+3Wy9oJ59HDMYv6vwhT0hpSwUxQhG/RM9YijnOmvmIQ+VI/n+1V/FKd6gP4XL2aBQ==",
      "license": "ISC",
      "peerDependencies": {
        "@types/react": "*",
        "react": "^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0"
      },
      "peerDependenciesMeta": {
        "@types/react": {
          "optional": true
        }
      }
    },
    "node_modules/magic-string": {
      "version": "1.4.5",
      "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-1.4.5.tgz",
      "integrity": "sha512-oLLC2+YvQUfAa+vxoufE/yc1icb87M9iXIRqAoR/2EhE/8cb3SF/+Gi0c2By1B+5Vz2e2vQtUvHiu1+63Znh+w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.6.0"
      }
    },
    "node_modules/markdown-table": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/markdown-table/-/markdown-table-3.1.0.tgz",
      "integrity": "sha512-xpeSCdM+B+6P3ncfgaB7FoDbtJ30xAe6Z18TGT7AgXJsHqCElCICZovQqdRMm7kHgpTyYv36EupqewoFFSB8vw==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/mdast-util-find-and-replace": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/mdast-util-find-and-replace/-/mdast-util-find-and-replace-3.0.4.tgz",
      "integrity": "sha512-z4B5c6jrnJ1ltOQemhWYPBSAo6y42Z8Gt2yEgfgNTMcLSU59B8bfj8Z8AnAlJrBGLnqkdAUZ7jdDEqQw3KuipQ==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "escape-string-regexp": "^5.0.0",
        "unist-util-is": "^6.0.0",
        "unist-util-visit-parents": "^6.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-from-markdown": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/mdast-util-from-markdown/-/mdast-util-from-markdown-2.1.0.tgz",
      "integrity": "sha512-KRLgmPaP2H1ul2bpoJkOS+9pAcDAAj9Nu1mqLnh8NLeJG5tlvj42TH80PIGBpROWlRXLk0lDrWNuZCFy/tsB4A==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "@types/unist": "^3.0.0",
        "decode-named-character-reference": "^1.0.0",
        "devlop": "^1.0.0",
        "mdast-util-to-string": "^4.0.0",
        "micromark": "^4.0.0",
        "micromark-util-decode-numeric-character-reference": "^2.0.0",
        "micromark-util-decode-string": "^2.0.0",
        "micromark-util-normalize-identifier": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0",
        "unist-util-stringify-position": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm/-/mdast-util-gfm-3.1.0.tgz",
      "integrity": "sha512-0ulfdQOM3ysHhCJ1p06l0b0VKlhU0wuQs3thxZQagjcjPrlFRqY215uZGHHJan9GEAXd9MbfPjFJz+qMkVR6zQ==",
      "license": "MIT",
      "dependencies": {
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-gfm-autolink-literal": "^2.0.0",
        "mdast-util-gfm-footnote": "^2.0.0",
        "mdast-util-gfm-strikethrough": "^2.0.0",
        "mdast-util-gfm-table": "^2.0.0",
        "mdast-util-gfm-task-list-item": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm-autolink-literal": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm-autolink-literal/-/mdast-util-gfm-autolink-literal-2.1.0.tgz",
      "integrity": "sha512-Jx6QSK8wDo558Bcf7q+1pe0v81g2PVs09Hlvu9xJHmCFRF3sAPW7vXFVIAwBncs3sde92WbsVqNxwdqViA2XnQ==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "ccount": "^2.0.0",
        "devlop": "^1.0.0",
        "mdast-util-find-and-replace": "^3.0.0",
        "micromark-util-character": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm-footnote": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm-footnote/-/mdast-util-gfm-footnote-2.1.0.tgz",
      "integrity": "sha512-sqpDWlsHn7Ac9GNZQMeUzPQSMzR6Wv0WKRNvQRg0KqHh02fpTz69Qc1QSseNX29bhz1ROIyNyxExfawVKTm1GQ==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "devlop": "^1.1.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0",
        "micromark-util-normalize-identifier": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm-strikethrough": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm-strikethrough/-/mdast-util-gfm-strikethrough-2.0.1.tgz",
      "integrity": "sha512-OuJHqvr455pwu2OaOrir7dbzqs4jlWKOtlu9L6GjcIjjQwNyw02VntQsr/Ek6/A13vgnXfUhBekWRUP1OkNivw==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm-table": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm-table/-/mdast-util-gfm-table-2.0.1.tgz",
      "integrity": "sha512-fiIjPrAy4kz68/eFbPHhsiWDGHhqUSVoU1XsfLM5DsEPXw7MxgiVVyulUggFRckVWeT1KXQXkg5vm3kv4oMSOA==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "devlop": "^1.0.0",
        "markdown-table": "^3.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0",
        "mdast-util-to-string": "^4.0.0",
        "unist-util-visit": "^5.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-gfm-task-list-item": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/mdast-util-gfm-task-list-item/-/mdast-util-gfm-task-list-item-2.0.1.tgz",
      "integrity": "sha512-jXVO1hvB2hs82g1esi7I9nIJDqiijbQLIyH2jDUb5s7jIAZMr/79h0VHSq7XHKTqpLARRm+DDNjduB7S9+6XZA==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "devlop": "^1.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-mdx-expression": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/mdast-util-mdx-expression/-/mdast-util-mdx-expression-2.0.1.tgz",
      "integrity": "sha512-J6f+9hUp+ldTZqKRSg7Vw5V6MqjATc+3E4gf3CFNcuZNWD8XdyI6zQ8GqH7f8169MM6P7hMBRDVGnn7oHB9kXQ==",
      "license": "MIT",
      "dependencies": {
        "@types/estree-jsx": "^1.0.0",
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "devlop": "^1.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-mdx-jsx": {
      "version": "3.2.1",
      "resolved": "https://registry.npmjs.org/mdast-util-mdx-jsx/-/mdast-util-mdx-jsx-3.2.1.tgz",
      "integrity": "sha512-oXp1GIa+E9IwIs3a106+tr3Bz2MlTTBvlXjOZMoIat11kk7vjqgmBnksB9WHmWv+gZh7k3IUgpAHlwHB7DH4GQ==",
      "license": "MIT",
      "dependencies": {
        "@types/estree-jsx": "^1.0.0",
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "@types/unist": "^3.0.0",
        "ccount": "^2.0.0",
        "devlop": "^1.1.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0",
        "parse-entities": "^4.0.0",
        "stringify-entities": "^4.0.0",
        "unist-util-stringify-position": "^4.0.0",
        "vfile-message": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-mdxjs-esm": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/mdast-util-mdxjs-esm/-/mdast-util-mdxjs-esm-2.0.1.tgz",
      "integrity": "sha512-EcmOpxsZ96CvlP03NghtH1EsLtr0n9Tm4lPUJUBccV9RwUOneqSycg19n5HGzCf+10LozMRSObtVr3ee1WoHtg==",
      "license": "MIT",
      "dependencies": {
        "@types/estree-jsx": "^1.0.0",
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "devlop": "^1.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "mdast-util-to-markdown": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-phrasing": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/mdast-util-phrasing/-/mdast-util-phrasing-4.1.0.tgz",
      "integrity": "sha512-TqICwyvJJpBwvGAMZjj4J2n0X8QWp21b9l0o7eXyVJ25YNWYbJDVIyD1bZXE6WtV6RmKJVYmQAKWa0zWOABz2w==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "unist-util-is": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-to-hast": {
      "version": "13.2.2",
      "resolved": "https://registry.npmjs.org/mdast-util-to-hast/-/mdast-util-to-hast-13.2.2.tgz",
      "integrity": "sha512-l2pnmOuqs+SGLVpTVXnRLQu5v1AzvDe181404fbXzzqObVxrAnnVxapAP27pUwzLBL/ABIkgUhGlPVU7QSvIFg==",
      "license": "MIT",
      "dependencies": {
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "@ungap/structured-clone": "^1.0.0",
        "devlop": "^1.0.0",
        "micromark-util-sanitize-uri": "^2.0.0",
        "trim-lines": "^3.0.0",
        "unist-util-position": "^5.0.0",
        "unist-util-visit": "^5.0.0",
        "vfile": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-to-markdown": {
      "version": "2.2.3",
      "resolved": "https://registry.npmjs.org/mdast-util-to-markdown/-/mdast-util-to-markdown-2.2.3.tgz",
      "integrity": "sha512-dImdB6VZRMRac1SwAW6o1c0ESk/7pFFAMCMuKM+9v7LpTSthMM5nzXpqKw4Mjo66aXVKhNkyrP4bMB9MurPyWg==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "@types/unist": "^3.0.0",
        "longest-streak": "^3.0.0",
        "mdast-util-phrasing": "^4.0.0",
        "mdast-util-to-string": "^4.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-classify-character": "^2.0.0",
        "micromark-util-decode-string": "^2.0.0",
        "micromark-util-html-tag-name": "^2.0.0",
        "unist-util-visit": "^5.0.0",
        "zwitch": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/mdast-util-to-string": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/mdast-util-to-string/-/mdast-util-to-string-4.0.0.tgz",
      "integrity": "sha512-0H44vDimn51F0YwvxSJSm0eCDOJTRlmN0R1yBh4HLj9wiV1Dn0QoXGbvFAWj2hSItVTlCmBF1hqKlIyUBVFLPg==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/micromark/-/micromark-4.0.3.tgz",
      "integrity": "sha512-oGYfQzHSG5dOMovQcJ3fyTmZlWAWpi0XA0sJwJs+i6OT88o1+Jtw/8z0CmdowSLxGhhFK89rQ/oXph/wN02PNw==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "@types/debug": "^4.0.0",
        "debug": "^4.0.0",
        "decode-named-character-reference": "^1.0.0",
        "devlop": "^1.0.0",
        "micromark-core-commonmark": "^2.0.0",
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-chunked": "^2.0.0",
        "micromark-util-combine-extensions": "^2.0.0",
        "micromark-util-decode-numeric-character-reference": "^2.0.0",
        "micromark-util-edit-map": "^1.0.0",
        "micromark-util-encode": "^2.0.0",
        "micromark-util-normalize-identifier": "^2.0.0",
        "micromark-util-resolve-all": "^2.0.0",
        "micromark-util-sanitize-uri": "^2.0.0",
        "micromark-util-subtokenize": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-core-commonmark": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/micromark-core-commonmark/-/micromark-core-commonmark-2.0.4.tgz",
      "integrity": "sha512-wxEeE8v8XVvOrxn1TZj74qYhAtTQsSqufHVS3uNVyT1MupXxhyaHk8/9xDNPh9BmL77QNDgWTkZ3RsYHB2ry7w==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "decode-named-character-reference": "^1.0.0",
        "devlop": "^1.0.0",
        "micromark-factory-destination": "^2.0.0",
        "micromark-factory-label": "^2.0.0",
        "micromark-factory-space": "^2.1.0",
        "micromark-factory-title": "^2.0.0",
        "micromark-factory-whitespace": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-chunked": "^2.0.0",
        "micromark-util-classify-character": "^2.0.0",
        "micromark-util-edit-map": "^1.0.0",
        "micromark-util-html-tag-name": "^2.0.0",
        "micromark-util-normalize-identifier": "^2.0.0",
        "micromark-util-resolve-all": "^2.0.0",
        "micromark-util-subtokenize": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.3"
      }
    },
    "node_modules/micromark-extension-gfm": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm/-/micromark-extension-gfm-3.0.0.tgz",
      "integrity": "sha512-vsKArQsicm7t0z2GugkCKtZehqUm31oeGBV/KVSorWSy8ZlNAv7ytjFhvaryUiCUJYqs+NoE6AFhpQvBTM6Q4w==",
      "license": "MIT",
      "dependencies": {
        "micromark-extension-gfm-autolink-literal": "^2.0.0",
        "micromark-extension-gfm-footnote": "^2.0.0",
        "micromark-extension-gfm-strikethrough": "^2.0.0",
        "micromark-extension-gfm-table": "^2.0.0",
        "micromark-extension-gfm-tagfilter": "^2.0.0",
        "micromark-extension-gfm-task-list-item": "^2.0.0",
        "micromark-util-combine-extensions": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-autolink-literal": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-autolink-literal/-/micromark-extension-gfm-autolink-literal-2.1.0.tgz",
      "integrity": "sha512-oOg7knzhicgQ3t4QCjCWgTmfNhvQbDDnJeVu9v81r7NltNCVmhPy1fJRX27pISafdjL+SVc4d3l48Gb6pbRypw==",
      "license": "MIT",
      "dependencies": {
        "micromark-util-character": "^2.0.0",
        "micromark-util-sanitize-uri": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-footnote": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-footnote/-/micromark-extension-gfm-footnote-2.1.0.tgz",
      "integrity": "sha512-/yPhxI1ntnDNsiHtzLKYnE3vf9JZ6cAisqVDauhp4CEHxlb4uoOTxOCJ+9s51bIB8U1N1FJ1RXOKTIlD5B/gqw==",
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-core-commonmark": "^2.0.0",
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-normalize-identifier": "^2.0.0",
        "micromark-util-sanitize-uri": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-strikethrough": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-strikethrough/-/micromark-extension-gfm-strikethrough-2.1.0.tgz",
      "integrity": "sha512-ADVjpOOkjz1hhkZLlBiYA9cR2Anf8F4HqZUO6e5eDcPQd0Txw5fxLzzxnEkSkfnD0wziSGiv7sYhk/ktvbf1uw==",
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-util-chunked": "^2.0.0",
        "micromark-util-classify-character": "^2.0.0",
        "micromark-util-resolve-all": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-table": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-table/-/micromark-extension-gfm-table-2.1.2.tgz",
      "integrity": "sha512-pRzm4kDTu0MjlmBkxmS9yYhw60nncfcEwu9NNdPFSQEFXS95ZKyIIyTSHu/o3ReBUrLKYEq+7YaXCRn/bPB4MA==",
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-tagfilter": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-tagfilter/-/micromark-extension-gfm-tagfilter-2.0.0.tgz",
      "integrity": "sha512-xHlTOmuCSotIA8TW1mDIM6X2O1SiX5P9IuDtqGonFhEK0qgRI4yeC6vMxEV2dgyr2TiD+2PQ10o+cOhdVAcwfg==",
      "license": "MIT",
      "dependencies": {
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-extension-gfm-task-list-item": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-extension-gfm-task-list-item/-/micromark-extension-gfm-task-list-item-2.1.0.tgz",
      "integrity": "sha512-qIBZhqxqI6fjLDYFTBIa4eivDMnP+OZqsNwmQ3xNLE4Cxwc+zfQEfbs6tzAo2Hjq+bh6q5F+Z8/cksrLFYWQQw==",
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/micromark-factory-destination": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-factory-destination/-/micromark-factory-destination-2.0.1.tgz",
      "integrity": "sha512-Xe6rDdJlkmbFRExpTOmRj9N3MaWmbAgdpSrBQvCFqhezUn4AHqJHbaEnfbVYYiexVSs//tqOdY/DxhjdCiJnIA==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-factory-label": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-factory-label/-/micromark-factory-label-2.0.1.tgz",
      "integrity": "sha512-VFMekyQExqIW7xIChcXn4ok29YE3rnuyveW3wZQWWqF4Nv9Wk5rgJ99KzPvHjkmPXF93FXIbBp6YdW3t71/7Vg==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-factory-space": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-factory-space/-/micromark-factory-space-2.1.0.tgz",
      "integrity": "sha512-fS8hnLIjnjvdQIj39Geug8wWsR0HrYZ43KShKxNfwT7t2LOHo/LbWZEzEaSOjwtjdCsjoE6syHhonEzW0zv0+Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-character": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-factory-title": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-factory-title/-/micromark-factory-title-2.0.1.tgz",
      "integrity": "sha512-5bZ+3CjhAd9eChYTHsjy6TGxpOFSKgKKJPJxr293jTbfry2KDoWkhBb6TcPVB4NmzaPhMs1Frm9AZH7OD4Cjzw==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-factory-whitespace": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-factory-whitespace/-/micromark-factory-whitespace-2.0.1.tgz",
      "integrity": "sha512-Ob0nuZ3PKt/n0hORHyvoD9uZhr+Za8sFoP+OnMcnWK5lngSzALgQYKMr9RJVOWLqQYuyn6ulqGWSXdwf6F80lQ==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-factory-space": "^2.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-character": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/micromark-util-character/-/micromark-util-character-2.1.1.tgz",
      "integrity": "sha512-wv8tdUTJ3thSFFFJKtpYKOYiGP2+v96Hvk4Tu8KpCAsTMs6yi+nVmGh1syvSCsaxz45J6Jbw+9DD6g97+NV67Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-chunked": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-chunked/-/micromark-util-chunked-2.0.1.tgz",
      "integrity": "sha512-QUNFEOPELfmvv+4xiNg2sRYeS/P84pTW0TCgP5zc9FpXetHY0ab7SxKyAQCNCc1eK0459uoLI1y5oO5Vc1dbhA==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-symbol": "^2.0.0"
      }
    },
    "node_modules/micromark-util-classify-character": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-classify-character/-/micromark-util-classify-character-2.0.1.tgz",
      "integrity": "sha512-K0kHzM6afW/MbeWYWLjoHQv1sgg2Q9EccHEDzSkxiP/EaagNzCm7T/WMKZ3rjMbvIpvBiZgwR3dKMygtA4mG1Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-character": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-combine-extensions": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-combine-extensions/-/micromark-util-combine-extensions-2.0.1.tgz",
      "integrity": "sha512-OnAnH8Ujmy59JcyZw8JSbK9cGpdVY44NKgSM7E9Eh7DiLS2E9RNQf0dONaGDzEG9yjEl5hcqeIsj4hfRkLH/Bg==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-chunked": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-decode-numeric-character-reference": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/micromark-util-decode-numeric-character-reference/-/micromark-util-decode-numeric-character-reference-2.0.2.tgz",
      "integrity": "sha512-ccUbYk6CwVdkmCQMyr64dXz42EfHGkPQlBj5p7YVGzq8I7CtjXZJrubAYezf7Rp+bjPseiROqe7G6foFd+lEuw==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-symbol": "^2.0.0"
      }
    },
    "node_modules/micromark-util-decode-string": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-decode-string/-/micromark-util-decode-string-2.0.1.tgz",
      "integrity": "sha512-nDV/77Fj6eH1ynwscYTOsbK7rR//Uj0bZXBwJZRfaLEJ1iGBR6kIfNmlNqaqJf649EP0F3NWNdeJi03elllNUQ==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "decode-named-character-reference": "^1.0.0",
        "micromark-util-character": "^2.0.0",
        "micromark-util-decode-numeric-character-reference": "^2.0.0",
        "micromark-util-symbol": "^2.0.0"
      }
    },
    "node_modules/micromark-util-edit-map": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/micromark-util-edit-map/-/micromark-util-edit-map-1.0.0.tgz",
      "integrity": "sha512-Pa2ljlsEL6sVwFaYeyrOLSYbQt73JvGbPOYFq+9AElXiSnfI5Q4465RRZ1sHv7lDjDOnGRDDaqPXqClqWK/q1Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-encode": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-encode/-/micromark-util-encode-2.0.1.tgz",
      "integrity": "sha512-c3cVx2y4KqUnwopcO9b/SCdo2O67LwJJ/UyqGfbigahfegL9myoEFoDYZgkT7f36T0bLrM9hZTAaAyH+PCAXjw==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT"
    },
    "node_modules/micromark-util-html-tag-name": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-html-tag-name/-/micromark-util-html-tag-name-2.0.1.tgz",
      "integrity": "sha512-2cNEiYDhCWKI+Gs9T0Tiysk136SnR13hhO8yW6BGNyhOC4qYFnwF1nKfD3HFAIXA5c45RrIG1ub11GiXeYd1xA==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT"
    },
    "node_modules/micromark-util-normalize-identifier": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-normalize-identifier/-/micromark-util-normalize-identifier-2.0.1.tgz",
      "integrity": "sha512-sxPqmo70LyARJs0w2UclACPUUEqltCkJ6PhKdMIDuJ3gSf/Q+/GIe3WKl0Ijb/GyH9lOpUkRAO2wp0GVkLvS9Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-symbol": "^2.0.0"
      }
    },
    "node_modules/micromark-util-resolve-all": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-resolve-all/-/micromark-util-resolve-all-2.0.1.tgz",
      "integrity": "sha512-VdQyxFWFT2/FGJgwQnJYbe1jjQoNTS4RjglmSjTUlpUMa95Htx9NHeYW4rGDJzbjvCsl9eLjMQwGeElsqmzcHg==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-sanitize-uri": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-sanitize-uri/-/micromark-util-sanitize-uri-2.0.1.tgz",
      "integrity": "sha512-9N9IomZ/YuGGZZmQec1MbgxtlgougxTodVwDzzEouPKo3qFWvymFHWcnDi2vzV1ff6kas9ucW+o3yzJK9YB1AQ==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "micromark-util-character": "^2.0.0",
        "micromark-util-encode": "^2.0.0",
        "micromark-util-symbol": "^2.0.0"
      }
    },
    "node_modules/micromark-util-subtokenize": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/micromark-util-subtokenize/-/micromark-util-subtokenize-2.1.0.tgz",
      "integrity": "sha512-XQLu552iSctvnEcgXw6+Sx75GflAPNED1qx7eBJ+wydBb2KCbRZe+NwvIEEMM83uml1+2WSXpBAcp9IUCgCYWA==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "devlop": "^1.0.0",
        "micromark-util-chunked": "^2.0.0",
        "micromark-util-symbol": "^2.0.0",
        "micromark-util-types": "^2.0.0"
      }
    },
    "node_modules/micromark-util-symbol": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/micromark-util-symbol/-/micromark-util-symbol-2.0.1.tgz",
      "integrity": "sha512-vs5t8Apaud9N28kgCrRUdEed4UJ+wWNvicHLPxCa9ENlYuAY31M0ETy5y1vA33YoNPDFTghEbnh6efaE8h4x0Q==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT"
    },
    "node_modules/micromark-util-types": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/micromark-util-types/-/micromark-util-types-2.0.3.tgz",
      "integrity": "sha512-oxB2Ik03hI0gv+VNn9tnh1t1YEe9MDPptViAEgfdf3YQHsn0pzGTgCdlSCJXcwhqm8phaEuM7zeEu3QQzVBrPg==",
      "funding": [
        {
          "type": "GitHub Sponsors",
          "url": "https://github.com/sponsors/unifiedjs"
        },
        {
          "type": "OpenCollective",
          "url": "https://opencollective.com/unified"
        }
      ],
      "license": "MIT"
    },
    "node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/nanoid": {
      "version": "3.3.20",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz",
      "integrity": "sha512-uKdg2G3GNCKQn9byYOpxbGqrT2fGO5KRt5J/8b3pok8rT6qxGWF6hxMyJiEYtAf+FVyYuD9hRaDqX5uPFYJ4ZQ==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/parse-entities": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/parse-entities/-/parse-entities-4.0.2.tgz",
      "integrity": "sha512-GG2AQYWoLgL877gQIKeRPGO1xF9+eG1ujIb5soS5gPvLQ1y2o8FL90w2QWNdf9I361Mpp7726c+lj3U0qK1uGw==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^2.0.0",
        "character-entities-legacy": "^3.0.0",
        "character-reference-invalid": "^2.0.0",
        "decode-named-character-reference": "^1.0.0",
        "is-alphanumerical": "^2.0.0",
        "is-decimal": "^2.0.0",
        "is-hexadecimal": "^2.0.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/parse-entities/node_modules/@types/unist": {
      "version": "2.0.11",
      "resolved": "https://registry.npmjs.org/@types/unist/-/unist-2.0.11.tgz",
      "integrity": "sha512-CmBKiL6NNo/OqgmMn95Fk9Whlp2mtvIv+KNpQKN2F4SjvrEesubTRWGYSg+BnWZOnlCaSTU1sMpsBOzgbYhnsA==",
      "license": "MIT"
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.7",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
      "integrity": "sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/playwright": {
      "version": "1.65.1",
      "resolved": "https://registry.npmjs.org/playwright/-/playwright-1.65.1.tgz",
      "integrity": "sha512-vJ1FuoOrNwOKHUIVEvSt3jT1L+wjjDpwhwIstKtfvTh8XIG4FG4bIFuvNdMxi81LGfAhUgUZleVFaOLY4RIUUw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "playwright-core": "1.65.1"
      },
      "bin": {
        "playwright": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.65.1",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.65.1.tgz",
      "integrity": "sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/postcss": {
      "version": "8.5.33",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.33.tgz",
      "integrity": "sha512-RVHEU9/Pp1Fnjr/MpAJsZoADukCKhfIi15OunEYiGktIkYLkPVvC1sioWolGDS7XByMTx9m/IGbro0Js13zhnQ==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.20",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.2"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/property-information": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/property-information/-/property-information-7.2.0.tgz",
      "integrity": "sha512-IAtzIB6sUiWaJYrX9smp3V46pBGbBeLFRGdh25kg1334VcBlD8HzhPeNIWQH9zhGmo2itIe25EHt9dQP7G5hmg==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/proxy-from-env": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/proxy-from-env/-/proxy-from-env-2.1.0.tgz",
      "integrity": "sha512-cJ+oHTW1VAEa8cJslgmUZrc+sjRKgAKl3Zyse6+PV38hZe/V6Z14TbCuXcan9F9ghlz4QrFr2c92TNF82UkYHA==",
      "license": "MIT",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/react": {
      "version": "19.3.1",
      "resolved": "https://registry.npmjs.org/react/-/react-19.3.1.tgz",
      "integrity": "sha512-QNhWdt7nrgVWWQG58QuGsAR3jv3Hbe4mb4vz7w2csnHavciZJgda1CPNaldF6eVxv90ud3jUXpKlHL69gO38yw==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.3.1",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz",
      "integrity": "sha512-Y0bARz53lhEC1NMCASs0/j+faB/zqt3R8hpvg1e8+61ZVJ4UL0UdC4cBbXfZMcIuhrfgeILTLe+ZeBCavQPtKQ==",
      "license": "MIT",
      "dependencies": {
        "scheduler": "^0.28.0"
      },
      "peerDependencies": {
        "react": "^19.3.1"
      }
    },
    "node_modules/react-markdown": {
      "version": "10.1.0",
      "resolved": "https://registry.npmjs.org/react-markdown/-/react-markdown-10.1.0.tgz",
      "integrity": "sha512-qKxVopLT/TyA6BX3Ue5NwabOsAzm0Q7kAPwq6L+wWDwisYs7R8vZ0nRXqq6rkueboxpkjvLGU9fWifiX/ZZFxQ==",
      "license": "MIT",
      "dependencies": {
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "devlop": "^1.0.0",
        "hast-util-to-jsx-runtime": "^2.0.0",
        "html-url-attributes": "^3.0.0",
        "mdast-util-to-hast": "^13.0.0",
        "remark-parse": "^11.0.0",
        "remark-rehype": "^11.0.0",
        "unified": "^11.0.0",
        "unist-util-visit": "^5.0.0",
        "vfile": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      },
      "peerDependencies": {
        "@types/react": ">=18",
        "react": ">=18"
      }
    },
    "node_modules/react-router": {
      "version": "7.18.6",
      "resolved": "https://registry.npmjs.org/react-router/-/react-router-7.18.6.tgz",
      "integrity": "sha512-SP8KqKfRLlJzqzPseC+r6yYFsqPEavtQCC4BKV810tBGijjESLtwVPam+gPOO+wYeXrYN/TNy2CAykQVcNg4iQ==",
      "license": "MIT",
      "dependencies": {
        "cookie": "^1.0.1",
        "set-cookie-parser": "^2.6.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "peerDependencies": {
        "react": ">=18",
        "react-dom": ">=18"
      },
      "peerDependenciesMeta": {
        "react-dom": {
          "optional": true
        }
      }
    },
    "node_modules/remark-gfm": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/remark-gfm/-/remark-gfm-4.0.1.tgz",
      "integrity": "sha512-1quofZ2RQ9EWdeN34S79+KExV1764+wCUGop5CPL1WGdD0ocPpu91lzPGbwWMECpEpd42kJGQwzRfyov9j4yNg==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "mdast-util-gfm": "^3.0.0",
        "micromark-extension-gfm": "^3.0.0",
        "remark-parse": "^11.0.0",
        "remark-stringify": "^11.0.0",
        "unified": "^11.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/remark-parse": {
      "version": "11.0.0",
      "resolved": "https://registry.npmjs.org/remark-parse/-/remark-parse-11.0.0.tgz",
      "integrity": "sha512-FCxlKLNGknS5ba/1lmpYijMUzX2esxW5xQqjWxw2eHFfS2MSdaHVINFmhjo+qN1WhZhNimq0dZATN9pH0IDrpA==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "mdast-util-from-markdown": "^2.0.0",
        "micromark-util-types": "^2.0.0",
        "unified": "^11.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/remark-rehype": {
      "version": "11.1.2",
      "resolved": "https://registry.npmjs.org/remark-rehype/-/remark-rehype-11.1.2.tgz",
      "integrity": "sha512-Dh7l57ianaEoIpzbp0PC9UKAdCSVklD8E5Rpw7ETfbTl3FqcOOgq5q2LVDhgGCkaBv7p24JXikPdvhhmHvKMsw==",
      "license": "MIT",
      "dependencies": {
        "@types/hast": "^3.0.0",
        "@types/mdast": "^4.0.0",
        "mdast-util-to-hast": "^13.0.0",
        "unified": "^11.0.0",
        "vfile": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/remark-stringify": {
      "version": "11.0.0",
      "resolved": "https://registry.npmjs.org/remark-stringify/-/remark-stringify-11.0.0.tgz",
      "integrity": "sha512-1OSmLd3awB/t8qdoEOMazZkNsfVTeY4fTsgzcQFdXNq8ToTN4ZGwrMnlda4K6smTFKD+GRV6O48i6Z4iKgPPpw==",
      "license": "MIT",
      "dependencies": {
        "@types/mdast": "^4.0.0",
        "mdast-util-to-markdown": "^2.0.0",
        "unified": "^11.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/rolldown": {
      "version": "1.2.19",
      "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.19.tgz",
      "integrity": "sha512-QIiV1J9d0pzN4jeeTH4sjPy0AZ6cAy2cG0ExeoE1+U8Rvj+hR3gYkokx0YbeUNGlZqiQJJ2utcETe0oKXwzsuA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@oxc-project/types": "=0.156.0",
        "@rolldown/pluginutils": "^1.0.0"
      },
      "bin": {
        "rolldown": "bin/cli.mjs"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "optionalDependencies": {
        "@rolldown/binding-android-arm-eabi": "1.2.19",
        "@rolldown/binding-android-arm64": "1.2.19",
        "@rolldown/binding-darwin-arm64": "1.2.19",
        "@rolldown/binding-darwin-x64": "1.2.19",
        "@rolldown/binding-freebsd-x64": "1.2.19",
        "@rolldown/binding-linux-arm-gnueabihf": "1.2.19",
        "@rolldown/binding-linux-arm64-gnu": "1.2.19",
        "@rolldown/binding-linux-arm64-musl": "1.2.19",
        "@rolldown/binding-linux-ppc64-gnu": "1.2.19",
        "@rolldown/binding-linux-s390x-gnu": "1.2.19",
        "@rolldown/binding-linux-x64-gnu": "1.2.19",
        "@rolldown/binding-linux-x64-musl": "1.2.19",
        "@rolldown/binding-openharmony-arm64": "1.2.19",
        "@rolldown/binding-wasm32-wasi": "1.2.19",
        "@rolldown/binding-win32-arm64-msvc": "1.2.19",
        "@rolldown/binding-win32-x64-msvc": "1.2.19"
      }
    },
    "node_modules/scheduler": {
      "version": "0.28.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.28.0.tgz",
      "integrity": "sha512-juorfCmIkIw8tT+p5BXSm6PJjQF/ycEYmKyzURCIt/RaZIhL+PulbQ9Yu2z1HdOJDdqDTlxA1+xKBmHXJsczAw==",
      "license": "MIT"
    },
    "node_modules/set-cookie-parser": {
      "version": "2.7.3",
      "resolved": "https://registry.npmjs.org/set-cookie-parser/-/set-cookie-parser-2.7.3.tgz",
      "integrity": "sha512-irZHtTqurLna57KQG/s+fzOwv/J6XSH4cs8M/vsrY3uCaQ3S6+QJguAH0WdN47SXlk82voMZ4naWMQf8fdEoIg==",
      "license": "MIT"
    },
    "node_modules/source-map-js": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.4.tgz",
      "integrity": "sha512-J7ZjMvHd9O1fcT/5V09QWaaSl2BbWx3F6O08spde82Namf9UB0GxRVIPiNbVsdKkoizHiSpTodo3vp2bAy91MA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/space-separated-tokens": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/space-separated-tokens/-/space-separated-tokens-2.0.2.tgz",
      "integrity": "sha512-PEGlAwrG8yXGXRjW32fGbg66JAlOAwbObuqVoJpv/mRgoWDQfgH1wDPvtzWyUSNAXBGSk8h755YDbbcEy3SH2Q==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/stringify-entities": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/stringify-entities/-/stringify-entities-4.0.4.tgz",
      "integrity": "sha512-IwfBptatlO+QCJUo19AqvrPNqlVMpW9YEL2LIVY+Rpv2qsjCGxaDLNRgeGsQWJhfItebuJhsGSLjaBbNSQ+ieg==",
      "license": "MIT",
      "dependencies": {
        "character-entities-html4": "^2.0.0",
        "character-entities-legacy": "^3.0.0"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/style-to-object": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/style-to-object/-/style-to-object-2.0.2.tgz",
      "integrity": "sha512-QmbXPUylqU80HAgTOJeEOdbA40W9KtxmjMhQy+tq+b8F2aoh3aQLuy82hh2jm2qsC9hR9eI0+eQidTMydKcqRA==",
      "license": "MIT",
      "dependencies": {
        "inline-style-parser": "0.2.9"
      }
    },
    "node_modules/tailwindcss": {
      "version": "4.3.5",
      "resolved": "https://registry.npmjs.org/tailwindcss/-/tailwindcss-4.3.5.tgz",
      "integrity": "sha512-FcQk9BuffmEHJP2G0XmB2SplU1aLTI7j07Kunk+U74Ny+XiWOtzXz9aujFZ/avntw1e2cOv/3PkgzflQ7gX2vQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/tapable": {
      "version": "2.3.4",
      "resolved": "https://registry.npmjs.org/tapable/-/tapable-2.3.4.tgz",
      "integrity": "sha512-NHFiWnAbMJxNNpBwiO7jJVGDuqMxT9/oV8v57RR+fgBQShkJil5inGD8/xWy0hjLyHQyX1tu27QANhlz3KBqCg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/webpack"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.17",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
      "integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.4"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/trim-lines": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/trim-lines/-/trim-lines-3.0.1.tgz",
      "integrity": "sha512-kRj8B+YHZCc9kQYdWfJB2/oUl9rA99qbowYYBtr4ui4mZyAQ2JpvVBd/6U2YloATfqBhBTSMhTpgBHtU0Mf3Rg==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/trough": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/trough/-/trough-2.2.0.tgz",
      "integrity": "sha512-tmMpK00BjZiUyVyvrBK7knerNgmgvcV/KLVyuma/SC+TQN167GrMRciANTz09+k3zW8L8t60jWO1GpfkZdjTaw==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    },
    "node_modules/tslib": {
      "version": "2.9.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.9.1.tgz",
      "integrity": "sha512-a4Ux9VKuIMHsOS7ENbEq6hK2ZGYIT27Rtl0E4eD9KqwxhKiQeMZE/9xb3IdYwWaSOyIBQLExhQgXDTYoiCxnWA==",
      "dev": true,
      "license": "0BSD",
      "optional": true
    },
    "node_modules/unified": {
      "version": "11.0.5",
      "resolved": "https://registry.npmjs.org/unified/-/unified-11.0.5.tgz",
      "integrity": "sha512-xKvGhPWw3k84Qjh8bI3ZeJjqnyadK+GEFtazSfZv/rKeTkTjOJho6mFqh2SM96iIcZokxiOpg78GazTSg8+KHA==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0",
        "bail": "^2.0.0",
        "devlop": "^1.0.0",
        "extend": "^3.0.0",
        "is-plain-obj": "^4.0.0",
        "trough": "^2.0.0",
        "vfile": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/unist-util-is": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/unist-util-is/-/unist-util-is-6.0.1.tgz",
      "integrity": "sha512-LsiILbtBETkDz8I9p1dQ0uyRUWuaQzd/cuEeS1hoRSyW5E5XGmTzlwY1OrNzzakGowI9Dr/I8HVaw4hTtnxy8g==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/unist-util-position": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/unist-util-position/-/unist-util-position-5.0.0.tgz",
      "integrity": "sha512-fucsC7HjXvkB5R3kTCO7kUjRdrS0BJt3M/FPxmHMBOm8JQi2BsHAHFsy27E0EolP8rp0NzXsJ+jNPyDWvOJZPA==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/unist-util-stringify-position": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/unist-util-stringify-position/-/unist-util-stringify-position-4.0.0.tgz",
      "integrity": "sha512-0ASV06AAoKCDkS2+xw5RXJywruurpbC4JZSm7nr7MOt1ojAzvyyaO+UxZf18j8FCF6kmzCZKcAgN/yu2gm2XgQ==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/unist-util-visit": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/unist-util-visit/-/unist-util-visit-5.2.0.tgz",
      "integrity": "sha512-fpsYs/VVoZxfGY9/j3FQpZmN8wdLJaV1Pt38AaJNZu9uKIHcFU3halCdBveEq1HGKO1OEfJY65w1zvoFV1b3qQ==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0",
        "unist-util-is": "^6.0.0",
        "unist-util-visit-parents": "^6.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/unist-util-visit-parents": {
      "version": "6.1.0",
      "resolved": "https://registry.npmjs.org/unist-util-visit-parents/-/unist-util-visit-parents-6.1.0.tgz",
      "integrity": "sha512-vKXxz6O38sKDj1mtx/k2cWvkkFBuYGx6uGrlzBkVeWCRF/F8sdI0j3Wbkz/5rVNRRuVc8UrgRdbCxNhmYXgP3w==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0",
        "unist-util-is": "^6.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/vfile": {
      "version": "6.0.3",
      "resolved": "https://registry.npmjs.org/vfile/-/vfile-6.0.3.tgz",
      "integrity": "sha512-KzIbH/9tXat2u30jf+smMwFCsno4wHVdNmzFyL+T/L3UGqqk6JKfVqOFOZEpZSHADH1k40ab6NUIXZq422ov3Q==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0",
        "vfile-message": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/vfile-message": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/vfile-message/-/vfile-message-4.0.4.tgz",
      "integrity": "sha512-66ycRswIkNmHH9PHku7ADtv5RVwgIrOcuv3J8Svz6h4qgGRrKVa+9/neuKyJZUXyOpYwLTvS+whZ4R2urHHgQg==",
      "license": "MIT",
      "dependencies": {
        "@types/unist": "^3.0.0",
        "unist-util-stringify-position": "^4.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/unified"
      }
    },
    "node_modules/vite": {
      "version": "8.3.8",
      "resolved": "https://registry.npmjs.org/vite/-/vite-8.3.8.tgz",
      "integrity": "sha512-LzOn3h9rG/0vhLdXrV4yJ4QFA9eEoqCl+Yx+kGJd7aB9w6nfNgVHKSYwLPZUHrz4ZGa+t+kXjV9itvcHDLQouA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "lightningcss": "^1.33.0",
        "picomatch": "^4.0.7",
        "postcss": "^8.5.32",
        "rolldown": "~1.2.18",
        "tinyglobby": "^0.2.17"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "@vitejs/devtools": "^0.7.1 || ^0.8.0",
        "esbuild": "^0.27.0 || ^0.28.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "@vitejs/devtools": {
          "optional": true
        },
        "esbuild": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "node_modules/zwitch": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/zwitch/-/zwitch-2.0.4.tgz",
      "integrity": "sha512-bXE4cR/kVZhKZX/RjPEflHaKVhUVl85noU3v6b8apfQEc1x4A+zBxjZ4lN8LqGd6WZ3dl98pY4o717VFmoPp+A==",
      "license": "MIT",
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/wooorm"
      }
    }
  }
}

~~~~~

## Assumptions

New chats use the checked ready PDFs and take their initial title from the first question. The browser accepts PDFs up to and including 50 MiB. Express and FastAPI perform storage, page-count and retrieval checks.

## Install and run

Run in PowerShell from the project root with the backend services configured.

~~~~~powershell
cd client
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
~~~~~

Open http://localhost:5173 in the browser.

## Checklist

- [x] Protected authentication routes, bearer tokens and automatic logout on 401
- [x] PDF uploads with validation, progress, processing polls, selection and confirmed deletion
- [x] Conversation history, creation, renaming and confirmed deletion
- [x] POST SSE streaming, Markdown, stop, copy, auto-scroll and source details
- [x] Keyboard-accessible navigation, 375 px drawer, loading and empty states, error feedback and themes
- [x] Production build, stream unit tests and browser integration tests
