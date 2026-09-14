import { expect, test } from "@playwright/test";

test("100-person class and absence workflow closes locally", async ({
  page,
}) => {
  const requests: Array<{ url: string; method: string }> = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /我的班级/ }).click();
  await expect(page.getByText("当前显示 50 / 100 名学生")).toBeVisible();
  await page.getByPlaceholder("姓名 / 学号 / 手机号").fill("林知禾");
  await expect(page.locator(".v2-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "打开工作台 →" }).click();
  await expect(page.getByRole("heading", { name: "林知禾" })).toBeVisible();
  await expect(page.getByText("仅本地敏感信息")).toBeVisible();

  await page.getByRole("button", { name: "登记事件" }).click();
  await page.getByLabel("事件类型 *").selectOption("缺勤");
  await page
    .getByLabel("事实描述 *")
    .fill("学习委员反馈：今天第一、二节虚构课程未到，原因待核实。");
  await page.getByRole("button", { name: "保存并生成待办" }).click();
  await expect(page.getByRole("status")).toContainText("关联待办已自动生成");
  // 演示空间已预置多条事件，进度条取最新登记的一条
  await expect(page.locator(".event-progress").first()).toContainText("登记");
  await expect(page.locator(".event-progress").first()).toContainText("待谈话");

  await page.getByRole("button", { name: /待办/ }).click();
  await page
    .locator(".task-row", { hasText: "就“缺勤”与学生谈话" })
    .getByRole("button", { name: "开始谈话" })
    .click();
  await page
    .getByLabel("口述原始记录 *")
    .fill("学生说明早晨临时身体不适，已补看课程资料。");
  await page
    .getByLabel("学生主要表达")
    .fill("说明当天缺勤原因，并愿意提前联系请假。");
  await page
    .getByLabel("班主任沟通与引导")
    .fill("核对请假流程和课程补学安排。");
  await page.getByLabel("达成的共识 / 措施").fill("按流程请假并补齐课程内容。");
  await page.getByLabel("后续跟进事项").fill("一周后复查考勤记录。");
  await page.getByLabel("复查日期").fill("2026-09-17");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();
  await expect(page.getByRole("status")).toContainText("后续复查待办");
  await page
    .locator(".task-row", { hasText: "复查“缺勤”后续情况" })
    .getByRole("button", { name: "完成复查" })
    .click();
  await page.getByRole("button", { name: /事务/ }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "确认结案" }).click();
  await expect(page.getByRole("status")).toContainText("事件已结案");
  await expect(page.getByText("已结案", { exact: true }).first()).toBeVisible();

  // 事务里林知禾已有多条演示事件卡，任一入口都打开同一学生工作台
  await page.getByRole("button", { name: "林知禾 →" }).first().click();
  await page.getByRole("button", { name: "AI 帮我成文" }).click();
  await expect(
    page.getByRole("dialog", { name: "AI Privacy Gateway" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "宗教、性取向、身份证、联系方式和完整敏感档案未进入本次材料。",
    ),
  ).toBeVisible();
  await expect(page.locator(".privacy-gateway .comparison")).not.toContainText(
    "13900000001",
  );
  await page
    .getByRole("checkbox", { name: /我已核对 AI 实际看到的内容/ })
    .check();
  await page.getByRole("button", { name: "确认 AI payload" }).click();
  await page
    .getByLabel("粘贴 AI 返回")
    .fill("S001 已说明缺勤情况，并约定一周后复查。");
  await expect(page.getByLabel("本地恢复结果")).toHaveValue(/林知禾/);
  await page
    .getByRole("checkbox", { name: /我已人工审核恢复后的文字/ })
    .check();
  await page.getByRole("button", { name: "保存审核结果" }).click();
  await expect(page.getByRole("status")).toContainText("本机恢复身份");

  expect(consoleErrors).toEqual([]);
  expect(requests.some((request) => request.method !== "GET")).toBe(false);
  expect(
    requests.every((request) => new URL(request.url).hostname === "127.0.0.1"),
  ).toBe(true);
});
