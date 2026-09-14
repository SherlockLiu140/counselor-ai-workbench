import { expect, test, type Page } from "@playwright/test";

const requestLog = new WeakMap<Page, Array<{ url: string; method: string }>>();
const consoleLog = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const requests: Array<{ url: string; method: string }> = [];
  const errors: string[] = [];
  requestLog.set(page, requests);
  consoleLog.set(page, errors);
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  const requests = requestLog.get(page) ?? [];
  expect(consoleLog.get(page) ?? []).toEqual([]);
  expect(requests.some((request) => request.method !== "GET")).toBe(false);
  expect(
    requests.every((request) => new URL(request.url).hostname === "127.0.0.1"),
  ).toBe(true);
});

async function openDemo(page: Page) {
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

async function registerEvent(
  page: Page,
  type: string,
  facts: string,
  studentLabel = "林知禾 · 20260001",
) {
  await page.getByRole("button", { name: "＋ 登记一件事" }).first().click();
  await page.getByLabel("学生 *").selectOption({ label: studentLabel });
  await page.getByLabel("事件类型 *").selectOption(type);
  await page.getByLabel("事实描述 *").fill(facts);
  await page.getByRole("button", { name: "保存并生成待办" }).click();
  await expect(page.getByRole("status")).toContainText("关联待办已自动生成");
}

async function completeTalk(page: Page, rawNotes: string) {
  await page.getByRole("button", { name: "记录本次谈话" }).first().click();
  await page.getByLabel("口述原始记录 *").fill(rawNotes);
  await page.getByLabel("学生主要表达").fill("学生说明了当前实际情况。");
  await page
    .getByLabel("班主任沟通与引导")
    .fill("围绕事实核对下一步安排，并说明可获得的支持。");
  await page.getByLabel("达成的共识 / 措施").fill("按约定推进并及时反馈。");
  await page.getByLabel("后续跟进事项").fill("按复查日期再次了解情况。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();
  await expect(page.getByRole("status")).toContainText("后续复查待办");
}

test("场景 1：优秀学生干部候选完成材料、提交、通过并回到学生详情", async ({
  page,
}) => {
  await openDemo(page);
  await page.getByRole("button", { name: "☆ 评奖评优" }).click();
  await page.getByText("＋ 建立评奖评优 / 奖助项目").click();
  await page.getByLabel("项目名称").fill("2026 年优秀学生干部验收项目");
  await page.getByLabel("类型").selectOption("优秀学生干部");
  await page.getByLabel("年度").fill("2026");
  await page.getByLabel("学期").fill("秋季学期");
  await page.getByLabel("截止时间").fill("2026-09-18");
  await page.getByLabel("所需材料").fill("申请表、成绩单、事迹材料");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.getByRole("status")).toContainText("项目已保存在本机");
  await page
    .getByLabel("当前项目")
    .selectOption({ label: "2026 年优秀学生干部验收项目" });
  await page.getByText("＋ 添加候选学生").click();
  await page
    .locator(".candidate-form select[name='studentId']")
    .selectOption({ label: "林知禾 · 20260001" });
  await page.getByRole("button", { name: "加入候选" }).click();

  const card = page.locator(".award-card", {
    hasText: "2026 年优秀学生干部验收项目",
  });
  await expect(card).toBeVisible();
  await card.getByLabel("申请表").check();
  await card.getByLabel("成绩单").check();
  await card.getByLabel("事迹材料").check();
  await expect(card).toContainText("材料齐全");
  await card.getByLabel("状态").selectOption("已提交");
  await card.getByLabel("状态").selectOption("通过");
  await card.getByText("结果与备注").click();
  await card.getByLabel("最终结果").fill("虚构评审通过");
  await card.getByLabel("最终结果").blur();
  await card.getByRole("button", { name: "AI 推荐意见" }).click();
  const awardGateway = page.getByRole("dialog", {
    name: "AI Privacy Gateway",
  });
  await expect(awardGateway).toBeVisible();
  await expect(
    awardGateway.locator(".comparison article").nth(1),
  ).not.toContainText("林知禾");
  await awardGateway.getByRole("button", { name: "关闭" }).click();
  await card.getByRole("button", { name: /林知禾/ }).click();
  await expect(page.getByText(/优秀学生干部验收项目 · 通过/)).toBeVisible();
  await expect(page.getByText(/虚构评审通过/)).toBeVisible();
});

test("场景 2：专升本未制定计划学生建立计划、谈话与两周跟进", async ({
  page,
}) => {
  await openDemo(page);
  await page.getByRole("button", { name: /升学就业/ }).click();
  await page
    .locator(".filter-pills")
    .getByRole("button", { name: "专升本未制定计划" })
    .click();
  const row = page.locator(".career-table tbody tr", { hasText: "林知禾" });
  await row.getByRole("button", { name: "打开档案 →" }).click();
  await page.getByLabel("目标院校").fill("虚构应用技术学院");
  await page.getByLabel("计划状态").selectOption("已制定");
  await page.getByRole("button", { name: "保存档案" }).click();
  await expect(page.getByRole("status")).toContainText("档案已保存在本机");
  await page.getByRole("button", { name: "创建两周后跟进" }).click();
  await expect(page.getByRole("status")).toContainText("跟进待办已创建");
  await page.getByRole("button", { name: "发起专升本谈话" }).click();
  await expect(page.getByRole("dialog", { name: /记录谈话/ })).toBeVisible();
  await page
    .getByLabel("口述原始记录 *")
    .fill("已共同核对目标院校、复习安排和两周后的复盘节点。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();
  await page.getByRole("button", { name: /首页/ }).click();
  await expect(page.getByText("两周后复盘专升本计划")).toBeVisible();
});

test("场景 3：没有简历的就业学生完成谈话、简历任务和进度更新", async ({
  page,
}) => {
  await openDemo(page);
  await page.getByRole("button", { name: /升学就业/ }).click();
  await page
    .locator(".filter-pills")
    .getByRole("button", { name: "没有简历" })
    .click();
  const row = page.locator(".career-table tbody tr", { hasText: "陈晨" });
  await row.getByRole("button", { name: "打开档案 →" }).click();
  await page.getByRole("button", { name: "创建两周后跟进" }).click();
  await page.getByRole("button", { name: "发起就业谈话" }).click();
  await page
    .getByLabel("口述原始记录 *")
    .fill("已讨论求职方向、简历准备和本周投递安排。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();

  await page.getByRole("button", { name: /升学就业/ }).click();
  const updatedRow = page.locator(".career-table tbody tr", {
    hasText: "陈晨",
  });
  await updatedRow.getByRole("button", { name: "打开档案 →" }).click();
  await page.getByLabel("简历状态").selectOption("已完成");
  await page.getByLabel("已投递数量").fill("6");
  await page.getByLabel("面试次数").fill("2");
  await page.getByLabel("offer 数量").fill("1");
  await page.getByLabel("当前状态").fill("已有 offer，待核实签约条件");
  await page.getByRole("button", { name: "保存档案" }).click();
  await page.getByRole("button", { name: /AI 辅助简历/ }).click();
  await expect(
    page.getByRole("dialog", { name: "AI Privacy Gateway" }),
  ).toBeVisible();
  await expect(
    page.locator(".privacy-gateway .comparison article").nth(1),
  ).not.toContainText("陈晨");
  await page
    .getByRole("dialog", { name: "AI Privacy Gateway" })
    .getByRole("button", { name: "关闭" })
    .click();
  await page
    .getByRole("dialog", { name: "陈晨升学就业档案" })
    .getByRole("button", { name: "关闭", exact: true })
    .last()
    .click();
  const finalRow = page.locator(".career-table tbody tr", { hasText: "陈晨" });
  await expect(finalRow).toContainText("已完成");
  await expect(finalRow).toContainText("6");
  await expect(finalRow).toContainText("2");
  await expect(finalRow).toContainText("1");
});

test("场景 4：个人默认模板成文并通过 Privacy Gateway 恢复身份", async ({
  page,
}) => {
  await openDemo(page);
  // 只点左侧导航；首页「发起谈心谈话」快速入口也含这四个字，用 /.v2-nav 收敛。
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  await page.getByRole("button", { name: "新建" }).click();
  await page.getByLabel("模板名称").fill("我的自然谈话记录");
  await page.getByLabel("适用场景").fill("情感问题");
  await page.getByLabel("常用开头").fill("我与学生围绕近期状态进行了沟通。");
  await page.getByLabel("常用结尾").fill("后续将按约定节点继续关注。");
  await page.getByLabel("写作规则").fill("避免公文套话，保留学生表达。");
  await page.getByRole("button", { name: "保存模板" }).click();
  const template = page.locator(".template-cards article", {
    hasText: "我的自然谈话记录",
  });
  await template.getByRole("button", { name: "设为默认" }).click();

  await registerEvent(
    page,
    "情感问题",
    "近期情感关系发生变化，饮食和学习状态受到影响。",
  );
  // demo 预置了已安排谈话的事件，最新登记的排在最前，取第一个
  await page.getByRole("button", { name: "记录本次谈话" }).first().click();
  await page
    .getByLabel("口述原始记录 *")
    .fill(
      "林知禾最近分手，吃不下饭，成绩下降。我建议多出去走走，多和朋友交流，有问题继续沟通。",
    );
  await page
    .getByLabel("学生主要表达")
    .fill("近期饮食和学习状态受到影响，希望逐步恢复日常节奏。");
  await page
    .getByLabel("班主任沟通与引导")
    .fill("建议保持日常活动、使用身边支持并在需要时继续沟通。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();

  // 首页快速入口「发起谈心谈话」也含这几个字，统一用 .v2-nav 收敛到左侧导航
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  const record = page.locator(".conversation-grid article").first();
  await record.getByText("查看标准记录").click();
  await expect(record).toContainText("我与学生围绕近期状态进行了沟通");
  await expect(record).toContainText("后续将按约定节点继续关注");
  await record.getByRole("button", { name: /林知禾/ }).click();
  await page.getByRole("button", { name: "AI 帮我成文" }).click();
  const gateway = page.getByRole("dialog", { name: "AI Privacy Gateway" });
  await expect(gateway).toBeVisible();
  await expect(gateway.locator(".comparison article").nth(1)).not.toContainText(
    "林知禾",
  );
  await page
    .getByRole("checkbox", { name: /我已核对 AI 实际看到的内容/ })
    .check();
  await page.getByRole("button", { name: "确认 AI payload" }).click();
  await page
    .getByLabel("粘贴 AI 返回")
    .fill("S001 已说明近期状态，并与班主任约定后续继续沟通。");
  await expect(page.getByLabel("本地恢复结果")).toHaveValue(/林知禾/);
  await page
    .getByRole("checkbox", { name: /我已人工审核恢复后的文字/ })
    .check();
  await page.getByRole("button", { name: "保存审核结果" }).click();
  await expect(page.getByRole("status")).toContainText("人工审核后保存");
});

test("场景 5：已有缺勤事件、谈话与复查可直接复用为材料", async ({ page }) => {
  await openDemo(page);
  await registerEvent(page, "缺勤", "虚构课程第一、二节未到，原因待核实。");
  await completeTalk(page, "学生说明当天身体不适，已补看课程资料。");
  await page
    .locator(".task-row", { hasText: "复查“缺勤”后续情况" })
    .getByRole("button", { name: "完成复查" })
    .click();
  await page.getByRole("button", { name: /材料输出/ }).click();
  await page.getByLabel("材料类型").selectOption("absence");
  await page
    .locator(".material-builder")
    .getByRole("combobox")
    .nth(1)
    .selectOption({ label: "林知禾 · 20260001" });
  await page.getByRole("button", { name: "生成材料" }).click();
  const preview = page.getByLabel("材料输出预览");
  await expect(preview).toHaveValue(/虚构课程第一、二节未到/);
  await expect(preview).toHaveValue(/学生说明了当前实际情况/);
  await expect(preview).toHaveValue(/已核实并完成/);
  await page.getByRole("button", { name: "AI 润色" }).click();
  const materialPolish = page.getByRole("dialog", { name: /AI 润色/ });
  await expect(materialPolish).toBeVisible();
  await materialPolish.locator("details.polish-privacy > summary").click();
  await expect(
    materialPolish.locator(".comparison article").nth(1),
  ).not.toContainText("林知禾");
  await materialPolish.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "保存到本地归档" }).click();
  await expect(page.getByRole("status")).toContainText("本地归档");
  await expect(page.getByText("1 份已保存材料")).toBeVisible();
});
