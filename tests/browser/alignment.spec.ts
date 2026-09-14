import { expect, test } from "@playwright/test";

/**
 * 顶栏里的两个动作元素一个是 <button>、一个是 <a class="button">。
 * 之前只有 `.v2-top-actions button` 设了字号与内边距，链接没被命中，
 * 结果两颗按钮一高一矮、上下边都对不齐。这条用例锁住它们必须同尺寸。
 */
test("顶栏两个动作按钮尺寸一致且上下对齐", async ({ page }) => {
  await page.setViewportSize({ width: 1469, height: 900 });
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".v2-kpis").first()).toBeVisible();

  const boxes = await page.locator(".v2-top-actions > *").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    }),
  );

  expect(boxes).toHaveLength(2);
  expect(boxes.map((b) => b.tag).sort()).toEqual(["a", "button"]);
  expect(boxes[0].h).toBe(boxes[1].h);
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0].bottom - boxes[1].bottom)).toBeLessThanOrEqual(1);
});

/**
 * 顶栏原本 padding 左右 32px，正文 .v2-main 是 36px，
 * 于是顶栏标题与右侧按钮会比下方卡片网格左右各外扩 4px。
 */
test("顶栏内容与正文卡片网格左右对齐", async ({ page }) => {
  await page.setViewportSize({ width: 1469, height: 900 });
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".v2-kpis").first()).toBeVisible();

  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return {
      titleLeft: r(".v2-topbar > div:first-child").left,
      actionsRight: r(".v2-top-actions").right,
      mainLeft: r(".v2-kpis").left,
      mainRight: r(".v2-kpis").right,
    };
  });

  expect(Math.abs(m.titleLeft - m.mainLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.actionsRight - m.mainRight)).toBeLessThanOrEqual(1);
});

/**
 * 两处容易悄悄回归的细节：
 * 1) 特殊关爱卡片的顶部强调条曾用 border-top:3px 实现，会把这一行撑高 2px；
 * 2) 下方两列图表面板与 KPI 四列网格的列边界必须落在同一根线上。
 */
test("KPI 卡片行高统一且与下方图表面板同列对齐", async ({ page }) => {
  await page.setViewportSize({ width: 1469, height: 900 });
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".v2-kpis").first()).toBeVisible();

  const m = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        h: Math.round(r.height),
        right: Math.round(r.right),
      };
    };
    return {
      kpis: [...document.querySelectorAll(".v2-kpis > *")].map(box),
      panels: [...document.querySelectorAll(".v2-dashboard-grid > *")].map(box),
    };
  });

  // 同一网格内所有卡片同高（强调条不得参与盒模型）
  expect([...new Set(m.kpis.map((k) => k.h))]).toHaveLength(1);

  // 强调条改由 inset 阴影承担，颜色信号不能丢
  const careShadow = await page
    .locator(".care-kpi")
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(careShadow).toContain("inset");

  // 图表面板的左右边界与 KPI 第 2 / 第 3 列边界重合
  expect(Math.abs(m.panels[0].right - m.kpis[1].right)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.panels[1].x - m.kpis[2].x)).toBeLessThanOrEqual(1);
});

/**
 * 今日看板原本用「左列固定 296px + 18px 间距」，而下方 KPI 网格是四等分 + 14px，
 * 两块叠在一起时竖向接缝错开约 25px（待办清单的左边缘比 KPI 第二列偏右）。
 * 这条用例锁住两块网格必须共用同一套轨道定义。
 */
test("今日看板与 KPI 网格的竖向接缝对齐", async ({ page }) => {
  await page.setViewportSize({ width: 1450, height: 900 });
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".v2-kpis").first()).toBeVisible();

  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return {
      railRight: r(".today-rail").right,
      listLeft: r(".today-list").left,
      kpi1Right: r(".v2-kpis > *:nth-child(1)").right,
      kpi2Left: r(".v2-kpis > *:nth-child(2)").left,
    };
  });

  // 看板左列右边缘 == KPI 第一列右边缘
  expect(Math.abs(m.railRight - m.kpi1Right)).toBeLessThanOrEqual(1);
  // 待办清单左边缘 == KPI 第二列左边缘
  expect(Math.abs(m.listLeft - m.kpi2Left)).toBeLessThanOrEqual(1);
});

/**
 * 看板左列从固定 296px 改成「四等分中的一轨」后会随视口收窄，
 * 该档位下时钟 46px 大字号曾把卡片撑破（内部横向溢出 32px）。
 */
test("看板左列收窄后时钟与周条不溢出", async ({ page }) => {
  await page.setViewportSize({ width: 1101, height: 900 });
  await page.goto("/workbench?mode=demo");
  await expect(page.locator(".today-clock").first()).toBeVisible();

  const o = await page.evaluate(() => {
    const over = (s: string) => {
      const el = document.querySelector(s);
      return el ? el.scrollWidth - el.clientWidth : 0;
    };
    return {
      clock: over(".today-clock-time"),
      week: over(".today-week"),
      rail: over(".today-rail"),
    };
  });

  expect(o.clock).toBeLessThanOrEqual(0);
  expect(o.week).toBeLessThanOrEqual(0);
  expect(o.rail).toBeLessThanOrEqual(0);
});
