import { expect, test } from "@playwright/test";

test("dashboard exposes beta study workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's review desk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Study Tutor" })).toBeVisible();
});

test("subject workspace can create a note", async ({ page }) => {
  const title = `Beta biology note ${Date.now()}`;
  await page.goto("/subjects/subj-biology");
  await page.getByPlaceholder("Note title").fill(title);
  await page.getByPlaceholder("Paste lecture notes, textbook points, or reminders...").fill("Cells use membranes to control movement.");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const noteId = new URL(page.url()).pathname.split("/").pop();
  if (noteId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
    }, noteId);
  }
});
