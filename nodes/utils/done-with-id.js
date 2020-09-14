function doneWithId(node, done, msg) {
  let message = msg;
  if (node.name) {
    message = `[${node.id}] ${message}`;
  }
  done(message);
}
module.exports = doneWithId;
