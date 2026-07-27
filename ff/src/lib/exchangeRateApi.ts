const BLUELYTICS_URL = 'https://api.bluelytics.com.ar/v2/latest';

interface BluelyticsResponse {
  blue: {
    value_avg: number;
    value_sell: number;
    value_buy: number;
  };
  last_update: string;
}

let cached: { rate: number; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchBlueSellRate(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.rate;
  }

  const res = await fetch(BLUELYTICS_URL);
  if (!res.ok) throw new Error(`Bluelytics error ${res.status}`);

  const data: BluelyticsResponse = await res.json();
  const rate = data.blue.value_sell;

  cached = { rate, fetchedAt: Date.now() };
  return rate;
}
