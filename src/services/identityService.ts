import { request, reportError } from 'node-server-engine';

const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || process.env.USER_SERVICE_URL;

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  profilePic?: string;
  [key: string]: any;
}

export async function getUserProfileById(userId: string, accessToken?: string): Promise<UserProfile | null> {
  if (!IDENTITY_SERVICE_URL) {
    console.warn('[IDENTITY_SERVICE] IDENTITY_SERVICE_URL not configured');
    return null;
  }

  try {
    const userUrl = `${IDENTITY_SERVICE_URL}/users/${userId}`;
    const response: any = await request({
      method: 'GET',
      url: userUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}` } : {})
      },
      timeout: 10000
    });

    const responseData = response?.data || response;
    
    if (responseData?.data?.user) {
      return responseData.data.user as UserProfile;
    } else if (responseData?.user) {
      return responseData.user as UserProfile;
    } else if (responseData?.data && responseData.data.id) {
      return responseData.data as UserProfile;
    } else if (responseData && responseData.id) {
      return responseData as UserProfile;
    }

    return null;
  } catch (error) {
    console.error(`[IDENTITY_SERVICE] Failed to fetch user profile for userId: ${userId}`, error);
    reportError(error);
    return null;
  }
}

export async function enrichOrderWithUserProfile(order: any, accessToken?: string): Promise<any> {
  if (!order?.userId) {
    return order;
  }

  try {
    const userProfile = await getUserProfileById(String(order.userId), accessToken);
    if (userProfile) {
      return {
        ...order,
        user: userProfile
      };
    }
  } catch (error) {
    console.error('[IDENTITY_SERVICE] Failed to enrich order with user profile:', error);
    reportError(error);
  }

  return order;
}

export async function enrichOrdersWithUserProfiles(orders: any[], accessToken?: string): Promise<any[]> {
  if (!orders || orders.length === 0) {
    return orders;
  }

  try {
    const userIds = [...new Set(orders.map(order => order.userId).filter(Boolean))];
    const userProfilesMap = new Map<string, UserProfile>();

    await Promise.all(
      userIds.map(async (userId) => {
        const profile = await getUserProfileById(String(userId), accessToken);
        if (profile) {
          userProfilesMap.set(String(userId), profile);
        }
      })
    );

    return orders.map(order => {
      if (order.userId && userProfilesMap.has(String(order.userId))) {
        return {
          ...order,
          user: userProfilesMap.get(String(order.userId))
        };
      }
      return order;
    });
  } catch (error) {
    console.error('[IDENTITY_SERVICE] Failed to enrich orders with user profiles:', error);
    reportError(error);
  }

  return orders;
}
