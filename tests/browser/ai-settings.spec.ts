import { expect, test, type Page } from "@playwright/test";
import {
  AI_SETTINGS_STORAGE_KEY,
  PROVIDERS,
  isOriginAllowedByCsp,
} from "../../src/v2/providers";

async function openDemo(page: Page) {
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

async function seedProvider(page: Page, providerId: string, model: string) {
  const value = JSON.stringify({
    activeProvider: providerId,
    providers: { [providerId]: { apiKey: "sk-demo-not-a-real-key", model } },
  });
  await page.addInitScript(
    (payload: { key: string; value: string }) => {
      window.localStorage.setItem(payload.key, payload.value);
    },
    { key: AI_SETTINGS_STORAGE_KEY, value },
  );
}

async function openGateway(page: Page) {
  await page.getByRole("button", { name: "＋ 登记一件事" }).first().click();
  await page
    .getByLabel("学生 *")
    .selectOption({ label: "林知禾 · 20260001" });
  await page.getByLabel("事件类型 *").selectOption("缺勤");
  await page.getByLabel("事实描述 *").fill("虚构课程第一、二节未到，原因待核实。");
  await page.getByRole("button", { name: "保存并生成待办" }).click();
  await expect(page.getByRole("status")).toContainText("关联待办已自动生成");

  await page.getByRole("button", { name: "记录本次谈话" }).first().click();
  await page
    .getByLabel("口述原始记录 *")
    .fill("学生说明当天身体不适，已补看课程资料。");
  await page
    .getByLabel("学生主要表达")
    .fill("学生说明了当前实际情况。");
  await page
    .getByLabel("班主任沟通与引导")
    .fill("围绕事实核对下一步安排，并说明可获得的支持。");
  await page.getByLabel("达成的共识 / 措施").fill("按约定推进并及时反馈。");
  await page.getByLabel("后续跟进事项").fill("按复查日期再次了解情况。");
  await page.getByRole("button", { name: "保存谈话并生成复查待办" }).click();
  await expect(page.getByRole("status")).toContainText("后续复查待办");

  await page.locator(".v2-nav", { hasText: "谈心谈话" }).click();
  const record = page.locator(".conversation-grid article").first();
  await record.getByText("查看标准记录").click();
  await record.getByRole("button", { name: /林知禾/ }).click();
  await page.getByRole("button", { name: "AI 帮我成文" }).click();
  await expect(
    page.getByRole("dialog", { name: "AI Privacy Gateway" }),
  ).toBeVisible();
}

async function confirmPayload(page: Page) {
  await page
    .getByRole("checkbox", { name: /我已核对 AI 实际看到的内容/ })
    .check();
  await page.getByRole("button", { name: "确认 AI payload" }).click();
  await expect(page.locator(".gateway-return")).toBeVisible();
}

test("AI 设置页以单一服务商选择器展示，并预选好默认模型", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "AI 设置" }).click();
  await expect(page.getByRole("heading", { name: "AI 设置" })).toBeVisible();

  // 单一服务商下拉，含六家
  const providerSelect = page.getByLabel("服务商");
  await expect(providerSelect).toBeVisible();
  await expect(providerSelect.locator("option")).toHaveCount(6);
  await expect(providerSelect).toHaveValue("deepseek");

  // 模型下拉预选第一个模型
  await expect(page.getByLabel("模型")).toHaveValue("deepseek-v4-flash");

  // 接口地址只读展示
  await expect(page.getByText("https://api.deepseek.com/v1")).toBeVisible();
});

test("切换服务商会带出对应预设地址与默认模型，含免费 Agens", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "AI 设置" }).click();

  const providerSelect = page.getByLabel("服务商");
  await providerSelect.selectOption("agnes");

  await expect(page.getByText("https://apihub.agnes-ai.com/v1")).toBeVisible();
  await expect(page.getByLabel("模型")).toHaveValue("agnes-2.5-pro-beta");
});

test("模型可先从下拉选择，也可切换为自定义手填", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "AI 设置" }).click();

  // 先切到智谱 GLM，再从其下拉里选模型
  await page.getByLabel("服务商").selectOption("glm");
  await expect(page.getByLabel("模型")).toHaveValue("glm-5.1");
  await page.getByLabel("模型").selectOption("glm-4-flash");
  await expect(page.getByLabel("模型")).toHaveValue("glm-4-flash");

  // 切到自定义手填
  await page.getByLabel("模型").selectOption("__custom__");
  const customInput = page.getByPlaceholder("直接填写模型 ID");
  await expect(customInput).toBeVisible();
  await customInput.fill("my-custom-model-v9");
  await expect(customInput).toHaveValue("my-custom-model-v9");
});

test("填 Key 后点「测试连接」会发起请求并展示服务商回应", async ({ page }) => {
  // 拦截外网，模拟服务商返回一个确定的结果，避免依赖真实网络与真实 Key
  await page.route("**/models", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Authentication Fails, Your api key is invalid" },
      }),
    }),
  );

  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "AI 设置" }).click();

  await page.getByLabel("API Key").fill("sk-demo-not-a-real-key");
  await page.getByRole("button", { name: "测试连接" }).click();

  // 服务商回应了 401，界面应展示可读的错误反馈
  await expect(page.locator(".ai-feedback")).toBeVisible();
  await expect(page.locator(".ai-feedback")).toContainText("鉴权失败");
});

test("未配置服务商时，网关引导到 AI 设置", async ({ page }) => {
  await openDemo(page);
  await openGateway(page);
  await confirmPayload(page);

  const guide = page.getByRole("button", { name: "配置 AI 服务商 →" });
  await expect(guide).toBeVisible();
  await guide.click();
  await expect(page.getByRole("heading", { name: "AI 设置" })).toBeVisible();
});

test("配置服务商后网关出现直接调用，且发送的仍只是去标识化内容", async ({
  page,
}) => {
  await seedProvider(page, "deepseek", "deepseek-v4-flash");
  await openDemo(page);
  await openGateway(page);

  // 关键：AI 实际看到的一栏里不允许出现真实姓名
  await expect(
    page.locator(".privacy-gateway .comparison article").nth(1),
  ).not.toContainText("林知禾");

  await confirmPayload(page);

  await expect(
    page.getByRole("button", { name: /直接调用 DeepSeek/ }),
  ).toBeVisible();
  await expect(page.locator(".gateway-ai-note")).toContainText(
    "deepseek-v4-flash",
  );
});

test("页面 CSP 已放行全部服务商，否则「测试连接」必然失败", async ({ page }) => {
  await openDemo(page);
  const csp =
    (await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content")) ?? "";

  expect(csp).toContain("connect-src");
  for (const preset of PROVIDERS) {
    const origin = new URL(preset.baseUrl).origin;
    expect(
      isOriginAllowedByCsp(csp, origin),
      `${preset.name} 的 ${origin} 未被 connect-src 放行，浏览器会直接掐断请求`,
    ).toBe(true);
  }
});
