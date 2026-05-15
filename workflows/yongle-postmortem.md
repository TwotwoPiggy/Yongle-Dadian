<purpose>
姘镐箰澶у吀锛圷ongle Dadian锛夊鐩樺紩鎿庛€傚湪 AI 杈呭姪寮€鍙戣繃绋嬩腑锛屽綋涓€涓?Bug 琚В鍐虫垨鏌愰」浠诲姟鏈€缁堣窇閫氬悗锛屾彁鍙栬繖娈靛璇濅腑鐨勬牳蹇冮敊璇俊鎭€佽皟璇曡繃绋嬩笌瑙ｅ喅鏂规锛屽皢鍏跺嚌缁冧负缁撴瀯鍖栫殑鐭ヨ瘑鏉＄洰骞惰繘琛屼袱娈靛紡钀界洏锛堣崏绋?鈫?纭褰掓。锛夈€?</purpose>

<knowledge_schema>
姣忎唤鐭ヨ瘑鏉＄洰蹇呴』鍖呭惈浠ヤ笅6涓?YAML Frontmatter 瀛楁锛堢己灏戜换浣曚竴涓潎瑙嗕负鏃犳晥鏉＄洰锛夛細

```yaml
---
id: "<YYYYMMDD>-<kebab-case-summary>"          # 鍞竴ID锛屽: 20260418-dotnet-ef-migration-fail
date: "<YYYY-MM-DD>"                            # 璁板綍鏃ユ湡
resolution_type: "<绫诲瀷>"                       # 鍒嗙被: bug-fix | config-fix | api-change | env-issue | logic-error | other
tags:                                           # 鎶€鏈爤涓庨鍩熸爣绛?  - "<tag1>"
  - "<tag2>"
host_agent: "<Agent鍚嶇О>"                       # 鎵ц瑙ｅ喅鏂规鐨凙I Agent: antigravity | codex | cursor | other
cause_summary: "<涓€鍙ヨ瘽绮剧偧鏍瑰洜>"               # 30瀛椾互鍐咃紝鐩存帴璇存槑闂鏈川
---
```
</knowledge_schema>

<process>

**Step 1: 瑙ｆ瀽鍚姩鍙傛暟**

瑙ｆ瀽 `$ARGUMENTS`锛?- `--global` 鈫?褰掓。鐩爣涓?`~/.yongle_knowledge/`锛堥粯璁わ級
- `--local` 鈫?褰掓。鐩爣涓哄綋鍓嶉」鐩殑 `.planning/knowledge/`
- `--model <name>` 鈫?瑕嗙洊鍒嗘瀽鏃朵娇鐢ㄧ殑妯″瀷鍚嶇О锛堜粎浣滆褰曪紝瀹為檯鐢卞涓籄gent璋冨害锛?
鑻ユ湭鎸囧畾 scope锛岄粯璁や娇鐢?`--global`銆?
纭畾褰掓。璺緞锛堝瓨鍌ㄤ负 `$ARCHIVE_DIR`锛夛細
```bash
if [ "$SCOPE" = "local" ]; then
  ARCHIVE_DIR=".planning/knowledge"
else
  # Windows PowerShell 鍏煎澶勭悊: $HOME 涓虹┖鏃跺洖閫€鍒?$USERPROFILE
  HOME_DIR="${HOME:-$USERPROFILE}"
  ARCHIVE_DIR="${HOME_DIR}/.yongle_knowledge"
fi
mkdir -p "$ARCHIVE_DIR"
```

---

**Step 2: 涓婁笅鏂囨櫤鑳藉洖婧笌鍒嗘瀽**

鏄剧ず鍒嗘瀽鎻愮ず锛?```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?姝ｅ湪鎵弿瀵硅瘽涓婁笅鏂?..
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?```

鍚戜笂鍥炴函褰撳墠瀵硅瘽鐨勫巻鍙茶褰曪紝鎵ц浠ヤ笅鏅鸿兘璇嗗埆锛?
**2a. 妫€鏌ユ椿璺冭拷韪?(WATCHING.md)**
- 妫€鏌ユ槸鍚﹀瓨鍦?`.planning/yongle/WATCHING.md`銆?- 濡傛灉瀛樺湪锛屽皢鍏惰涓?*鏈€楂樹紭鍏堢骇涓婁笅鏂?*銆傛枃浠朵腑鐨?`Timeline` 璁板綍浜?AI 鐨勭湡瀹炶皟璇曡建杩癸紝搴斾紭鍏堜簬澶фā鍨嬬殑瀵硅瘽鍥炴函璁板繂銆?- 濡傛灉涓嶅瓨鍦紝鍒欐寜甯歌鏂瑰紡鍥炴函褰撳墠瀵硅瘽銆?
**2b. 璇嗗埆闂杈圭晫**
- 瀹氫綅瀵硅瘽涓嚭鐜扮殑**绗竴涓姤閿欎俊鍙?*锛堝锛氶敊璇爢鏍堛€丅uild Failed銆丒xception銆佹瀯寤轰腑鏂瓑鍏抽敭璇嶏級
- 瀹氫綅**鏈€缁堣В鍐虫柟妗?*锛堝锛氱敤鎴风‘璁?鎴愬姛浜?銆?璺戦€氫簡"銆?濂界殑"绛夛紝鎴栨渶鍚庝竴娆℃垚鍔熺殑浠ｇ爜杩愯缁撴灉锛?- 濡傛灉闂缁忓巻浜?*澶氭灏濊瘯**锛堝け璐モ啋閲嶈瘯鈫掓垚鍔燂級锛屽皢杩欏嚑娆＄浉鍏崇殑涓婁笅鏂?*鏁翠綋鎵撳寘**浣滀负鍒嗘瀽鍩虹锛屼笉瑁佸壀涓棿鐨勫け璐ュ皾璇曪紙瀹冧滑鏄渶瀹濊吹鐨?韪╁潙璁板綍"锛?
**2c. 鎻愮偧鏍稿績鍐呭**锛?- **鏍规湰鍘熷洜**锛圧oot Cause锛夛細涓€鍙ヨ瘽璇存竻涓轰綍浼氬嚭閿?- **璋冭瘯鍘嗙▼**锛圖ebug Path锛夛細绠€杩板皾璇曚簡鍝簺鏂瑰悜锛屽摢浜涘け璐ヤ簡銆佸摢浜涙垚鍔熶簡锛堢粨鍚?WATCHING.md 鐨?Timeline锛?- **鏈€缁堣В鍐虫柟妗?*锛圧esolution锛夛細鏈€缁堣捣浣滅敤鐨勫叿浣撴搷浣滄楠?- **闃插鍙戝缓璁?*锛圥revention锛夛細涓嬫濡備綍閬垮厤绫讳技闂

**2d. 濉厖鍏冩暟鎹?*锛?- 鏍规嵁鍐呭鎺ㄦ柇 `resolution_type`
- 鏍规嵁娑夊強鐨勬妧鏈爤鎻愬彇 `tags`锛堝: dotnet, ef-core, build, migrations, docker锛?- `host_agent` 璁剧疆涓哄綋鍓嶅涓荤幆澧冿紙濡?`antigravity`锛?- `date` 璁剧疆涓轰粖鏃ユ棩鏈?- `id` 鏍煎紡涓?`YYYYMMDD-<kebab-cause-summary>`锛堟渶澶?涓崟璇嶏級

---

**Step 3: 纭鍒嗘瀽缁撴灉**

鍦ㄦ寮忚惤鐩樺墠锛屽悜鐢ㄦ埛灞曠ず鎻愮偧鎽樿锛?
```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?鍒嗘瀽瀹屾垚锛屽噯澶囧綊妗?鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?
馃搵  ID:          {id}
馃搮  鏃ユ湡:        {date}
馃彿锔? 鍒嗙被:        {resolution_type}
馃敄  鏍囩:        {tags}
馃  璁板綍Agent:   {host_agent}
馃挕  鏍瑰洜鎽樿:    {cause_summary}

纭鍐欏叆鑽夌锛?```

```
> [!IMPORTANT]
> **AUTOMATION HOOK**: If `YONGLE_TEST_MODE` is "true", automatically select the first option ("✅ 确认，写入草稿") and skip the interactive prompt.

AskUserQuestion(
  header: "姘镐箰澶у吀 鈥?褰掓。纭",
  question: "浠ヤ笂鍒嗘瀽鍑嗙‘鍚楋紵",
  options: [
    { label: "鉁?纭锛屽啓鍏ヨ崏绋?, description: "灏嗘寜浠ヤ笂鍐呭鐢熸垚鑽夌鏂囦欢" },
    { label: "鉁忥笍 淇敼鏍瑰洜鎽樿", description: "瀵?cause_summary 杩涜鎵嬪姩淇鍚庡啀褰掓。" },
    { label: "馃彿锔?淇敼鏍囩/鍒嗙被", description: "瀵?tags 鎴?resolution_type 杩涜璋冩暣" },
    { label: "鉂?鍙栨秷", description: "涓嶅綊妗ｆ娆¤褰? }
  ],
  multiSelect: false
)
```

- 濡傛灉鐢ㄦ埛閫夋嫨"淇敼鏍瑰洜鎽樿"鎴?淇敼鏍囩/鍒嗙被"锛岀敤鏂囨湰璺熻繘闂鏀堕泦淇敼鍐呭锛屾洿鏂扮浉搴斿瓧娈靛悗閲嶆柊灞曠ず纭銆?- 濡傛灉鐢ㄦ埛閫夋嫨"鍙栨秷"锛屾墦鍗?`宸插彇娑堝綊妗ｃ€俙 骞堕€€鍑恒€?
---

**Step 4: 鍐欏叆鑽夌鏂囦欢**

鐢熸垚鏃ユ湡鏃堕棿鎴冲墠缂€锛?```bash
# 鐢熸垚璺ㄥ钩鍙板吋瀹圭殑鏃堕棿鎴?TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
DRAFT_FILENAME="${TIMESTAMP}-${SLUG}.draft.md"
DRAFT_PATH="${ARCHIVE_DIR}/${DRAFT_FILENAME}"
```

灏嗗畬鏁寸煡璇嗘潯鐩啓鍏ヨ崏绋挎枃浠讹紝鏍煎紡濡備笅锛?
```markdown
---
id: "{id}"
date: "{date}"
resolution_type: "{resolution_type}"
tags:
{tags_yaml_list}
host_agent: "{host_agent}"
cause_summary: "{cause_summary}"
draft: true
---

# {涓€鍙ヨ瘽鏍囬}

## 闂鏍瑰洜

{root_cause_detailed}

## 璋冭瘯鍘嗙▼

{debug_path_with_failed_attempts}

## 鏈€缁堣В鍐虫柟妗?
{resolution_steps}

## 闃插鍙戝缓璁?
{prevention_tips}

---
*鏈枃妗ｇ敱姘镐箰澶у吀鑷姩鐢熸垚锛屽緟纭鍚庡綊妗ｃ€?
*Generated: {datetime}*
```

鍐欏叆鍚庢樉绀猴細
```
鉁?鑽夌宸茬敓鎴? {DRAFT_PATH}
```

---

**Step 5: 浜哄伐瀹￠槄纭**

> [!IMPORTANT]
> **AUTOMATION HOOK**: If `YONGLE_TEST_MODE` is "true", automatically select the first option ("✅ 直接确认归档") and skip the interactive prompt.

```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?璇峰闃呰崏绋?鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?
馃搫 鑽夌璺緞: {DRAFT_PATH}

璇峰湪缂栬緫鍣ㄤ腑鎵撳紑骞跺闃咃紝纭鏃犺鍚庢墽琛屼互涓嬪懡浠ゆ寮忓綊妗ｏ細

  /yongle-confirm {DRAFT_PATH}

鎴栬€呯洿鎺ュ湪姝ゅ鍥炲"纭"璺宠繃鎵嬪姩缂栬緫銆?```

绛夊緟鐢ㄦ埛鍥炲簲锛?
```
AskUserQuestion(
  header: "姘镐箰澶у吀 鈥?姝ｅ紡褰掓。",
  question: "鑽夌宸茬敓鎴愶紝璇峰闃呭悗鍋氬嚭閫夋嫨锛?,
  options: [
    { label: "鉁?鐩存帴纭褰掓。", description: "鏃犻渶缂栬緫锛屾寜褰撳墠鑽夌鍐呭姝ｅ紡褰掓。" },
    { label: "馃摑 鎴戝凡鎵嬪姩缂栬緫瀹屾瘯锛岀幇鍦ㄥ綊妗?, description: "宸插湪缂栬緫鍣ㄤ腑淇敼锛屼繚瀛樺悗鍦ㄦ纭" },
    { label: "鈴?绋嶅悗褰掓。", description: "淇濈暀鑽夌锛岀◢鍚庨€氳繃 /yongle-confirm 鍛戒护褰掓。" }
  ],
  multiSelect: false
)
```

---

**Step 6: 姝ｅ紡褰掓。**

鑻ョ敤鎴烽€夋嫨"鐩存帴纭褰掓。"鎴?宸茬紪杈戝畬姣曠幇鍦ㄥ綊妗?锛?
1. **澶勭悊鏂囦欢杞Щ涓庡垎绫?*锛?   - 璇嗗埆鐭ヨ瘑鏉＄洰涓殑鍐呭锛?     - 鑻ュ寘鍚?**椋庢牸 (Style)**銆?*鎬濈淮妯″紡 (Thoughts)** 鎴?**閫氱敤妯″紡 (Patterns)**锛氬皢瀵瑰簲鐗囨鍚屾鑷?`~/.yongle_knowledge/memory/` 涓嬬殑瀵瑰簲鍒嗙被锛屽苟鏇存柊 `memory/INDEX.json`銆?     - 鏍稿績鐭ヨ瘑鏈綅渚濈劧瀛樺叆 `$ARCHIVE_DIR`銆?
   ```bash
   FINAL_FILENAME="${TIMESTAMP}-${SLUG}.md"
   FINAL_PATH="${ARCHIVE_DIR}/${FINAL_FILENAME}"
   ```

2. **娓呮礂鍏冩暟鎹紙鍘婚櫎 draft 鏍囧織锛?*锛?   璇诲彇 `$DRAFT_PATH` 鍐呭锛屽埄鐢ㄥぇ妯″瀷鑳藉姏鎴栫畝鍗曠殑鏂囨湰鏇挎崲鍘婚櫎 `draft: true` 杩欎竴琛岋紝鐒跺悗灏嗙粨鏋滃啓鍏?`$FINAL_PATH`銆?
3. **娓呯悊鑽夌涓庤拷韪枃浠?*锛?   ```bash
   rm "$DRAFT_PATH"
   # 鍚屾椂娓呯悊娲昏穬杩借釜鏂囦欢
   if [ -f ".planning/yongle/WATCHING.md" ]; then
     rm ".planning/yongle/WATCHING.md"
   fi
   ```

4. **鏇存柊鎴栧垵濮嬪寲绱㈠紩锛圛NDEX.md锛?*锛?   ```bash
   INDEX_PATH="${ARCHIVE_DIR}/INDEX.md"
   
   # 濡傛灉绱㈠紩涓嶅瓨鍦紝鍏堝垵濮嬪寲琛ㄥご
   if [ ! -f "$INDEX_PATH" ]; then
     echo "# 姘镐箰澶у吀鐭ヨ瘑绱㈠紩" > "$INDEX_PATH"
     echo "" >> "$INDEX_PATH"
     echo "| 鏃ユ湡 | 鏉＄洰ID | 鍒嗙被 | 鏍瑰洜鎽樿 | 鏍囩 |" >> "$INDEX_PATH"
     echo "|------|--------|------|----------|------|" >> "$INDEX_PATH"
   fi

   # 杩藉姞鏂版潯鐩憳瑕佽
   echo "| {date} | [{id}](./${FINAL_FILENAME}) | {resolution_type} | {cause_summary} | {tags_inline} |" >> "$INDEX_PATH"

   # 5. 鏇存柊 SQLite 绱㈠紩
   # 纭畾 SCOPE 鍜?DATA_JSON (閫昏緫鍚?confirm)
   node yongle/scripts/yongle-db.js upsert "$SCOPE" "$DATA_JSON"
   ```

鏄剧ず瀹屾垚妯箙锛?```
鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹? 姘镐箰澶у吀 鈻?褰掓。瀹屾垚 鉁?鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹佲攣鈹?
馃摎 宸插綊妗? {FINAL_PATH}
馃搵 绱㈠紩宸叉洿鏂? {INDEX_PATH}

# 6. 鍚庡彴闈欓粯鍚屾 (鍙€?
# 妫€鏌ユ槸鍚﹀紑鍚簡鑷姩鍚屾妯″紡
SYNC_MODE=$(node "d:\Computers\AI Develop\Tools\Skills\yongle\sdk\src\config-get.ts" yongle.sync.mode 2>/dev/null || echo "manual")
if [ "$SYNC_MODE" = "auto" ] || [ "$SYNC_MODE" = "both" ]; then
  echo "姝ｅ湪鎵ц鍚庡彴闈欓粯鍚屾..."
  node "d:\Computers\AI Develop\Tools\Skills\yongle\sdk\src\sync-cli.ts" --scope=all > /dev/null 2>&1 &
fi

涓嬫閬囧埌绫讳技闂锛屽彲鐢?/yongle-search 蹇€熸绱€?```

鑻ョ敤鎴烽€夋嫨"绋嶅悗褰掓。"锛屽垯鑽夌淇濈暀鍦?`{DRAFT_PATH}`锛屽苟鎻愮ず锛?```
鑽夌宸蹭繚瀛橈紝绋嶅悗閫氳繃 /yongle-confirm {DRAFT_PATH} 瀹屾垚褰掓。銆?```

</process>

<notes>
- 涓婁笅鏂囧洖婧敱瀹夸富澶фā鍨嬶紙濡?Antigravity锛夌洿鎺ユ墽琛岋紝鏃犻渶澶栭儴 API 璋冪敤
- 鏀寔澶氳疆琛ヤ竵锛堜竴涓?Bug 缁忓巻澶氭灏濊瘯锛夌殑鏁翠綋鎵撳寘鎻愮偧
- 鑽夌闃舵鍏佽鐢ㄦ埛鎵嬪姩缂栬緫鍐呭锛屾渶澶х▼搴︿繚闅滅煡璇嗚川閲?- INDEX.md 鏄交閲忓钩閾哄紡绱㈠紩锛屾湭鏉ュ彲涓?SQLite 鑱斿姩
- 鎵€鏈夋枃浠跺啓鍏ユ搷浣滃潎閫氳繃绯荤粺宸ュ叿锛圔ash/Write锛夊畬鎴愶紝涓嶄緷璧栦换浣?npm 鍖?</notes>

