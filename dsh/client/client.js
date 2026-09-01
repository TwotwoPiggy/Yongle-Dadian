/**
 * yongle-dadian-dsh — browser half (lazy-CJS 客户端 bundle)
 *
 * 在 `conversation.composer.dock` (输入框下方的统计/状态条)
 * 注册永乐大典知识库状态小组件 (Dock Widget):
 *   - 同行右对齐挂载，与 dsh-balance 共享同一行底栏，不占用额外高度
 *   - 实时显示知识库已沉淀知识总数 (如: 🏛️ 永乐知识 21 条)
 *   - 动态识别草稿待办 (如有待审草稿展示 ⚠️ 告警徽标)
 *   - 悬停 / 点击弹出浮动卡片 (Popover)，展示三级库细分、向量模型与快捷交互动作
 *   - 快捷动作优先调用 DSH 宿主原生 inputActions.setDraft，瞬间高亮显示且光标就绪
 */
window.__ModuleLoader__.load({
	id: "yongle-dadian-dsh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region styles
		const CSS_ID = "yongle-dadian-dsh/styles.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "yongle-dadian-dsh";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = [
				".dsh_yongle_root{display:flex;align-items:center;justify-content:flex-end;max-width:var(--dsh-chat-content-width, 100%);box-sizing:border-box;width:100%;padding:4px calc(var(--dsh-composer-side-clearance, 16px) + 16px) 0;margin:-24px auto 0;pointer-events:none;font-size:12px;line-height:20px;white-space:nowrap;overflow:visible}",
				".dsh_yongle_trigger{position:relative;display:inline-flex;align-items:center;cursor:pointer;user-select:none;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);line-height:20px;padding:0 6px;border-radius:4px;pointer-events:auto;transition:background-color .15s ease,color .15s ease}",
				".dsh_yongle_trigger:hover{color:var(--dsw-alias-label-primary,#111827);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.08))}",
				".dsh_yongle_badge{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}",
				".dsh_yongle_dot{display:inline-block;width:7px;height:7px;border-radius:50%;background-color:var(--dsw-alias-state-success-primary,#10b981);box-shadow:0 0 0 2px rgba(16,185,129,0.2)}",
				".dsh_yongle_dot_warn{background-color:var(--dsw-alias-state-warn-primary,#f59e0b);box-shadow:0 0 0 2px rgba(245,158,11,0.2);animation:dsh_yongle_pulse 1.2s infinite ease-in-out}",
				"@keyframes dsh_yongle_pulse{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(1.3);opacity:1}}",
				".dsh_yongle_popover{position:absolute;bottom:calc(100% + 8px);right:0;left:auto;z-index:9999;min-width:320px;max-width:92vw;background:var(--dsw-alias-bg-layer-1,var(--dsw-hovercard-bg,#ffffff));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.2));border-radius:10px;box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,0.18));padding:12px 14px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;white-space:normal;text-align:left;color:var(--dsw-alias-label-primary,#111827);font-size:12px;line-height:1.5;backdrop-filter:blur(16px);opacity:0;pointer-events:none;transform:translateY(6px);transition:opacity .18s cubic-bezier(0.16,1,0.3,1),transform .18s cubic-bezier(0.16,1,0.3,1)}",
				".dsh_yongle_popover::after{content:'';position:absolute;top:100%;left:0;right:0;height:10px;background:transparent}",
				".dsh_yongle_trigger:hover .dsh_yongle_popover, .dsh_yongle_popover:hover{opacity:1;pointer-events:auto;transform:translateY(0)}",
				".dsh_yongle_header{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:12.5px;color:var(--dsw-alias-label-primary);padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-separator-primary,rgba(128,128,128,0.12))}",
				".dsh_yongle_levels{display:flex;flex-direction:column;gap:5px}",
				".dsh_yongle_item{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.05));font-size:11.5px}",
				".dsh_yongle_item_title{display:inline-flex;align-items:center;gap:5px;font-weight:500}",
				".dsh_yongle_item_val{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-weight:500}",
				".dsh_yongle_footer{display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px dashed var(--dsw-alias-separator-primary,rgba(128,128,128,0.15));font-size:11px;color:var(--dsw-alias-label-tertiary)}",
				".dsh_yongle_actions{display:flex;gap:6px;margin-top:2px}",
				".dsh_yongle_btn{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.08));border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,0.15));border-radius:4px;padding:4px 8px;font-size:11.5px;font-weight:500;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:3px;transition:all .15s ease;font-family:inherit}",
				".dsh_yongle_btn:hover{background:var(--dsw-alias-brand-primary,#3b82f6);color:#ffffff;border-color:transparent}",
				".dsh_yongle_sep{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-separator-primary,rgba(128,128,128,0.25));margin:0 8px;user-select:none}"
			].join("\n");
			document.head.appendChild(tag);
		}
		//#endregion

		//#region state & fetcher
		let _cachedData = null;
		const _listeners = new Set();

		function notifyListeners() {
			for (const l of _listeners) {
				try { l(_cachedData); } catch {}
			}
		}

		async function fetchStats() {
			try {
				const res = await fetch('/yongle/stats', { cache: 'no-store' });
				if (res.ok) {
					const json = await res.json();
					if (json.ok) {
						_cachedData = json;
						notifyListeners();
						return _cachedData;
					}
				}
			} catch {}
			return null;
		}

		/**
		 * 兜底的 DOM 文本注入函数
		 */
		function insertTextFallback(text) {
			try {
				const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"], input[type="text"]');
				if (!el) return;

				el.focus();

				if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) {
					try {
						const selection = window.getSelection();
						if (selection) {
							const range = document.createRange();
							range.selectNodeContents(el);
							selection.removeAllRanges();
							selection.addRange(range);
						}
						if (document.execCommand('insertText', false, text)) {
							return;
						}
					} catch {}
					el.textContent = text;
					el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
					return;
				}

				if ('value' in el) {
					el.value = text;
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
			} catch (err) {
				console.error('[yongle] insert fallback error:', err);
			}
		}
		//#endregion

		//#region Component
		function YongleDockReadout(props) {
			const [data, setData] = react.useState(_cachedData);
			const inputActions = props?.inputActions;

			react.useEffect(() => {
				const listener = (d) => setData(d);
				_listeners.add(listener);
				fetchStats();
				const timer = setInterval(() => {
					if (typeof document !== 'undefined' && !document.hidden) {
						fetchStats();
					}
				}, 15000);
				return () => {
					_listeners.delete(listener);
					clearInterval(timer);
				};
			}, []);

			const stats = data?.stats || [];
			let totalEntries = 0;
			let totalDrafts = 0;
			for (const s of stats) {
				if (s.enabled) {
					totalEntries += (s.entries || 0);
					totalDrafts += (s.drafts || 0);
				}
			}

			const handleInsertPrompt = (text) => {
				// 1. 优先使用 DSH 宿主原生提供的 inputActions
				if (typeof inputActions?.setDraft === 'function') {
					inputActions.setDraft(text);
					const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
					el?.focus();
					return;
				}

				// 2. 兜底 DOM 注入
				insertTextFallback(text);
			};

			const dotClass = totalDrafts > 0 ? "dsh_yongle_dot dsh_yongle_dot_warn" : "dsh_yongle_dot";
			const labelText = totalDrafts > 0 ? `永乐知识 ${totalEntries} 条 (${totalDrafts} 待审)` : `永乐知识 ${totalEntries} 条`;

			const popoverNode = react.createElement("div", {
				className: "dsh_yongle_popover",
				key: "popover"
			}, [
				react.createElement("div", { className: "dsh_yongle_header", key: "head" }, [
					react.createElement("span", { key: "t" }, "🏛️ 永乐大典知识库"),
					react.createElement("span", {
						key: "refresh",
						style: { cursor: "pointer", fontSize: "11px", color: "var(--dsw-alias-brand-primary, #3b82f6)" },
						onClick: (e) => { e.stopPropagation(); fetchStats(); }
					}, "🔄 刷新")
				]),
				react.createElement("div", { className: "dsh_yongle_levels", key: "levels" },
					stats.map((s, idx) => {
						const icon = s.level === 'project' ? '📦' : (s.level === 'user' ? '👤' : '🌐');
						const statusText = s.enabled ? `${s.entries} 条 (FTS: ${s.fts})` : '未配置';
						const draftTip = s.drafts > 0 ? ` ⚠️ ${s.drafts} 草稿` : '';
						return react.createElement("div", { className: "dsh_yongle_item", key: idx }, [
							react.createElement("span", { className: "dsh_yongle_item_title", key: "n" }, `${icon} ${s.level}`),
							react.createElement("span", { className: "dsh_yongle_item_val", key: "v" }, `${statusText}${draftTip}`)
						]);
					})
				),
				react.createElement("div", { className: "dsh_yongle_footer", key: "foot" }, [
					react.createElement("span", { key: "embed" }, `向量: ${data?.embedding?.provider || 'ollama'}`),
					react.createElement("span", { key: "pm" }, `复盘: ${data?.autoPostmortem ? '🟢 开启' : '⚪ 关闭'}`)
				]),
				react.createElement("div", { className: "dsh_yongle_actions", key: "actions" }, [
					react.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_search",
						onClick: () => handleInsertPrompt("/yongle-search ")
					}, "🔍 搜索"),
					react.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_pm",
						onClick: () => handleInsertPrompt("/yongle-postmortem")
					}, "📝 蒸馏复盘"),
					react.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_stat",
						onClick: () => handleInsertPrompt("/yongle-status")
					}, "📊 看板")
				])
			]);

			const triggerNode = react.createElement("span", {
				className: "dsh_yongle_trigger",
				key: "yongle_dock_trigger",
				title: "点击或悬停查看永乐大典知识库状态"
			}, [
				react.createElement("span", { className: "dsh_yongle_badge", key: "badge" }, [
					react.createElement("span", { className: dotClass, key: "dot" }),
					react.createElement("span", { key: "txt" }, `🏛️ ${labelText}`)
				]),
				popoverNode
			]);

			return react.createElement("div", {
				className: "dsh_yongle_root",
				key: "yongle_dock_root",
				children: triggerNode
			});
		}
		//#endregion

		//#region plugin
		const inject = ["slots"];

		function apply(ctx) {
			// 等待 ui-conversation 声明 composer.dock 槽位后注册永乐大典读数挂件
			if (typeof ctx?.slots?.inject === 'function') {
				ctx.slots.inject("conversation.composer.dock", () => {
					const dispose = ctx.slots.register({
						name: "conversation.composer.dock",
						id: "yongle-dadian-dsh",
						order: 2,
					}, YongleDockReadout);
					return () => {
						dispose?.();
					};
				});
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
