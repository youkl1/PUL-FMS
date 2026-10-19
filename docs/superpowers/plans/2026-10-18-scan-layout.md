# 统一扫码版面二期实施计划（2026-10-18）

> 执行：superpowers:subagent-driven-development，任务串行；不 commit/add；采购到货与统一扫码业务逻辑零变化。

**目标**：扫码交互版面对齐老系统图一——结果双栏并示、openScan 升级大版面；业务逻辑零改动。

**已拍板**：scan-hub 双栏并示；openScan 升级 1280+ 大弹窗；字段沿用现行 11/12 列；保留标题头/按药品清单扫码开关/药品清单功能；PulDocDetail 复用为渲染器。

---

### Task A：scan-hub 结果区双栏并示

**文件**：scan-hub-ui.js、scan-hub.html（样式）、styles/purchase.css 或页内 style、_t-doc-detail.node.js §13 断言更新

- [ ] detailCardHtml 去页签，改双栏结果卡：左 renderDrugs（drugRowsOf 现有适配）、右 renderCodes（codeRowsOf），各自 table-responsive + 纵向滚动（max-height 与现行码表一致）
- [ ] 异常码：计数 chip（非 0 红）+ 点击展开/收起异常码表（badRowsOf）；bad>0 默认展开，=0 收起只显 chip；「双层表达」说明移到卡头 metaHtml
- [ ] footer 四分支、hub-fixed-foot、EMBED、草稿、demoPad、扫码卡、标题头全部不动；TAB 页签状态变量移除（onTab 不再需要），bind 保留操作转发
- [ ] 双栏样式加 .hub-duo grid（窄屏单列堆叠 ≤1200px）
- [ ] §13 断言更新为双栏契约（左右表头、chip、展开属性 data-dd-badtgl），RED→GREEN
- [ ] 验证：node --check、_t-doc-detail 全绿、_t-scan-hub 全绿

### Task B：PchUI.openScan 升级大版面弹窗

**文件**：purchase-shared.js（仅 openScan 渲染层）、styles/purchase.css、各 openScan 调用页（仅补 opts 参数）、_t-doc-detail.node.js §20

- [ ] openScan 新契约（全部可选，向后兼容）：`width`（默认升 1280）、`headerHtml`（单据头区，页面传）、`drugsRows: function(){return rows;}`（药品清单行模型，缺省=不渲染左栏，过渡兼容）
- [ ] 弹窗体改统一版面：headerHtml（可选）→ 扫码过程卡（现行模式/输入/flags/反馈，逻辑不动）→ 双栏结果（左 renderDrugs(drugsRows())，右现行 renderScanItems 码明细逻辑原样）→ footer（现行 onAudit/close 按钮不动）
- [ ] doScanInput/scanState/三态反馈/onScan/onClose 全部零改动；每扫一码后左栏同步刷新（重调 drugsRows 渲染）
- [ ] 调用页接线：现有 openScan 调用页逐页补 `headerHtml + drugsRows`（用本页已有 summarize/数据适配，禁止新写业务计算）；页清单以 grep `UI.openScan(` 实际结果为准，逐页最小参数
- [ ] §20 断言：openScan 含 drugsRows/headerHtml 契约、向后兼容（无新参页面渲染不破）、各调用页接线静态断言
- [ ] 验证：node --check purchase-shared.js + 各页、_t-doc-detail、_t-scan-hub、_t-scan-lab、_t-invariants 全绿

### Task C：回归与交付

- [ ] 全量 7 套件 + check-prd-menu-sync
- [ ] 终审（业务零漂移抽查 + 版面一致性）
- [ ] README 轮次记录 + 记忆更新
