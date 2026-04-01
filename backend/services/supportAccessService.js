const { queryOne } = require('../config/db');

async function getOrganizerIdForUser(userId) {
  if (!userId) return null;
  const org = await queryOne(`SELECT id FROM organizers WHERE user_id = $1`, [userId]);
  return org?.id || null;
}

async function getActorScope(user) {
  if (!user) return { role: null, userId: null, organizerId: null };
  return {
    role: user.role,
    userId: user.id,
    organizerId: user.role === 'organizer' ? await getOrganizerIdForUser(user.id) : null,
  };
}

function canViewTicket(scope, ticket) {
  if (!scope?.role || !ticket) return false;
  if (scope.role === 'admin') return true;
  if (scope.role === 'user') return ticket.user_id === scope.userId;
  if (scope.role === 'organizer') return Boolean(scope.organizerId) && ticket.organizer_id === scope.organizerId;
  return false;
}

function canReplyToTicket(scope, ticket) {
  return canViewTicket(scope, ticket) && ticket.status !== 'closed';
}

function canSoftDeleteTicket(scope, ticket) {
  if (!canViewTicket(scope, ticket)) return false;
  if (scope.role === 'admin') return true;
  return ticket.created_by_user_id === scope.userId;
}

module.exports = {
  getActorScope,
  getOrganizerIdForUser,
  canViewTicket,
  canReplyToTicket,
  canSoftDeleteTicket,
};
