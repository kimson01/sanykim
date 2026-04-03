const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../utils/notificationService');

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getMyNotifications = async (req, res) => {
  try {
    const limit = Math.min(toPositiveInt(req.query.limit, 12), 50);
    const unreadOnly = String(req.query.unread_only || '').toLowerCase() === 'true';
    const result = await listNotifications(req.user.id, { limit, unreadOnly });
    return res.json({
      success: true,
      data: result.items,
      meta: { unread_count: result.unreadCount },
    });
  } catch (err) {
    console.error('getMyNotifications:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const readNotification = async (req, res) => {
  try {
    const updated = await markNotificationRead(req.user.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    console.error('readNotification:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const readAllNotifications = async (req, res) => {
  try {
    const count = await markAllNotificationsRead(req.user.id);
    return res.json({
      success: true,
      message: 'Notifications marked as read',
      data: { updated: count },
    });
  } catch (err) {
    console.error('readAllNotifications:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getMyNotifications,
  readNotification,
  readAllNotifications,
};
