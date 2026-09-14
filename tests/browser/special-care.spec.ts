import { expect, test } from "@playwright/test";

test("root and workbench paths open the only formal product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("班主任AI 工作台", { exact: false }).first()).toBeVisible();
  await page.goto("/workbench");
  await expect(page.getByText("班主任AI 工作台", { exact: false }).first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has("v")).toBe(false);
});

test("special-care KPI opens the directory and student dashboard", async ({ page }) => {
  await page.goto("/workbench?mode=demo");
  const card = page.locator(".care-kpi");
  await expect(card).toContainText("特殊关爱学生");
  await expect(card).toContainText("12 人");
  await card.click();
  await expect(page.getByRole("heading", { name: "特殊关爱学生目录" })).toBeVisible();
  await expect(page.locator(".care-table tbody tr")).toHaveCount(12);

  await page.getByLabel("特殊关爱类型筛选").selectOption("多重关注");
  await expect(page.locator(".care-table tbody tr")).toHaveCount(3);
  await page.getByLabel("特殊关爱类型筛选").selectOption("");
  await page.getByLabel("搜索特殊关爱学生").fill("林知禾");
  await expect(page.locator(".care-table tbody tr")).toHaveCount(1);
  await page.locator(".care-table tbody tr").getByRole("button", { name: "林知禾" }).click();

  await expect(page.getByRole("heading", { name: "林知禾" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "基本信息" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "特殊关爱与重要情况" })).toBeVisible();
  await expect(page.getByText("家庭困难", { exact: true })).toBeVisible();
  await expect(page.getByLabel("平均成绩变化折线图")).toBeVisible();
  await expect(page.getByLabel("班级排名变化折线图")).toBeVisible();

  await page.getByRole("button", { name: "AI 帮我生成谈话提纲" }).click();
  const gateway = page.getByRole("dialog", { name: "AI Privacy Gateway" });
  await expect(gateway).toBeVisible();
  await expect(gateway.locator(".comparison")).not.toContainText("13900000001");
  await expect(gateway.locator(".comparison")).not.toContainText("虚构信教情况");
  await expect(gateway.locator(".comparison")).not.toContainText("虚构性取向记录");
});
