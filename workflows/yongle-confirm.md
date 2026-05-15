<purpose>
灏嗘案涔愬ぇ鍏歌崏绋匡紙.draft.md锛夋寮忓綊妗ｃ€傛敮鎸佺洿鎺ユ寚瀹氭枃浠惰矾寰勶紝鎴栬€呭湪鏈寚瀹氭椂鑷姩鎵弿骞跺垪鍑烘墍鏈夎崏绋夸緵鐢ㄦ埛閫夋嫨銆?</purpose>

<process>

**Step 1: 鐜涓庡弬鏁板噯澶?*

瑙ｆ瀽 `$ARGUMENTS` 鎻愬彇 `$DRAFT_PATH`銆?
```bash
# Windows PowerShell 鍏煎澶勭悊: $HOME 涓虹┖鏃跺洖閫€鍒?$USERPROFILE
HOME_DIR="${HOME:-$USERPROFILE}"
ARCHIVE_DIR="${HOME_DIR}/.yongle_knowledge"
```

**Step 2: 纭畾鐩爣鑽夌**

鑻?`$DRAFT_PATH` 涓虹┖锛?
1. **鎵弿鎵€鏈夎崏绋?*锛?   ```bash
   ls "${ARCHIVE_DIR}"/*.draft.md 2>/dev/null
   ```

2. **鎻愮ず鐢ㄦ埛閫夋嫨**锛?   鑻ユ棤鑽夌锛屾彁绀?`鏈壘鍒板緟褰掓。鐨勮崏绋挎枃浠躲€俙 骞堕€€鍑恒€?   鑻ユ湁鑽夌锛屼娇鐢?`AskUserQuestion` 灞曠ず鍒楄〃銆?
鑻?`$DRAFT_PATH` 涓嶄负绌猴紝楠岃瘉鏂囦欢鏄惁瀛樺湪銆?
---

**Step 3: 瀹￠槄骞剁‘璁?*

璇诲彇鑽夌鏂囦欢鐨?Frontmatter 淇℃伅锛坕d, date, resolution_type, cause_summary锛夊睍绀虹粰鐢ㄦ埛銆?
```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?鍑嗗褰掓。鑽夌
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?
馃搫 璺緞: {DRAFT_PATH}
馃搵  ID:   {id}
馃搮 鏃ユ湡:  {date}
馃挕 鏍瑰洜:  {cause_summary}

纭褰掓。锛?```

```
> [!IMPORTANT]
> **AUTOMATION HOOK**: If `YONGLE_TEST_MODE` is "true", automatically select the first option ("✅ 确认归档") and skip the interactive prompt.

AskUserQuestion(
  header: "纭褰掓。",
  question: "鏄惁灏嗘鑽夌姝ｅ紡瀛樺叆鐭ヨ瘑搴擄紵",
  options: [
    { label: "鉁?纭褰掓。", description: "閲嶅懡鍚嶅苟鏇存柊绱㈠紩" },
    { label: "鉂?鍙栨秷", description: "淇濈暀鑽夌涓嶆搷浣? }
  ],
  multiSelect: false
)
```

---

**Step 4: 鎵ц褰掓。閫昏緫**

鐢ㄦ埛鐐瑰嚮纭鍚庯細

1. **璁＄畻姝ｅ紡璺緞**锛?   灏嗘枃浠跺悕涓殑 `.draft.md` 鏇挎崲涓?`.md`銆?   `FINAL_PATH=$(echo "$DRAFT_PATH" | sed 's/\.draft\.md$/.md/')`

2. **娓呮礂鍏冩暟鎹?*锛?   璇诲彇鑽夌鍐呭锛屽皢 `draft: true` 琛岀Щ闄わ紝鍐欏叆姝ｅ紡鏂囦欢璺緞銆?
3. **鏇存柊绱㈠紩锛圛NDEX.md锛?*锛?   璇诲彇鑽夌涓殑鍏冩暟鎹瓧娈点€?   ```bash
   INDEX_PATH="${ARCHIVE_DIR}/INDEX.md"
   
   # 濡傛灉绱㈠紩涓嶅瓨鍦紝鍏堝垵濮嬪寲琛ㄥご
   if [ ! -f "$INDEX_PATH" ]; then
     echo "# 姘镐箰澶у吀鐭ヨ瘑绱㈠紩" > "$INDEX_PATH"
     echo "" >> "$INDEX_PATH"
     echo "| 鏃ユ湡 | 鏉＄洰ID | 鍒嗙被 | 鏍瑰洜鎽樿 | 鏍囩 |" >> "$INDEX_PATH"
     echo "|------|--------|------|----------|------|" >> "$INDEX_PATH"
   fi

   # 杩藉姞鎽樿琛?   echo "| {date} | [{id}](./${FINAL_FILENAME}) | {resolution_type} | {cause_summary} | {tags_inline} |" >> "$INDEX_PATH"

   # 5. 鏇存柊 SQLite 绱㈠紩
   # 棣栧厛纭畾 SCOPE
   if [[ "$DRAFT_PATH" == *".planning/knowledge"* ]]; then
     DB_SCOPE="local"
   else
     DB_SCOPE="global"
   fi
   # 鍑嗗鏁版嵁 JSON
   DATA_JSON="{\"id\": \"$ID\", \"date\": \"$DATE\", \"resolution_type\": \"$TYPE\", \"cause_summary\": \"$SUMMARY\", \"tags\": [${TAGS_ARRAY}], \"filepath\": \"$FINAL_PATH\"}"
   node yongle/scripts/yongle-db.js upsert "$DB_SCOPE" "$DATA_JSON"
   ```

4. **娓呯悊鏃ф枃浠?*锛?   鍒犻櫎鍘熻崏绋挎枃浠躲€?
---

**Step 5: 瀹屾垚鎻愮ず**

```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?褰掓。瀹屾垚 鉁?鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?
馃摎 宸插綊妗? {FINAL_PATH}
馃搵 绱㈠紩宸叉洿鏂般€?
# 鍚庡彴闈欓粯鍚屾 (鍙€?
SYNC_MODE=$(node "d:\Computers\AI Develop\Tools\Skills\yongle\sdk\src\config-get.ts" yongle.sync.mode 2>/dev/null || echo "manual")
if [ "$SYNC_MODE" = "auto" ] || [ "$SYNC_MODE" = "both" ]; then
  echo "姝ｅ湪鎵ц鍚庡彴闈欓粯鍚屾..."
  node "d:\Computers\AI Develop\Tools\Skills\yongle\sdk\src\sync-cli.ts" --scope=all > /dev/null 2>&1 &
fi
```

</process>

