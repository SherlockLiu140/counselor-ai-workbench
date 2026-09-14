import { describe, expect, it } from "vitest";
import { detect, markCustom, render } from "../src/engine/engine";
import {
  defaultOptions,
  type Context,
  type FieldType,
} from "../src/engine/types";
import {
  approvedText,
  changeReview,
  confirmReview,
  createReview,
  reviewRisks,
} from "../src/engine/review";
import { demoStudents, demoScenarios } from "../src/demo/data";
const codes = Object.fromEntries(
  demoStudents.map((s, i) => [s.id, `S${String(i + 1).padStart(3, "0")}`]),
);
const ctx = (text: string): Context => ({
  text,
  students: demoStudents,
  codes,
  options: defaultOptions,
  customRules: [],
});
describe("detector rules and boundaries", () => {
  it.each([
    ["13900009999", "phone"],
    ["+86 13900009999", "phone"],
    ["139-0000-9999", "phone"],
    ["139 0000 9999", "phone"],
    ["（13900009999）", "phone"],
    ["11010120000101001X", "identity"],
    ["11010120000101001x", "identity"],
    ["110101200001010010", "identity"],
    ["teacher@example.invalid", "email"],
    ["abc.def+tag@example.invalid", "email"],
    ["陈晨", "name"],
    ["20260003", "studentId"],
    ["学号：AB202699", "studentId"],
    ["12345678", "studentId"],
    ["微信号：demo_teacher", "contact"],
    ["QQ：123456789", "contact"],
    ["宿舍：2栋308室", "dorm"],
    ["2栋308室", "dorm"],
    ["地址：示例市虚构路18号", "address"],
    ["浙江省绍兴市虚构区示例路18号", "address"],
    ["2026年3月15日", "date"],
    ["2026-03-15", "date"],
    ["出生日期：2006年3月15日", "birth"],
    ["确诊为焦虑症", "medical"],
    ["父亲近期失业", "family"],
  ] as [string, FieldType][])("%s detects %s", (text, type) =>
    expect(detect(ctx(text)).some((f) => f.type === type)).toBe(true),
  );
  it.each([
    "12900009999",
    "1390000999",
    "213900009999",
    "139000099990",
    "x13900009999",
    "13900009999x",
  ])("rejects boundary mobile %s", (text) =>
    expect(detect(ctx(text)).some((f) => f.type === "phone")).toBe(false),
  );
  it("does not guess unlisted Chinese names", () =>
    expect(
      detect(ctx("虚构访客讨论课程安排")).some((f) => f.type === "name"),
    ).toBe(false));
  it("maps name and student id to same code", () =>
    expect(render("陈晨 20260003", detect(ctx("陈晨 20260003")))).toBe(
      "S003 S003",
    ));
  it("keeps repeated mentions and offsets stable", () =>
    expect(render("陈晨与陈晨", detect(ctx("陈晨与陈晨")))).toBe("S003与S003"));
  it("rejects partial student id", () =>
    expect(detect(ctx("x20260003y"))).toHaveLength(0));
  it("does not mislabel ID as a phone or long number", () =>
    expect(detect(ctx("11010120000101001X"))).toHaveLength(1));
  it("generalizes to month", () =>
    expect(render("2026年3月15日", detect(ctx("2026年3月15日")))).toBe(
      "2026年3月",
    ));
  it("respects optional generalization", () =>
    expect(
      detect({
        ...ctx("确诊为焦虑症"),
        options: { ...defaultOptions, medical: false },
      }),
    ).toHaveLength(0));
  it("honors custom literal rules over other detectors", () => {
    const c = {
      ...ctx("陈晨"),
      customRules: [{ value: "陈晨", replacement: "[参与者]" }],
    };
    expect(render(c.text, detect(c))).toBe("[参与者]");
  });
  it("does not treat custom text as a regular expression", () =>
    expect(
      detect({
        ...ctx("无特殊字符"),
        customRules: [{ value: ".*", replacement: "x" }],
      }),
    ).toHaveLength(0));
  it("flags duplicate names without identifying evidence", () => {
    const c = ctx("陈晨需要支持");
    c.students = [
      ...demoStudents,
      { ...demoStudents[2], id: "student:20269999", studentId: "20269999" },
    ];
    expect(detect(c)[0].ambiguous).toBe(true);
    expect(detect(c)[0].replacement).toContain("待确认");
  });
  it("resolves duplicate name using same sentence student number", () => {
    const c = ctx("陈晨，学号20260003");
    c.students = [
      ...demoStudents,
      {
        ...demoStudents[2],
        id: "student:20269999",
        studentId: "20269999",
        phone: "",
      },
    ];
    expect(detect(c)[0].replacement).toBe("S003");
  });
  it("does not use evidence from another sentence", () => {
    const c = ctx("陈晨。另一位学号20260003");
    c.students = [
      ...demoStudents,
      { ...demoStudents[2], id: "student:20269999", studentId: "20269999" },
    ];
    expect(detect(c)[0].ambiguous).toBe(true);
  });
  it("keeps duplicate name ambiguous if two student ids appear", () => {
    const c = ctx("陈晨 20260003 20269999");
    c.students = [
      ...demoStudents,
      { ...demoStudents[2], id: "student:20269999", studentId: "20269999" },
    ];
    expect(detect(c)[0].ambiguous).toBe(true);
  });
  it("recognizes emergency contact fields", () => {
    const c = ctx("联系人示例监护人，电话13900009998");
    c.students = [
      {
        ...demoStudents[0],
        emergencyName: "示例监护人",
        emergencyPhone: "13900009998",
      },
    ];
    expect(detect(c).map((f) => f.type)).toEqual(["contact", "phone"]);
  });
});
describe("human review output gate", () => {
  const setup = () => {
    const c = ctx(demoScenarios[0].text);
    return { c, r: createReview(c.text, detect(c)) };
  };
  it("blocks direct automatic output", () =>
    expect(() => approvedText(setup().r)).toThrow("人工复核"));
  it("requires explicit risk acknowledgement", () => {
    const { r, c } = setup();
    expect(() => confirmReview(r, c)).toThrow("剩余");
  });
  it("allows output after explicit confirmation", () => {
    const { r, c } = setup();
    expect(
      approvedText(confirmReview({ ...r, riskAcknowledged: true }, c)),
    ).toContain("S003");
  });
  it("restores an automatic finding", () => {
    const c = ctx("陈晨");
    const f = detect(c);
    f[0].action = "restore";
    expect(render(c.text, f)).toBe("陈晨");
  });
  it("deletes an automatic finding", () => {
    const c = ctx("陈晨");
    const f = detect(c);
    f[0].action = "delete";
    expect(render(c.text, f)).toBe("");
  });
  it("edits invalidate approved revision", () => {
    const { r, c } = setup();
    const approved = confirmReview({ ...r, riskAcknowledged: true }, c);
    expect(() =>
      approvedText(changeReview(approved, approved.findings)),
    ).toThrow();
  });
  it("custom marking preserves traceable offsets", () => {
    const text = "请关注虚构访客的课程";
    const f = markCustom(text, [], 3, 7, "[学生]");
    expect(render(text, f)).toBe("请关注[学生]的课程");
    expect(f[0].original).toBe("虚构访客");
  });
  it("rejects partially overlapping manual marks", () => {
    const c = ctx("陈晨近期情况");
    expect(() => markCustom(c.text, detect(c), 1, 4, "x")).toThrow("重叠");
  });
  it("allows complete override of existing markers", () => {
    const c = ctx("陈晨近期情况");
    expect(
      render(c.text, markCustom(c.text, detect(c), 0, c.text.length, "[摘要]")),
    ).toBe("[摘要]");
  });
  it("rescan finds manually reintroduced phone", () => {
    const c = ctx("陈晨");
    const f = detect(c);
    f[0].replacement = "13900009999";
    expect(reviewRisks(createReview(c.text, f), c).residual[0].type).toBe(
      "phone",
    );
  });
  it("unresolved duplicate identity blocks confirmation", () => {
    const c = ctx("陈晨");
    const f = detect(c);
    f[0].ambiguous = true;
    expect(() =>
      confirmReview({ ...createReview(c.text, f), riskAcknowledged: true }, c),
    ).toThrow("同名");
  });
});
