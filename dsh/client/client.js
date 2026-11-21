/**
 * yongle-dadian-dsh — browser half (lazy-CJS 客户端 bundle)
 *
 * 包含两大核心 Web UI 呈现:
 *  1. `settings.section` (永乐大典可视化设置与全景状态监控面板)
 *     - 实时运行状态卡片 (三级库知识量 / FTS 索引 / LanceDB 向量 / 草稿待办)
 *     - 可视化配置表单 (Embedding 提供商 / 模型 / URL / Key / 检索参数 / 存储路径)
 *     - 一键运维操作 (保存配置 / 重建索引 / 知识库自愈巡检 / 刷新)
 *  2. `conversation.composer.dock` (底栏常驻读数挂件)
 *     - 同行右对齐挂载，与 dsh-balance 共享底栏
 *     - 悬停 / 点击弹出浮动卡片与快捷操作
 */
window.__ModuleLoader__.load({
	id: "yongle-dadian-dsh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const R = (typeof window !== "undefined" && window.React) ? window.React : (typeof react !== "undefined" ? react : require("react"));

		//#region styles
		const CSS_ID = "yongle-dadian-dsh/styles.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "yongle-dadian-dsh";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = [
				/* Dock Widget Styles */
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
				".dsh_yongle_sep{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-separator-primary,rgba(128,128,128,0.25));margin:0 8px;user-select:none}",

				/* Settings Section Styles */
				".dsh_yl_settings_container{box-sizing:border-box;max-width:760px;padding:24px 28px;display:flex;flex-direction:column;gap:20px;color:var(--dsw-alias-label-primary,#111827);font-size:13px;line-height:1.5;pointer-events:auto;user-select:auto}",
				".dsh_yl_header_block{display:flex;flex-direction:column;gap:6px}",
				".dsh_yl_title_row{display:flex;align-items:center;justify-content:space-between}",
				".dsh_yl_main_title{font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0;display:flex;align-items:center;gap:8px}",
				".dsh_yl_desc{font-size:13px;color:var(--dsw-alias-label-secondary,#6b7280);margin:0;line-height:1.6}",
				".dsh_yl_card{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.04));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.15));border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:14px;pointer-events:auto}",
				".dsh_yl_card_title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0;display:flex;align-items:center;justify-content:space-between}",
				".dsh_yl_grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px}",
				".dsh_yl_stat_box{background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,0.06));border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,0.1));border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}",
				".dsh_yl_stat_label{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#9ca3af);font-weight:500}",
				".dsh_yl_stat_value{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px}",
				".dsh_yl_stat_sub{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}",
				".dsh_yl_form_row{display:grid;grid-template-columns:160px 1fr;align-items:center;gap:16px}",
				".dsh_yl_form_row_v{display:flex;flex-direction:column;gap:6px}",
				".dsh_yl_form_label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
				".dsh_yl_form_hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#9ca3af);line-height:1.4}",
				".dsh_yl_input{background:var(--dsw-alias-bg-layer-1,var(--dsw-specific-input-major,#1e1e1e));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.25));border-radius:6px;padding:8px 12px;font-size:13px;color:var(--dsw-alias-label-primary,#ffffff);font-family:inherit;width:100%;box-sizing:border-box;outline:none;pointer-events:auto !important;cursor:text;transition:border-color .15s ease,box-shadow .15s ease}",
				".dsh_yl_input:focus{border-color:var(--dsw-alias-brand-primary,#3b82f6);box-shadow:0 0 0 2px rgba(59,130,246,0.25)}",
				".dsh_yl_select{appearance:none;cursor:pointer !important;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:right 12px center;background-repeat:no-repeat;padding-right:32px}",
				".dsh_yl_switch_label{display:inline-flex;align-items:center;gap:8px;cursor:pointer !important;user-select:none;font-size:13px;font-weight:500;pointer-events:auto !important}",
				".dsh_yl_checkbox{cursor:pointer !important;width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary,#3b82f6);pointer-events:auto !important}",
				".dsh_yl_btn_bar{display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap}",
				".dsh_yl_btn_primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3b82f6));color:#ffffff;border:none;border-radius:6px;padding:8px 18px;font-size:13px;font-weight:500;cursor:pointer !important;display:inline-flex;align-items:center;gap:6px;transition:all .15s ease;font-family:inherit;pointer-events:auto !important}",
				".dsh_yl_btn_primary:hover:not(:disabled){opacity:0.9;transform:translateY(-1px)}",
				".dsh_yl_btn_primary:disabled{opacity:0.5;cursor:not-allowed !important}",
				".dsh_yl_btn_secondary{background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,0.08));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.25));color:var(--dsw-alias-label-primary);border-radius:6px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer !important;display:inline-flex;align-items:center;gap:6px;transition:all .15s ease;font-family:inherit;pointer-events:auto !important}",
				".dsh_yl_btn_secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));border-color:var(--dsw-alias-border-l1,rgba(128,128,128,0.4))}",
				".dsh_yl_btn_secondary:disabled{opacity:0.5;cursor:not-allowed !important}",
				".dsh_yl_btn_ghost{background:transparent;border:none;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer !important;padding:6px 10px;font-size:12.5px;display:inline-flex;align-items:center;gap:4px;border-radius:4px;transition:color .15s ease;font-family:inherit;pointer-events:auto !important}",
				".dsh_yl_btn_ghost:hover{color:var(--dsw-alias-brand-primary,#3b82f6)}",
				".dsh_yl_alert{border-radius:8px;padding:10px 14px;font-size:12.5px;line-height:1.5;display:flex;align-items:center;justify-content:space-between;gap:8px;animation:dsh_yl_fadein .2s ease}",
				".dsh_yl_alert_success{background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:var(--dsw-alias-state-success-primary,#10b981)}",
				".dsh_yl_alert_error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--dsw-alias-state-error-primary,#ef4444)}",
				".dsh_yl_alert_info{background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:var(--dsw-alias-brand-primary,#3b82f6)}",
				"@keyframes dsh_yl_fadein{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}"
			].join("\n");
			document.head.appendChild(tag);
		}
		//#endregion

		//#region State & Fetchers
		let _cachedStats = null;
		let _cachedConfig = null;
		const _listeners = new Set();

		function notifyAll() {
			for (const l of _listeners) {
				try { l({ stats: _cachedStats, config: _cachedConfig }); } catch {}
			}
		}

		async function tryFetch(urls, options = {}) {
			for (const u of urls) {
				try {
					const res = await fetch(u, { ...options, cache: 'no-store' });
					if (res.ok) {
						const json = await res.json();
						if (json.ok) return json;
					}
				} catch {}
			}
			return null;
		}

		async function fetchStats() {
			const json = await tryFetch(['/yongle/stats', '/api/yongle/stats']);
			if (json && json.ok) {
				_cachedStats = json;
				if (json.config) _cachedConfig = json.config;
				notifyAll();
				return json;
			}
			return null;
		}

		async function fetchConfig() {
			const json = await tryFetch(['/yongle/config', '/api/yongle/config']);
			if (json && json.ok && json.config) {
				_cachedConfig = json.config;
				notifyAll();
				return json.config;
			}
			return null;
		}

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
						if (document.execCommand('insertText', false, text)) return;
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

		//#region 1. Dock Readout Component
		function YongleDockReadout(props) {
			const [data, setData] = R.useState(_cachedStats);
			const inputActions = props?.inputActions;

			R.useEffect(() => {
				const listener = (payload) => {
					if (payload?.stats) setData(payload.stats);
				};
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
				if (typeof inputActions?.setDraft === 'function') {
					inputActions.setDraft(text);
					const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
					el?.focus();
					return;
				}
				insertTextFallback(text);
			};

			const dotClass = totalDrafts > 0 ? "dsh_yongle_dot dsh_yongle_dot_warn" : "dsh_yongle_dot";
			const labelText = totalDrafts > 0 ? `永乐知识 ${totalEntries} 条 (${totalDrafts} 待审)` : `永乐知识 ${totalEntries} 条`;

			const popoverNode = R.createElement("div", {
				className: "dsh_yongle_popover",
				key: "popover"
			}, [
				R.createElement("div", { className: "dsh_yongle_header", key: "head" }, [
					R.createElement("span", { key: "t" }, "🏛️ 永乐大典知识库"),
					R.createElement("span", {
						key: "refresh",
						style: { cursor: "pointer", fontSize: "11px", color: "var(--dsw-alias-brand-primary, #3b82f6)" },
						onClick: (e) => { e.stopPropagation(); fetchStats(); }
					}, "🔄 刷新")
				]),
				R.createElement("div", { className: "dsh_yongle_levels", key: "levels" },
					stats.map((s, idx) => {
						const icon = s.level === 'project' ? '📦' : (s.level === 'user' ? '👤' : '🌐');
						const statusText = s.enabled ? `${s.entries} 条 (FTS: ${s.fts})` : '未配置';
						const draftTip = s.drafts > 0 ? ` ⚠️ ${s.drafts} 草稿` : '';
						return R.createElement("div", { className: "dsh_yongle_item", key: idx }, [
							R.createElement("span", { className: "dsh_yongle_item_title", key: "n" }, `${icon} ${s.level}`),
							R.createElement("span", { className: "dsh_yongle_item_val", key: "v" }, `${statusText}${draftTip}`)
						]);
					})
				),
				R.createElement("div", { className: "dsh_yongle_footer", key: "foot" }, [
					R.createElement("span", { key: "embed" }, `向量: ${data?.embedding?.provider || 'ollama'}`),
					R.createElement("span", { key: "pm" }, `复盘: ${data?.autoPostmortem ? '🟢 开启' : '⚪ 关闭'}`)
				]),
				R.createElement("div", { className: "dsh_yongle_actions", key: "actions" }, [
					R.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_search",
						onClick: () => handleInsertPrompt("/yongle-search ")
					}, "🔍 搜索"),
					R.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_pm",
						onClick: () => handleInsertPrompt("/yongle-postmortem")
					}, "📝 蒸馏复盘"),
					R.createElement("button", {
						type: "button",
						className: "dsh_yongle_btn",
						key: "btn_stat",
						onClick: () => handleInsertPrompt("/yongle-status")
					}, "📊 看板")
				])
			]);

			const triggerNode = R.createElement("span", {
				className: "dsh_yongle_trigger",
				key: "yongle_dock_trigger",
				title: "点击或悬停查看永乐大典知识库状态"
			}, [
				R.createElement("span", { className: "dsh_yongle_badge", key: "badge" }, [
					R.createElement("span", { className: dotClass, key: "dot" }),
					R.createElement("span", { key: "txt" }, `🏛️ ${labelText}`)
				]),
				popoverNode
			]);

			return R.createElement("div", {
				className: "dsh_yongle_root",
				key: "yongle_dock_root",
				children: triggerNode
			});
		}
		//#endregion

		//#region 2. Settings Section Component (可视化设置与监控面板)
		function YongleSettingsSection() {
			const [statsData, setStatsData] = R.useState(_cachedStats);
			const [configData, setConfigData] = R.useState(_cachedConfig || {});
			const [loading, setLoading] = R.useState(false);
			const [saving, setSaving] = R.useState(false);
			const [reindexing, setReindexing] = R.useState(false);
			const [repairing, setRepairing] = R.useState(false);
			const [banner, setBanner] = R.useState(null);

			const reload = async () => {
				setLoading(true);
				try {
					const [s, c] = await Promise.all([fetchStats(), fetchConfig()]);
					if (s) setStatsData(s);
					if (c) setConfigData(c);
				} finally {
					setLoading(false);
				}
			};

			R.useEffect(() => {
				reload();
			}, []);

			const handleFieldChange = (section, key, value) => {
				setConfigData(prev => {
					const copy = JSON.parse(JSON.stringify(prev || {}));
					if (!copy[section]) copy[section] = {};
					copy[section][key] = value;
					return copy;
				});
			};

			const handleSave = async () => {
				setSaving(true);
				setBanner({ type: 'info', text: '正在保存配置并持久化...' });
				try {
					let ok = false;
					let savedConfig = null;
					for (const url of ['/yongle/config', '/api/yongle/config']) {
						try {
							const res = await fetch(url, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ config: configData }),
							});
							if (res.ok) {
								const json = await res.json();
								if (json.ok) {
									ok = true;
									savedConfig = json.config;
									break;
								}
							}
						} catch {}
					}
					if (ok) {
						setBanner({ type: 'success', text: '✅ 全局配置已成功保存并即时生效！' });
						if (savedConfig) setConfigData(savedConfig);
						await reload();
					} else {
						setBanner({ type: 'error', text: '❌ 保存失败: 无法连接宿主配置接口，请检查 DSH 运行状态' });
					}
				} catch (err) {
					setBanner({ type: 'error', text: '❌ 网络请求异常: ' + String(err?.message || err) });
				} finally {
					setSaving(false);
				}
			};

			const handleReindex = async () => {
				if (!confirm('确定要重新扫描并重建 SQLite + LanceDB 全量索引吗？')) return;
				setReindexing(true);
				setBanner({ type: 'info', text: '正在重新扫描并重建全量知识库索引...' });
				try {
					let ok = false;
					for (const url of ['/yongle/reindex', '/api/yongle/reindex']) {
						try {
							const res = await fetch(url, { method: 'POST' });
							if (res.ok) {
								const json = await res.json();
								if (json.ok) {
									ok = true;
									break;
								}
							}
						} catch {}
					}
					if (ok) {
						setBanner({ type: 'success', text: '✅ 全量索引重建完成！' });
						await reload();
					} else {
						setBanner({ type: 'error', text: '❌ 索引重建失败: 接口响应异常' });
					}
				} catch (err) {
					setBanner({ type: 'error', text: '❌ 请求失败: ' + String(err?.message || err) });
				} finally {
					setReindexing(false);
				}
			};

			const handleRepair = async () => {
				setRepairing(true);
				setBanner({ type: 'info', text: '正在执行知识库健康巡检与格式自愈...' });
				try {
					let ok = false;
					for (const url of ['/yongle/repair', '/api/yongle/repair']) {
						try {
							const res = await fetch(url, { method: 'POST' });
							if (res.ok) {
								const json = await res.json();
								if (json.ok) {
									ok = true;
									break;
								}
							}
						} catch {}
					}
					if (ok) {
						setBanner({ type: 'success', text: '✅ 知识库健康巡检与自愈完成！' });
						await reload();
					} else {
						setBanner({ type: 'error', text: '❌ 巡检失败: 接口响应异常' });
					}
				} catch (err) {
					setBanner({ type: 'error', text: '❌ 请求失败: ' + String(err?.message || err) });
				} finally {
					setRepairing(false);
				}
			};

			// 计算统计数据
			const statsList = statsData?.stats || [];
			let totalEntries = 0;
			let totalDrafts = 0;
			for (const s of statsList) {
				if (s.enabled) {
					totalEntries += (s.entries || 0);
					totalDrafts += (s.drafts || 0);
				}
			}

			const e = R.createElement;

			// 1. 头部组件
			const headerNode = e('div', { className: 'dsh_yl_header_block', key: 'header' }, [
				e('div', { className: 'dsh_yl_title_row', key: 'title_row' }, [
					e('h2', { className: 'dsh_yl_main_title', key: 'h2' }, '🏛️ 永乐大典 (Yongle Dadian) 知识库设置与监控'),
					e('button', {
						type: 'button',
						className: 'dsh_yl_btn_ghost',
						key: 'btn_refresh',
						onClick: reload,
						disabled: loading
					}, loading ? '🔄 刷新中...' : '🔄 刷新状态')
				]),
				e('p', { className: 'dsh_yl_desc', key: 'p_desc' }, '跨 Agent 统一 AI 开发经验知识库引擎，支持三级架构隔离（项目/用户/团队）与毫秒级 SQLite FTS5 + LanceDB 混合检索。')
			]);

			// 2. 状态反馈 Banner
			const bannerNode = banner ? e('div', {
				className: `dsh_yl_alert dsh_yl_alert_${banner.type}`,
				key: 'banner'
			}, [
				e('span', { key: 'txt' }, banner.text),
				e('span', {
					key: 'close',
					style: { cursor: 'pointer', opacity: 0.7, padding: '0 4px' },
					onClick: () => setBanner(null)
				}, '✕')
			]) : null;

			// 3. 实时运行概览卡片 (Live Status Card)
			const liveCard = e('div', { className: 'dsh_yl_card', key: 'card_live' }, [
				e('div', { className: 'dsh_yl_card_title', key: 't' }, [
					e('span', { key: 't_span' }, '📊 实时运行状态概览'),
					e('span', {
						key: 'badge',
						style: { fontSize: '11px', color: 'var(--dsw-alias-state-success-primary, #10b981)', fontWeight: 500 }
					}, '🟢 引擎运行正常')
				]),
				e('div', { className: 'dsh_yl_grid', key: 'grid' }, [
					e('div', { className: 'dsh_yl_stat_box', key: 'stat_entries' }, [
						e('span', { className: 'dsh_yl_stat_label', key: 'lbl' }, '知识沉淀总量'),
						e('span', { className: 'dsh_yl_stat_value', key: 'val' }, `${totalEntries} 条`),
						e('span', { className: 'dsh_yl_stat_sub', key: 'sub' },
							statsList.length > 0
								? statsList.map(s => `${s.level}: ${s.enabled ? s.entries : '未启用'}`).join(' | ')
								: '正在加载统计...'
						)
					]),
					e('div', { className: 'dsh_yl_stat_box', key: 'stat_drafts' }, [
						e('span', { className: 'dsh_yl_stat_label', key: 'lbl' }, '待审复盘草稿'),
						e('span', {
							className: 'dsh_yl_stat_value',
							style: { color: totalDrafts > 0 ? 'var(--dsw-alias-state-warn-primary, #f59e0b)' : 'inherit' },
							key: 'val'
						}, `${totalDrafts} 篇`),
						e('span', { className: 'dsh_yl_stat_sub', key: 'sub' }, totalDrafts > 0 ? '⚠️ 存在未归档条目，可输入 /yongle-status 审核' : '状态健康，无待办草稿')
					]),
					e('div', { className: 'dsh_yl_stat_box', key: 'stat_embed' }, [
						e('span', { className: 'dsh_yl_stat_label', key: 'lbl' }, '向量检索引擎 (Embedding)'),
						e('span', { className: 'dsh_yl_stat_value', key: 'val' }, statsData?.embedding?.provider || configData?.embedding?.provider || 'gemini'),
						e('span', { className: 'dsh_yl_stat_sub', key: 'sub' }, `模型: ${statsData?.embedding?.model || configData?.embedding?.model || 'gemini-embedding-001'}`)
					]),
					e('div', { className: 'dsh_yl_stat_box', key: 'stat_db' }, [
						e('span', { className: 'dsh_yl_stat_label', key: 'lbl' }, '混合索引数据库'),
						e('span', { className: 'dsh_yl_stat_value', key: 'val' }, 'SQLite + LanceDB'),
						e('span', { className: 'dsh_yl_stat_sub', key: 'sub' }, '进程内零延迟高并发连接复用')
					])
				])
			]);

			// 4. 向量化与 Embedding 配置卡片
			const embeddingCfg = configData.embedding || {};
			const isEmbeddingEnabled = embeddingCfg.enabled !== false;
			const embeddingCard = e('div', { className: 'dsh_yl_card', key: 'card_embed' }, [
				e('div', { className: 'dsh_yl_card_title', key: 't' }, '⚙️ 向量提取引擎设置 (Embedding)'),
				e('div', { className: 'dsh_yl_form_row', key: 'row_enabled' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '向量检索开关'),
					e('label', { className: 'dsh_yl_switch_label', key: 'inp' }, [
						e('input', {
							type: 'checkbox',
							className: 'dsh_yl_checkbox',
							checked: isEmbeddingEnabled,
							onChange: (ev) => handleFieldChange('embedding', 'enabled', ev.target.checked),
							key: 'chk'
						}),
						'启用向量化检索 (关闭后自动回退为毫秒级纯 FTS 全文检索)'
					])
				]),
				e('div', { className: 'dsh_yl_form_row', key: 'row_provider' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '提供商 (Provider)'),
					e('select', {
						className: 'dsh_yl_input dsh_yl_select',
						value: embeddingCfg.provider || 'gemini',
						onChange: (ev) => handleFieldChange('embedding', 'provider', ev.target.value),
						key: 'sel'
					}, [
						e('option', { value: 'gemini', key: 'opt_gemini' }, 'Google Gemini (text-embedding-004)'),
						e('option', { value: 'ollama', key: 'opt_ollama' }, 'Ollama (本地免 Token / 推荐)'),
						e('option', { value: 'openai', key: 'opt_openai' }, 'OpenAI (text-embedding-3)'),
						e('option', { value: 'deepseek', key: 'opt_deepseek' }, 'DeepSeek (兼容第三方)')
					])
				]),
				e('div', { className: 'dsh_yl_form_row', key: 'row_model' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '模型名称 (Model)'),
					e('input', {
						type: 'text',
						className: 'dsh_yl_input',
						placeholder: '例如: gemini-embedding-001 或 nomic-embed-text',
						value: embeddingCfg.model ?? '',
						onChange: (ev) => handleFieldChange('embedding', 'model', ev.target.value),
						key: 'inp'
					})
				]),
				e('div', { className: 'dsh_yl_form_row', key: 'row_base_url' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, 'Base URL (可选)'),
					e('input', {
						type: 'text',
						className: 'dsh_yl_input',
						placeholder: 'http://127.0.0.1:11434 或留空使用官方网关',
						value: embeddingCfg.baseUrl ?? '',
						onChange: (ev) => handleFieldChange('embedding', 'baseUrl', ev.target.value),
						key: 'inp'
					})
				]),
				e('div', { className: 'dsh_yl_form_row', key: 'row_api_key' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, 'API Key (密钥)'),
					e('input', {
						type: 'password',
						className: 'dsh_yl_input',
						placeholder: '本地 Ollama 留空; 云端模型输入 key...',
						value: embeddingCfg.apiKey ?? '',
						onChange: (ev) => handleFieldChange('embedding', 'apiKey', ev.target.value),
						key: 'inp'
					})
				])
			]);

			// 5. 检索与自动化参数卡片
			const yongleCfg = configData.yongle || {};
			const searchCfg = yongleCfg.search || {};
			const paramsCard = e('div', { className: 'dsh_yl_card', key: 'card_params' }, [
				e('div', { className: 'dsh_yl_card_title', key: 't' }, '🔍 检索与自动化偏好'),
				e('div', { className: 'dsh_yl_form_row', key: 'row_limit' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '默认返回条数'),
					e('input', {
						type: 'number',
						className: 'dsh_yl_input',
						min: 1,
						max: 15,
						value: searchCfg.default_limit ?? 5,
						onChange: (ev) => {
							const v = parseInt(ev.target.value, 10);
							setConfigData(prev => {
								const copy = JSON.parse(JSON.stringify(prev || {}));
								if (!copy.yongle) copy.yongle = {};
								if (!copy.yongle.search) copy.yongle.search = {};
								copy.yongle.search.default_limit = isNaN(v) ? 5 : v;
								return copy;
							});
						},
						key: 'inp'
					})
				]),
				e('div', { className: 'dsh_yl_form_row', key: 'row_postmortem' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '工具失败自动复盘'),
					e('label', { className: 'dsh_yl_switch_label', key: 'inp' }, [
						e('input', {
							type: 'checkbox',
							className: 'dsh_yl_checkbox',
							checked: !!configData.autoPostmortem,
							onChange: (ev) => {
								const val = ev.target.checked;
								setConfigData(prev => ({ ...(prev || {}), autoPostmortem: val }));
							},
							key: 'chk'
						}),
						'开启后在 Agent 回合内工具连续报错时，自动注入知识库修复方案提醒'
					])
				])
			]);

			// 6. 三级存储路径卡片
			const storageCfg = yongleCfg.storage || {};
			const storageCard = e('div', { className: 'dsh_yl_card', key: 'card_storage' }, [
				e('div', { className: 'dsh_yl_card_title', key: 't' }, '📁 三级知识库存储路径'),
				e('div', { className: 'dsh_yl_form_row_v', key: 'row_user_path' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '用户级知识库根路径 (User Home)'),
					e('input', {
						type: 'text',
						className: 'dsh_yl_input',
						placeholder: '~/.yongle_knowledge (默认)',
						value: storageCfg.user_path ?? '',
						onChange: (ev) => {
							const val = ev.target.value;
							setConfigData(prev => {
								const copy = JSON.parse(JSON.stringify(prev || {}));
								if (!copy.yongle) copy.yongle = {};
								if (!copy.yongle.storage) copy.yongle.storage = {};
								copy.yongle.storage.user_path = val;
								return copy;
							});
						},
						key: 'inp'
					}),
					e('span', { className: 'dsh_yl_form_hint', key: 'hint' }, '个人跨项目核心知识库存储目录，包含 memory/ 条目与 drafts/ 草稿箱。')
				]),
				e('div', { className: 'dsh_yl_form_row_v', key: 'row_global_path' }, [
					e('span', { className: 'dsh_yl_form_label', key: 'lbl' }, '全局团队共享库根路径 (Global Path / 可选)'),
					e('input', {
						type: 'text',
						className: 'dsh_yl_input',
						placeholder: '留空表示未启用全局级共享库',
						value: storageCfg.global_path ?? '',
						onChange: (ev) => {
							const val = ev.target.value;
							setConfigData(prev => {
								const copy = JSON.parse(JSON.stringify(prev || {}));
								if (!copy.yongle) copy.yongle = {};
								if (!copy.yongle.storage) copy.yongle.storage = {};
								copy.yongle.storage.global_path = val;
								return copy;
							});
						},
						key: 'inp'
					}),
					e('span', { className: 'dsh_yl_form_hint', key: 'hint' }, '用于团队同步或通过 Git 共享的知识库绝对路径。')
				])
			]);

			// 7. 运维与自愈操作区 (Operations Bar)
			const actionsCard = e('div', { className: 'dsh_yl_card', key: 'card_actions' }, [
				e('div', { className: 'dsh_yl_card_title', key: 't' }, '🛠️ 运维与诊断操作'),
				e('div', { className: 'dsh_yl_btn_bar', key: 'bar' }, [
					e('button', {
						type: 'button',
						className: 'dsh_yl_btn_primary',
						onClick: handleSave,
						disabled: saving,
						key: 'btn_save'
					}, saving ? '💾 保存中...' : '💾 保存并应用配置'),
					e('button', {
						type: 'button',
						className: 'dsh_yl_btn_secondary',
						onClick: handleReindex,
						disabled: reindexing,
						key: 'btn_reindex'
					}, reindexing ? '🔄 索引重建中...' : '🔄 重新构建索引 (Reindex)'),
					e('button', {
						type: 'button',
						className: 'dsh_yl_btn_secondary',
						onClick: handleRepair,
						disabled: repairing,
						key: 'btn_repair'
					}, repairing ? '🩺 自愈巡检中...' : '🩺 知识库自愈巡检 (Lint & Repair)')
				])
			]);

			return e('div', { className: 'dsh_yl_settings_container', key: 'root' }, [
				headerNode,
				bannerNode,
				liveCard,
				embeddingCard,
				paramsCard,
				storageCard,
				actionsCard
			]);
		}
		//#endregion

		//#region 3. Plugin Apply & Slots Registration
		const inject = ["slots"];

		function apply(ctx) {
			// 1. 注册 conversation.composer.dock 底栏状态挂件
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

				// 2. 注册 settings.section 侧边栏专属「🏛️ 永乐大典」设置与监控面板
				ctx.slots.inject("settings.section", () => {
					const dispose = ctx.slots.register({
						name: "settings.section",
						id: "yongle",
						order: 48,
						label: () => "🏛️ 永乐大典",
					}, YongleSettingsSection);
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
