function requireApprovalToken(req, res, next) {
  const provided = req.body?.approval_token || req.headers['x-approval-token'];
  const expected = process.env.APPROVAL_TOKEN;

  if (!expected || provided !== expected) {
    return res.status(403).json({
      error: 'Approval token invalid.',
      code: 'APPROVAL_TOKEN_INVALID'
    });
  }

  return next();
}

module.exports = {
  requireApprovalToken
};
