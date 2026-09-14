# IA_AND_DATA_MODEL.md

# 一、信息架构

## 主导航
1. 首页
2. 我的班级
3. 事务
4. 待办
5. 谈心谈话
6. 评奖评优
7. 升学就业
8. 材料输出

二级：
- 模板
- 本地数据
- AI 设置
- 隐私设置
- 导入导出

---

# 二、核心实体关系

```text
Class
  └── Student
        ├── StudentRoleHistory
        ├── AcademicRecord
        ├── AttendanceRecord
        ├── Event
        │     ├── Task
        │     └── Conversation
        ├── Conversation
        │     └── Task
        ├── AwardApplication
        ├── CareerPlan
        └── LocalSensitiveProfile
```

核心原则：
**Student 是中心实体，Event 是过程实体，Task 是执行实体，Conversation 是班主任专业记录实体。**

---

# 三、建议数据结构

## Class
```ts
{
  id,
  name,
  grade,
  major,
  cohort,
  createdAt,
  archived
}
```

## Student
```ts
{
  id,
  classId,
  studentNo,
  name,
  gender?,
  phone?,
  dorm?,
  status,
  tags[],
  currentRole?,
  graduationDirection?,
  createdAt,
  updatedAt
}
```

## StudentSensitiveProfile
仅本地：
```ts
{
  studentId,
  familySituation?,
  financialAidSituation?,
  religion?,
  sexualOrientation?,
  psychologicalNotes?,
  medicalNotes?,
  emergencyContact?,
  customFields[]
}
```

注意：
这些字段不能默认进入 AI payload。

## StudentRoleHistory
```ts
{
  id,
  studentId,
  roleName,
  startDate,
  endDate?,
  notes?
}
```

## AcademicRecord
```ts
{
  id,
  studentId,
  term,
  course?,
  score?,
  failed?,
  source,
  importedAt
}
```

## AttendanceRecord
```ts
{
  id,
  studentId,
  date,
  course?,
  type, // present/late/absent/leave
  source,
  notes?
}
```

## Event
```ts
{
  id,
  studentId,
  type,
  occurredAt,
  sourceType, // class_committee/teacher/system/self/other
  sourceText?,
  facts,
  priority,
  status,
  needsConversation,
  needsFollowUp,
  relatedConversationIds[],
  relatedTaskIds[],
  result?,
  closedAt?,
  createdAt
}
```

## Task
```ts
{
  id,
  studentId?,
  eventId?,
  conversationId?,
  type,
  title,
  dueAt?,
  priority,
  status,
  completionNote?,
  createdAt,
  completedAt?
}
```

## Conversation
```ts
{
  id,
  studentId,
  eventId?,
  scenario,
  templateId?,
  happenedAt,
  location?,
  rawNotes,
  finalRecord?,
  studentExpression?,
  counselorGuidance?,
  agreements?,
  followUpPlan?,
  nextFollowUpAt?,
  aiUsed,
  createdAt
}
```

## ConversationTemplate
```ts
{
  id,
  name,
  scenario,
  preTalkChecklist[],
  talkDirections[],
  outputStructure[],
  writingStyle,
  customPromptRules?,
  isDefault,
  createdByUser
}
```

## AwardApplication
```ts
{
  id,
  studentId,
  type,
  year,
  status,
  requiredMaterials[],
  missingMaterials[],
  deadline?,
  result?,
  notes?
}
```

## CareerPlan
```ts
{
  studentId,
  direction,
  furtherStudy?: {
    targetSchool?,
    targetMajor?,
    stage?,
    planStatus?,
    lastFollowUp?
  },
  employment?: {
    targetRole?,
    resumeStatus?,
    applications?,
    interviews?,
    offers?,
    signed?,
    internshipCompany?,
    lastFollowUp?
  }
}
```

---

# 四、学生状态不等于标签化

`Student.status` 建议仅表示工作状态：
- 正常
- 待关注
- 待谈话
- 跟进中
- 实习中
- 毕业去向待确认

不要设置：
- 问题学生
- 危险学生
- 心理高风险
等自动标签。

---

# 五、首页图表数据

## KPI
由本地数据库实时聚合：
- totalStudents
- todayAbsence
- pendingConversation
- pendingFollowUp
- academicConcernCount
- overdueTasks
- furtherStudyCount
- directionUnknownCount

## AttendanceTrend
按天/周聚合：
```ts
[{date, absent, late, leave}]
```

## AcademicDistribution
```ts
[
 {bucket:"无挂科", count},
 {bucket:"1门挂科", count},
 {bucket:"2门及以上", count}
]
```

## EventDistribution
```ts
[
 {type:"学业", count},
 {type:"考勤", count},
 {type:"家庭", count},
 {type:"宿舍/人际", count},
 {type:"升学就业", count},
 {type:"其他", count}
]
```

## GraduationDirection
```ts
[
 {direction:"专升本", count},
 {direction:"就业", count},
 {direction:"考公考编", count},
 {direction:"未明确", count}
]
```

---

# 六、学生详情图表

- 最近若干课程/阶段成绩趋势
- 月度缺勤/迟到趋势
- 本学期事件数量
- 谈话时间线
- 班委任职时间线
- 奖助评优时间线
- 升学就业进度

不要为图表而图表。
没有足够数据时显示友好空状态。
