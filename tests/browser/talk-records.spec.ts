import { expect, test, type Page } from "@playwright/test";

/**
 * 谈话记录的可见性、导出与脱敏入口。
 *
 * 这组用例回护三个真实问题：
 * 1. 谈话记录原来被 13 张模板卡压在首屏之外，老师"以为没存上"；
 * 2. 「口述原始记录」在两个页面上都完全看不到；
 * 3. 记录只能整库备份，无法按谈话维度导出。
 */

const requestLog = new WeakMap<Page, Array<{ url: string; method: string }>>();

test.beforeEach(async ({ page }) => {
  const requests: Array<{ url: string; method: string }> = [];
  requestLog.set(page, requests);
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
});

// 与 business.spec.ts 一致的 Local First 守卫：不得出现非 GET 请求，且只发往本机。
test.afterEach(async ({ page }) => {
  const requests = requestLog.get(page) ?? [];
  expect(requests.some((request) => request.method !== "GET")).toBe(false);
  expect(
    requests.every((request) => new URL(request.url).hostname === "127.0.0.1"),
  ).toBe(true);
});

const RAW_MARK = "口述原始记录唯一串RAW。";
const EXPR_MARK = "学生主要表达唯一串EXPR。";

async function openDemo(page: Page) {
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

/** 走完整链路建立一条谈话：登记事件 → 待办开始谈话 → 保存。 */
async function recordOneTalk(page: Page) {
  await page.getByRole("button", { name: "＋ 登记一件事" }).first().click();
  await page.getByLabel("学生 *").selectOption({ label: "林知禾 · 20260001" });
  await page.getByLabel("事件类型 *").selectOption("缺勤");
  await page.getByLabel("事实描述 *").fill("学习委员反馈，本周两次早课未到。");
  await page.getByRole("button", { name: "保存并生成待办" }).click();
  await expect(page.getByRole("status").first()).toContainText("关联待办已自动生成");

  await page.locator(".v2-nav", { hasText: "待办" }).first().click();
  await page
    .locator(".task-row", { hasText: "待谈话" })
    .first()
    .getByRole("button", { name: "开始谈话" })
    .click();
  await expect(page.getByRole("dialog", { name: /记录谈话/ })).toBeVisible();
  await page.getByLabel("口述原始记录 *").fill(RAW_MARK);
  await page.getByLabel("学生主要表达").fill(EXPR_MARK);
  await page.getByLabel("班主任沟通与引导").fill("建议与班委结对。");
  await page.getByLabel("达成的共识 / 措施").fill("本周起早课提前出发。");
  await page.getByLabel("后续跟进事项").fill("下周一复查。");
  await page
    .getByRole("button", { name: "保存谈话并生成复查待办" })
    .click();
  await expect(page.getByRole("status").first()).toContainText("后续复查待办");
}

test("谈心谈话页：谈话记录排在模板库之前，且首屏即可看到", async ({ page }) => {
  await openDemo(page);
  await recordOneTalk(page);

  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  await expect(page.getByRole("heading", { name: "谈心谈话" })).toBeVisible();

  // 结构断言：记录区块必须出现在模板库之前
  const order = await page.evaluate(() => {
    const ledger = document.querySelector(".talk-ledger");
    const templates = document.querySelector(".talk-template-library");
    if (!ledger || !templates) return "missing";
    return ledger.compareDocumentPosition(templates) &
      Node.DOCUMENT_POSITION_FOLLOWING
      ? "before"
      : "after";
  });
  expect(order).toBe("before");

  // 记录卡在首屏内可见（模板库不再把它压到下方）
  const card = page.locator(".talk-ledger .conversation-grid article").first();
  await expect(card).toBeInViewport();
  await expect(card).toContainText("林知禾");
  // demo 预置 4 条历史谈话 + 本次保存 1 条
  await expect(page.locator(".talk-ledger")).toContainText("共 5 条");
});

test("谈话记录直接展示各字段，口述原始记录不再不可见", async ({ page }) => {
  await openDemo(page);
  await recordOneTalk(page);
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();

  const card = page.locator(".talk-ledger .conversation-grid article").first();
  // 折叠状态下也能看到口述原始记录与学生主要表达
  await expect(card).toContainText(RAW_MARK);
  await expect(card).toContainText(EXPR_MARK);
  await expect(card).toContainText("口述原始记录");
  await expect(card).toContainText("班主任引导");
  await expect(card).toContainText("共识措施");
  await expect(card).toContainText("后续跟进");
  // 标准记录仍可展开
  await card.getByText("查看标准记录").click();
  await expect(card.locator("pre")).toContainText("谈话主题");
});

test("导出此条会下载 Markdown 文件，内容含原始记录", async ({ page }) => {
  await openDemo(page);
  await recordOneTalk(page);
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();

  const card = page.locator(".talk-ledger .conversation-grid article").first();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: "导出此条" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(download.suggestedFilename()).toContain("谈话记录");

  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk.toString("utf8");
  expect(content).toContain("# ");
  expect(content).toContain(RAW_MARK);
  expect(content).toContain(EXPR_MARK);
  expect(content).toContain("请妥善保管");
  await expect(page.getByRole("status").first()).toContainText("已导出 1 条谈话记录");
});

test("导出全部会一次导出多条", async ({ page }) => {
  await openDemo(page);
  await recordOneTalk(page);
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出全部（Markdown）" }).click(),
  ]);
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk.toString("utf8");
  expect(content).toContain("谈心谈话记录");
  // 4 条预置历史谈话 + 本次保存 1 条
  expect(content).toContain("共 5 条");
});

test("学生个人看板有独立的谈话记录区块，字段可见并可导出", async ({ page }) => {
  await openDemo(page);
  await recordOneTalk(page);

  await page.locator(".v2-nav", { hasText: "我的班级" }).first().click();
  await page.getByRole("button", { name: "打开工作台 →" }).first().click();

  const panel = page.locator(".talk-records");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "谈话记录" })).toBeVisible();
  // 林知禾：demo 预置迟到谈话 1 条 + 本次保存 1 条
  await expect(panel).toContainText("共 2 条");
  await expect(panel).toContainText(RAW_MARK);
  await expect(panel).toContainText(EXPR_MARK);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "导出此条" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});

test("谈话记录的 AI 润色先在本机脱敏：本地原文与 AI 可见内容分栏对照", async ({
  page,
}) => {
  await openDemo(page);
  await recordOneTalk(page);
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();

  const card = page.locator(".talk-ledger .conversation-grid article").first();
  await card.getByRole("button", { name: "AI 润色" }).click();

  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await expect(dialog).toBeVisible();
  // 打开弹窗本身不得发起任何请求（afterEach 会再兜一次）
  await expect(dialog).toContainText("AI 实际会看到的内容");

  await dialog.locator("details.polish-privacy > summary").click();
  await expect(
    dialog.getByRole("heading", { name: "本地原文", exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "AI 实际看到的内容" }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();
});
