Ext.define('PVE.qemu.DisplayInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveDisplayInputPanel',
    onlineHelp: 'qm_display',

    onGetValues: function(values) {
	let ret = PVE.Parser.printPropertyString(values, 'type');
	if (ret === '') {
	    return { 'delete': 'vga' };
	}
	return { vga: ret };
    },

    items: [{
	name: 'type',
	xtype: 'proxmoxKVComboBox',
	value: '__default__',
	deleteEmpty: false,
	fieldLabel: gettext('Graphic card'),
	comboItems: PVE.Utils.kvm_vga_driver_array(),
	validator: function(v) {
	    let cfg = this.up('proxmoxWindowEdit').vmconfig || {};

	    if (v.match(/^serial\d+$/) && (!cfg[v] || cfg[v] !== 'socket')) {
		let fmt = gettext("Serial interface '{0}' is not correctly configured.");
		return Ext.String.format(fmt, v);
	    }
	    return true;
	},
	listeners: {
	    change: function(cb, val) {
		if (!val) {
		    return;
		}
		let memoryfield = this.up('panel').down('field[name=memory]');
		let disableMemoryField = false;

		if (val === "cirrus") {
		    memoryfield.setEmptyText("4");
		} else if (val === "std" || val.match(/^qxl\d?$/) || val === "vmware") {
		    memoryfield.setEmptyText("16");
		} else if (val.match(/^virtio/)) {
		    memoryfield.setEmptyText("256");
		} else if (val.match(/^(serial\d|none)$/)) {
		    memoryfield.setEmptyText("N/A");
		    disableMemoryField = true;
		} else {
		    console.debug("unexpected display type", val);
		    memoryfield.setEmptyText(Proxmox.Utils.defaultText);
		}
		memoryfield.setDisabled(disableMemoryField);
	    },
	},
    },
    {
	xtype: 'proxmoxintegerfield',
	emptyText: Proxmox.Utils.defaultText,
	fieldLabel: gettext('Memory') + ' (MiB)',
	minValue: 4,
	maxValue: 512,
	step: 4,
	name: 'memory',
    }],
});

Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    subject: gettext('Display'),
    width: 350,

    items: [{
	xtype: 'pveDisplayInputPanel',
    }],

    initComponent: function() {
	let me = this;

	me.callParent();

	me.load({
	    success: function(response) {
		me.vmconfig = response.result.data;
		let vga = me.vmconfig.vga || '__default__';
		me.setValues(PVE.Parser.parsePropertyString(vga, 'type'));
	    },
	});
    },
});
