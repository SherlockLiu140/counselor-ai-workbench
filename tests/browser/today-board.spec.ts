import { expect, test } from "@playwright/test";

test("首页展示时钟与今日待办清单", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await expect(page.getByText("100 名学生", { exact: false }).first()).toBeVisible();

  const clock = page.locator(".today-clock");
  await expect(clock).toBeVisible();
  await expect(page.locator(".today-clock-time")).toContainText(
    /\d{2}:\d{2}:\d{2}/,
  );
  await expect(page.locator(".today-clock-date")).toContainText(
    /星期[日一二三四五六]/,
  );
  await expect(page.locator(".today-clock-date")).toContainText(
    /\d{4} 年 \d{1,2} 月 \d{1,2} 日/,
  );

  await expect(page.locator(".today-chip.overdue strong")).toHaveText("2");
  await expect(page.locator(".today-chip.today strong")).toHaveText("3");
  await expect(page.locator(".today-chip.talk strong")).toHaveText("3");

  await expect(page.locator(".today-items .today-item")).toHaveCount(5);
  await expect(page.locator(".today-more")).toContainText("还有 2 项");
});

test("今日清单可直接勾选完成，计数同步变化", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".today-item")).toHaveCount(5);

  await page
    .getByRole("button", { name: "标记完成：就缺勤与迟到情况与学生谈话" })
    .click();
  await expect(page.getByRole("status").first()).toContainText("已完成");
  await expect(page.locator(".today-chip.today strong")).toHaveText("2");
  await expect(
    page.getByRole("button", { name: "标记完成：就缺勤与迟到情况与学生谈话" }),
  ).toHaveCount(0);
  await expect(page.locator(".today-more")).toContainText("还有 1 项");
});

test("今日清单可跳转到待办中心与谈心谈话", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await page
    .locator(".today-chip.talk")
    .click();
  await expect(page.getByRole("heading", { name: "谈心谈话" })).toBeVisible();
});

test("时钟下方展示今日推进、本周节奏与接下来", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".today-rhythm")).toBeVisible();

  const bar = page.locator(".today-progress-bar > span");
  await expect(bar).toHaveCount(7);
  await expect(page.locator(".today-progress-bar > span.filled")).toHaveCount(0);
  await expect(page.locator(".today-progress-total")).toHaveText("/ 7");
  await expect(page.locator(".today-progress-note")).toHaveText("还剩 7 项");

  await expect(page.locator(".today-week li")).toHaveCount(7);
  await expect(page.locator(".today-week li.is-today")).toHaveCount(1);
  await expect(page.locator(".today-week li.is-today")).toHaveClass(/has-items/);

  const upcoming = page.locator(".today-upcoming li");
  await expect(upcoming).toHaveCount(1);
  await expect(page.locator(".today-upcoming-date")).toHaveText(/\d{1,2}\/\d{1,2}/);
  await expect(page.locator(".today-upcoming-title")).toContainText(
    "回访实习岗位适应情况",
  );
});

test("勾选今日事项后进度条前进，总数不变", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".today-progress-bar > span.filled")).toHaveCount(0);

  await page
    .getByRole("button", { name: "标记完成：就缺勤与迟到情况与学生谈话" })
    .click();

  await expect(page.locator(".today-progress-bar > span.filled")).toHaveCount(1);
  await expect(page.locator(".today-progress-total")).toHaveText("/ 7");
  await expect(page.locator(".today-progress-note")).toHaveText("还剩 6 项");
});

test("接下来的事项可跳转到该生工作台", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  await page.locator(".today-upcoming li button").first().click();
  await expect(page.locator(".today-board")).toHaveCount(0);
});
