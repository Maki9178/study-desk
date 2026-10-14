# 相似项目研究与本次改进

研究日期：2026-10-15。通过 GitHub 搜索 `student planner homework` 和 `local first todo app`，阅读以下项目说明，并检查其中两份对应实现源码。只借鉴交互和设计思路；本次 JavaScript/CSS 为本项目编写，未复制外部源码、图片或引入框架。

| 项目 | 核实的能力和参考位置 | 在课桌中的应用 |
| --- | --- | --- |
| [HeliumEdu/frontend](https://github.com/HeliumEdu/frontend) | 学生课程/作业计划；[筛选实现](https://github.com/HeliumEdu/frontend/blob/develop/lib/data/sources/planner_item_filter_compute.dart)将课程、分类、状态和搜索组合 | 新增课程筛选，复用已有 course 字段；让推荐跟随筛选，保留分类与截止分组 |
| [Schmitt-Florian/SchoolPlanner](https://github.com/Schmitt-Florian/SchoolPlanner) | [README](https://github.com/Schmitt-Florian/SchoolPlanner/blob/master/README.md)声明周课程安排、作业和考试管理；MIT 许可 | 用未来七天概览呈现截止集中程度；显示已估耗时，便于安排学习；未引入课表/成绩数据结构 |
| [isotjs/todosian-app](https://github.com/isotjs/todosian-app) | [README](https://github.com/isotjs/todosian-app/blob/main/README.md)的 Daily Focus、本地 Markdown；[DailyFocusViewModel](https://github.com/isotjs/todosian-app/blob/main/app/src/main/java/com/isotjs/todosian/ui/dailyfocus/DailyFocusViewModel.kt)排除已完成任务、支持聚焦与保存失败处理；Apache-2.0 许可 | 日期点击聚焦未完成作业，已有保存回滚保持；不把 Android 文件权限或同步方案移植到浏览器 |

Helium 是 Flutter 客户端配合独立后端，SchoolPlanner 与 Todosian 是 Android 应用，均不适合直接替换课桌当前无运行时依赖的浏览器原型。这里只采用可在本地实现的功能，不增加账号系统、服务器同步或外部请求。

## 实施范围与边界

1. 未来七个本地日历日的截止数量、已估分钟数、未估数量；此前逾期与无截止提示。日内已经逾期的任务仍在今天桶里，原全库“已逾期”统计仍显示所有过期任务。
2. 工作量按课程/搜索/分类统计所有未完成项，不受状态/截止筛选限制；作业清单和首页建议遵循全部筛选。顶部统计为全库总数。
3. 日期聚焦清除原截止筛选并切换到未完成；再次点击同日或选择截止分组清除日期聚焦。
4. 标题入口与独立编辑按钮并存；平台入口明确标为作业列表或平台，避免暗示必有直达单份作业的链接。
5. 修复进行中完成勾选，兼容现有 schemaVersion 1、加密/明文信封及离线包。

未实现新增课表、成绩、专注计时器、自动抓取和多设备同步。本次七天工作量是按截止时间的汇总，不是自动排程或剩余学习时长预测。

## 验证

- 原有完整 npm test：加密与备份、失败回滚、重复导入、PTA 解析、HTTP 路由、离线包一致性。
- 新增纯逻辑回归：上海日期边界、七天包含范围、纽约夏令时结束、完成项排除、未知耗时、输入不变。
- 实际应用事件回归：进行中 → 已完成 → 待完成，保存后状态保留。
- 可选 Chromium 集成脚本 tests/planning.browser.cjs：桌面/390px 窄屏、课程与日期联动、未设置课程、入口回退、完成持久化、刷新、演示隔离、无页面异常。

浏览器检查使用虚构资料，没有读取用户浏览器库或个人备份；不代表已验收真实课程网站和用户本机 Edge。
