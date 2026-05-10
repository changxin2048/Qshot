(() => {
  // src/config/baseConfig.js
  (function initBaseConfig() {
    const config = {
      appName: "Qshot - 子弹搜索",
      defaultColumns: 1,
      // 单个 iframe 认定加载失败的超时。重型 SPA（DeepSeek/Kimi/Gemini）冷启动偶尔会接近 20s，
      // 放宽到 25s 以避免误判为「加载失败」。
      embedTimeoutMs: 25e3,
      // iframe 加载完成后立即发送查询，不再人为等待
      postLoadSendDelayMs: 0,
      tabSendRetryCount: 3,
      tabSendRetryDelayMs: 12e3,
      // 错峰加载：多站点场景下每个 iframe 之间的 src 赋值间隔（ms）。
      // 避免 6~8 个重型 SPA 同时初始化导致白屏。
      iframeStaggerMs: 120,
      // 发送并发数：同一轮追问最多同时向几张 AI 卡片写入并提交。
      // 4 接近早期速度，但仍保留小并发池，避免 6~8 张重型编辑器同时抢焦点/抢渲染。
      sendConcurrency: 4,
      // 并发槽位上限：同一时刻最多允许多少张 iframe 处于"加载中"状态。
      // 其余卡片先把 DOM 创建出来并显示"等待加载中…"，在前面的卡片加载完成（load/error/超时）后
      // 依次补位，避免 6~8 个重型 SPA 同时冷启动打满 CPU / 网络。
      //   - 低配机 / 弱网：建议 2
      //   - 默认：3（对大多数机器在稳定性和首屏速度之间取平衡）
      //   - 高配 + 光纤 + 并发卡片数不多时可以调到 4~5
      //   - 设成 99 等效于关闭并发限制
      iframeMaxConcurrent: 3,
      debug: true
    };
    globalThis.QSHOT_BASE_CONFIG = config;
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2NvbmZpZy9iYXNlQ29uZmlnLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIoZnVuY3Rpb24gaW5pdEJhc2VDb25maWcoKSB7XHJcbiAgY29uc3QgY29uZmlnID0ge1xyXG4gICAgYXBwTmFtZTogXCJRc2hvdCAtIOWtkOW8ueaQnOe0olwiLFxyXG4gICAgZGVmYXVsdENvbHVtbnM6IDEsXHJcbiAgICAvLyDljZXkuKogaWZyYW1lIOiupOWumuWKoOi9veWksei0peeahOi2heaXtuOAgumHjeWeiyBTUEHvvIhEZWVwU2Vlay9LaW1pL0dlbWluae+8ieWGt+WQr+WKqOWBtuWwlOS8muaOpei/kSAyMHPvvIxcclxuICAgIC8vIOaUvuWuveWIsCAyNXMg5Lul6YG/5YWN6K+v5Yik5Li644CM5Yqg6L295aSx6LSl44CN44CCXHJcbiAgICBlbWJlZFRpbWVvdXRNczogMjUwMDAsXHJcbiAgICAvLyBpZnJhbWUg5Yqg6L295a6M5oiQ5ZCO56uL5Y2z5Y+R6YCB5p+l6K+i77yM5LiN5YaN5Lq65Li6562J5b6FXHJcbiAgICBwb3N0TG9hZFNlbmREZWxheU1zOiAwLFxyXG4gICAgdGFiU2VuZFJldHJ5Q291bnQ6IDMsXHJcbiAgICB0YWJTZW5kUmV0cnlEZWxheU1zOiAxMjAwMCxcclxuICAgIC8vIOmUmeWzsOWKoOi9ve+8muWkmuermeeCueWcuuaZr+S4i+avj+S4qiBpZnJhbWUg5LmL6Ze055qEIHNyYyDotYvlgLzpl7TpmpTvvIhtc++8ieOAglxyXG4gICAgLy8g6YG/5YWNIDZ+OCDkuKrph43lnosgU1BBIOWQjOaXtuWIneWni+WMluWvvOiHtOeZveWxj+OAglxyXG4gICAgaWZyYW1lU3RhZ2dlck1zOiAxMjAsXHJcbiAgICAvLyDlj5HpgIHlubblj5HmlbDvvJrlkIzkuIDova7ov73pl67mnIDlpJrlkIzml7blkJHlh6DlvKAgQUkg5Y2h54mH5YaZ5YWl5bm25o+Q5Lqk44CCXHJcbiAgICAvLyA0IOaOpei/keaXqeacn+mAn+W6pu+8jOS9huS7jeS/neeVmeWwj+W5tuWPkeaxoO+8jOmBv+WFjSA2fjgg5byg6YeN5Z6L57yW6L6R5Zmo5ZCM5pe25oqi54Sm54K5L+aKoua4suafk+OAglxyXG4gICAgc2VuZENvbmN1cnJlbmN5OiA0LFxyXG4gICAgLy8g5bm25Y+R5qe95L2N5LiK6ZmQ77ya5ZCM5LiA5pe25Yi75pyA5aSa5YWB6K645aSa5bCR5bygIGlmcmFtZSDlpITkuo5cIuWKoOi9veS4rVwi54q25oCB44CCXHJcbiAgICAvLyDlhbbkvZnljaHniYflhYjmioogRE9NIOWIm+W7uuWHuuadpeW5tuaYvuekulwi562J5b6F5Yqg6L295Lit4oCmXCLvvIzlnKjliY3pnaLnmoTljaHniYfliqDovb3lrozmiJDvvIhsb2FkL2Vycm9yL+i2heaXtu+8ieWQjlxyXG4gICAgLy8g5L6d5qyh6KGl5L2N77yM6YG/5YWNIDZ+OCDkuKrph43lnosgU1BBIOWQjOaXtuWGt+WQr+WKqOaJk+a7oSBDUFUgLyDnvZHnu5zjgIJcclxuICAgIC8vICAgLSDkvY7phY3mnLogLyDlvLHnvZHvvJrlu7rorq4gMlxyXG4gICAgLy8gICAtIOm7mOiupO+8mjPvvIjlr7nlpKflpJrmlbDmnLrlmajlnKjnqLPlrprmgKflkozpppblsY/pgJ/luqbkuYvpl7Tlj5blubPooaHvvIlcclxuICAgIC8vICAgLSDpq5jphY0gKyDlhYnnuqQgKyDlubblj5HljaHniYfmlbDkuI3lpJrml7blj6/ku6XosIPliLAgNH41XHJcbiAgICAvLyAgIC0g6K6+5oiQIDk5IOetieaViOS6juWFs+mXreW5tuWPkemZkOWItlxyXG4gICAgaWZyYW1lTWF4Q29uY3VycmVudDogMyxcclxuICAgIGRlYnVnOiB0cnVlXHJcbiAgfTtcclxuXHJcbiAgZ2xvYmFsVGhpcy5RU0hPVF9CQVNFX0NPTkZJRyA9IGNvbmZpZztcclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFBQSxHQUFDLFNBQVMsaUJBQWlCO0FBQ3pCLFVBQU0sU0FBUztBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsZ0JBQWdCO0FBQUE7QUFBQTtBQUFBLE1BR2hCLGdCQUFnQjtBQUFBO0FBQUEsTUFFaEIscUJBQXFCO0FBQUEsTUFDckIsbUJBQW1CO0FBQUEsTUFDbkIscUJBQXFCO0FBQUE7QUFBQTtBQUFBLE1BR3JCLGlCQUFpQjtBQUFBO0FBQUE7QUFBQSxNQUdqQixpQkFBaUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BUWpCLHFCQUFxQjtBQUFBLE1BQ3JCLE9BQU87QUFBQSxJQUNUO0FBRUEsZUFBVyxvQkFBb0I7QUFBQSxFQUNqQyxHQUFHOyIsCiAgIm5hbWVzIjogW10KfQo=
