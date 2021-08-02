const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config');
const modeNode = require('../../nodes/mode');

describe('Hubitat Mode Node', () => {
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: 10234,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultModeNode = {
    id: 'n1',
    type: 'hubitat mode',
    name: 'test mode name',
    server: 'n0',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultModeNode];
    helper.load(modeNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test mode name');
        n1.should.have.property('sendEvent', true);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'mode',
      value: 'new-value',
      displayName: 'My Hub',
      descriptionText: 'New Value',
    };
    helper.load([modeNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentMode = 'old-value';
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', hubitatEvent);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('mode', hubitatEvent);
    });
  });
  it('should use dot shape icon when send event', (done) => {
    const flow = [{ ...defaultModeNode, sendEvent: true }];
    helper.load(modeNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'dot');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should use ring shape icon when send event', (done) => {
    const flow = [{ ...defaultModeNode, sendEvent: false }];
    helper.load(modeNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'ring');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when systemStart received and desynchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([modeNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentMode = 'old-value';
      n1.hubitat.getMode = () => new Promise((res) => res([{ name: 'new-value', active: true }]));
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', 'new-value');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
    });
  });
  it('should not send event when systemStart received and synchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([modeNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentMode = 'old-value';
      n1.hubitat.getMode = () => new Promise((res) => res([{ name: 'old-value', active: true }]));
      let inError = false;
      n2.on('input', () => {
        inError = true;
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
      setTimeout(() => {
        if (inError) {
          done(new Error('synchronized state send event'));
        } else {
          done();
        }
      }, 20);
    });
  });
});
