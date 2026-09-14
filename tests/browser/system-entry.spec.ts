import { expect, test } from "@playwright/test";

/**
 * 两处「方便班主任去学工系统办事」的入口，都只在本机完成：
 * 链接存在 localStorage，模板在浏览器里直接生成。
 */

test("花名册导入区能下载模板，表头就是系统字段名", async ({ page }) => {
  await page.goto("/workbench?mode=session");
  await page.getByRole("button", { name: /我的班级/ }).click();

  const panel = page.locator(".panel", { hasText: "本地花名册" });
  await expect(
    panel.getByText("模板表头就是系统字段名", { exact: false }),
  ).toBeVisible();

  const xlsxDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "下载导入模板（XLSX）" }).click();
  expect((await xlsxDownload).suggestedFilename()).toBe(
    "班主任工作台-花名册模板.xlsx",
  );

  const csvDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "下载 CSV 模板" }).click();
  expect((await csvDownload).suggestedFilename()).toBe(
    "班主任工作台-花名册模板.csv",
  );
});

test("学工系统链接可设置、可修改，刷新后仍在（只存本机）", async ({ page }) => {
  await page.goto("/workbench?mode=session");

  const entry = page.locator(".v2-external");
  await expect(entry.getByRole("button", { name: "＋ 设置学工系统链接" })).toBeVisible();
  await entry.getByRole("button", { name: "＋ 设置学工系统链接" }).click();
  await entry.getByLabel("学工系统网址").fill("xg.zjnu.edu.cn");
  await entry.getByRole("button", { name: "保存" }).click();

  const link = entry.locator(".v2-external-link");
  await expect(link).toHaveAttribute("href", "https://xg.zjnu.edu.cn/");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(entry.locator(".v2-external-host")).toHaveText("xg.zjnu.edu.cn");

  // 刷新后还在：说明只落在本机，没有走服务端
  await page.reload();
  await expect(page.locator(".v2-external-link")).toHaveAttribute(
    "href",
    "https://xg.zjnu.edu.cn/",
  );

  // 可以改，也可以清除
  await page.getByRole("button", { name: "修改链接" }).click();
  await expect(page.getByLabel("学工系统网址")).toHaveValue(
    "https://xg.zjnu.edu.cn/",
  );
  await page.getByRole("button", { name: "清除" }).click();
  await expect(
    page.locator(".v2-external").getByRole("button", { name: "＋ 设置学工系统链接" }),
  ).toBeVisible();
});

test("非法地址不允许保存，也打不开", async ({ page }) => {
  await page.goto("/workbench?mode=session");
  const entry = page.locator(".v2-external");
  await entry.getByRole("button", { name: "＋ 设置学工系统链接" }).click();
  await entry.getByLabel("学工系统网址").fill("javascript:alert(1)");
  await entry.getByRole("button", { name: "保存" }).click();

  await expect(entry.locator(".v2-external-error")).toContainText("http / https");
  await expect(entry.locator(".v2-external-link")).toHaveCount(0);
});

test("谈话记录复制之后才出现「去学工系统粘贴」入口", async ({ page }) => {
  // 无头浏览器不给剪贴板权限（WebKit 下 navigator.clipboard 会直接 reject），
  // 这条用例要锁的是「复制成功后才露出入口」，所以把剪贴板固定成成功。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await page.goto("/workbench?mode=demo");
  await page.evaluate(() =>
    window.localStorage.setItem(
      "counselor-student-system-url",
      "https://xg.zjnu.edu.cn/",
    ),
  );
  await page.reload();
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).click();

  const record = page.locator(".conversation-grid > *").first();
  await expect(record.getByRole("link", { name: /去学工系统粘贴/ })).toHaveCount(0);
  await record.getByRole("button", { name: "复制学工系统版本" }).click();
  await expect(record.getByRole("button", { name: "已复制学工系统版本" })).toBeVisible();
  await expect(record.getByRole("link", { name: /去学工系统粘贴/ })).toHaveAttribute(
    "href",
    "https://xg.zjnu.edu.cn/",
  );
});

test("剪贴板不可用时给提示，而不是点了毫无反应", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    // 降级路径也一起失败，才能走到提示分支
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });
  await page.goto("/workbench?mode=demo");
  await page.evaluate(() =>
    window.localStorage.setItem(
      "counselor-student-system-url",
      "https://xg.zjnu.edu.cn/",
    ),
  );
  await page.reload();
  await page.locator(".v2-nav", { hasText: "谈心谈话" }).click();

  const record = page.locator(".conversation-grid > *").first();
  await record.getByRole("button", { name: "复制学工系统版本" }).click();
  await expect(page.getByRole("alert")).toContainText("复制失败");
  await expect(record.getByRole("link", { name: /去学工系统粘贴/ })).toHaveCount(0);
});
