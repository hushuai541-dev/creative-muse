// --- Invite Module ---
// Referral tracking and reward logic

import * as Auth from './auth.js';

const REDEEMED_KEY = '__redeemed__';
const USED_CODES = {};

export function redeemInvite(inviteCode, newUserId, ip, userAgent) {
  const inviter = Auth.getUserByInviteCode(inviteCode);
  if (!inviter || inviter.id === newUserId) {
    return { success: false, error: '无效的邀请码' };
  }

  // Anti-fraud: same IP + same device can't self-refer
  const key = `${ip}_${userAgent}`;
  if (USED_CODES[`${inviteCode}_${key}`]) {
    return { success: false, error: '同一设备无法重复接受邀请' };
  }

  const newUser = Auth.getUser(newUserId);
  if (!newUser) return { success: false, error: '用户不存在' };
  if (newUser.invitedBy) {
    return { success: false, error: '已接受过邀请' };
  }

  // Give rewards
  Auth.updateUser(inviter.id, {
    permanentTokens: inviter.permanentTokens + 5,
    inviteCount: inviter.inviteCount + 1,
  });

  Auth.updateUser(newUserId, {
    permanentTokens: (newUser.permanentTokens || 0) + 5,
    invitedBy: inviter.id,
  });

  USED_CODES[`${inviteCode}_${key}`] = true;

  return {
    success: true,
    inviterName: inviter.name,
    reward: 5,
  };
}

export function getInviteStats(userId) {
  const user = Auth.getUser(userId);
  if (!user) return { inviteCount: 0, permanentTokens: 0, inviteCode: '' };
  return {
    inviteCount: user.inviteCount || 0,
    permanentTokens: user.permanentTokens || 0,
    inviteCode: user.inviteCode,
    inviteLink: `/home?ref=${user.inviteCode}`,
  };
}
