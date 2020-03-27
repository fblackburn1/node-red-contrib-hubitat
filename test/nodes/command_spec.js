/* eslint-disable no-unused-vars */
const express = require('express');
const helper = require('node-red-node-test-helper');
const http = require('http');
const stoppable = require('stoppable');
const commandNode = require('../../nodes/command.js');
const configNode = require('../../nodes/config.js');


describe('Hubitat Command Node', () => {
  const testPort = 10234;
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: testPort,
    token: '1234-abcd',
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
  };
  const testApp = express();
  const testServer = stoppable(http.createServer(testApp));

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
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

  it('should not send msg when server return error', (done) => {
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
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive();
      setTimeout(() => {
        if (inError) {
          done(new Error('server error allowed though'));
        } else {
          done();
        }
      }, 20);
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

  it('should take arguments from message', (done) => {
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
      { ...defaultCommandNode, wires: [['n2']] },
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
      { ...defaultCommandNode, wires: [['n2']] },
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
});
