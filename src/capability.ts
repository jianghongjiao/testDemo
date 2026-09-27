/**
 * 能力（AI 插件）调用的通用层。
 *
 * 这个文件**不 import 任何外部包**，只用结构化类型描述"宿主注入的客户端长什么样" ——
 * 所以 tdw-chat 保持零依赖，飞书妙搭的 `@lark-apaas/client-toolkit` 由使用者的应用提供。
 *
 * 为什么不能反过来把客户端内联进来：那样页面里会出现**两份** capabilityClient 实例
 * （宿主的和包里的），auth / session / 计费上下文各自为政，症状极难排查。
 * 共享的东西必须只有一份，且由宿主提供 —— 和 registry.ts 里把实例记在 DOM 上同一个道理。
 */
import type { CapabilityClientLike, CapabilityParamsContext } from './types';

/* ============================ 错误识别 ============================ */

/**
 * 按 name 判定，不用 instanceof。
 *
 * 这些错误类来自 `@lark-apaas/client-capability`，它是宿主的**间接**依赖：
 * 我们既不能 import（会破坏零依赖），也不该假设它在依赖树里的位置（提升方式一变就崩）。
 * 运行时每个错误类都在构造时设了自己的 name，所以 name 是稳定判据。
 */
const nameOf = (error: unknown): string => (error instanceof Error ? error.name : '');

export const isRateLimitError = (error: unknown): boolean => nameOf(error) === 'RateLimitError';
export const isNetworkError = (error: unknown): boolean => nameOf(error) === 'NetworkError';
export const isExecutionError = (error: unknown): boolean => nameOf(error) === 'ExecutionError';
export const isNotFoundError = (error: unknown): boolean =>
  nameOf(error) === 'CapabilityNotFoundError' || nameOf(error) === 'ActionNotFoundError';
export const isAbortError = (error: unknown): boolean => nameOf(error) === 'AbortError';

/**
 * 「额度耗尽」在 SDK 层无法可靠区分：业务码表里只有 `k_ec_cap_006`（限流），
 * 额度耗尽是限流的一个子集，SDK 只按服务端的 `is_rate_limit_error` 布尔量分类。
 *
 * **`402` 是假设值，不是文档结论**，而且它只在 `call()`（非流式）路径上可能成立 ——
 * 那条路径会把 HTTP 状态码当第三个参数传给 `RateLimitError`。**流式路径拿不到**：
 * 无论是 HTTP 非 ok（被包成不带 statusCode 的 `NetworkError`）还是流内 `type: 'error'`
 * （`new RateLimitError(err.code, err.message)`，同样没有 statusCode），
 * 这个判定恒为 false。所以流式调用遇到额度耗尽时，会先按普通限流重试几轮才失败。
 *
 * 第一次真遇到额度耗尽时，把错误的 `rateLimitCode` / `rateLimitMessage` / `statusCode`
 * 三个字段打出来 —— 如果服务端给的业务码能区分额度和限流，就该改按 `rateLimitCode` 判定。
 */
export const QUOTA_STATUS = 402;

export const isQuotaExhaustedError = (error: unknown): boolean =>
  isRateLimitError(error) && (error as { statusCode?: number }).statusCode === QUOTA_STATUS;

/**
 * 只有可恢复的错误才值得重试。
 *
 * `hasContent`：本次尝试**是否已经收到过内容**。这是流式路径上唯一能区分
 * "参数写错"和"生成中途断了"的信号，理由见下。
 */
function isRetriable(error: unknown, hasContent: boolean): boolean {
  if (isAbortError(error) || isNotFoundError(error) || isQuotaExhaustedError(error)) return false;
  if (isRateLimitError(error) || isNetworkError(error)) return true;
  if (isExecutionError(error)) {
    const status = (error as { statusCode?: number }).statusCode;
    // 非流式路径能拿到 HTTP 状态码：5xx 是服务端抖动，4xx 是确定性失败
    // （k_ec_cap_002 / 004 / 005 都被 `ExecutionError` 吞了业务码，只剩这个维度）
    if (status !== undefined) return status >= 500;
    // 流式路径**永远拿不到**状态码：SDK 抛的是 `new ExecutionError(err.message)`，
    // 业务码和 HTTP 码全都丢在了 `TypeError`/`CapabilityError` 的分支之外。
    // 于是只能拿"有没有吐过字"当判据：
    //  - 一个字都没吐就失败 → 大概率是参数名对不上 / 插件配置错（集成期最常见的一类），
    //    重试一万次也一样，而且每轮白等 800/1600/3200ms，把一个配置错误伪装成网络故障
    //  - 已经吐过字才断 → 生成中途中断，重试有意义
    return hasContent;
  }
  return false;
}

/* ============================ 调用 ============================ */

export interface CapabilityRunOptions {
  client: CapabilityClientLike;
  /** 能力实例 ID */
  capabilityId: string;
  /** action 名 */
  action: string;
  params: Record<string, unknown>;
  /** 取消信号。中途 abort 会立刻关流并抛 AbortError */
  signal: AbortSignal;
  /** 渐进回调，收到的是**到目前为止的全文** */
  onChunk: (fullText: string) => void;
  /**
   * 回调合并窗口（毫秒）。模型每个 token 一个 chunk，不合并会把渲染打爆。
   * **传 0 表示不合并**（每个 chunk 都回调），短文本和测试场景用得上。
   * @default 50
   */
  flushMs?: number;
  /** 重试次数（不含首次） @default 3 */
  retries?: number;
  /** 首次重试延迟，之后指数退避 @default 800 */
  retryDelayMs?: number;
  /** 每次重试前回调，可用来提示"重试中" */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * 流式调用一个能力，返回最终全文。
 *
 * 相比手写 `for await`，这里补上了五件容易漏的事：
 *  1. **abort 即时生效** —— 不必等下一个 chunk 到达（模型"思考"时可能十几秒不出 chunk）
 *  2. **中途退出一定发关流请求** —— 否则底层 SSE 连接不释放；但不等它完成，见 closeIterator
 *  3. **回调合并** —— 按 flushMs 合并，而不是每个 token 一次渲染
 *  4. **重试有明确终点** —— 循环不可能静默落空，调用方永远拿到文本或一个异常
 *  5. **失败前已生成的部分先送出去** —— 半截回复不该因为收尾失败而消失
 */
export async function runCapabilityStream(options: CapabilityRunOptions): Promise<string> {
  const {
    client,
    capabilityId,
    action,
    params,
    signal,
    onChunk,
    flushMs = 50,
    retries = 3,
    retryDelayMs = 800,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal.aborted) throw abortError();
    // 每次尝试单独记账：上一轮吐过字不代表这一轮不是配置错误
    const progress: Progress = { hasContent: false };
    try {
      const stream = client.load(capabilityId).callStream<{ content?: string }>(action, params);
      return await consume(stream, { signal, onChunk, flushMs, progress });
    } catch (error) {
      lastError = error;
      if (!isRetriable(error, progress.hasContent) || attempt === retries) break;
      try {
        onRetry?.(attempt + 1, error);
      } catch {
        /* 回调抛错不该影响重试 */
      }
      await sleep(retryDelayMs * 2 ** attempt, signal);
    }
  }

  // 兜底出口。循环只能由 return 或 break 结束，这一句保证调用方拿到的是
  // 一个明确的异常，而不是 undefined ——"静默落空"是这类重试循环最经典的 bug
  throw lastError ?? new Error(`[tdw-chat] 能力调用失败：${capabilityId}.${action}`);
}

/** 单次尝试的进度。目前只用来区分"配置错"和"中途断"，见 isRetriable */
interface Progress {
  hasContent: boolean;
}

/** 消费流：abort 即时生效 + 回调合并 + 中途退出一定关流 */
async function consume<T extends { content?: string }>(
  stream: AsyncIterable<T>,
  opts: {
    signal: AbortSignal;
    onChunk: (text: string) => void;
    flushMs: number;
    progress: Progress;
  },
): Promise<string> {
  const { signal, onChunk, flushMs, progress } = opts;
  const iterator = stream[Symbol.asyncIterator]();

  // 挂一个只 reject 的 promise，与每次 next() 赛跑，让 abort 不必等下一个 chunk
  let rejectOnAbort: (() => void) | null = null;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(abortError());
    if (signal.aborted) rejectOnAbort();
    else signal.addEventListener('abort', rejectOnAbort, { once: true });
  });
  // 循环正常结束时它仍可能稍后 reject，先挂个 catch 免得变成 unhandled rejection
  aborted.catch(() => undefined);

  const batched = flushMs > 0;
  let full = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    try {
      onChunk(full);
    } catch {
      /* 回调抛错不该影响生成 */
    }
  };

  try {
    for (;;) {
      const step = await Promise.race([iterator.next(), aborted]);
      if (step.done) break;
      const delta = step.value.content;
      if (!delta) continue;
      full += delta;
      progress.hasContent = true;
      if (!batched) flush();
      else if (timer === undefined) timer = setTimeout(flush, flushMs);
    }
    if (batched) {
      if (timer !== undefined) clearTimeout(timer);
      if (full) flush(); // 收尾补一次，短内容也不会漏
    }
    return full;
  } catch (error) {
    // 已经生成的部分不丢：调用方可以据此把半截回复留在界面上并标成错误态。
    // 少了这一句，"吐了一半然后连接断了"会变成 —— 用户消息标红，半截回复凭空消失。
    if (batched && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      if (full) flush();
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (rejectOnAbort) signal.removeEventListener('abort', rejectOnAbort);
    closeIterator(iterator);
  }
}

/**
 * 关流。**故意不 await**。
 *
 * 生成器可能正卡在它内部的一个 await 上（比如在等下一个 SSE 分片）。这种状态下
 * `return()` 不会立刻生效 —— 它被排队到那个 await 结算之后才执行。await 它就等于把
 * "取消"退化成"等它自己结束"：实测一个 5 秒后才出下一个 chunk 的流，abort 之后要
 * 整整 5 秒才把异常抛给调用方，取消按钮点了跟没点一样。
 *
 * 所以这里只负责**把关闭请求发出去**（生成器的 finally 会照常跑，连接照常释放），
 * 不负责等它完成。清理发生得比返回值晚，但一定会发生。
 */
function closeIterator(iterator: AsyncIterator<unknown>): void {
  try {
    const result = iterator.return?.() as Promise<unknown> | undefined;
    // 关流失败或异步 reject 都不该变成 unhandled rejection
    if (result && typeof result.then === 'function') {
      void result.then(undefined, () => undefined);
    }
  } catch {
    /* 关闭失败无所谓 */
  }
}

/* ============================ J0 缺省映射 ============================ */

export const DEFAULT_CAPABILITY_ID = 'J0';
export const DEFAULT_CAPABILITY_ACTION = 'textGenerate';
export const DEFAULT_SYSTEM_PROMPT = '你是一个乐于助人的助手，请用中文回答。';

/**
 * `J0` = `@official-plugins/ai-text-generate`（豆包模型智能写作）的入参映射。
 *
 * 参数名是插件 schema 里定义的**首字母大写** `System` / `User` / `Data` / `SessionMsg`。
 * 写成小写会被判参数校验失败（`k_ec_cap_004`），而那个错误会被 SDK 包成
 * `ExecutionError` —— 看起来像"执行出错"，极难排查。换插件时覆盖 `buildCapabilityParams`。
 */
export function buildJ0Params(
  text: string,
  _ctx: CapabilityParamsContext,
): Record<string, unknown> {
  return { System: DEFAULT_SYSTEM_PROMPT, User: text, Data: '', SessionMsg: '' };
}

/* ============================ 工具 ============================ */

function abortError(): Error {
  const error = new Error('[tdw-chat] 已取消');
  error.name = 'AbortError';
  return error;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
