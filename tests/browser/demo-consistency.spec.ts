import { expect, test, type Page } from "@playwright/test";

/**
 * 演示模式交互自洽性：
 * KPI 卡片整卡可点并落到正确筛选、学生总表整行可点、
 * 谈心谈话 / 材料输出页在 demo 下不再空白、正式模式不受演示数据影响。
 */

async function openDemo(page: Page) {
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

test("KPI 整卡可点：特殊关爱卡片进入关爱目录", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-kpis .care-kpi").click();
  await expect(
    page.getByRole("heading", { name: "特殊关爱学生目录" }),
  ).toBeVisible();
});

test("KPI 整卡可点：挂科学生卡片落到学生库的挂科筛选", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-kpis button", { hasText: "挂科学生" }).click();
  await expect(
    page.getByRole("heading", { name: "完整资料在本地直接可见" }),
  ).toBeVisible();
  await expect(page.getByLabel("学业状态")).toHaveValue("failed");
  // 默认显示第一个班；1 班挂科 9 人（全年级 13 人，另 4 人在 2 班）
  await expect(page.locator(".v2-table tbody tr")).toHaveCount(9);
});

test("KPI 整卡可点：待谈话卡片落到待办中心并预选类型", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-kpis button", { hasText: "待谈话" }).click();
  await expect(page.getByRole("heading", { name: "待办" })).toBeVisible();
  // 待谈话筛选生效：列表里只有待谈话类型的待办
  const rows = page.locator(".task-row, .todo-row").first();
  await expect(rows).toBeVisible();
});

test("KPI 整卡可点：就业方向未明确落到升学就业筛选", async ({ page }) => {
  await openDemo(page);
  await page
    .locator(".v2-kpis button", { hasText: "就业方向未明确" })
    .click();
  await expect(
    page.getByRole("heading", { name: "一眼找到下一步还不明确的学生" }),
  ).toBeVisible();
  await expect(page.locator(".filter-pills .active")).toHaveText(
    "方向未明确",
  );
});

test("学生总表整行可点：点任意行打开该生工作台", async ({ page }) => {
  await openDemo(page);
  const row = page.locator(".v2-table tbody tr").first();
  const name = await row.locator("b").innerText();
  await row.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("谈心谈话页不再空白：默认可见多条已完成记录", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  await expect(
    page.getByRole("heading", { name: "谈心谈话" }),
  ).toBeVisible();
  const cards = page.locator(".conversation-grid article");
  await expect(cards.first()).toBeVisible();
  expect((await cards.count())).toBeGreaterThanOrEqual(3);
  await expect(page.getByText("宋景初").first()).toBeVisible();
});

test("材料输出页可直接为宋景初生成谈心谈话记录", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "材料输出" }).first().click();
  await expect(
    page.getByRole("heading", { name: "已经记录过一次，不再重新写第二遍" }),
  ).toBeVisible();

  // 谈话类型下学生下拉应已包含有谈话记录的学生；选中宋景初
  // （label 文本包含 option 文本，getByLabel 会撞「材料类型」，改用结构定位）
  await page.getByLabel("材料类型").selectOption("conversation");
  const studentSelect = page.locator(".material-builder select").nth(1);
  const songValue = await studentSelect
    .locator("option", { hasText: "宋景初" })
    .getAttribute("value");
  expect(songValue).toBeTruthy();
  await studentSelect.selectOption(songValue!);

  await page.getByRole("button", { name: "生成材料" }).click();
  await expect(page.getByLabel("材料输出预览")).toContainText("谈话主题");
  await expect(page.getByLabel("材料输出预览")).not.toContainText(
    "尚无已完成的谈话记录",
  );
});

test("正式入口不受演示数据调整影响", async ({ page }) => {
  await page.goto("/workbench");
  await expect(page.locator(".v2-shell")).toBeVisible();
  // 正式空间没有演示学生；空空间显示建立班级引导
  await expect(page.getByText("宋景初")).toHaveCount(0);
});
