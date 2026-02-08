import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

const globalForRedis = global as unknown as {
  redisClient?: RedisClient;
};

function createRedisClient() {
  const client = createClient({
    url: process.env.REDIS_URL,
  });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  return client;
}

export async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;

  if (!globalForRedis.redisClient) {
    globalForRedis.redisClient = createRedisClient();
  }

  const client = globalForRedis.redisClient;

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}
