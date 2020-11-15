function doneWithId(node, done, msg) {
  let message = msg;
  if (node.deviceId) {
    message = `[deviceId:${node.deviceId}] ${message}`;
  }
  if (node.name) {
    message = `[${node.id}] ${message}`;
  }
  done(message);
}
module.exports = doneWithId;
