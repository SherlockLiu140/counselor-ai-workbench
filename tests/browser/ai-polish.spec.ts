import { expect, test, type Page } from "@playwright/test";

/**
 * 「AI 润色」弹窗 —— 谈话记录与材料唯一的 AI 入口。
 *
 * 回护四件事：
 * 1. 谈话记录 / 材料输出都进入同一个弹窗，不再有两套并行入口；
 * 2. 只打开弹窗不联网，只有点「一键润色」才发请求；
 * 3. AI 只收到去标识化 payload，真实姓名从不外发；
 * 4. 返回内容在本机恢复真实姓名，可编辑并贴回谈话记录。
 */

const FAKE_SETTINGS = {
  activeProvider: "deepseek",
  providers: {
    deepseek: { apiKey: "sk-fake-for-test", model: "deepseek-v4-flash" },
  },
};

async function openDemo(page: Page, withKey = false) {
  if (withKey)
    await page.addInitScript((settings) => {
      window.localStorage.setItem(
        "counselor-ai-providers",
        JSON.stringify(settings),
      );
    }, FAKE_SETTINGS);
  await page.goto("/workbench?mode=demo");
  await expect(
    page.getByText("100 名学生", { exact: false }).first(),
  ).toBeVisible();
}

async function openPolishFromTalks(page: Page) {
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).first().click();
  const card = page.locator(".talk-ledger .conversation-grid article").first();
  await card.getByRole("button", { name: "AI 润色" }).click();
}

/** 记录所有非本机请求，用于证明「不联网」。 */
function watchExternal(page: Page) {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1")
      external.push(request.url());
  });
  return external;
}

test("谈话记录可打开 AI 润色弹窗，配置项齐全", async ({ page }) => {
  await openDemo(page);
  await openPolishFromTalks(page);

  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("选择 AI 服务商")).toBeVisible();
  await expect(dialog.getByLabel("选择模型")).toBeVisible();
  await expect(dialog.getByLabel("选择谈话模板")).toBeVisible();
  // 自动带入：标题下写明是哪位学生、什么场景
  await expect(dialog.locator(".section-title p")).toContainText("·");
});

test("未配置服务商时只提示去配置，不发起任何请求", async ({ page }) => {
  const external = watchExternal(page);
  await openDemo(page);
  await openPolishFromTalks(page);

  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await expect(dialog.getByText("还没有可用的 AI 服务商")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /去配置 AI 服务商/ }),
  ).toBeVisible();
  expect(external).toEqual([]);
});

test("只打开弹窗不联网，脱敏全程在本机完成", async ({ page }) => {
  const external = watchExternal(page);
  await openDemo(page, true);
  await openPolishFromTalks(page);

  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await expect(dialog).toBeVisible();
  await dialog.locator("details.polish-privacy > summary").click();
  await expect(
    dialog.getByRole("heading", { name: "本地原文", exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "AI 实际看到的内容" }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  expect(external).toEqual([]);
});

test("一键润色：AI 只收到去标识化内容，返回后在本机恢复真实姓名", async ({
  page,
}) => {
  await openDemo(page, true);
  let sentBody = "";
  await page.route("**/chat/completions", async (route) => {
    sentBody = route.request().postData() ?? "";
    const parsed = JSON.parse(sentBody) as {
      messages: Array<{ content: string }>;
    };
    // 用模型实际收到的 S 代号回一句，验证本地恢复确实发生
    const code = /S\d+/.exec(parsed.messages[0].content)?.[0] ?? "S001";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content:
                "近期该生出现多次迟到情况，因此与其就近期考勤及作息情况进行了沟通。\n\n" +
                "谈话中提醒其减少晚间不必要的手机使用，逐步把作息调整回较为规律的状态。\n\n" +
                `后续将继续关注 ${code} 的到课与迟到情况。`,
            },
          },
        ],
      }),
    });
  });

  await openPolishFromTalks(page);
  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await dialog.getByRole("button", { name: "一键润色" }).click();

  const result = dialog.getByLabel("润色结果");
  await expect(result).toBeVisible({ timeout: 10000 });
  const shown = await result.inputValue();

  // 关键安全断言：发出去的 body 不含真实姓名，只含 S 代号
  expect(sentBody).not.toContain("林知禾");
  expect(sentBody).toMatch(/S\d+/);
  // 分层 Prompt 的长度锚点与最终输出指令在位
  expect(sentBody).toContain("现在请直接输出最终谈心谈话记录正文");
  expect(sentBody).toContain("不要把内容压缩成摘要");
  expect(sentBody).toContain("目标长度约");
  expect(sentBody).toContain('"max_tokens":2048');
  // 本地恢复：界面展示的文本里不能再有代号
  expect(shown).not.toMatch(/S\d+/);
});

test("润色结果可编辑并贴回谈话记录（同步归档）", async ({ page }) => {
  await openDemo(page, true);
  await page.route("**/chat/completions", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "AI 润色后的正式记录正文。" } }],
      }),
    }),
  );

  await openPolishFromTalks(page);
  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await dialog.getByRole("button", { name: "一键润色" }).click();

  const result = dialog.getByLabel("润色结果");
  await expect(result).toBeVisible({ timeout: 10000 });
  await result.fill("【人工确认】经润色后的正式谈话记录。");
  await dialog.getByRole("button", { name: "贴回谈话记录" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".v2-nav", { hasText: "材料输出" }).first().click();
  await expect(page.locator(".archive-list")).toContainText(
    "经润色后的正式谈话记录",
  );
});

test("微调按钮复用同一份脱敏 payload，不重新发送真实身份", async ({
  page,
}) => {
  await openDemo(page, true);
  const bodies: string[] = [];
  await page.route("**/chat/completions", async (route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: "润色结果。" } }],
      }),
    });
  });

  await openPolishFromTalks(page);
  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await dialog.getByRole("button", { name: "一键润色" }).click();
  await expect(dialog.getByLabel("润色结果")).toBeVisible({ timeout: 10000 });

  await dialog.getByRole("button", { name: "更简洁" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).not.toContain("林知禾");
  expect(bodies[1]).toContain("进一步调整要求");
});

test("材料输出页用同一个润色弹窗", async ({ page }) => {
  await openDemo(page);
  await page.locator(".v2-nav", { hasText: "材料输出" }).first().click();
  await page.getByLabel("材料类型").selectOption("conversation");
  await page.getByRole("button", { name: "生成材料" }).click();
  await page.getByLabel("材料输出预览").waitFor();
  await page.getByRole("button", { name: "AI 润色" }).click();
  await expect(page.getByRole("dialog", { name: /AI 润色/ })).toBeVisible();
});

/* ---------------------------------------------------------------- */
/* 「返回内容为空」这一类失败的界面表现                                */
/* ---------------------------------------------------------------- */

test("首次返回被输出上限截断时自动加大上限重试，并如实说明", async ({ page }) => {
  await openDemo(page, true);
  const bodies: string[] = [];
  await page.route("**/chat/completions", async (route) => {
    bodies.push(route.request().postData() ?? "");
    const first = bodies.length === 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        first
          ? { choices: [{ finish_reason: "length", message: { content: "" } }] }
          : { choices: [{ message: { content: "重试后拿到的正式记录正文。" } }] },
      ),
    });
  });

  await openPolishFromTalks(page);
  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await dialog.getByRole("button", { name: "一键润色" }).click();

  await expect(dialog.getByLabel("润色结果")).toBeVisible({ timeout: 10000 });
  await expect(dialog.getByLabel("润色结果")).toHaveValue(/重试后拿到的正式记录正文/);
  // 产生过两次外部请求，界面必须让老师知道，而不是静默重试
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toContain('"max_tokens":8192');
  await expect(dialog.getByRole("status")).toContainText("已自动把输出上限");
});

test("两次都返回空时，弹窗给出带 finish_reason 的排查线索", async ({ page }) => {
  await openDemo(page, true);
  await page.route("**/chat/completions", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "" } }],
        usage: { prompt_tokens: 1200, completion_tokens: 2048 },
      }),
    }),
  );

  await openPolishFromTalks(page);
  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await dialog.getByRole("button", { name: "一键润色" }).click();

  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 10000 });
  await expect(alert).toContainText("finish_reason=length");
  await expect(alert).toContainText("max_tokens=8192");
  // 不能只说「为空」，要告诉老师下一步怎么办
  await expect(alert).toContainText("非思考模型");
});

test("模型 ID 不在预设列表时先给出提醒", async ({ page }) => {
  // 截图里出现过的场景：本地保存的是预设之外的手填模型 ID
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "counselor-ai-providers",
      JSON.stringify({
        activeProvider: "deepseek",
        providers: {
          deepseek: { apiKey: "sk-fake-for-test", model: "deepseek-flash" },
        },
      }),
    ),
  );
  await openDemo(page);
  await openPolishFromTalks(page);

  const dialog = page.getByRole("dialog", { name: "AI 润色谈话记录" });
  await expect(dialog.getByText(/不在预设列表中/)).toBeVisible();
  await expect(dialog.getByText(/拉取模型列表/)).toBeVisible();
});
