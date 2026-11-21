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
