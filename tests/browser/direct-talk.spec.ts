import { expect, test, type Page } from "@playwright/test";

/**
 * 「发起一次谈心谈话」必须直接进入谈话，而不是先弹「登记一件事」。
 *
 * 回护两个真实问题：
 * 1. 谈心谈话页点「发起一次谈话」弹出的却是「登记一件事」表单，
 *    等于强制老师先登记事件、再被生成一条「待谈话」待办，才轮到谈话；
 * 2. 谈话当场就发生了，那条「待谈话」待办建立即作废，纯属噪音。
 *
 * 设计取舍：谈话是主记录，能否归档到「事务」、要不要安排复查，
 * 都由老师在表单里显式勾选，不再有隐式副作用。
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

async function openTalks(page: Page) {
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  await expect(page.getByRole("heading", { name: "谈心谈话" })).toBeVisible();
}

test("谈心谈话页点「发起一次谈心谈话」直接打开谈话表单，不再先弹「登记一件事」", async ({
  page,
}) => {
  await openDemo(page);
  await openTalks(page);

  await page.getByRole("button", { name: "发起一次谈心谈话" }).click();

  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await expect(dialog).toBeVisible();
  // 关键回归点：绝不能是「登记一件事」
  await expect(page.getByRole("dialog", { name: "登记一件事" })).toHaveCount(0);
  await expect(dialog).not.toContainText("事实描述");
  await expect(dialog).not.toContainText("保存并生成待办");
  // 表单里直接可选学生、主题与谈话内容
  await expect(dialog.getByLabel("学生 *")).toBeVisible();
  await expect(dialog.getByLabel("谈话主题 *")).toBeVisible();
  await expect(dialog.getByLabel("口述原始记录 *")).toBeVisible();
  await expect(dialog).toContainText("不再自动生成「待谈话」待办");
});

test("直接谈话保存后出现在记录最上方，且不新增「待谈话」待办", async ({
  page,
}) => {
  await openDemo(page);

  const talkKpi = page.locator(".v2-kpis button", { hasText: "待谈话" }).first();
  const before = await talkKpi.locator("strong").innerText();

  await openTalks(page);
  await page.getByRole("button", { name: "发起一次谈心谈话" }).click();
  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await dialog.getByLabel("学生 *").selectOption({ label: "林知禾 · 20260001" });
  await dialog.getByLabel("谈话主题 *").selectOption("家庭困难");
  await dialog.getByLabel("谈话背景（可选）").fill("虚构背景：近期生活费紧张。");
  await dialog.getByLabel("口述原始记录 *").fill(RAW_MARK);
  await dialog.getByLabel("学生主要表达").fill(EXPR_MARK);
  await dialog.getByRole("button", { name: "保存谈话记录" }).click();

  await expect(page.getByRole("status").first()).toContainText(
    "谈话记录已本地保存",
  );
  await expect(dialog).toBeHidden();

  // demo 预置 4 条历史谈话 + 本次保存 1 条
  await expect(page.locator(".talk-ledger")).toContainText("共 5 条");
  const card = page.locator(".talk-ledger .conversation-grid article").first();
  await expect(card).toContainText("林知禾");
  await expect(card).toContainText("家庭困难");
  await expect(card).toContainText(RAW_MARK);
  await expect(card).toContainText(EXPR_MARK);

  // 关键回归点：谈话没有制造新的「待谈话」待办
  await page.locator(".v2-nav", { hasText: "首页" }).first().click();
  await expect(talkKpi.locator("strong")).toHaveText(before);
});

test("勾选留痕时谈话会归档到「事务」并直接结案，且不挂任何待办", async ({
  page,
}) => {
  await openDemo(page);
  await openTalks(page);
  await page.getByRole("button", { name: "发起一次谈心谈话" }).click();
  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await dialog.getByLabel("学生 *").selectOption({ label: "林知禾 · 20260001" });
  await dialog.getByLabel("谈话主题 *").selectOption("宿舍问题");
  await dialog.getByLabel("口述原始记录 *").fill(RAW_MARK);
  await dialog.getByRole("button", { name: "保存谈话记录" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").first()).toContainText(
    "已在「事务」留存一条记录",
  );

  await page.locator(".v2-nav", { hasText: "事务" }).first().click();
  const eventCard = page.locator(".event-card", { hasText: "宿舍问题" }).first();
  await expect(eventCard).toBeVisible();
  await expect(eventCard).toContainText("林知禾");
  // 谈话即处理完毕：直接结案，不留一个多余的「确认结案」点击
  await expect(eventCard).toContainText("已结案");
  await expect(eventCard).toContainText("0 个待办");
  await expect(eventCard.getByRole("button", { name: "确认结案" })).toHaveCount(
    0,
  );
});

test("取消勾选留痕时，事务里不会多出记录", async ({ page }) => {
  await openDemo(page);
  // 先记录演示空间预置的事务数（本轮已预置 5 条事件）
  await page.locator(".v2-nav", { hasText: "事务" }).first().click();
  await expect(page.getByRole("heading", { name: "事务中心" })).toBeVisible();
  const before = await page.locator(".event-card").count();
  expect(before).toBeGreaterThanOrEqual(1);

  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  await page.getByRole("button", { name: "发起一次谈心谈话" }).click();
  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await dialog
    .getByLabel("同时在「事务」留一条记录（便于归档与材料引用）")
    .uncheck();
  await dialog.getByLabel("口述原始记录 *").fill(RAW_MARK);
  await dialog.getByRole("button", { name: "保存谈话记录" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".v2-nav", { hasText: "事务" }).first().click();
  await expect(page.getByRole("heading", { name: "事务中心" })).toBeVisible();
  await expect(page.locator(".event-card")).toHaveCount(before);
});

test("只有勾选「需要复查提醒」才生成复查待办，且事件转为跟进中", async ({
  page,
}) => {
  await openDemo(page);
  await openTalks(page);
  await page.getByRole("button", { name: "发起一次谈心谈话" }).click();
  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await dialog.getByLabel("学生 *").selectOption({ label: "林知禾 · 20260001" });
  await dialog.getByLabel("口述原始记录 *").fill(RAW_MARK);

  // 默认不勾选，所以不出现复查日期输入
  await expect(dialog.getByLabel("复查日期")).toHaveCount(0);
  await dialog.getByLabel("需要复查提醒（生成待办）").check();
  await expect(dialog.getByLabel("复查日期")).toBeVisible();
  await dialog.getByRole("button", { name: "保存谈话记录并设复查提醒" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").first()).toContainText(
    "已按设置生成复查待办",
  );

  await page.locator(".v2-nav", { hasText: "待办" }).first().click();
  await expect(
    page.locator(".task-row").filter({ hasText: /复查.缺勤.后续情况/ }),
  ).toHaveCount(1);
});

test("首页快速开始也提供「发起谈心谈话」直接入口", async ({ page }) => {
  await openDemo(page);
  await page
    .locator(".v2-quick")
    .getByRole("button", { name: "发起谈心谈话" })
    .click();
  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog", { name: "登记一件事" })).toHaveCount(0);
});

test("学生个人看板点「发起谈话」预选该生，也不再先走事件登记", async ({
  page,
}) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "我的班级" }).first().click();
  await page.getByRole("button", { name: "打开工作台 →" }).first().click();
  await page.getByRole("button", { name: "发起谈话" }).click();

  const dialog = page.getByRole("dialog", { name: /发起一次谈心谈话/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("林知禾");
  await expect(
    dialog.getByLabel("学生 *").locator("option:checked"),
  ).toHaveText(/林知禾/);
  await expect(page.getByRole("dialog", { name: "登记一件事" })).toHaveCount(0);
});
