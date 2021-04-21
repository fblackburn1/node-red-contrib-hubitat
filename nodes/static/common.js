/* eslint-disable no-unused-vars */
/* eslint-disable no-param-reassign */
function cleanHubitatSelectMenu(menuId, defaultText) {
  const selectMenu = $(`#${menuId}`);
  selectMenu.find('option').remove().end();
  const option = $('<option>', { value: '', text: defaultText });
  selectMenu.append(option);
  selectMenu.val('').trigger('change');
}

function resetHubitatSelectMenu(menuId, defaultText) {
  const selectMenu = $(`#${menuId}`);
  selectMenu.find('option').remove().end();
  const defaultOption = $('<option>', { value: '', text: defaultText });
  selectMenu.append(defaultOption);
  return selectMenu;
}

function paramsFromServer(server) {
  return {
    usetls: server.usetls,
    host: server.host,
    port: server.port,
    appId: server.appId,
    token: server.credentials.token,
  };
}

function cleanHubitatDevices() {
  cleanHubitatSelectMenu('node-input-deviceId', 'Choose device...');
}

function listHubitatDevices(server, deviceId) {
  const selectMenu = resetHubitatSelectMenu('node-input-deviceId', 'Choose device...');
  $.getJSON('hubitat/devices', paramsFromServer(server), (res) => {
    res.forEach((item) => {
      const selected = deviceId === item.id;
      const option = $('<option>', { value: item.id, text: item.label });
      selectMenu.append(option);
      if (selected) { selectMenu.val(item.id).trigger('change'); }
    });
    if (!deviceId) { selectMenu.val('').trigger('change'); }
  }).fail(() => cleanHubitatDevices());
}

function loadCredentials(server) {
  const def = $.Deferred();
  if (server.credentials) {
    def.resolve();
  } else {
    $.getJSON(`credentials/hubitat-config/${server.id}`, (data) => {
      server.credentials = data;
      server.credentials._ = $.extend(true, {}, data);
      def.resolve();
    });
  }
  return def.promise();
}
