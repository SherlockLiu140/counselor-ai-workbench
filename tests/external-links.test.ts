import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDENT_SYSTEM_URL,
  getStudentSystemUrl,
  normalizeStudentSystemUrl,
  saveStudentSystemUrl,
  shortStudentSystemUrl,
} from "../src/v2/externalLinks";

describe("学工系统链接", () => {
  it("空值表示「还没设置」，不是错误", () => {
    expect(normalizeStudentSystemUrl("")).toBe("");
    expect(normalizeStudentSystemUrl("   ")).toBe("");
  });

  it("缺协议时补 https，给的地址照原样保留", () => {
    expect(normalizeStudentSystemUrl("xg.zjnu.edu.cn")).toBe(
      "https://xg.zjnu.edu.cn/",
    );
    expect(normalizeStudentSystemUrl("  https://xg.zjnu.edu.cn/login?a=1  ")).toBe(
      "https://xg.zjnu.edu.cn/login?a=1",
    );
    expect(normalizeStudentSystemUrl("http://10.0.0.8:8080/xg")).toBe(
      "http://10.0.0.8:8080/xg",
    );
  });

  it("只允许 http / https，其它协议一律拒绝", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "file:///etc/passwd",
    ])
      expect(() => normalizeStudentSystemUrl(input)).toThrow(/http \/ https/);
  });

  it("地址不合法时给出可读的提示，而不是直接崩", () => {
    expect(() => normalizeStudentSystemUrl("http://")).toThrow(/无法识别/);
  });

  it("侧边栏展示去掉协议与结尾斜杠", () => {
    expect(shortStudentSystemUrl("https://xg.zjnu.edu.cn/")).toBe("xg.zjnu.edu.cn");
    expect(shortStudentSystemUrl("http://10.0.0.8:8080/xg")).toBe("10.0.0.8:8080/xg");
  });

  it("没有浏览器存储时降级：读默认值、写入不抛错", () => {
    // vitest 跑在 node 环境，这里等价于 localStorage 不可用
    expect(getStudentSystemUrl()).toBe(DEFAULT_STUDENT_SYSTEM_URL);
    expect(() => saveStudentSystemUrl("https://xg.zjnu.edu.cn")).not.toThrow();
    expect(getStudentSystemUrl()).toBe("https://xg.zjnu.edu.cn/");
    expect(saveStudentSystemUrl("")).toBe("");
  });
});
