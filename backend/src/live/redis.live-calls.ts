import { Redis } from "ioredis";

import { config } from "../config";
import { LiveCall, type LiveCalls } from "./live-calls";

/** A call that stops updating is gone after this, even if nothing cleared it (a killed worker). */
const TTL_S = 900;
const key = (emailRunId: string) => `live:call:${emailRunId}`;

/**
 * Its own connection, with the offline queue off: while Redis is down every
 * command fails at once instead of waiting, so a preview write never holds up
 * the model call it describes. The queues' connection must wait; this one must not.
 */
export function redisLiveCalls(): LiveCalls {
  const redis = new Redis(config.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true });

  return {
    async put(call) {
      if (redis.status === "wait") await redis.connect();
      await redis.set(key(call.emailRunId), JSON.stringify(call), "EX", TTL_S);
    },
    async clear(emailRunId) {
      if (redis.status === "wait") await redis.connect();
      await redis.del(key(emailRunId));
    },
    async get(emailRunIds) {
      if (emailRunIds.length === 0) return [];
      if (redis.status === "wait") await redis.connect();
      const values = await redis.mget(emailRunIds.map(key));
      return values.flatMap((value) => {
        if (value === null) return [];
        const parsed = LiveCall.safeParse(JSON.parse(value));
        return parsed.success ? [parsed.data] : [];
      });
    },
    async close() {
      if (redis.status !== "wait" && redis.status !== "end") await redis.quit();
    },
  };
}
