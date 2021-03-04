Ext.define('PVE.qemu.MachineInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveMachineInputPanel',

    items: [{
	name: 'machine',
	xtype: 'proxmoxKVComboBox',
	fieldLabel: gettext('Machine'),
	comboItems: [
	    ['__default__', PVE.Utils.render_qemu_machine('')],
	    ['q35', 'q35'],
	],
    }],
});

Ext.define('PVE.qemu.MachineEdit', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('Machine'),

    items: [{
	xtype: 'pveMachineInputPanel',
    }],

    initComponent: function() {
	let me = this;

	me.callParent();

	me.load({
	    success: function(response) {
		let vmconfig = response.result.data;
		let machine = vmconfig.machine || '__default__';
		me.setValues({ machine: machine });
	    },
	});
    },
});
