const supportService = require('../services/supportService');

function sendError(res, label, err) {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`${label}:`, err.message);
  }
  return res.status(statusCode).json({ success: false, message: err.message || 'Server error' });
}

const listMessages = async (req, res) => {
  try {
    const rows = await supportService.listMessages(req.user, req.params.id, req.query);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, 'listMessages', err);
  }
};

const addMessage = async (req, res) => {
  try {
    const row = await supportService.addMessage(req.user, req.params.id, req.body);
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return sendError(res, 'addMessage', err);
  }
};

module.exports = {
  listMessages,
  addMessage,
};
