<purpose>
鐭ヨ瘑搴撶储寮曢噸鏋勫紩鎿庛€傛壂鎻忕洰鏍囩洰褰曚笅鐨勬墍鏈夌煡璇嗘潯鐩紝鍚屾鍏冩暟鎹嚦 SQLite 鏁版嵁搴撱€?</purpose>

<process>

**Step 1: 鐜鍑嗗**

1. 瑙ｆ瀽鍙傛暟 `$ARGUMENTS` 纭畾 `$SCOPE` (榛樿 `global`)銆?2. 纭畾鐩爣鐩綍 `$TARGET_DIR`锛?   - `local` -> `.planning/knowledge/`
   - `global` -> `~/.yongle_knowledge/` (澶勭悊 Windows 璺緞)
3. 鍒濆鍖栨暟鎹簱锛?   ```bash
   node yongle/scripts/yongle-db.js init "$SCOPE"
   ```

---

**Step 2: 鎵弿涓庢彁鍙?*

1. 閫掑綊鎵弿 `$TARGET_DIR` 涓嬬殑鎵€鏈?`.md` 鏂囦欢锛堟帓闄?`INDEX.md` 鍜?`WATCHING.md`锛夈€?2. 瀵逛簬姣忎釜鏂囦欢锛?   - 璇诲彇鏂囦欢鍐呭銆?   - 鎻愬彇 YAML Frontmatter 涓殑 `id`, `date`, `resolution_type`, `cause_summary`, `tags`銆?   - 鏋勯€?JSON 鏁版嵁瀵硅薄銆?   - 鎵ц鍐欏叆锛?     ```bash
     node yongle/scripts/yongle-db.js upsert "$SCOPE" '{"id": "...", "date": "...", ...}'
     ```

---

**Step 3: 缁撴灉缁熻**

1. 瀹屾垚鍚庢樉绀虹粺璁′俊鎭細
   - 鎵弿鏂囦欢鎬绘暟銆?   - 鎴愬姛鏇存柊鐨勬潯鐩暟銆?   - 鏁版嵁搴撹矾寰勩€?
</process>

<notes>
- 绱㈠紩杩囩▼浼氳鐩栧凡鏈夎褰曪紙UPSERT锛夛紝淇濊瘉 DB 涓?FS 鍚屾銆?- 濡傛灉鏂囦欢涓嶅寘鍚湁鏁堢殑 Frontmatter锛屽垯璺宠繃銆?</notes>

