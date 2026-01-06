import { request, reportError } from 'node-server-engine';

const ORDER_REWARD_TOGGLE = 'order_product';
const ALLOWED_ORDER_TYPES = new Set(['product', 'prasad', 'event']);

type RewardToggle = {
  key: string;
  enabled: boolean;
  points: number;
  direction: 'add' | 'reduce';
};

function getAppcontrolUrl(): string | undefined {
  return process.env.APPCONTROL_SERVICE_URL;
}

async function fetchOrderRewardToggle(appcontrolUrl: string, accessToken?: string): Promise<RewardToggle | null> {
  try {
    const res = await request({
      method: 'GET',
      url: `${appcontrolUrl}/app-settings/rewardSettings`,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });

    const body: any = res.data;
    const value = body?.success ? body?.data?.value : undefined;
    const toggles = Array.isArray(value?.toggles) ? value.toggles : [];
    const t = toggles.find((x: any) => String(x?.key) === ORDER_REWARD_TOGGLE);
    if (!t) return null;

    const points = Math.max(0, Math.floor(Number(t.points) || 0));
    const direction = t.direction === 'reduce' ? 'reduce' : 'add';
    const enabled = t.enabled !== false;
    return { key: ORDER_REWARD_TOGGLE, enabled, points, direction };
  } catch (e) {
    reportError(e);
    return null;
  }
}

async function hasOrderReward(
  appcontrolUrl: string,
  userId: string,
  orderId: string,
  accessToken?: string
): Promise<boolean> {
  const expectedReason = `Order reward (${orderId})`;
  let page = 1;
  const pageSize = 50;

  try {
    while (page <= 10) {
      const res = await request({
        method: 'GET',
        url: `${appcontrolUrl}/rewards/transactions`,
        params: { userId, page, pageSize },
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        }
      });
      const body: any = res.data;
      const rows = body?.success ? body?.data?.data : undefined;
      if (!Array.isArray(rows) || rows.length === 0) return false;

      for (const tx of rows) {
        if (String(tx?.reason ?? '') === expectedReason) return true;
      }

      // Continue to next page if there might be more
      page += 1;
    }
  } catch (e) {
    reportError(e);
    // If we cannot confirm, allow grant (best-effort)
  }
  return false;
}

async function grantOrderRewardPoints(
  appcontrolUrl: string,
  params: { userId: string; pointsDelta: number; orderId: string; orderNumber: string | undefined },
  accessToken?: string
): Promise<void> {
  await request({
    method: 'POST',
    url: `${appcontrolUrl}/rewards/points/grant`,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    data: {
      userId: params.userId,
      points: params.pointsDelta,
      reason: `Order reward (${params.orderId})`
    }
  });
}

/**
 * Apply order reward points (one per order) when payment is paid and order type is product/prasad/event.
 * Best-effort: failures are logged and do not break the order flow.
 */
export async function applyOrderReward(
  userId: string,
  orderId: string,
  orderType: string,
  orderNumber?: string,
  accessToken?: string
): Promise<void> {
  try {
    if (!userId || !orderId) return;
    if (!ALLOWED_ORDER_TYPES.has(orderType)) return;

    const appcontrolUrl = getAppcontrolUrl();
    if (!appcontrolUrl) {
      reportError('APPCONTROL_SERVICE_URL not configured; skipping order reward');
      return;
    }

    const toggle = await fetchOrderRewardToggle(appcontrolUrl, accessToken);
    if (!toggle || !toggle.enabled || toggle.points <= 0) return;

    const alreadyRewarded = await hasOrderReward(appcontrolUrl, userId, orderId, accessToken);
    if (alreadyRewarded) return;

    const pointsDelta = toggle.direction === 'reduce' ? -toggle.points : toggle.points;
    if (pointsDelta === 0) return;

    await grantOrderRewardPoints(appcontrolUrl, { userId, pointsDelta, orderId, orderNumber }, accessToken);
  } catch (e) {
    // best-effort: log but never break order creation/update
    reportError(e);
  }
}


