/* eslint-disable no-unused-vars */
const http = require('http');
const express = require('express');
const helper = require('node-red-node-test-helper');
const stoppable = require('stoppable');
const { performance } = require('perf_hooks');
const commandNode = require('../../nodes/command');
const configNode = require('../../nodes/config');

describe('Hubitat Command Node', () => {
  const testPort = 10234;
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: testPort,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultCommandNode = {
    id: 'n1',
    type: 'hubitat command',
    name: 'test command name',
    server: 'n0',
    deviceId: '42',
    command: 'testCommand',
    commandArgs: 'test,args',
    ignoreOverrides: true,
  };
  const testApp = express();
  const testServer = stoppable(http.createServer(testApp));

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
    testApp.get('/apps/api/1/devices/slow/:command/:arguments', (req, res) => {
      setTimeout(() => { res.json({ deviceId: 'slow' }); }, 100);
    });
    testApp.get('/apps/api/1/devices/fast/:command/:arguments', (req, res) => { res.json({ deviceId: 'fast' }); });
    testApp.get('/apps/api/1/devices/:deviceId/errorCommand', (req, res) => { res.sendStatus(500); });
    testApp.get('/apps/api/1/devices/:deviceId/:command/:arguments', (req, res) => { res.json(req.params); });
    testApp.get('/apps/api/1/devices/:deviceId/:command', (req, res) => { res.json(req.params); });
    startServer((err) => {
      if (err) {
        done(err);
      }
      helper.startServer(done);
    });
  });

  after((done) => {
    testServer.stop(() => {
      helper.stopServer(done);
    });
  });

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultCommandNode];
    helper.load(commandNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test command name');
        n1.should.have.property('deviceId', '42');
        n1.should.have.property('command', 'testCommand');
        n1.should.have.property('commandArgs', 'test,args');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should not send msg when server is not configured', (done) => {
    const flow = [
      { ...defaultCommandNode, server: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(commandNode, flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({});
      setTimeout(() => {
        if (inError) {
          done(new Error('no server allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should send message with all properties', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultCommandNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response');
          msg.should.have.property('requestCommand', defaultCommandNode.command);
          msg.should.have.property('requestArguments', defaultCommandNode.commandArgs);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({});
    });
  });

  it('should send msg when server return error', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultCommandNode,
        command: 'errorCommand',
        commandArgs: '',
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('responseStatus', 500);
          msg.should.have.property('response');
          msg.should.have.property('requestCommand', 'errorCommand');
          msg.should.have.property('requestArguments', '');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive();
    });
  });

  it('should output an error when empty command is provided', (done) => {
    const flow = [
      { ...defaultCommandNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(commandNode, flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({ command: '' });
      setTimeout(() => {
        if (inError) {
          done(new Error('no command allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should ignore message input when enable ignore overrides', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultCommandNode,
        deviceId: '42',
        command: 'testCommand',
        commandArgs: 'test,args',
        ignoreOverrides: true,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { deviceId: '42', command: 'testCommand', arguments: 'test,args' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ deviceId: '1', command: 'otherCommand', arguments: '75' });
    });
  });

  it('should take arguments from message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultCommandNode, ignoreOverrides: false, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { deviceId: n1.deviceId, command: n1.command, arguments: '75' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ arguments: '75' });
    });
  });

  it('should take arguments from message when command comes from message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultCommandNode, ignoreOverrides: false, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { deviceId: defaultCommandNode.deviceId, command: 'setLevel', arguments: '50' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ command: 'setLevel', arguments: '50' });
    });
  });

  it('should not take arguments from node when command comes from message without arguments', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultCommandNode, ignoreOverrides: false, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { deviceId: n1.deviceId, command: 'Off' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ command: 'Off' });
    });
  });

  it('should take deviceId from message', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultCommandNode,
        ignoreOverrides: false,
        deviceId: '1',
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([commandNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.response.should.have.property('deviceId', '75');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ deviceId: '75' });
    });
  });

  it('should output an error when empty deviceId is provided', (done) => {
    const flow = [
      { ...defaultCommandNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(commandNode, flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({ deviceId: '' });
      setTimeout(() => {
        if (inError) {
          done(new Error('no deviceId allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should throttling requests', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultCommandNode, ignoreOverrides: false, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const expected = ['fast', 'slow', 'slow'];
    helper.load([commandNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          const deviceId = expected.pop();
          msg.response.should.have.property('deviceId', deviceId);
          if (deviceId === 'fast') {
            done();
          }
        } catch (err) {
          done(err);
        }
      });
      n0.requestPool = 2;
      n1.receive({ deviceId: 'slow' });
      n1.receive({ deviceId: 'slow' });
      n1.receive({ deviceId: 'fast' });
    });
  });
  it('should have a delay between commands', (done) => {
    const delayCommands = 50;
    const flow = [
      { ...defaultConfigNode, delayCommands },
      { ...defaultCommandNode, ignoreOverrides: false, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    let startTime = null;
    let firstCompletedTime = null;
    let secondCompletedTime = null;
    let thirdCompletedTime = null;
    helper.load([commandNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          const { deviceId } = msg.response;
          if (deviceId === 'first') {
            firstCompletedTime = performance.now();
            if ((firstCompletedTime - startTime) > delayCommands) {
              throw new Error(`Too much delay for first message (${firstCompletedTime - startTime} < ${delayCommands}ms)`);
            }
          }
          if (deviceId === 'second') {
            if (firstCompletedTime === null) {
              throw new Error('First msg not completed');
            }
            secondCompletedTime = performance.now();
            if ((secondCompletedTime - firstCompletedTime) < delayCommands) {
              throw new Error(`Delay for second msg not respected: ${secondCompletedTime - firstCompletedTime} > ${delayCommands}ms`);
            }
          }
          if (deviceId === 'third') {
            if (secondCompletedTime === null) {
              throw new Error('Second msg not completed');
            }
            thirdCompletedTime = performance.now();
            if ((thirdCompletedTime - secondCompletedTime) < delayCommands) {
              throw new Error(`Delay for third msg not respected: ${thirdCompletedTime - secondCompletedTime} > ${delayCommands}ms`);
            }
            done();
          }
        } catch (err) {
          done(err);
        }
      });
      n0.delayCommands = delayCommands;
      startTime = performance.now();
      n1.receive({ deviceId: 'first' });
      n1.receive({ deviceId: 'second' });
      n1.receive({ deviceId: 'third' });
    });
  });
});
