import { ApiError } from './api';
import { AuthError } from './auth';

export interface ErrorInfo {
  title: string;
  detail: string;
  action: 'login' | 'retry' | 'none';
}

export function describeError(error: unknown): ErrorInfo {
  if (error instanceof AuthError) {
    if (error.code === 'network') {
      return { title: '连不上服务器', detail: error.message, action: 'retry' };
    }
    if (error.code === 'expired' || error.code === 'token' || error.code === 'state') {
      return { title: '登录状态不可用', detail: error.message, action: 'login' };
    }
    return { title: '授权没有完成', detail: error.message, action: 'none' };
  }

  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === 'network') {
      return { title: '连不上服务器', detail: error.message, action: 'retry' };
    }
    if (error.status === 401) {
      return { title: '登录已过期', detail: '重新授权后即可继续浏览。', action: 'login' };
    }
    if (error.status === 429) {
      const after = error.retryAfter;
      return {
        title: '请求太频繁',
        detail: after ? `接口限流了，大约 ${after} 秒后恢复。` : '接口限流了，稍等一会儿再试。',
        action: 'retry',
      };
    }
    if (error.code === 'insufficient_scope') {
      const scope = error.payload?.required_scope?.join('、');
      return {
        title: '应用缺少权限',
        detail: scope ? `需要在授权时勾选：${scope}` : '当前授权缺少所需权限，请重新授权。',
        action: 'login',
      };
    }
    if (error.code === 'permission_denied') {
      return { title: '没有权限', detail: error.message, action: 'none' };
    }
    if (/cors/i.test(error.message)) {
      return {
        title: '被服务端的跨域策略拦下了',
        detail: '扩展会在访问接口时移除浏览器自动附加的 Origin 头。如果一直失败，到扩展管理页重新加载一次再试。',
        action: 'retry',
      };
    }
    if (error.status >= 500) {
      return { title: '服务暂时不可用', detail: '稍后再试一次。', action: 'retry' };
    }
    return { title: '请求没有成功', detail: error.message, action: 'retry' };
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') return { title: '请求已取消', detail: '', action: 'none' };
    return { title: '出了点问题', detail: error.message, action: 'retry' };
  }

  return { title: '出了点问题', detail: '请稍后重试。', action: 'retry' };
}
