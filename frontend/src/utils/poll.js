// src/utils/poll.js
export async function pollStatus({
  getStatusFn,
  paperId,
  isDone = (resp) => {
    const d = resp?.data || {};
    return d.status === 'success' || d.state === 'success' || d.result === 'success' || d.video_ready === true || d.audio_ready === true;
  },
  onPending = () => {},
  intervalMs = 2000,
  maxAttempts = 90,
}) {
  let attempt = 0;
  let backoff = intervalMs;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const resp = await getStatusFn(paperId);
      console.debug(`[pollStatus] attempt=${attempt} paperId=${paperId} resp.status=${resp.status} resp.data=`, resp.data);
      if (isDone(resp)) {
        console.debug('[pollStatus] DONE', { attempt, paperId, data: resp.data });
        return resp;
      }
      onPending(resp, attempt);
    } catch (err) {
      // log errors (404, 5xx, network, CORS)
      console.debug('[pollStatus] attempt error', {
        attempt,
        paperId,
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message
      });
      // continue polling for transient errors
    }

    await new Promise((res) => setTimeout(res, backoff + Math.floor(Math.random() * 250)));
    backoff = Math.min(8000, Math.floor(backoff * 1.25));
  }

  throw new Error('Polling timed out');
}
