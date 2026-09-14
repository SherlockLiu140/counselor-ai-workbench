import { expect, test, type Page } from "@playwright/test";

async function openDemo(page: Page) {
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

test("独立待办点「开始谈话」不再无反应，会建立谈话事项", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "待办" }).click();

  const row = page.locator(".task-row", {
    hasText: "跟进专升本复习计划制定情况",
  });
  await expect(row).toContainText("独立待办");
  await row.getByRole("button", { name: "开始谈话" }).click();

  await expect(page.getByRole("dialog", { name: /记录谈话/ })).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText(
    "已由待办建立谈话事项",
  );
});

test("从独立待办发起的谈话，保存后不再留下重复的待谈话条目", async ({
  page,
}) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "待办" }).click();
  await page
    .locator(".task-row", { hasText: "了解近期作息与情绪状态" })
    .getByRole("button", { name: "开始谈话" })
    .click();

  await page
    .getByLabel("口述原始记录 *")
    .fill("已了解近期作息与情绪状态，约定两周后复盘。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();
  await expect(page.getByRole("status")).toContainText("后续复查待办");

  // 原待办已转入谈话事项跟进，不再以「待谈话」停留在待处理列表
  await expect(
    page.locator(".task-row", { hasText: "了解近期作息与情绪状态" }),
  ).toHaveCount(0);
});

test("已关联事件的待办仍直接打开对应谈话表单", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "＋ 登记一件事" }).first().click();
  await page
    .getByLabel("学生 *")
    .selectOption({ label: "林知禾 · 20260001" });
  await page.getByLabel("事件类型 *").selectOption("缺勤");
  await page.getByLabel("事实描述 *").fill("虚构课程第一、二节未到，原因待核实。");
  await page.getByRole("button", { name: "保存并生成待办" }).click();
  await expect(page.getByRole("status")).toContainText("关联待办已自动生成");

  await page.locator(".v2-nav", { hasText: "待办" }).click();
  const row = page.locator(".task-row", {
    hasText: "就“缺勤”与学生谈话",
  });
  await expect(row).toContainText("查看原始事件");
  await row.getByRole("button", { name: "开始谈话" }).click();

  await expect(page.getByRole("dialog", { name: /记录谈话/ })).toBeVisible();
  await expect(page.locator(".talk-context")).toContainText(
    "虚构课程第一、二节未到",
  );
});
